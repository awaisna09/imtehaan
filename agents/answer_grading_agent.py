#!/usr/bin/env python3
"""
Answer Grading Agent for Business Studies Practice
This LangChain agent grades student answers against model answers
and provides detailed feedback.
"""

import os
import json
import asyncio
import hashlib
import time
from typing import Dict, List, Any
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage
from pydantic import BaseModel, Field
import logging

# Import cache if available
try:
    from cache import cache_get, cache_set
    CACHE_AVAILABLE = True
except ImportError:
    CACHE_AVAILABLE = False

    def cache_get(key): return None
    def cache_set(key, value, ttl=3600): return False


# Configure logging with detailed format
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Debug mode - set via environment variable
DEBUG_MODE = os.getenv("GRADING_DEBUG", "false").lower() == "true"


class GradingCriteria(BaseModel):
    """Criteria for grading Business Studies answers"""
    content_accuracy: float = Field(
        description="Accuracy of business concepts and terminology (0-10)"
    )
    structure_clarity: float = Field(
        description="Logical structure and clarity of argument (0-10)"
    )
    examples_relevance: float = Field(
        description="Relevance and quality of examples provided (0-10)"
    )
    critical_thinking: float = Field(
        description="Depth of analysis and critical thinking (0-10)"
    )
    business_terminology: float = Field(
        description="Proper use of business terminology (0-10)"
    )


class GradingResult(BaseModel):
    """Result of the grading process"""
    overall_score: float = Field(description="Overall score out of 50")
    percentage: float = Field(description="Percentage score")
    grade: str = Field(description="Letter grade (A, B, C, D, F)")
    strengths: List[str] = Field(
        description="List of strengths in the answer"
    )
    areas_for_improvement: List[str] = Field(
        description="List of areas that need improvement"
    )
    specific_feedback: str = Field(
        description="Detailed feedback on the answer"
    )
    suggestions: List[str] = Field(
        description="Specific suggestions for improvement"
    )
    reasoning_category: str = Field(
        default="unknown",
        description=(
            "One of: correct, partial, mild_confusion, wrong, "
            "high_confusion, misconception"
        )
    )
    has_misconception: bool = Field(
        default=False,
        description=(
            "True if the student answer contains a conceptual "
            "misconception"
        )
    )
    primary_concept_ids: List[str] = Field(
        default_factory=list,
        description="List of primary syllabus concept IDs"
    )
    secondary_concept_ids: List[str] = Field(
        default_factory=list,
        description="List of secondary or related concept IDs"
    )
    mastery_deltas: Dict[str, float] = Field(
        default_factory=dict,
        description="Mapping of concept_id to mastery delta change"
    )


class SupabaseRepository:
    """Repository for Supabase database operations"""

    def __init__(self):
        """
        Initialize Supabase client.
        Prefers SERVICE_ROLE_KEY for write operations, falls back to ANON_KEY.
        """
        self.url = os.getenv("SUPABASE_URL")
        # Prefer service role key for write operations, fallback to anon key
        self.key = (
            os.getenv("SUPABASE_SERVICE_ROLE_KEY") or
            os.getenv("SUPABASE_ANON_KEY")
        )
        self.enabled = bool(self.url and self.key)

        if self.enabled:
            from supabase import create_client
            self.client = create_client(self.url, self.key)
            if DEBUG_MODE:
                key_type = (
                    "SERVICE_ROLE" if os.getenv("SUPABASE_SERVICE_ROLE_KEY")
                    else "ANON"
                )
                logger.info(
                    f"✅ [SUPABASE] SupabaseRepository initialized "
                    f"with {key_type} key"
                )
        else:
            self.client = None
            if DEBUG_MODE:
                logger.warning(
                    "[WARNING] SupabaseRepository disabled - "
                    "no Supabase credentials found"
                )

    def log_question_attempt(self, **data):
        """
        Insert a row into question_attempts if Supabase is enabled.

        Handles JSONB arrays (primary_concept_ids, secondary_concept_ids)
        automatically via Supabase client.
        """
        if not self.enabled:
            return None
        try:
            if DEBUG_MODE:
                logger.info(
                    "📝 [SUPABASE] Inserting into table: question_attempts"
                )
                logger.info("   Data:")
                logger.info(f"     user_id: {data.get('user_id')}")
                logger.info(f"     question_id: {data.get('question_id')}")
                logger.info(f"     topic_id: {data.get('topic_id')}")
                logger.info(f"     raw_score: {data.get('raw_score')}")
                logger.info(f"     percentage: {data.get('percentage')}")
                logger.info(f"     grade: {data.get('grade')}")
                logger.info(
                    f"     reasoning_category: "
                    f"{data.get('reasoning_category')}"
                )
                logger.info(
                    f"     has_misconception: "
                    f"{data.get('has_misconception')}"
                )
                logger.info(
                    f"     primary_concept_ids: "
                    f"{data.get('primary_concept_ids')}"
                )
                logger.info(
                    f"     secondary_concept_ids: "
                    f"{data.get('secondary_concept_ids')}"
                )
            result = (
                self.client.table("question_attempts")
                .insert(data)
                .execute()
            )

            if DEBUG_MODE and result.data:
                logger.info("=" * 80)
                logger.info(
                    "✅ [SUPABASE] Entry created in question_attempts:"
                )
                created_entry = result.data[0]
                entry_id = created_entry.get('attempt_id', 'N/A')
                logger.info(f"   Entry ID: {entry_id}")
                logger.info(f"   user_id: {created_entry.get('user_id')}")
                q_id = created_entry.get('question_id')
                logger.info(f"   question_id: {q_id}")
                logger.info(f"   topic_id: {created_entry.get('topic_id')}")
                logger.info(
                    f"   raw_score: {created_entry.get('raw_score')}"
                )
                logger.info(
                    f"   percentage: {created_entry.get('percentage')}"
                )
                logger.info(f"   grade: {created_entry.get('grade')}")
                reasoning = created_entry.get('reasoning_category')
                logger.info(f"   reasoning_category: {reasoning}")
                misconception = created_entry.get('has_misconception')
                logger.info(f"   has_misconception: {misconception}")
                primary = created_entry.get('primary_concept_ids')
                logger.info(f"   primary_concept_ids: {primary}")
                secondary = created_entry.get('secondary_concept_ids')
                logger.info(f"   secondary_concept_ids: {secondary}")
                created = created_entry.get('created_at', 'N/A')
                logger.info(f"   created_at: {created}")
                logger.info("=" * 80)

            return result
        except Exception as e:
            logger.error(f"Error logging question attempt: {e}")
            return None

    def fetch_question_by_id(self, question_id: str):
        """
        Fetch question + model answer + optional metadata
        (max_marks, difficulty_level) if exists.
        """
        if not self.enabled:
            return None
        if DEBUG_MODE:
            logger.info(
                "📊 [SUPABASE] Reading from table: "
                "business_activity_questions"
            )
            logger.info(
                f"   Query: SELECT * WHERE question_id = {question_id}"
            )
        res = (
            self.client.table("business_activity_questions")
            .select("*")
            .eq("question_id", question_id)
            .execute()
        )
        if DEBUG_MODE and res.data:
            logger.info(
                f"✅ [SUPABASE] Retrieved question data: "
                f"question_id={question_id}, "
                f"marks={res.data[0].get('marks')}, "
                f"topic_id={res.data[0].get('topic_id')}"
            )
        return res.data[0] if res.data else None

    def update_mastery(
        self, user_id: str, concept_id: str, delta: float
    ):
        """
        Update or insert mastery (0–100 clamp).

        Returns the new mastery value, or None if Supabase is disabled.
        """
        if not self.enabled:
            return None
        try:
            if DEBUG_MODE:
                logger.info(
                    "📊 [SUPABASE] Reading from table: user_mastery"
                )
                logger.info(
                    f"   Query: SELECT * WHERE user_id={user_id} "
                    f"AND concept_id={concept_id}"
                )
            res = (
                self.client.table("user_mastery")
                .select("*")
                .eq("user_id", user_id)
                .eq("concept_id", concept_id)
                .execute()
            )
            current = res.data[0]["mastery"] if res.data else 50
            new_mastery = max(0, min(100, current + delta))

            if DEBUG_MODE:
                logger.info(
                    f"📈 [MASTERY] Level Update for Concept {concept_id}:"
                )
                logger.info(f"   Previous Mastery: {current:.2f}")
                logger.info(f"   Delta Applied: {delta:+.2f}")
                logger.info(f"   New Mastery: {new_mastery:.2f}")
                logger.info(f"   Clamped: {new_mastery != current + delta}")

            if res.data:
                if DEBUG_MODE:
                    logger.info(
                        "📝 [SUPABASE] Updating table: user_mastery"
                    )
                    logger.info(
                        f"   Data: {{user_id: {user_id}, "
                        f"concept_id: {concept_id}, "
                        f"mastery: {new_mastery:.2f}}}"
                    )
                result = (
                    self.client.table("user_mastery")
                    .update({"mastery": new_mastery})
                    .eq("user_id", user_id)
                    .eq("concept_id", concept_id)
                    .execute()
                )
                if DEBUG_MODE and result.data:
                    updated_entry = result.data[0]
                    logger.info("   ✅ Entry updated:")
                    m_id = updated_entry.get('mastery_id', 'N/A')
                    logger.info(f"      mastery_id: {m_id}")
                    logger.info(
                        f"      user_id: {updated_entry.get('user_id')}"
                    )
                    logger.info(
                        f"      concept_id: "
                        f"{updated_entry.get('concept_id')}"
                    )
                    logger.info(
                        f"      mastery: {updated_entry.get('mastery')}"
                    )
            else:
                if DEBUG_MODE:
                    logger.info(
                        "📝 [SUPABASE] Inserting into table: user_mastery"
                    )
                    logger.info(
                        f"   Data: {{user_id: {user_id}, "
                        f"concept_id: {concept_id}, "
                        f"mastery: {new_mastery:.2f}}}"
                    )
                result = (
                    self.client.table("user_mastery")
                    .insert({
                        "user_id": user_id,
                        "concept_id": concept_id,
                        "mastery": new_mastery
                    })
                    .execute()
                )
                if DEBUG_MODE and result.data:
                    created_entry = result.data[0]
                    logger.info("   ✅ Entry created:")
                    m_id = created_entry.get('mastery_id', 'N/A')
                    logger.info(f"      mastery_id: {m_id}")
                    logger.info(
                        f"      user_id: {created_entry.get('user_id')}"
                    )
                    logger.info(
                        f"      concept_id: "
                        f"{created_entry.get('concept_id')}"
                    )
                    logger.info(
                        f"      mastery: {created_entry.get('mastery')}"
                    )
            return new_mastery
        except Exception as e:
            logger.error(
                f"Error updating mastery for user {user_id}, "
                f"concept {concept_id}: {e}"
            )
            return None

    def log_trend(
        self, user_id: str, concept_id: str, new_score: float
    ):
        """Insert a mastery trend log entry."""
        if not self.enabled:
            return None
        try:
            return (
                self.client.table("user_trends")
                .insert({
                    "user_id": user_id,
                    "concept_id": concept_id,
                    "mastery": new_score
                })
                .execute()
            )
        except Exception as e:
            logger.error(
                f"Error logging trend for user {user_id}, "
                f"concept {concept_id}: {e}"
            )
            return None

    def batch_log_trends(
        self, trends: List[Dict[str, Any]]
    ):
        """Batch insert multiple trend entries."""
        if not self.enabled or not trends:
            return None
        try:
            if DEBUG_MODE:
                logger.info(
                    "📝 [SUPABASE] Batch inserting into table: user_trends"
                )
                logger.info(f"   Records: {len(trends)}")
                for i, trend in enumerate(trends[:5]):  # Show first 5
                    mastery_val = trend.get('mastery', 0)
                    mastery_str = (
                        f"{mastery_val:.2f}"
                        if isinstance(mastery_val, (int, float))
                        else str(mastery_val)
                    )
                    logger.info(
                        f"   [{i+1}] user_id={trend.get('user_id')}, "
                        f"concept_id={trend.get('concept_id')}, "
                        f"mastery={mastery_str}"
                    )
                if len(trends) > 5:
                    logger.info(f"   ... and {len(trends) - 5} more records")
            result = (
                self.client.table("user_trends")
                .insert(trends)
                .execute()
            )

            if DEBUG_MODE and result.data:
                logger.info("=" * 80)
                count = len(result.data)
                logger.info(
                    f"✅ [SUPABASE] Created {count} entries in "
                    f"user_trends:"
                )
                for i, entry in enumerate(result.data[:10], 1):
                    t_id = entry.get('trend_id', 'N/A')
                    u_id = entry.get('user_id')
                    c_id = entry.get('concept_id')
                    mastery = entry.get('mastery')
                    created = entry.get('created_at', 'N/A')
                    logger.info(
                        f"   [{i}] trend_id: {t_id}, "
                        f"user_id: {u_id}, "
                        f"concept_id: {c_id}, "
                        f"mastery: {mastery}, "
                        f"created_at: {created}"
                    )
                if len(result.data) > 10:
                    remaining = len(result.data) - 10
                    logger.info(f"   ... and {remaining} more entries")
                logger.info("=" * 80)

            return result
        except Exception as e:
            logger.error(f"Error batch logging trends: {e}")
            return None

    def batch_update_weaknesses(
        self, weaknesses: List[Dict[str, Any]]
    ):
        """Batch upsert multiple weakness entries."""
        if not self.enabled or not weaknesses:
            return None
        try:
            if DEBUG_MODE:
                logger.info(
                    "📝 [SUPABASE] Batch upserting into table: "
                    "user_weaknesses"
                )
                logger.info(f"   Records: {len(weaknesses)}")
                for i, weakness in enumerate(weaknesses[:5]):  # Show first 5
                    logger.info(
                        f"   [{i+1}] user_id={weakness.get('user_id')}, "
                        f"concept_id={weakness.get('concept_id')}, "
                        f"is_weak={weakness.get('is_weak')}"
                    )
                if len(weaknesses) > 5:
                    logger.info(
                        f"   ... and {len(weaknesses) - 5} more records"
                    )
            result = (
                self.client.table("user_weaknesses")
                .upsert(weaknesses)
                .execute()
            )

            if DEBUG_MODE and result.data:
                logger.info("=" * 80)
                count = len(result.data)
                logger.info(
                    f"✅ [SUPABASE] Created/Updated {count} entries in "
                    f"user_weaknesses:"
                )
                for i, entry in enumerate(result.data[:10], 1):
                    w_id = entry.get('weakness_id', 'N/A')
                    u_id = entry.get('user_id')
                    c_id = entry.get('concept_id')
                    is_weak = entry.get('is_weak')
                    updated = entry.get('updated_at', 'N/A')
                    logger.info(
                        f"   [{i}] weakness_id: {w_id}, "
                        f"user_id: {u_id}, "
                        f"concept_id: {c_id}, "
                        f"is_weak: {is_weak}, "
                        f"updated_at: {updated}"
                    )
                if len(result.data) > 10:
                    remaining = len(result.data) - 10
                    logger.info(f"   ... and {remaining} more entries")
                logger.info("=" * 80)

            return result
        except Exception as e:
            logger.error(f"Error batch updating weaknesses: {e}")
            return None

    def update_weakness(
        self,
        user_id: str,
        concept_id: str,
        new_mastery: float,
        has_misconception: bool
    ):
        """Apply weakness conditions (<40 or misconceptions)."""
        if not self.enabled:
            return None
        try:
            is_weak = new_mastery < 40 or has_misconception
            return (
                self.client.table("user_weaknesses")
                .upsert({
                    "user_id": user_id,
                    "concept_id": concept_id,
                    "is_weak": is_weak
                })
                .execute()
            )
        except Exception as e:
            logger.error(
                f"Error updating weakness for user {user_id}, "
                f"concept {concept_id}: {e}"
            )
            return None

    def search_concepts_by_question_embedding(
        self,
        question_id: str,
        match_limit: int = 5,
    ):
        """
        Search for related concepts using question_embeddings ->
        concept_embeddings.

        Uses caching to avoid repeated database queries.
        """
        if not self.enabled:
            return []

        cache_key = f"concepts_for_question:{question_id}:{match_limit}"
        if CACHE_AVAILABLE:
            cached = cache_get(cache_key)
            if cached is not None:
                if DEBUG_MODE:
                    logger.info(
                        f"🔍 [CACHE HIT] Concepts for question {question_id}"
                    )
                return cached

        try:
            if DEBUG_MODE:
                logger.info(
                    "📊 [SUPABASE] Calling RPC function: "
                    "match_concepts_for_question"
                )
                logger.info(
                    f"   Parameters: question_id={question_id}, "
                    f"match_limit={match_limit}"
                )
            res = self.client.rpc(
                "match_concepts_for_question",
                {
                    "q_question_id": question_id,
                    "match_count": match_limit,
                },
            ).execute()
            result = res.data or []

            if DEBUG_MODE:
                logger.info(
                    f"✅ [SUPABASE] RPC returned {len(result)} concepts"
                )
                if result:
                    concept_ids = [r.get("concept_id") for r in result[:5]]
                    logger.info(f"   Concept IDs: {concept_ids}")

            if CACHE_AVAILABLE and result:
                cache_set(cache_key, result, ttl=600)
                if DEBUG_MODE:
                    logger.info(
                        f"💾 [CACHE SET] Concepts for question {question_id}"
                    )

            return result
        except Exception as e:
            if DEBUG_MODE:
                logger.error(f"Error searching concepts: {e}")
            return []

    def fetch_lesson_context_for_question(self, question_id: str):
        """
        Fetch lesson/context text linked to a question.

        Uses the context column from business_activity_questions table.
        Uses caching to avoid repeated database queries.
        """
        if not self.enabled:
            return ""

        cache_key = f"lesson_context:{question_id}"
        if CACHE_AVAILABLE:
            cached = cache_get(cache_key)
            if cached is not None:
                if DEBUG_MODE:
                    logger.info(
                        f"🔍 [CACHE HIT] Lesson context for question "
                        f"{question_id}"
                    )
                return cached

        try:
            if DEBUG_MODE:
                logger.info(
                    "📊 [SUPABASE] Reading from table: "
                    "business_activity_questions"
                )
                logger.info(
                    f"   Query: SELECT context WHERE question_id = "
                    f"{question_id}"
                )
            qb_res = (
                self.client.table("business_activity_questions")
                .select("context")
                .eq("question_id", question_id)
                .execute()
            )
            if not qb_res.data:
                if DEBUG_MODE:
                    logger.info(
                        f"⚠️  [SUPABASE] No context found for question "
                        f"{question_id}"
                    )
                return ""

            context = qb_res.data[0].get("context") or ""
            if DEBUG_MODE:
                logger.info(
                    f"✅ [SUPABASE] Retrieved context: "
                    f"{len(context)} characters"
                )

            if CACHE_AVAILABLE and context:
                cache_set(cache_key, context, ttl=3600)
                if DEBUG_MODE:
                    logger.info(
                        f"💾 [CACHE SET] Lesson context for question "
                        f"{question_id}"
                    )

            return context

        except Exception as e:
            if DEBUG_MODE:
                logger.error(f"Error fetching lesson context: {e}")
            return ""


class ConceptDetector:
    """Detect primary/secondary concepts using embeddings (LLM fallback)."""

    def __init__(
        self,
        repo: SupabaseRepository,
        llm: ChatOpenAI,
        question_searcher: "QuestionEmbeddingsSearcher | None" = None,
    ):
        self.repo = repo
        self.llm = llm
        self.question_searcher = question_searcher

    async def detect_async(
        self,
        question: str,
        student_answer: str,
        question_id: str | None = None
    ):
        """Async version of detect for parallel execution"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, self.detect, question, student_answer, question_id
        )

    def detect(
        self,
        question: str,
        student_answer: str,
        question_id: str | None = None
    ):
        """
        Return {
            "primary": [concept_id1, concept_id2],
            "secondary": [concept_id3]
        }
        Uses embeddings first, falls back to LLM.
        """
        start_time = time.time()

        if (
            self.repo.enabled
            and self.question_searcher
            and question_id
        ):
            concept_ids = (
                self.question_searcher.get_concept_ids_for_question(
                    question_id=question_id,
                    limit=5,
                )
            )
            if concept_ids:
                elapsed = time.time() - start_time
                if DEBUG_MODE:
                    logger.info(
                        f"🔍 [ConceptDetector] Found {len(concept_ids)} "
                        f"concepts via embeddings in {elapsed:.2f}s"
                    )
                return {"primary": concept_ids, "secondary": []}

        if not self.repo.enabled:
            return {"primary": [], "secondary": []}

        question_answer_hash = hashlib.md5(
            f'{question}:{student_answer}'.encode()
        ).hexdigest()
        cache_key = f"concepts_llm:{question_answer_hash}"
        if CACHE_AVAILABLE:
            cached = cache_get(cache_key)
            if cached is not None:
                elapsed = time.time() - start_time
                if DEBUG_MODE:
                    logger.info(
                        f"🔍 [CACHE HIT] Concepts detected in {elapsed:.2f}s"
                    )
                return cached

        q_short = question[:250] + "..." if len(question) > 250 else question
        a_short = (
            student_answer[:250] + "..."
            if len(student_answer) > 250
            else student_answer
        )
        prompt = (
            f"Identify Business Studies concepts. Return JSON:\n"
            f'{{"primary": ["id1"], "secondary": ["id2"]}}\n'
            f"Q: {q_short}\nA: {a_short}"
        )
        out = self.llm.invoke(prompt).content

        try:
            data = json.loads(out)
            elapsed = time.time() - start_time

            if CACHE_AVAILABLE:
                cache_set(cache_key, data, ttl=1800)
                if DEBUG_MODE:
                    logger.info(
                        f"💾 [CACHE SET] Concepts detected in {elapsed:.2f}s"
                    )

            if DEBUG_MODE:
                logger.info(
                    f"🔍 [ConceptDetector] Detected concepts in "
                    f"{elapsed:.2f}s: {data}"
                )

            return data
        except Exception as e:
            if DEBUG_MODE:
                logger.error(f"Error in concept detection: {e}")
            return {"primary": [], "secondary": []}


class ReasoningClassifier:
    """Classify reasoning quality of student answers"""

    def __init__(self, llm: ChatOpenAI):
        self.llm = llm

    async def classify_async(
        self, question: str, model_answer: str, student_answer: str
    ) -> str:
        """Async version for parallel execution"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, self.classify, question, model_answer, student_answer
        )

    def classify(
        self, question: str, model_answer: str, student_answer: str
    ) -> str:
        start_time = time.time()

        reasoning_hash = hashlib.md5(
            f'{question}:{model_answer}:{student_answer}'.encode()
        ).hexdigest()
        cache_key = f"reasoning:{reasoning_hash}"
        if CACHE_AVAILABLE:
            cached = cache_get(cache_key)
            if cached is not None:
                elapsed = time.time() - start_time
                if DEBUG_MODE:
                    logger.info(
                        f"🔍 [CACHE HIT] Reasoning classified in "
                        f"{elapsed:.2f}s: {cached}"
                    )
                return cached

        q_short = question[:250] + "..." if len(question) > 250 else question
        m_short = (
            model_answer[:300] + "..."
            if len(model_answer) > 300
            else model_answer
        )
        a_short = (
            student_answer[:250] + "..."
            if len(student_answer) > 250
            else student_answer
        )
        prompt = (
            f"Classify reasoning. Return JSON:\n"
            f'{{"category": "<correct|partial|mild_confusion|wrong|'
            f'high_confusion|misconception>"}}\n'
            f"Q: {q_short}\nModel: {m_short}\nAnswer: {a_short}"
        )
        out = self.llm.invoke(prompt).content
        try:
            category = json.loads(out)["category"]
            elapsed = time.time() - start_time

            if CACHE_AVAILABLE:
                cache_set(cache_key, category, ttl=1800)
                if DEBUG_MODE:
                    logger.info(
                        f"💾 [CACHE SET] Reasoning classified in "
                        f"{elapsed:.2f}s: {category}"
                    )

            if DEBUG_MODE:
                logger.info(
                    f"🔍 [ReasoningClassifier] Classified in {elapsed:.2f}s: "
                    f"{category}"
                )

            return category
        except Exception as e:
            if DEBUG_MODE:
                logger.error(f"Error in reasoning classification: {e}")
            return "partial"


class MisconceptionDetector:
    """Detect misconceptions in student answers"""

    def __init__(self, llm: ChatOpenAI):
        self.llm = llm

    async def detect_async(self, question: str, student_answer: str) -> bool:
        """Async version for parallel execution"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, self.detect, question, student_answer
        )

    def detect(self, question: str, student_answer: str) -> bool:
        start_time = time.time()

        misconception_hash = hashlib.md5(
            f'{question}:{student_answer}'.encode()
        ).hexdigest()
        cache_key = f"misconception:{misconception_hash}"
        if CACHE_AVAILABLE:
            cached = cache_get(cache_key)
            if cached is not None:
                elapsed = time.time() - start_time
                if DEBUG_MODE:
                    logger.info(
                        f"🔍 [CACHE HIT] Misconception detected in "
                        f"{elapsed:.2f}s: {cached}"
                    )
                return cached

        q_short = question[:250] + "..." if len(question) > 250 else question
        a_short = (
            student_answer[:250] + "..."
            if len(student_answer) > 250
            else student_answer
        )
        prompt = (
            f"Misconception? Return JSON:\n"
            f'{{"misconception": <true|false>}}\n'
            f"Q: {q_short}\nA: {a_short}"
        )
        out = self.llm.invoke(prompt).content
        try:
            has_misconception = bool(json.loads(out)["misconception"])
            elapsed = time.time() - start_time

            if CACHE_AVAILABLE:
                cache_set(cache_key, has_misconception, ttl=1800)
                if DEBUG_MODE:
                    logger.info(
                        f"💾 [CACHE SET] Misconception detected in "
                        f"{elapsed:.2f}s: {has_misconception}"
                    )

            if DEBUG_MODE:
                logger.info(
                    f"🔍 [MisconceptionDetector] Detected in {elapsed:.2f}s: "
                    f"{has_misconception}"
                )

            return has_misconception
        except Exception as e:
            if DEBUG_MODE:
                logger.error(f"Error in misconception detection: {e}")
            return False


class MasteryEngine:
    """Compute mastery deltas from reasoning category and difficulty"""

    base_map = {
        "correct": 4,
        "partial": 2,
        "mild_confusion": 0,
        "wrong": -2,
        "high_confusion": -3,
        "misconception": -8,
    }

    def difficulty_weight(self, max_marks: int | None):
        if not max_marks:
            return 1.0
        if max_marks <= 2:
            return 0.8
        if max_marks <= 4:
            return 1.0
        if max_marks <= 7:
            return 1.2
        return 1.4

    def compute(
        self,
        reasoning_category: str,
        max_marks: int | None = None,
        difficulty_level: int | None = None,
    ):
        base = self.base_map.get(reasoning_category, 0)
        weight = self.difficulty_weight(max_marks)

        if difficulty_level is not None:
            if difficulty_level == 1:
                extra = 0.8
            elif difficulty_level == 2:
                extra = 1.0
            elif difficulty_level == 3:
                extra = 1.2
            else:
                extra = 1.0
            weight *= extra

        if DEBUG_MODE:
            marks_weight = self.difficulty_weight(max_marks)
            extra = 1.0
            if difficulty_level is not None:
                if difficulty_level == 1:
                    extra = 0.8
                elif difficulty_level == 2:
                    extra = 1.0
                elif difficulty_level == 3:
                    extra = 1.2
            final_delta = base * weight
            logger.info(
                f"🔍 [MasteryEngine] Computing delta for "
                f"reasoning={reasoning_category}:"
            )
            logger.info(f"   Base value: {base}")
            logger.info(f"   Marks weight: {marks_weight:.2f}")
            if difficulty_level is not None:
                logger.info(f"   Difficulty multiplier: {extra:.2f}")
            logger.info(f"   Final weight: {weight:.2f}")
            logger.info(f"   Final delta: {final_delta:+.2f}")

        return base * weight


class WeaknessEngine:
    """Update student weakness flags based on mastery and misconceptions"""

    def __init__(self, repo: SupabaseRepository):
        self.repo = repo

    def update(
        self,
        user_id: str,
        concept_id: str,
        new_mastery: float,
        has_misconception: bool
    ):
        self.repo.update_weakness(
            user_id, concept_id, new_mastery, has_misconception
        )


class TrendUpdater:
    """Log mastery trends for tracking student progress"""

    def __init__(self, repo: SupabaseRepository):
        self.repo = repo

    def log(self, user_id: str, concept_id: str, new_mastery: float):
        self.repo.log_trend(user_id, concept_id, new_mastery)


class QuestionEmbeddingsSearcher:
    """
    Search for related concepts using question_embeddings +
    concept_embeddings.
    """

    def __init__(self, repo: SupabaseRepository):
        self.repo = repo

    def get_concept_ids_for_question(
        self, question_id: str, limit: int = 5
    ) -> List[str]:
        """
        Use SupabaseRepository.search_concepts_by_question_embedding to get
        related concepts.

        Returns a list of concept_id strings.
        """
        if not self.repo.enabled:
            return []

        rows = self.repo.search_concepts_by_question_embedding(
            question_id=question_id,
            match_limit=limit,
        )
        concept_ids = []
        for row in rows:
            cid = row.get("concept_id")
            if cid:
                concept_ids.append(cid)
        return concept_ids


class RAGRetriever:
    """
    Retrieve question text, model answer, and lesson/context for RAG.

    NOTE: There is no mark scheme. We only use model_answer +
    lesson/context.
    """

    def __init__(self, repo: SupabaseRepository):
        self.repo = repo

    def get_bundle(
        self,
        question: str,
        model_answer: str,
        question_id: str | None = None,
    ) -> Dict[str, str]:
        """
        Return a dict with:
        - question: str
        - model_answer: str
        - lesson_context: str
        """
        final_question = question
        final_model_answer = model_answer
        lesson_context = ""

        if self.repo.enabled and question_id:
            qb = self.repo.fetch_question_by_id(question_id)
            if qb:
                final_question = qb.get("question", final_question)
                final_model_answer = qb.get(
                    "model_answer", final_model_answer
                )
                lesson_context = (
                    self.repo.fetch_lesson_context_for_question(question_id)
                )

        return {
            "question": final_question,
            "model_answer": final_model_answer,
            "lesson_context": lesson_context,
        }


class AnswerGradingAgent:
    """LangChain agent for grading Business Studies answers"""

    def __init__(
        self,
        api_key: str,
        model: str = None,
        temperature: float = None,
        max_tokens: int = None
    ):
        """Initialize the grading agent with configuration"""
        load_dotenv('config.env')

        self.model = model or os.getenv(
            'GRADING_MODEL', 'gpt-4o-mini'
        )
        self.temperature = temperature or float(
            os.getenv('GRADING_TEMPERATURE', '0.1')
        )
        # Slightly lower default for speed, still enough for feedback
        self.max_tokens = max_tokens or int(
            os.getenv('GRADING_MAX_TOKENS', '1500')
        )

        if os.getenv('LANGSMITH_TRACING', 'false').lower() == 'true':
            os.environ['LANGSMITH_TRACING'] = 'true'
            os.environ['LANGSMITH_ENDPOINT'] = os.getenv(
                'LANGSMITH_ENDPOINT', 'https://api.smith.langchain.com'
            )
            os.environ['LANGSMITH_API_KEY'] = os.getenv(
                'LANGSMITH_API_KEY', ''
            )
            os.environ['LANGSMITH_PROJECT'] = os.getenv(
                'LANGSMITH_PROJECT', 'imtehaan-ai-tutor'
            )
            print("🔍 LangSmith tracing enabled for grading system")

        self.llm = ChatOpenAI(
            model=self.model,
            temperature=self.temperature,
            max_tokens=self.max_tokens,
            openai_api_key=api_key,
            timeout=30,
            max_retries=1
        )
        self.repo = SupabaseRepository()

        self.question_searcher = QuestionEmbeddingsSearcher(self.repo)
        self.rag_retriever = RAGRetriever(self.repo)

        self.concept_detector = ConceptDetector(
            self.repo,
            self.llm,
            question_searcher=self.question_searcher,
        )
        self.reasoning_classifier = ReasoningClassifier(self.llm)
        self.misconception_detector = MisconceptionDetector(self.llm)
        self.mastery_engine = MasteryEngine()
        self.weakness_engine = WeaknessEngine(self.repo)
        self.trend_updater = TrendUpdater(self.repo)
        self._setup_agent()

    def _setup_agent(self):
        """Setup the LangChain agent with tools and prompts"""
        pass

    def _get_system_prompt(self) -> str:
        """Get the system prompt for the grading agent"""
        return """You are an expert Cambridge IGCSE Business Studies examiner.

Your job is to:
1. Grade student answers using the JSON schema provided.
2. Compare the student response to the model answer.
3. Detect the presence or absence of:
   • Knowledge
   • Application
   • Analysis
   • Evaluation

────────────────────────────────────────
MARK-BASED EXPECTATION RULES
────────────────────────────────────────
You must evaluate whether the student included the correct
components based on the mark allocation:

• For 2-mark questions, the student is expected to include
  Knowledge only
• For 4-mark questions, the student must include Knowledge +
  Application
• For 6-mark questions, the student must include Knowledge +
  Application + Analysis
• For 8+ marks, the student must include Knowledge + Application +
  Analysis + Evaluation

If the student misses any component required for that mark level,
explicitly mention it as a weakness.

────────────────────────────────────────
FEEDBACK REQUIREMENTS
────────────────────────────────────────
When writing feedback:
• Explicitly mention strengths and weaknesses in Knowledge,
  Application, Analysis, Evaluation.
• Be specific: "Your Application was weak because you did not use
  the business context."
• Identify misunderstandings.
• Encourage the student but remain academically strict.
• Make the connection between the required marks and the missing
  components clear.

IMPORTANT:
• DO NOT modify any JSON fields or output structure.
• DO NOT add new fields.
• Maintain existing grading logic and schema.
• Only influence how feedback is phrased in the fields already defined.

You are ONLY grading. Do not generate a full model answer."""

    def grade_answer(
        self,
        question: str,
        model_answer: str,
        student_answer: str,
        user_id: str = None,
        max_marks: int = None,
        question_id: str = None,
        topic_id: str = None,
        difficulty_level: int = None
    ) -> GradingResult:
        """
        Grade a student answer against the model answer.

        Single LLM call on the hot path.
        """
        total_start = time.time()

        if DEBUG_MODE:
            logger.info("=" * 80)
            logger.info("🎯 [GRADING] Starting answer grading")
            logger.info("=" * 80)
            logger.info(f"📝 Question ID: {question_id}")
            logger.info(f"👤 User ID: {user_id}")
            logger.info(f"📚 Topic ID: {topic_id}")
            logger.info(f"📊 Max Marks: {max_marks}")
            logger.info(f"🎚️  Difficulty Level: {difficulty_level}")
            logger.info(f"📏 Question Length: {len(question)} chars")
            logger.info(
                f"📏 Student Answer Length: {len(student_answer)} chars"
            )
            logger.info("-" * 80)

        try:
            # RAG: get final question, model_answer, and any lesson/context
            rag_start = time.time()
            bundle = self.rag_retriever.get_bundle(
                question=question,
                model_answer=model_answer,
                question_id=question_id,
            )
            rag_elapsed = time.time() - rag_start
            rag_question = bundle["question"]
            rag_model_answer = bundle["model_answer"]
            lesson_context = bundle["lesson_context"]

            if DEBUG_MODE:
                logger.info(
                    f"🔍 [RAG] Retrieval completed in {rag_elapsed:.2f}s"
                )
                logger.info(
                    f"   Question from RAG: {rag_question[:100]}..."
                )
                logger.info(
                    f"   Lesson Context Length: {len(lesson_context)} chars"
                )
                logger.info(
                    f"   Using RAG Question: {rag_question != question}"
                )
                logger.info(
                    f"   Using RAG Model Answer: "
                    f"{rag_model_answer != model_answer}"
                )
                logger.info("-" * 80)

            # Truncate inputs to reduce token usage and speed
            q_trunc = (
                rag_question[:350] + "..."
                if len(rag_question) > 350
                else rag_question
            )
            m_trunc = (
                rag_model_answer[:500] + "..."
                if len(rag_model_answer) > 500
                else rag_model_answer
            )
            a_trunc = (
                student_answer[:350] + "..."
                if len(student_answer) > 350
                else student_answer
            )
            ctx_trunc = (
                lesson_context[:150] + "..."
                if lesson_context and len(lesson_context) > 150
                else (lesson_context or "")
            )

            marks_hint = (
                f"Max marks for this question: {max_marks}.\n"
                if max_marks is not None else ""
            )

            system_prompt = self._get_system_prompt()

            # Build user prompt (grading instructions and content)
            user_prompt = (
                f"{marks_hint}"
                f"Now grade the following answer. Return ONLY JSON.\n\n"
                f"Question: {q_trunc}\n"
                f"Model Answer: {m_trunc}\n"
                f"Student Answer: {a_trunc}\n"
            )
            if ctx_trunc:
                user_prompt += f"Lesson Context (optional): {ctx_trunc}\n"

            user_prompt += (
                'Return JSON exactly in this shape:\n'
                '{"overall_score": <0-50>, '
                '"percentage": <0-100>, '
                '"grade": "<A|B|C|D|F>", '
                '"strengths": ["s1"], '
                '"areas_for_improvement": ["a1"], '
                '"specific_feedback": "<brief>", '
                '"suggestions": ["s1"], '
                '"reasoning_category": "<correct|partial|mild_confusion|'
                'wrong|high_confusion|misconception>", '
                '"has_misconception": <true|false>, '
                '"primary_concepts": ["id1"], '
                '"secondary_concepts": ["id2"]}'
            )

            llm_start = time.time()

            # Use proper message format: SystemMessage + HumanMessage
            # CRITICAL: Both messages MUST be sent to the LLM
            system_msg = SystemMessage(content=system_prompt)
            human_msg = HumanMessage(content=user_prompt)
            messages = [system_msg, human_msg]

            # Explicit verification that both messages are present
            if len(messages) != 2:
                error_msg = (
                    f"CRITICAL ERROR: Expected 2 messages, got {len(messages)}"
                )
                logger.error(error_msg)
                raise ValueError(error_msg)

            if not isinstance(messages[0], SystemMessage):
                error_msg = (
                    "CRITICAL ERROR: First message is not a SystemMessage"
                )
                logger.error(error_msg)
                raise ValueError(error_msg)

            if not isinstance(messages[1], HumanMessage):
                error_msg = (
                    "CRITICAL ERROR: Second message is not a HumanMessage"
                )
                logger.error(error_msg)
                raise ValueError(error_msg)

            if DEBUG_MODE:
                logger.info("🤖 [LLM] Invoking grading LLM (single call)...")
                logger.info(
                    "   System prompt length: {} chars".format(
                        len(system_prompt)
                    )
                )
                logger.info(
                    "   User prompt length: {} chars".format(len(user_prompt))
                )
                logger.info("=" * 80)
                logger.info("📤 VERIFYING MESSAGES BEFORE SENDING:")
                logger.info("=" * 80)
                logger.info(
                    "   ✅ Message 1: {} ({} chars)".format(
                        type(messages[0]).__name__,
                        len(messages[0].content)
                    )
                )
                logger.info(
                    "   ✅ Message 2: {} ({} chars)".format(
                        type(messages[1]).__name__,
                        len(messages[1].content)
                    )
                )
                logger.info("   ✅ Total messages: {}".format(len(messages)))
                logger.info("=" * 80)
                logger.info("📋 SYSTEM MESSAGE PREVIEW (first 200 chars):")
                logger.info("   " + messages[0].content[:200] + "...")
                logger.info("=" * 80)
                logger.info("📋 USER MESSAGE PREVIEW (first 200 chars):")
                logger.info("   " + messages[1].content[:200] + "...")
                logger.info("=" * 80)
                logger.info("🚀 Sending BOTH messages to LLM now...")

            # Invoke LLM with both messages
            # CRITICAL: ChatOpenAI.invoke() MUST receive both SystemMessage
            # and HumanMessage. LangChain's tracing may show simplified view,
            # but both are sent to OpenAI API
            if DEBUG_MODE:
                logger.info("=" * 80)
                logger.info("🔍 FINAL MESSAGE VERIFICATION BEFORE LLM CALL:")
                logger.info("=" * 80)
                for i, msg in enumerate(messages, 1):
                    msg_type = type(msg).__name__
                    base_type = (
                        msg.__class__.__bases__[0].__name__
                        if msg.__class__.__bases__ else "N/A"
                    )
                    logger.info(
                        "   Message {}: {} (base: {})".format(
                            i, msg_type, base_type
                        )
                    )
                    logger.info(
                        "   Content preview: {}...".format(
                            msg.content[:100]
                        )
                    )
                logger.info("=" * 80)
                logger.info(
                    "📤 Calling llm.invoke() with {} messages".format(
                        len(messages)
                    )
                )
                logger.info(
                    "   Note: LangChain tracing may show simplified view, "
                    "but both messages are sent to OpenAI API"
                )
                logger.info("=" * 80)

            # CRITICAL: Pass messages list directly to invoke()
            # This ensures SystemMessage goes as 'system' role and
            # HumanMessage goes as 'user' role in the OpenAI API call
            #
            # IMPORTANT: If LangChain tracing shows only HumanMessage, it may
            # be a display issue. The actual OpenAI API call should include
            # both messages. However, to ensure both are sent, we'll verify
            # the message structure one more time before invoking.
            if DEBUG_MODE:
                # Log the actual message objects being sent
                logger.info("=" * 80)
                logger.info(
                    "🔍 FINAL CHECK - Messages being sent to invoke():"
                )
                logger.info("=" * 80)
                for i, msg in enumerate(messages, 1):
                    msg_type = type(msg).__name__
                    msg_role = getattr(msg, 'type', 'N/A')
                    msg_length = len(msg.content)
                    logger.info(
                        "   [{}] Type: {}, Role: {}, Length: {} chars".format(
                            i, msg_type, msg_role, msg_length
                        )
                    )
                    logger.info("-" * 80)
                    logger.info("   FULL CONTENT:")
                    logger.info("-" * 80)
                    # Show full content, but split into chunks if too long
                    content = msg.content
                    if len(content) > 2000:
                        logger.info("   " + content[:2000])
                        logger.info(
                            "   ... (truncated, total: {} chars)".format(
                                len(content)
                            )
                        )
                    else:
                        logger.info("   " + content)
                    logger.info("=" * 80)

            try:
                # Ensure we're passing the list of messages, not a single
                # message. ChatOpenAI.invoke() should handle
                # [SystemMessage, HumanMessage] correctly and send both to
                # OpenAI API
                result = self.llm.invoke(messages)
            except Exception as e:
                if DEBUG_MODE:
                    logger.error(
                        "❌ [LLM] Error invoking LLM with messages: {}".format(
                            e
                        )
                    )
                    logger.error(
                        "   Messages sent: {} (types: {})".format(
                            len(messages),
                            [type(m).__name__ for m in messages]
                        )
                    )
                raise
            llm_elapsed = time.time() - llm_start

            if DEBUG_MODE:
                logger.info(f"✅ [LLM] Response received in {llm_elapsed:.2f}s")
                logger.info(f"   Response Length: {len(result.content)} chars")
                logger.info("-" * 80)

            # Direct JSON parsing path (fast path)
            parse_start = time.time()
            grading_result: GradingResult
            try:
                if DEBUG_MODE:
                    logger.info(
                        "🔍 [PARSING] Attempting direct JSON parsing..."
                    )
                content = result.content.strip()
                json_start = content.find('{')
                json_end = content.rfind('}') + 1
                if json_start >= 0 and json_end > json_start:
                    json_str = content[json_start:json_end]
                    parsed_data = json.loads(json_str)

                    required_keys = ['overall_score', 'percentage', 'grade']
                    if all(key in parsed_data for key in required_keys):
                        parse_elapsed = time.time() - parse_start
                        if DEBUG_MODE:
                            logger.info(
                                f"✅ [PARSING] Direct JSON parsing successful "
                                f"in {parse_elapsed:.2f}s"
                            )
                            score = parsed_data.get('overall_score')
                            logger.info(f"   Score: {score}/50")
                            percentage = parsed_data.get('percentage')
                            logger.info(f"   Percentage: {percentage}%")
                            grade = parsed_data.get('grade')
                            logger.info(f"   Grade: {grade}")
                            reasoning = parsed_data.get('reasoning_category')
                            logger.info(f"   Reasoning: {reasoning}")
                            misconception = parsed_data.get(
                                'has_misconception'
                            )
                            logger.info(f"   Misconception: {misconception}")
                            primary = parsed_data.get('primary_concepts', [])
                            logger.info(f"   Primary Concepts: {primary}")
                            secondary = parsed_data.get(
                                'secondary_concepts', []
                            )
                            logger.info(f"   Secondary Concepts: {secondary}")
                            logger.info("-" * 80)

                        grading_result = GradingResult(
                            overall_score=parsed_data['overall_score'],
                            percentage=parsed_data['percentage'],
                            grade=parsed_data['grade'],
                            strengths=parsed_data.get('strengths', []),
                            areas_for_improvement=parsed_data.get(
                                'areas_for_improvement', []
                            ),
                            specific_feedback=parsed_data.get(
                                'specific_feedback', ''
                            ),
                            suggestions=parsed_data.get('suggestions', []),
                            reasoning_category=parsed_data.get(
                                'reasoning_category', 'partial'
                            ),
                            has_misconception=parsed_data.get(
                                'has_misconception', False
                            ),
                            primary_concept_ids=parsed_data.get(
                                'primary_concepts', []
                            ),
                            secondary_concept_ids=parsed_data.get(
                                'secondary_concepts', []
                            )
                        )

                        if DEBUG_MODE:
                            logger.info(
                                "🔍 [MASTERY] Processing mastery updates..."
                            )
                        self._process_mastery_and_analytics(
                            grading_result, user_id, max_marks,
                            difficulty_level, question_id
                        )

                        if user_id and question_id:
                            if DEBUG_MODE:
                                logger.info("=" * 80)
                                logger.info(
                                    "💾 [LOGGING] Logging question attempt..."
                                )
                                logger.info("=" * 80)
                            try:
                                self.repo.log_question_attempt(
                                    user_id=user_id,
                                    question_id=question_id,
                                    topic_id=topic_id,
                                    raw_score=grading_result.overall_score,
                                    percentage=grading_result.percentage,
                                    grade=grading_result.grade,
                                    reasoning_category=(
                                        grading_result.reasoning_category
                                    ),
                                    has_misconception=(
                                        grading_result.has_misconception
                                    ),
                                    primary_concept_ids=(
                                        grading_result.primary_concept_ids
                                    ),
                                    secondary_concept_ids=(
                                        grading_result.secondary_concept_ids
                                    )
                                )
                                if DEBUG_MODE:
                                    logger.info(
                                        "✅ [LOGGING] Question attempt "
                                        "logged successfully"
                                    )
                            except Exception as e:
                                logger.warning(
                                    f"Failed to log question attempt: {e}. "
                                    "Grading will continue without logging."
                                )

                        total_elapsed = time.time() - total_start
                        if DEBUG_MODE:
                            logger.info("=" * 80)
                            logger.info(
                                f"✅ [GRADING] Completed in "
                                f"{total_elapsed:.2f}s"
                            )
                            logger.info(
                                f"   Breakdown: RAG={rag_elapsed:.2f}s, "
                                f"LLM={llm_elapsed:.2f}s, "
                                f"Parse={parse_elapsed:.2f}s"
                            )
                            logger.info("=" * 80)

                        return grading_result
            except (json.JSONDecodeError, KeyError, ValueError) as e:
                parse_elapsed = time.time() - parse_start
                if DEBUG_MODE:
                    logger.warning(
                        f"⚠️  [PARSING] Direct JSON parsing failed in "
                        f"{parse_elapsed:.2f}s: {e}"
                    )
                    logger.info("   Falling back to structured parsing...")
                logger.warning(
                    f"Direct JSON parsing failed: {e}. "
                    f"Falling back to structured parsing."
                )
                # fall through

            # Fallback: structured parsing without extra LLM calls
            if DEBUG_MODE:
                logger.info("🔍 [PARSING] Using structured parsing fallback...")
            grading_result = self._parse_grading_result(
                {"output": result.content},
                question,
                model_answer,
                student_answer,
                user_id,
                max_marks,
                question_id,
                rag_question=rag_question,
                rag_model_answer=rag_model_answer,
                difficulty_level=difficulty_level,
            )

            if user_id and question_id:
                if DEBUG_MODE:
                    logger.info("=" * 80)
                    logger.info("💾 [LOGGING] Logging question attempt...")
                    logger.info("=" * 80)
                try:
                    self.repo.log_question_attempt(
                        user_id=user_id,
                        question_id=question_id,
                        topic_id=topic_id,
                        raw_score=grading_result.overall_score,
                        percentage=grading_result.percentage,
                        grade=grading_result.grade,
                        reasoning_category=grading_result.reasoning_category,
                        has_misconception=grading_result.has_misconception,
                        primary_concept_ids=(
                            grading_result.primary_concept_ids
                        ),
                        secondary_concept_ids=(
                            grading_result.secondary_concept_ids
                        )
                    )
                except Exception as e:
                    logger.warning(
                        f"Failed to log question attempt to Supabase: {e}. "
                        "Grading will continue without logging."
                    )
                    if DEBUG_MODE:
                        logger.info("✅ [LOGGING] Question attempt logged")

            total_elapsed = time.time() - total_start
            if DEBUG_MODE:
                logger.info("=" * 80)
                logger.info(
                    f"✅ [GRADING] Completed in {total_elapsed:.2f}s"
                )
                logger.info(
                    f"   Final Score: {grading_result.overall_score}/50 "
                    f"({grading_result.percentage}%)"
                )
                logger.info(f"   Grade: {grading_result.grade}")
                logger.info("=" * 80)

            return grading_result

        except Exception as e:
            total_elapsed = time.time() - total_start
            if DEBUG_MODE:
                logger.error("=" * 80)
                logger.error(
                    f"❌ [GRADING] Error after {total_elapsed:.2f}s: {e}"
                )
                logger.error("=" * 80)
            logger.error(f"Error during grading: {e}")
            return self._create_fallback_result(
                question, model_answer, student_answer
            )

    def _parse_grading_result(
        self,
        agent_result: Dict,
        question: str,
        model_answer: str,
        student_answer: str,
        user_id: str = None,
        max_marks: int = None,
        question_id: str | None = None,
        rag_question: str | None = None,
        rag_model_answer: str | None = None,
        difficulty_level: int | None = None,
    ) -> GradingResult:
        """
        Parse the agent result into a structured GradingResult.

        IMPORTANT: This fallback path does NOT make extra LLM calls.
        """
        try:
            output = agent_result.get("output", "").strip()

            # Try to salvage JSON from the output (again) without LLM
            json_start = output.find('{')
            json_end = output.rfind('}') + 1
            if json_start >= 0 and json_end > json_start:
                try:
                    json_str = output[json_start:json_end]
                    parsed_data = json.loads(json_str)

                    grading_result = GradingResult(
                        overall_score=parsed_data.get('overall_score', 0),
                        percentage=parsed_data.get('percentage', 0.0),
                        grade=parsed_data.get('grade', 'F'),
                        strengths=parsed_data.get('strengths', []),
                        areas_for_improvement=parsed_data.get(
                            'areas_for_improvement', []
                        ),
                        specific_feedback=parsed_data.get(
                            'specific_feedback',
                            "Feedback could not be fully parsed."
                        ),
                        suggestions=parsed_data.get('suggestions', []),
                        reasoning_category=parsed_data.get(
                            'reasoning_category', 'partial'
                        ),
                        has_misconception=parsed_data.get(
                            'has_misconception', False
                        ),
                        primary_concept_ids=parsed_data.get(
                            'primary_concepts', []
                        ),
                        secondary_concept_ids=parsed_data.get(
                            'secondary_concepts', []
                        )
                    )
                except Exception:
                    # If even that fails, use a safe default
                    grading_result = self._create_structured_result(
                        output, question, model_answer, student_answer
                    )
            else:
                grading_result = self._create_structured_result(
                    output, question, model_answer, student_answer
                )

            # Process mastery and analytics (no extra LLM)
            self._process_mastery_and_analytics(
                grading_result, user_id, max_marks, difficulty_level,
                question_id
            )

            return grading_result

        except Exception as e:
            logger.error(f"Error parsing grading result: {e}")
            return self._create_fallback_result(
                question, model_answer, student_answer
            )

    def _process_mastery_and_analytics(
        self,
        result: GradingResult,
        user_id: str | None,
        max_marks: int | None,
        difficulty_level: int | None,
        question_id: str | None
    ):
        """
        Process mastery updates and analytics (extracted for reuse).
        Uses batch operations for Supabase where possible.
        """
        mastery_start = time.time()

        result.mastery_deltas = {}
        if not user_id:
            if DEBUG_MODE:
                logger.info("🔍 [Mastery] Skipped - no user_id provided")
            return

        all_concepts = (
            result.primary_concept_ids + result.secondary_concept_ids
        )
        if not all_concepts:
            if DEBUG_MODE:
                logger.info("🔍 [Mastery] Skipped - no concepts detected")
            return

        reasoning = result.reasoning_category
        miscon = result.has_misconception

        if DEBUG_MODE:
            logger.info(
                f"🔍 [Mastery] Processing {len(all_concepts)} concepts for "
                f"user {user_id}"
            )
            logger.info(
                f"   Reasoning: {reasoning}, Misconception: {miscon}, "
                f"Max Marks: {max_marks}, Difficulty: {difficulty_level}"
            )
            logger.info("=" * 80)
            logger.info("📊 [DIFFICULTY] Calculation Breakdown:")
            if max_marks:
                if max_marks <= 2:
                    logger.info(f"   Max Marks: {max_marks} → Low (1)")
                elif max_marks <= 4:
                    logger.info(f"   Max Marks: {max_marks} → Medium (2)")
                else:
                    logger.info(f"   Max Marks: {max_marks} → High (3)")
            else:
                logger.info("   Max Marks: None (using default)")
            if difficulty_level:
                diff_map = {1: "Low", 2: "Medium", 3: "High"}
                logger.info(
                    f"   Difficulty Level: {difficulty_level} "
                    f"({diff_map.get(difficulty_level, 'Unknown')})"
                )
            else:
                logger.info("   Difficulty Level: None")
            logger.info("=" * 80)

        trends_batch = []
        weaknesses_batch = []

        for cid in all_concepts:
            if not cid:
                continue

            delta = self.mastery_engine.compute(
                reasoning,
                max_marks=max_marks,
                difficulty_level=difficulty_level,
            )

            if DEBUG_MODE:
                logger.info(
                    f"   Concept {cid}: Delta = {delta:.2f} "
                    f"(reasoning={reasoning}, marks={max_marks}, "
                    f"difficulty={difficulty_level})"
                )

            new_mastery = self.repo.update_mastery(user_id, cid, delta)

            if new_mastery is not None:
                result.mastery_deltas[cid] = delta

                trends_batch.append({
                    "user_id": user_id,
                    "concept_id": cid,
                    "mastery": new_mastery
                })

                is_weak = new_mastery < 40 or miscon
                weaknesses_batch.append({
                    "user_id": user_id,
                    "concept_id": cid,
                    "is_weak": is_weak
                })

                if DEBUG_MODE:
                    logger.info(
                        f"   Concept {cid}: New mastery = {new_mastery:.2f}, "
                        f"Is Weak = {is_weak}"
                    )

        if trends_batch:
            try:
                if DEBUG_MODE:
                    logger.info("=" * 80)
                    logger.info(
                        "📊 [SUPABASE] Batch operations starting..."
                    )
                    logger.info("=" * 80)
                self.repo.batch_log_trends(trends_batch)
                if DEBUG_MODE:
                    logger.info(
                        f"✅ [BATCH] Logged {len(trends_batch)} trends"
                    )
            except Exception as e:
                if DEBUG_MODE:
                    logger.warning(f"Batch trend logging failed: {e}")

        if weaknesses_batch:
            try:
                self.repo.batch_update_weaknesses(weaknesses_batch)
                if DEBUG_MODE:
                    logger.info(
                        f"✅ [BATCH] Updated {len(weaknesses_batch)} "
                        f"weaknesses"
                    )
                    logger.info("=" * 80)
            except Exception as e:
                if DEBUG_MODE:
                    logger.warning(f"Batch weakness update failed: {e}")

        mastery_elapsed = time.time() - mastery_start
        if DEBUG_MODE:
            logger.info("=" * 80)
            logger.info(
                f"✅ [Mastery] Processing completed in "
                f"{mastery_elapsed:.2f}s"
            )
            logger.info(
                f"   Mastery deltas: {result.mastery_deltas}"
            )
            logger.info("=" * 80)
            logger.info(
                "📊 [SUPABASE] SUMMARY OF ENTRIES CREATED:"
            )
            logger.info("=" * 80)
            logger.info(
                "   ✅ question_attempts: 1 entry (logged above)"
            )
            mastery_count = len(result.mastery_deltas)
            logger.info(
                f"   ✅ user_mastery: {mastery_count} entries "
                f"created/updated"
            )
            trends_count = len(trends_batch)
            logger.info(
                f"   ✅ user_trends: {trends_count} entries created"
            )
            weaknesses_count = len(weaknesses_batch)
            logger.info(
                f"   ✅ user_weaknesses: {weaknesses_count} entries "
                f"created/updated"
            )
            logger.info("=" * 80)

    def _create_structured_result(
        self,
        output: str,
        question: str,
        model_answer: str,
        student_answer: str
    ) -> GradingResult:
        """
        Create a structured result when JSON parsing fails.

        IMPORTANT: No extra LLM calls here.
        """
        if DEBUG_MODE:
            logger.warning(
                "⚠️  [FALLBACK] Using static structured result fallback. "
                "No extra LLM call."
            )

        return GradingResult(
            overall_score=25,
            percentage=50.0,
            grade="D",
            strengths=[
                "You attempted the question and provided a relevant response.",
            ],
            areas_for_improvement=[
                "Your answer did not fully match the expected structure.",
                "Key Business Studies concepts were not clearly explained.",
                "Application, analysis or evaluation may be missing."
            ],
            specific_feedback=(
                "The grading system could not reliably parse the detailed "
                "feedback from the AI. This is a technical fallback result. "
                "Please retry the question later or contact support if this "
                "keeps happening."
            ),
            suggestions=[
                "Write your answer in full sentences with clear points.",
                (
                    "Make sure you define key terms and link them to the "
                    "case/context."
                ),
                (
                    "Add at least one explanation and one consequence or "
                    "evaluation."
                )
            ]
        )

    def _create_fallback_result(
        self,
        question: str,
        model_answer: str,
        student_answer: str
    ) -> GradingResult:
        """Create a fallback result when grading fully fails"""
        if DEBUG_MODE:
            logger.error("❌ [FALLBACK] Creating hard fallback result.")

        return GradingResult(
            overall_score=0,
            percentage=0.0,
            grade="F",
            strengths=["Answer submitted successfully"],
            areas_for_improvement=[
                "Grading system error - please contact support"
            ],
            specific_feedback=(
                "There was an error in the grading system. "
                "Please try again or contact support."
            ),
            suggestions=[
                "Retry grading",
                "Check answer format",
                "Contact technical support"
            ]
        )


def main():
    """Example usage of the AnswerGradingAgent"""

    api_key = os.getenv('OPENAI_API_KEY')
    if not api_key:
        print("❌ Error: OPENAI_API_KEY not found in config.env")
        print("Please check your config.env file")
        return

    agent = AnswerGradingAgent(api_key)

    question = (
        "Explain the concept of market segmentation and its "
        "importance in business strategy."
    )

    model_answer = """
    Market segmentation is the process of dividing a broad consumer
    or business market into sub-groups of consumers based on shared
    characteristics. This concept is crucial for business strategy
    for several reasons:

    1. Targeted Marketing: It allows businesses to focus their
       marketing efforts on specific customer groups, leading to more
       effective campaigns and higher conversion rates.

    2. Product Development: Understanding different segments helps
       in developing products that meet the specific needs and
       preferences of target customers.

    3. Competitive Advantage: By serving specific segments well,
       businesses can differentiate themselves from competitors and
       build customer loyalty.

    4. Resource Allocation: It enables efficient allocation of
       marketing and development resources to the most profitable
       customer segments.

    5. Customer Satisfaction: Tailored products and services lead
       to higher customer satisfaction and retention rates.

    Examples of segmentation criteria include demographic factors
    (age, income), geographic location, psychographic characteristics
    (lifestyle, values), and behavioral patterns (usage rate,
    brand loyalty).
    """

    student_answer = """
    Market segmentation is when you divide customers into groups.
    It's important because it helps businesses sell products better.
    You can target different people with different marketing. It also
    helps make products that people want. Companies can compete better
    this way.
    """

    print("🤖 Starting answer grading...")
    print(f"Question: {question}")
    print(f"Student Answer: {student_answer}")
    print("\n" + "=" * 50 + "\n")

    result = agent.grade_answer(
        question,
        model_answer,
        student_answer,
        user_id=None,
        max_marks=6
    )

    print("📊 GRADING RESULTS")
    print("=" * 50)
    print(f"Overall Score: {result.overall_score}/50")
    print(f"Percentage: {result.percentage}%")
    print(f"Grade: {result.grade}")

    print("\n✅ STRENGTHS:")
    for strength in result.strengths:
        print(f"  • {strength}")

    print("\n🔧 AREAS FOR IMPROVEMENT:")
    for area in result.areas_for_improvement:
        print(f"  • {area}")

    print("\n💡 SPECIFIC FEEDBACK:")
    print(f"  {result.specific_feedback}")

    print("\n🚀 SUGGESTIONS:")
    for suggestion in result.suggestions:
        print(f"  • {suggestion}")


if __name__ == "__main__":
    main()
