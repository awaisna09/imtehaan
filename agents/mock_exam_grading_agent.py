#!/usr/bin/env python3
"""
Mock Exam Grading Agent
This agent grades complete mock exams by evaluating all attempted questions
and updating adaptive learning signals (mastery, weaknesses, readiness).
"""

import os
import json
import asyncio
import statistics
import time
from typing import List, Dict, Optional, TypedDict
from datetime import datetime, timedelta
from uuid import uuid4
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from pydantic import BaseModel, Field, field_validator, model_validator
import logging
from collections import defaultdict
from functools import wraps

# LangGraph imports
try:
    from langgraph.graph import StateGraph, END
    LANGGRAPH_AVAILABLE = True
except ImportError:
    LANGGRAPH_AVAILABLE = False
    StateGraph = None
    END = None

# FastAPI imports
try:
    from fastapi import FastAPI, HTTPException, Request, Depends
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse
    FASTAPI_AVAILABLE = True
except ImportError:
    FASTAPI_AVAILABLE = False
    FastAPI = None
    Depends = None
    JSONResponse = None

# Load environment variables
load_dotenv("config.env")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Metrics tracking
_metrics = {
    "jobs_created": 0,
    "jobs_completed": 0,
    "jobs_failed": 0,
    "questions_graded": 0,
    "api_requests": 0,
    "api_errors": 0,
    "supabase_retries": 0,
    "supabase_failures": 0,
}


def log_metric(metric_name: str, value: int = 1):
    """Log a metric."""
    if metric_name in _metrics:
        _metrics[metric_name] += value
    else:
        _metrics[metric_name] = value


def get_metrics() -> Dict:
    """Get current metrics."""
    return _metrics.copy()


# Retry decorator for Supabase operations
def retry_supabase_operation(
    max_retries: int = 3,
    delay: float = 1.0,
    backoff: float = 2.0
):
    """Decorator to retry Supabase operations with exponential backoff."""
    def decorator(func):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(max_retries):
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    last_exception = e
                    if attempt < max_retries - 1:
                        wait_time = delay * (backoff ** attempt)
                        logger.warning(
                            f"Supabase operation failed (attempt "
                            f"{attempt + 1}/{max_retries}): {e}. "
                            f"Retrying in {wait_time}s..."
                        )
                        log_metric("supabase_retries")
                        await asyncio.sleep(wait_time)
                    else:
                        log_metric("supabase_failures")
                        logger.error(
                            f"Supabase operation failed after "
                            f"{max_retries} attempts: {e}"
                        )
            raise last_exception

        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    last_exception = e
                    if attempt < max_retries - 1:
                        wait_time = delay * (backoff ** attempt)
                        logger.warning(
                            f"Supabase operation failed (attempt "
                            f"{attempt + 1}/{max_retries}): {e}. "
                            f"Retrying in {wait_time}s..."
                        )
                        log_metric("supabase_retries")
                        time.sleep(wait_time)
                    else:
                        log_metric("supabase_failures")
                        logger.error(
                            f"Supabase operation failed after "
                            f"{max_retries} attempts: {e}"
                        )
            raise last_exception

        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    return decorator


# ============================================================================
# Data Models
# ============================================================================

class QuestionGrade(BaseModel):
    """Grade for a single question."""
    question_id: int
    question_number: int = 1
    part: str = ""
    question_text: str
    student_answer: str
    model_answer: str
    marks_allocated: int
    marks_awarded: float = Field(description="Marks awarded to the student")
    percentage_score: float = Field(
        description="Percentage score for this question"
    )
    feedback: str = Field(description="Detailed feedback on the answer")
    strengths: List[str] = Field(description="List of strengths in the answer")
    improvements: List[str] = Field(
        description="Areas that need improvement"
    )
    concept_ids: List[str] = Field(
        default_factory=list,
        description="List of concept IDs detected for this question"
    )


class ExamReport(BaseModel):
    """Complete exam grading report."""
    total_questions: int
    questions_attempted: int
    total_marks: int
    marks_obtained: float
    percentage_score: float
    overall_grade: str = Field(
        description="Letter grade: A+, A, B+, B, C+, C, D, F"
    )
    question_grades: List[QuestionGrade]
    overall_feedback: str = Field(
        description="Overall exam performance feedback"
    )
    recommendations: List[str] = Field(
        description="Recommendations for improvement"
    )
    strengths_summary: List[str] = Field(description="Overall strengths")
    weaknesses_summary: List[str] = Field(
        description="Overall weaknesses"
    )
    readiness_score: Optional[float] = Field(
        default=None, description="Readiness score (0-100)"
    )


# ============================================================================
# Core Agent
# ============================================================================

class MockExamGradingAgent:
    """Agent for grading complete mock exams and updating adaptive signals."""

    def __init__(self, api_key: str):
        """Initialize the grading agent."""
        self.api_key = api_key
        self.llm = ChatOpenAI(
            model=os.getenv("GRADING_MODEL", "gpt-5-nano-2025-08-07"),
            temperature=0.3,
            max_tokens=4000,
            openai_api_key=api_key,
        )

        # Initialize embeddings for concept detection
        try:
            self.embeddings = OpenAIEmbeddings(openai_api_key=api_key)
        except Exception as e:
            logger.warning(f"Could not initialize embeddings: {e}")
            self.embeddings = None

        # Initialize Supabase client
        try:
            from supabase import create_client

            self.supabase_url = os.getenv("SUPABASE_URL")
            self.supabase_key = (
                os.getenv("SUPABASE_SERVICE_ROLE_KEY")
                or os.getenv("SUPABASE_ANON_KEY")
            )
            if self.supabase_url and self.supabase_key:
                self.supabase = create_client(
                    self.supabase_url, self.supabase_key
                )
                logger.info(
                    "✅ Supabase client initialized for Mock Exam Grading Agent"
                )
            else:
                self.supabase = None
                logger.warning(
                    "⚠️ Supabase credentials not found - persistence disabled"
                )
        except ImportError:
            logger.warning(
                "⚠️ Supabase Python client not installed - "
                "persistence disabled"
            )
            self.supabase = None
        except Exception as e:
            logger.warning(f"⚠️ Error initializing Supabase: {e}")
            self.supabase = None

        logger.info("✅ Mock Exam Grading Agent initialized")

    # ---------------------------------------------------------------------
    # Concept Detection (for adaptive learning, not grading itself)
    # ---------------------------------------------------------------------
    def detect_concepts_for_question(self, question_text: str) -> List[str]:
        """
        Detect concept IDs for a question using embeddings and pgvector search.

        Args:
            question_text: The question text to analyze

        Returns:
            List of concept IDs (as strings)
        """
        if not self.supabase or not self.embeddings:
            return []

        try:
            # Generate embedding for question
            embedding = self.embeddings.embed_query(question_text)

            # Use Supabase RPC for pgvector similarity search
            # Uses concept_embeddings table (correct source of vectors)
            result = self.supabase.rpc(
                "match_concepts",
                {
                    "query_embedding": embedding,
                    "match_threshold": 0.7,
                    "match_count": 5,
                },
            ).execute()

            if result.data:
                concept_ids = [
                    item.get("concept_id")
                    for item in result.data
                    if item.get("concept_id") is not None
                ]
                return [str(cid) for cid in concept_ids]

            # No matches or RPC not wired – just return empty
            return []
        except Exception as e:
            logger.warning(
                f"Error detecting concepts for question: {e}",
                exc_info=True
            )
            # Fallback: try direct table query if RPC doesn't exist
            try:
                if self.supabase:
                    # Simple fallback - just return empty for now
                    logger.debug(
                        "RPC match_concepts failed, using fallback "
                        "(returning empty list)"
                    )
            except Exception as fallback_error:
                logger.debug(f"Fallback also failed: {fallback_error}")
            return []

    # ---------------------------------------------------------------------
    # Mastery / Weakness / Readiness logic
    # ---------------------------------------------------------------------
    def difficulty_weight_from_marks(self, marks: int) -> float:
        """Calculate difficulty weight based on marks allocated."""
        if marks <= 5:
            return 1.0
        elif marks <= 10:
            return 1.2
        else:
            return 1.5

    def base_delta_from_question_score(self, percentage_score: float) -> float:
        """Convert percentage score to mastery delta (-10 to +10 range)."""
        # Map 0–100% to -10 to +10 delta (50% = 0 delta)
        return (percentage_score - 50.0) / 5.0

    @retry_supabase_operation(max_retries=3, delay=1.0, backoff=2.0)
    def apply_mastery_update(
        self,
        user_id: str,
        concept_id: str,
        base_delta: float,
        marks_allocated: int,
    ) -> float:
        """
        Apply mastery update to Supabase with retry logic.

        Returns:
            New mastery value (0–100)
        """
        if not self.supabase:
            logger.warning(
                f"Supabase not available - skipping mastery update for "
                f"user {user_id}, concept {concept_id}"
            )
            return 0.0

        try:
            difficulty_weight = self.difficulty_weight_from_marks(
                marks_allocated
            )
            time_weight = 1.0  # Fixed for now
            exam_weight = 1.3  # Exam weighting factor

            final_delta = (
                base_delta * difficulty_weight * time_weight * exam_weight
            )

            # Get current mastery
            # Actual schema: mastery_score (INTEGER), id (BIGINT PK),
            # user_id (TEXT)
            result = (
                self.supabase.table("student_mastery")
                .select("mastery_score")
                .eq("user_id", user_id)
                .eq("concept_id", concept_id)
                .limit(1)
                .execute()
            )

            current_mastery = 50.0  # Default
            if result.data:
                current_mastery = float(
                    result.data[0].get("mastery_score", 50.0)
                )

            # Calculate new mastery
            new_mastery = max(0.0, min(100.0, current_mastery + final_delta))

            # Upsert mastery (actual schema uses mastery_score, id as PK)
            # Check if record exists first using id
            existing = (
                self.supabase.table("student_mastery")
                .select("id")
                .eq("user_id", user_id)
                .eq("concept_id", concept_id)
                .limit(1)
                .execute()
            )

            if existing.data:
                # Update existing record
                (
                    self.supabase.table("student_mastery")
                    .update(
                        {
                            "mastery_score": int(round(new_mastery)),
                            "updated_at": datetime.now().isoformat(),
                        }
                    )
                    .eq("user_id", user_id)
                    .eq("concept_id", concept_id)
                    .execute()
                )
            else:
                # Insert new record
                (
                    self.supabase.table("student_mastery")
                    .insert(
                        {
                            "user_id": user_id,
                            "concept_id": concept_id,
                            "mastery_score": int(round(new_mastery)),
                            "updated_at": datetime.now().isoformat(),
                        }
                    )
                    .execute()
                )

            logger.debug(
                f"Mastery updated: user={user_id}, concept={concept_id}, "
                f"old={current_mastery:.2f}, new={new_mastery:.2f}"
            )
            return new_mastery
        except Exception as e:
            logger.error(
                f"Error applying mastery update for user {user_id}, "
                f"concept {concept_id}: {e}",
                exc_info=True
            )
            return 0.0

    def classify_weakness_level(
        self, percentage_score: float
    ) -> Optional[str]:
        """Classify weakness level from percentage score."""
        if percentage_score < 30:
            return "critical"
        elif percentage_score < 40:
            return "high"
        elif percentage_score < 50:
            return "moderate"
        elif percentage_score < 60:
            return "low"
        else:
            return None

    def compute_readiness_score(
        self,
        user_id: str,
        exam_report: ExamReport,
        mastery_updates: Dict[str, float],
    ) -> float:
        """
        Compute readiness score using formula:
        R = 0.35M + 0.25E + 0.15T + 0.10C + 0.10D + 0.05S
        """
        # M = average mastery from mastery_updates
        if mastery_updates:
            M = sum(mastery_updates.values()) / len(mastery_updates)
        else:
            M = 50.0  # Default baseline

        # E = exam percentage_score
        E = exam_report.percentage_score

        # T = trend (simplified: 100 if E > 60, else 50)
        T = 100.0 if E > 60 else 50.0

        # C = confidence (100 if all questions attempted)
        if exam_report.questions_attempted == exam_report.total_questions:
            C = 100.0
        else:
            C = 70.0

        # D = difficulty (normalized from total_marks, assuming max 100)
        D = min(100.0, (exam_report.total_marks / 100.0) * 100.0)

        # S = consistency (std dev of question scores, normalized)
        if exam_report.question_grades:
            scores = [q.percentage_score for q in exam_report.question_grades]
            if len(scores) > 1:
                std_dev = statistics.stdev(scores)
                # Normalize: lower std dev = higher consistency
                S = max(0.0, 100.0 - (std_dev * 2))
            else:
                S = 50.0
        else:
            S = 50.0

        readiness = (
            0.35 * M
            + 0.25 * E
            + 0.15 * T
            + 0.10 * C
            + 0.10 * D
            + 0.05 * S
        )
        return max(0.0, min(100.0, readiness))

    # ---------------------------------------------------------------------
    # Grading (per exam and per question)
    # ---------------------------------------------------------------------
    def grade_exam(self, attempted_questions: List[Dict]) -> ExamReport:
        """
        Grade a complete mock exam.

        Args:
            attempted_questions: List of attempted questions with:
                - question
                - user_answer
                - solution / model_answer
                - marks

        Returns:
            ExamReport with detailed grading results.
        """
        try:
            logger.info(
                f"📝 Grading exam with "
                f"{len(attempted_questions)} attempted questions"
            )

            # Calculate total marks
            total_marks = sum(q.get("marks", 0) for q in attempted_questions)

            # Grade each question
            question_grades: List[QuestionGrade] = []
            for q in attempted_questions:
                grade = self._grade_single_question(q)
                question_grades.append(grade)

            # Calculate overall scores
            marks_obtained = sum(g.marks_awarded for g in question_grades)
            percentage_score = (
                (marks_obtained / total_marks * 100) if total_marks > 0 else 0
            )

            # Generate overall feedback
            overall_feedback = self._generate_overall_feedback(
                question_grades, percentage_score
            )

            # Generate recommendations
            recommendations = self._generate_recommendations(
                question_grades, percentage_score
            )

            # Generate strengths and weaknesses summary
            strengths, weaknesses = self._generate_summaries(question_grades)

            # Determine overall grade
            overall_grade = self._calculate_grade(percentage_score)

            report = ExamReport(
                total_questions=len(attempted_questions),
                questions_attempted=len(attempted_questions),
                total_marks=total_marks,
                marks_obtained=marks_obtained,
                percentage_score=round(percentage_score, 2),
                overall_grade=overall_grade,
                question_grades=question_grades,
                overall_feedback=overall_feedback,
                recommendations=recommendations,
                strengths_summary=strengths,
                weaknesses_summary=weaknesses,
            )

            logger.info(
                f"✅ Exam graded successfully. "
                f"Score: {percentage_score}% ({overall_grade})"
            )
            return report

        except Exception as e:
            logger.error(f"❌ Error grading exam: {e}")
            return self._create_fallback_report(attempted_questions)

    def _grade_single_question(self, question: Dict) -> QuestionGrade:
        """Grade a single question with concept detection (no RAG)."""
        try:
            question_id = question.get("question_id", 0)
            question_text = question.get("question", "")
            student_answer = question.get("user_answer", "")
            model_answer = (
                question.get("solution") or question.get("model_answer", "")
            )
            marks = question.get("marks", 0)
            part = question.get("part", "")
            question_number = (
                question.get("question_number", 0)
                if "question_number" in question
                else question_id
            )

            # Detect concepts for this question (for adaptive layer)
            concept_ids = self.detect_concepts_for_question(question_text)

            if not model_answer:
                # If no model answer provided, award marks based on effort
                return QuestionGrade(
                    question_id=question_id,
                    question_number=question_number,
                    part=part,
                    question_text=question_text,
                    student_answer=student_answer,
                    model_answer="No model answer available",
                    marks_allocated=marks,
                    marks_awarded=marks * 0.5 if student_answer.strip() else 0,
                    percentage_score=50.0 if student_answer.strip() else 0.0,
                    feedback=(
                        "Your answer has been recorded. Detailed grading "
                        "requires a model answer."
                    ),
                    strengths=(
                        ["Answer submitted"]
                        if student_answer.strip()
                        else ["Attempt made"]
                    ),
                    improvements=(
                        ["Keep practicing"]
                        if student_answer.strip()
                        else ["Try to provide an answer"]
                    ),
                    concept_ids=concept_ids,
                )

            # Build grading prompt (no lesson/RAG context here)
            grading_prompt = f"""
You are an expert examiner grading a Business Studies mock exam question.
Please evaluate the student's answer comprehensively.

QUESTION:
{question_text}

MODEL ANSWER:
{model_answer}

STUDENT'S ANSWER:
{student_answer}

MARKS ALLOCATED: {marks}

Please provide:
1. Marks awarded (0 to {marks})
2. Percentage score (0 to 100)
3. Detailed feedback on the answer
4. 2-3 key strengths
5. 2-3 areas for improvement

Be fair, constructive, and encouraging. Consider:
- Understanding of the topic
- Use of appropriate business terminology
- Structure and clarity of response
- Relevance of the content
- Depth of analysis

Return your response in this JSON format:
{{
    "marks_awarded": <number between 0 and {marks}>,
    "percentage_score": <number between 0 and 100>,
    "feedback": "<detailed feedback>",
    "strengths": ["strength1", "strength2", "strength3"],
    "improvements": ["improvement1", "improvement2"]
}}
"""

            response = self.llm.invoke(grading_prompt)

            # Parse the response
            try:
                result = json.loads(response.content)
            except json.JSONDecodeError:
                # Try to extract JSON from the response
                content = response.content
                json_start = content.find("{")
                json_end = content.rfind("}") + 1
                if json_start >= 0 and json_end > json_start:
                    result = json.loads(content[json_start:json_end])
                else:
                    raise ValueError("Could not parse JSON response")

            return QuestionGrade(
                question_id=question_id,
                question_number=question_number,
                part=part,
                question_text=question_text,
                student_answer=student_answer,
                model_answer=model_answer,
                marks_allocated=marks,
                marks_awarded=float(
                    result.get("marks_awarded", marks * 0.5)
                ),
                percentage_score=float(
                    result.get("percentage_score", 50.0)
                ),
                feedback=result.get(
                    "feedback", "Good effort on this question."
                ),
                strengths=result.get("strengths", ["Answer submitted"]),
                improvements=result.get("improvements", ["Keep practicing"]),
                concept_ids=concept_ids,
            )

        except Exception as e:
            logger.error(f"Error grading question {question_id}: {e}")
            model_ans = (
                question.get("solution")
                or question.get("model_answer", "No model answer")
            )
            return QuestionGrade(
                question_id=question.get("question_id", 0),
                question_number=question.get("question_number", 0),
                part=question.get("part", ""),
                question_text=question.get("question", ""),
                student_answer=question.get("user_answer", ""),
                model_answer=model_ans,
                marks_allocated=question.get("marks", 0),
                marks_awarded=0.0,
                percentage_score=0.0,
                feedback="Error in grading system. Please contact support.",
                strengths=["Answer submitted"],
                improvements=["Grading error occurred"],
                concept_ids=[],
            )

    # ---------------------------------------------------------------------
    # Report helpers
    # ---------------------------------------------------------------------
    def _generate_overall_feedback(
        self, question_grades: List[QuestionGrade], percentage: float
    ) -> str:
        """Generate overall feedback for the exam."""
        if percentage >= 90:
            return (
                f"Outstanding performance! You scored {percentage}%, "
                "demonstrating excellent mastery of Business Studies "
                "concepts. Your understanding is exceptional across all "
                "topics covered."
            )
        elif percentage >= 80:
            return (
                f"Excellent work! Your score of {percentage}% shows strong "
                "understanding of the material. You have a solid grasp of "
                "key concepts and can apply them effectively."
            )
        elif percentage >= 70:
            return (
                f"Good performance with {percentage}%. You demonstrate a "
                "solid understanding of most concepts. With some focused "
                "practice, you can achieve even better results."
            )
        elif percentage >= 60:
            return (
                f"Satisfactory performance at {percentage}%. You understand "
                "the basics but need to strengthen your knowledge in several "
                "areas. Keep studying!"
            )
        elif percentage >= 50:
            return (
                f"Below expectations at {percentage}%. Focus on understanding "
                "core concepts and improving your answer structure. More "
                "practice will help you improve significantly."
            )
        else:
            return (
                f"Needs improvement at {percentage}%. Review the fundamental "
                "concepts and work on building your understanding. Don't "
                "give up - consistent effort will lead to progress."
            )

    def _generate_recommendations(
        self, question_grades: List[QuestionGrade], percentage: float
    ) -> List[str]:
        """Generate recommendations based on performance."""
        recommendations: List[str] = []

        if percentage < 60:
            recommendations.append(
                "Review fundamental Business Studies concepts thoroughly"
            )
            recommendations.append(
                "Practice writing structured answers with clear points"
            )
            recommendations.append(
                "Focus on using appropriate business terminology"
            )
        elif percentage < 80:
            recommendations.append(
                "Strengthen understanding in weaker topic areas"
            )
            recommendations.append(
                "Practice providing more detailed analysis in answers"
            )
            recommendations.append(
                "Work on connecting concepts to real-world examples"
            )
        else:
            recommendations.append(
                "Continue practicing with more challenging questions"
            )
            recommendations.append(
                "Focus on refining your critical analysis skills"
            )
            recommendations.append("Maintain your excellent study habits")

        # Find questions with lowest scores
        low_scores = sorted(
            question_grades, key=lambda x: x.percentage_score
        )[:3]
        if low_scores:
            q = low_scores[0]
            recommendations.append(
                f"Pay special attention to Question {q.question_number} "
                f"Part {q.part} - scored {q.percentage_score}%"
            )

        return recommendations

    def _generate_summaries(
        self, question_grades: List[QuestionGrade]
    ) -> tuple[List[str], List[str]]:
        """Generate strengths and weaknesses summaries."""
        # Analyze common patterns
        all_strengths = [s for g in question_grades for s in g.strengths]
        all_improvements = [
            i for g in question_grades for i in g.improvements
        ]

        strength_counts: Dict[str, int] = {}
        improvement_counts: Dict[str, int] = {}

        for s in all_strengths:
            strength_counts[s] = strength_counts.get(s, 0) + 1

        for i in all_improvements:
            improvement_counts[i] = improvement_counts.get(i, 0) + 1

        # Get top 3 strengths
        strengths_pairs = sorted(
            strength_counts.items(), key=lambda x: x[1], reverse=True
        )[:3]
        strengths = [s[0] for s in strengths_pairs]

        # Get top 3 areas for improvement
        weaknesses_pairs = sorted(
            improvement_counts.items(), key=lambda x: x[1], reverse=True
        )[:3]
        weaknesses = [w[0] for w in weaknesses_pairs]

        if not strengths:
            strengths = [
                "Consistent effort across questions",
                "Completed all questions",
            ]

        if not weaknesses:
            weaknesses = [
                "Continue practicing",
                "Maintain focus and effort",
            ]

        return strengths, weaknesses

    def _calculate_grade(self, percentage: float) -> str:
        """Calculate letter grade from percentage."""
        if percentage >= 97:
            return "A+"
        elif percentage >= 93:
            return "A"
        elif percentage >= 87:
            return "B+"
        elif percentage >= 83:
            return "B"
        elif percentage >= 77:
            return "C+"
        elif percentage >= 73:
            return "C"
        elif percentage >= 65:
            return "D"
        else:
            return "F"

    def _create_fallback_report(
        self, attempted_questions: List[Dict]
    ) -> ExamReport:
        """Create a fallback report when grading fails."""
        total_marks = sum(q.get("marks", 0) for q in attempted_questions)

        return ExamReport(
            total_questions=len(attempted_questions),
            questions_attempted=len(attempted_questions),
            total_marks=total_marks,
            marks_obtained=0.0,
            percentage_score=0.0,
            overall_grade="F",
            question_grades=[],
            overall_feedback=(
                "Error in grading system. Please try again or contact "
                "support."
            ),
            recommendations=[
                "Retry the grading",
                "Contact technical support",
            ],
            strengths_summary=["Answers submitted successfully"],
            weaknesses_summary=["Grading system error"],
        )


# ============================================================================
# LangGraph State and Nodes
# ============================================================================

class MockExamState(TypedDict):
    """State for LangGraph mock exam grading workflow."""
    user_id: str
    attempted_questions: List[Dict]
    question_grades: List[QuestionGrade]
    exam_report: Optional[ExamReport]
    mastery_updates: Dict[str, float]
    readiness_score: Optional[float]
    concept_ids: List[str]
    request_id: Optional[str]
    job_id: Optional[str]


# Global agent instance for LangGraph nodes
_agent_instance: Optional[MockExamGradingAgent] = None


def set_agent_instance(agent: MockExamGradingAgent):
    """Set the agent instance for use in LangGraph nodes."""
    global _agent_instance
    _agent_instance = agent


def load_exam(state: MockExamState) -> Dict:
    """Node: Load and validate exam data."""
    request_id = state.get("request_id", "unknown")
    job_id = state.get("job_id", "unknown")

    logger.info(
        json.dumps(
            {
                "request_id": request_id,
                "job_id": job_id,
                "user_id": state.get("user_id"),
                "step": "load_exam",
                "message": "Loading exam data",
            }
        )
    )

    attempted_questions = state.get("attempted_questions", [])

    if not attempted_questions:
        raise ValueError("No attempted questions provided")

    return {
        "attempted_questions": attempted_questions,
    }


def grade_questions(state: MockExamState) -> Dict:
    """Node: Grade all questions."""
    request_id = state.get("request_id", "unknown")
    job_id = state.get("job_id", "unknown")
    user_id = state.get("user_id", "")

    logger.info(
        json.dumps(
            {
                "request_id": request_id,
                "job_id": job_id,
                "user_id": user_id,
                "step": "grade_questions",
                "message": "Grading questions",
            }
        )
    )

    if not _agent_instance:
        raise ValueError("Agent instance not set")

    attempted_questions = state.get("attempted_questions", [])
    question_grades: List[QuestionGrade] = []
    all_concept_ids: List[str] = []

    for q in attempted_questions:
        grade = _agent_instance._grade_single_question(q)
        question_grades.append(grade)
        all_concept_ids.extend(grade.concept_ids)

    return {
        "question_grades": question_grades,
        "concept_ids": list(set(all_concept_ids)),  # Deduplicate
    }


def aggregate_results(state: MockExamState) -> Dict:
    """Node: Aggregate results into ExamReport."""
    request_id = state.get("request_id", "unknown")
    job_id = state.get("job_id", "unknown")
    user_id = state.get("user_id", "")

    logger.info(
        json.dumps(
            {
                "request_id": request_id,
                "job_id": job_id,
                "user_id": user_id,
                "step": "aggregate_results",
                "message": "Aggregating results",
            }
        )
    )

    if not _agent_instance:
        raise ValueError("Agent instance not set")

    question_grades = state.get("question_grades", [])
    attempted_questions = state.get("attempted_questions", [])

    # Calculate total marks
    total_marks = sum(q.get("marks", 0) for q in attempted_questions)

    # Calculate overall scores
    marks_obtained = sum(g.marks_awarded for g in question_grades)
    percentage_score = (
        (marks_obtained / total_marks * 100) if total_marks > 0 else 0
    )

    # Generate overall feedback
    overall_feedback = _agent_instance._generate_overall_feedback(
        question_grades, percentage_score
    )

    # Generate recommendations
    recommendations = _agent_instance._generate_recommendations(
        question_grades, percentage_score
    )

    # Generate strengths and weaknesses summary
    strengths, weaknesses = _agent_instance._generate_summaries(
        question_grades
    )

    # Determine overall grade
    overall_grade = _agent_instance._calculate_grade(percentage_score)

    exam_report = ExamReport(
        total_questions=len(attempted_questions),
        questions_attempted=len(attempted_questions),
        total_marks=total_marks,
        marks_obtained=marks_obtained,
        percentage_score=round(percentage_score, 2),
        overall_grade=overall_grade,
        question_grades=question_grades,
        overall_feedback=overall_feedback,
        recommendations=recommendations,
        strengths_summary=strengths,
        weaknesses_summary=weaknesses,
        readiness_score=None,  # Will be set in next node
    )

    return {
        "exam_report": exam_report,
    }


def compute_mastery_and_readiness(state: MockExamState) -> Dict:
    """Node: Compute mastery updates and readiness score."""
    request_id = state.get("request_id", "unknown")
    job_id = state.get("job_id", "unknown")
    user_id = state.get("user_id", "")

    logger.info(
        json.dumps(
            {
                "request_id": request_id,
                "job_id": job_id,
                "user_id": user_id,
                "step": "compute_mastery_and_readiness",
                "message": "Computing mastery and readiness",
            }
        )
    )

    if not _agent_instance:
        raise ValueError("Agent instance not set")

    exam_report = state.get("exam_report")
    question_grades = state.get("question_grades", [])

    if not exam_report:
        return {
            "mastery_updates": {},
            "readiness_score": None,
        }

    # Compute mastery updates per concept
    mastery_updates: Dict[str, float] = {}
    weakness_updates: List[Dict[str, str]] = []

    for grade in question_grades:
        for concept_id in grade.concept_ids:
            # Calculate mastery delta
            base_delta = _agent_instance.base_delta_from_question_score(
                grade.percentage_score
            )
            new_mastery = _agent_instance.apply_mastery_update(
                user_id, concept_id, base_delta, grade.marks_allocated
            )
            mastery_updates[concept_id] = new_mastery

            # Check for weaknesses
            weakness_level = _agent_instance.classify_weakness_level(
                grade.percentage_score
            )
            if weakness_level:
                weakness_updates.append(
                    {
                        "concept_id": concept_id,
                        "level": weakness_level,
                    }
                )

    # Update weaknesses in Supabase with retry
    if _agent_instance.supabase and weakness_updates:
        @retry_supabase_operation(max_retries=3, delay=1.0, backoff=2.0)
        def insert_weakness(weakness_data: Dict):
            return (
                _agent_instance.supabase.table("student_weaknesses")
                .insert(weakness_data)
                .execute()
            )

        @retry_supabase_operation(max_retries=3, delay=1.0, backoff=2.0)
        def update_weakness(
            weakness_data: Dict, user_id: str, concept_id: str
        ):
            return (
                _agent_instance.supabase.table("student_weaknesses")
                .update(weakness_data)
                .eq("user_id", user_id)
                .eq("concept_id", concept_id)
                .execute()
            )

        for weakness in weakness_updates:
            try:
                # Actual schema: severity (not level), id (BIGINT PK),
                # created_at
                # Map level to severity
                severity_map = {
                    "critical": "critical",
                    "high": "high",
                    "moderate": "moderate",
                    "low": "low",
                }
                severity = severity_map.get(
                    weakness["level"],
                    weakness["level"]
                )

                # Check if record exists using id
                existing = (
                    _agent_instance.supabase.table("student_weaknesses")
                    .select("id")
                    .eq("user_id", user_id)
                    .eq("concept_id", weakness["concept_id"])
                    .limit(1)
                    .execute()
                )

                if existing.data:
                    # Update existing
                    update_weakness(
                        {
                            "severity": severity,
                            "created_at": datetime.now().isoformat(),
                        },
                        user_id,
                        weakness["concept_id"],
                    )
                else:
                    # Insert new
                    insert_weakness(
                        {
                            "user_id": user_id,
                            "concept_id": weakness["concept_id"],
                            "severity": severity,
                            "created_at": datetime.now().isoformat(),
                        }
                    )
            except Exception as e:
                logger.warning(
                    json.dumps({
                        "request_id": request_id,
                        "job_id": job_id,
                        "user_id": user_id,
                        "step": "compute_mastery_and_readiness",
                        "error": f"Error updating weakness: {e}",
                        "concept_id": weakness.get("concept_id"),
                    })
                )

    # Compute readiness score
    readiness_score = _agent_instance.compute_readiness_score(
        user_id, exam_report, mastery_updates
    )

    # Update exam report with readiness score
    exam_report.readiness_score = readiness_score

    return {
        "mastery_updates": mastery_updates,
        "readiness_score": readiness_score,
        "exam_report": exam_report,
    }


def persist_results(state: MockExamState) -> Dict:
    """Node: Persist results to Supabase with retry logic."""
    request_id = state.get("request_id", "unknown")
    job_id = state.get("job_id", "unknown")
    user_id = state.get("user_id", "")

    logger.info(
        json.dumps(
            {
                "request_id": request_id,
                "job_id": job_id,
                "user_id": user_id,
                "step": "persist_results",
                "message": "Persisting results to Supabase",
            }
        )
    )

    if not _agent_instance or not _agent_instance.supabase:
        logger.warning(
            json.dumps({
                "request_id": request_id,
                "job_id": job_id,
                "user_id": user_id,
                "step": "persist_results",
                "message": "Supabase not available - skipping persistence",
            })
        )
        return {}

    exam_report = state.get("exam_report")
    if not exam_report:
        logger.warning(
            json.dumps({
                "request_id": request_id,
                "job_id": job_id,
                "user_id": user_id,
                "step": "persist_results",
                "message": "No exam report to persist",
            })
        )
        return {}

    try:
        exam_id = str(uuid4())

        # Insert exam attempt with retry
        # Actual schema: exam_attempt_id (UUID PK), obtained_marks, percentage
        # user_id is UUID (must be valid UUID format)
        @retry_supabase_operation(max_retries=3, delay=1.0, backoff=2.0)
        def insert_exam_attempt():
            result = (
                _agent_instance.supabase.table("exam_attempts")
                .insert(
                    {
                        "exam_attempt_id": exam_id,
                        "user_id": user_id,  # Must be valid UUID
                        "total_marks": exam_report.total_marks,
                        "obtained_marks": exam_report.marks_obtained,
                        "percentage": exam_report.percentage_score,
                        "overall_grade": exam_report.overall_grade,
                        "readiness_score": (
                            exam_report.readiness_score
                            if exam_report.readiness_score is not None
                            else None
                        ),
                        "created_at": datetime.now().isoformat(),
                    }
                )
                .execute()
            )
            # Return the exam_attempt_id
            if result.data and len(result.data) > 0:
                return result.data[0].get("exam_attempt_id", exam_id)
            return exam_id

        exam_id = insert_exam_attempt()

        # Insert question results in batches (if many questions)
        # Actual schema: exam_attempt_id (not exam_id),
        # percentage (not percentage_score), concepts (not concept_ids),
        # user_id (UUID), and many additional fields
        if exam_id and exam_report.question_grades:
            question_results: List[Dict] = []
            for grade in exam_report.question_grades:
                # question_id is UUID in schema, but we have integer IDs
                # Since question_id is nullable, set to None if not valid UUID
                question_id_value = None
                if grade.question_id:
                    # Try to convert to UUID if it's already a UUID string
                    try:
                        from uuid import UUID
                        # If it's already a valid UUID string, use it
                        UUID(str(grade.question_id))
                        question_id_value = str(grade.question_id)
                    except (ValueError, AttributeError):
                        # If it's an integer or invalid UUID, set to None
                        # (question_id is nullable in schema)
                        question_id_value = None

                question_results.append(
                    {
                        "exam_attempt_id": exam_id,
                        "user_id": user_id,  # UUID format
                        "question_id": question_id_value,  # UUID or None
                        "question_number": grade.question_number,
                        "part": grade.part,
                        "question_text": grade.question_text,
                        "student_answer": grade.student_answer,
                        "model_answer": grade.model_answer,
                        "marks_allocated": grade.marks_allocated,
                        "marks_awarded": grade.marks_awarded,
                        "percentage": grade.percentage_score,
                        "feedback": grade.feedback,
                        "strengths": grade.strengths,  # Array field
                        "improvements": grade.improvements,  # Array field
                        # Array field (not concept_ids)
                        "concepts": grade.concept_ids,
                        "created_at": datetime.now().isoformat(),
                    }
                )

            if question_results:
                @retry_supabase_operation(
                    max_retries=3, delay=1.0, backoff=2.0
                )
                def insert_question_results():
                    # Batch insert in chunks of 50 if needed
                    batch_size = 50
                    for i in range(0, len(question_results), batch_size):
                        batch = question_results[i:i + batch_size]
                        (
                            _agent_instance.supabase.table(
                                "exam_question_results"
                            )
                            .insert(batch)
                            .execute()
                        )

                insert_question_results()

        # Upsert readiness with retry
        # Actual schema: id (UUID PK), user_id (UUID), readiness_score
        # Try to get readiness_score from state or exam_report
        readiness_score = state.get("readiness_score")
        if readiness_score is None and exam_report:
            readiness_score = exam_report.readiness_score

        if readiness_score is not None:
            @retry_supabase_operation(max_retries=3, delay=1.0, backoff=2.0)
            def upsert_readiness():
                # Check if record exists using id (UUID PK)
                existing = (
                    _agent_instance.supabase.table("student_readiness")
                    .select("id")
                    .eq("user_id", user_id)  # user_id is UUID
                    .limit(1)
                    .execute()
                )

                if existing.data:
                    # Update existing record
                    return (
                        _agent_instance.supabase.table("student_readiness")
                        .update(
                            {
                                "readiness_score": readiness_score,
                                "updated_at": datetime.now().isoformat(),
                            }
                        )
                        .eq("user_id", user_id)
                        .execute()
                    )
                else:
                    # Insert new record
                    return (
                        _agent_instance.supabase.table("student_readiness")
                        .insert(
                            {
                                "user_id": user_id,  # UUID format
                                "readiness_score": readiness_score,
                                "updated_at": datetime.now().isoformat(),
                            }
                        )
                        .execute()
                    )

            upsert_readiness()

        logger.info(
            json.dumps(
                {
                    "request_id": request_id,
                    "job_id": job_id,
                    "user_id": user_id,
                    "step": "persist_results",
                    "message": "Results persisted successfully",
                    "exam_attempt_id": exam_id,
                    "questions_count": len(question_results),
                }
            )
        )

    except Exception as e:
        logger.error(
            json.dumps(
                {
                    "request_id": request_id,
                    "job_id": job_id,
                    "user_id": user_id,
                    "step": "persist_results",
                    "error": str(e),
                    "error_type": type(e).__name__,
                    "message": (
                        "CRITICAL: Persistence failed - tables will not be "
                        "updated!"
                    ),
                }
            ),
            exc_info=True,
        )
        # Log to console as well for visibility
        print(
            f"\n[ERROR] Persistence failed for user {user_id}: {e}\n"
        )
        # Don't raise - allow workflow to complete even if persistence fails
        # But log the error prominently

    return {}


async def run_mock_exam_graph(
    agent: MockExamGradingAgent,
    user_id: str,
    attempted_questions: List[Dict],
    request_id: Optional[str] = None,
    job_id: Optional[str] = None,
) -> ExamReport:
    """
    Run the LangGraph workflow for mock exam grading.

    Args:
        agent: MockExamGradingAgent instance
        user_id: User ID
        attempted_questions: List of attempted questions
        request_id: Optional request ID for tracing
        job_id: Optional job ID for tracing

    Returns:
        ExamReport
    """
    if not LANGGRAPH_AVAILABLE:
        # Fallback to synchronous grade_exam if LangGraph not available
        logger.warning(
            "LangGraph not available - using synchronous grade_exam"
        )
        return agent.grade_exam(attempted_questions)

    # Set agent instance for nodes
    set_agent_instance(agent)

    # Initial state
    initial_state: MockExamState = {
        "user_id": user_id,
        "attempted_questions": attempted_questions,
        "question_grades": [],
        "exam_report": None,
        "mastery_updates": {},
        "readiness_score": None,
        "concept_ids": [],
        "request_id": request_id,
        "job_id": job_id,
    }

    logger.info(
        json.dumps({
            "request_id": request_id,
            "job_id": job_id,
            "user_id": user_id,
            "message": "Starting mock exam grading workflow",
            "questions_count": len(attempted_questions),
        })
    )

    # Build graph
    graph = StateGraph(MockExamState)
    graph.add_node("load_exam", load_exam)
    graph.add_node("grade_questions", grade_questions)
    graph.add_node("aggregate_results", aggregate_results)
    graph.add_node(
        "compute_mastery_and_readiness", compute_mastery_and_readiness
    )
    graph.add_node("persist_results", persist_results)

    graph.set_entry_point("load_exam")
    graph.add_edge("load_exam", "grade_questions")
    graph.add_edge("grade_questions", "aggregate_results")
    graph.add_edge("aggregate_results", "compute_mastery_and_readiness")
    graph.add_edge("compute_mastery_and_readiness", "persist_results")
    graph.add_edge("persist_results", END)

    # Compile and run
    try:
        app = graph.compile()
        final_state = app.invoke(initial_state)

        logger.info(
            json.dumps({
                "request_id": request_id,
                "job_id": job_id,
                "user_id": user_id,
                "message": "Workflow completed successfully",
                "has_exam_report": final_state.get("exam_report") is not None,
                "has_mastery_updates": bool(
                    final_state.get("mastery_updates", {})
                ),
                "readiness_score": final_state.get("readiness_score"),
            })
        )

        exam_report = final_state.get("exam_report")
        if not exam_report:
            raise ValueError("Exam report not generated")

        return exam_report
    except Exception as e:
        logger.error(
            json.dumps({
                "request_id": request_id,
                "job_id": job_id,
                "user_id": user_id,
                "error": str(e),
                "error_type": type(e).__name__,
                "message": "Workflow failed",
            }),
            exc_info=True,
        )
        raise


# ============================================================================
# CLI Test Entry
# ============================================================================

def main():
    """Local example usage."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("❌ OPENAI_API_KEY not found")
        return

    agent = MockExamGradingAgent(api_key)

    attempted_questions = [
        {
            "question_id": 1,
            "question": "Explain the concept of market segmentation.",
            "user_answer": (
                "Market segmentation is dividing customers into groups"
            ),
            "solution": (
                "Market segmentation is the process of dividing a market "
                "into groups of customers with similar needs and "
                "characteristics..."
            ),
            "marks": 10,
            "part": "A",
        }
    ]

    report = agent.grade_exam(attempted_questions)

    print("\n📊 EXAM REPORT")
    print("=" * 50)
    print(
        f"Score: {report.marks_obtained}/{report.total_marks} marks "
        f"({report.percentage_score}%)"
    )
    print(f"Grade: {report.overall_grade}")
    print(f"\nFeedback: {report.overall_feedback}")


if __name__ == "__main__":
    main()


# ============================================================================
# FastAPI Microservice
# ============================================================================

if FASTAPI_AVAILABLE:
    # In-memory job store (simple async job model)
    JOB_STORE: Dict[str, Dict] = {}
    JOB_EXPIRY_HOURS = int(os.getenv("JOB_EXPIRY_HOURS", "24"))

    # Rate limiting (simple in-memory)
    _rate_limit_store: Dict[str, List[float]] = defaultdict(list)
    RATE_LIMIT_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", "100"))
    RATE_LIMIT_WINDOW = int(os.getenv("RATE_LIMIT_WINDOW", "60"))  # seconds

    app = FastAPI(
        title="Mock Exam Grading Service",
        version="1.0.0",
        description=(
            "FastAPI microservice for grading mock exams with LangGraph "
            "workflow. Supports async job processing, concept detection, "
            "mastery tracking, and readiness scoring."
        ),
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # CORS middleware
    ALLOWED_ORIGINS_RAW = os.getenv("ALLOWED_ORIGINS", "*")
    ALLOWED_ORIGINS = [
        origin.strip() for origin in ALLOWED_ORIGINS_RAW.split(",")
    ]

    if "*" not in ALLOWED_ORIGINS:
        localhost_origins = [
            "http://localhost:5173",
            "http://localhost:3000",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:3000",
        ]
        for origin in localhost_origins:
            if origin not in ALLOWED_ORIGINS:
                ALLOWED_ORIGINS.append(origin)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Request ID middleware
    @app.middleware("http")
    async def add_request_id(request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or str(uuid4())
        request.state.request_id = request_id
        start_time = time.time()

        try:
            response = await call_next(request)
            response.headers["X-Request-ID"] = request_id
            response.headers["X-Response-Time"] = str(
                round((time.time() - start_time) * 1000, 2)
            )
            log_metric("api_requests")
            return response
        except Exception as e:
            log_metric("api_errors")
            logger.error(
                json.dumps({
                    "request_id": request_id,
                    "error": str(e),
                    "path": request.url.path,
                })
            )
            raise

    # Rate limiting middleware
    @app.middleware("http")
    async def rate_limit_middleware(request: Request, call_next):
        """Simple rate limiting based on IP address."""
        if request.url.path.startswith("/health") or \
           request.url.path.startswith("/docs") or \
           request.url.path.startswith("/redoc") or \
           request.url.path.startswith("/openapi.json"):
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        now = time.time()

        # Clean old entries
        _rate_limit_store[client_ip] = [
            ts for ts in _rate_limit_store[client_ip]
            if now - ts < RATE_LIMIT_WINDOW
        ]

        # Check rate limit
        if len(_rate_limit_store[client_ip]) >= RATE_LIMIT_REQUESTS:
            logger.warning(
                json.dumps({
                    "message": "Rate limit exceeded",
                    "client_ip": client_ip,
                    "path": request.url.path,
                })
            )
            return JSONResponse(
                status_code=429,
                content={
                    "error": "Rate limit exceeded",
                    "message": (
                        f"Maximum {RATE_LIMIT_REQUESTS} requests per "
                        f"{RATE_LIMIT_WINDOW} seconds"
                    ),
                    "retry_after": RATE_LIMIT_WINDOW,
                },
                headers={"Retry-After": str(RATE_LIMIT_WINDOW)},
            )

        # Add current request
        _rate_limit_store[client_ip].append(now)
        return await call_next(request)

    # Job cleanup background task
    async def cleanup_expired_jobs():
        """Periodically clean up expired jobs from JOB_STORE."""
        while True:
            try:
                await asyncio.sleep(3600)  # Run every hour
                now = datetime.now()
                expired_jobs = []

                for job_id, job_data in JOB_STORE.items():
                    created_at_str = job_data.get("created_at")
                    if created_at_str:
                        try:
                            created_at = datetime.fromisoformat(
                                created_at_str.replace("Z", "+00:00")
                            )
                            if now - created_at > timedelta(
                                hours=JOB_EXPIRY_HOURS
                            ):
                                expired_jobs.append(job_id)
                        except (ValueError, TypeError):
                            # Invalid date format, mark for cleanup
                            expired_jobs.append(job_id)

                for job_id in expired_jobs:
                    del JOB_STORE[job_id]
                    logger.info(
                        json.dumps({
                            "message": "Cleaned up expired job",
                            "job_id": job_id,
                        })
                    )

                if expired_jobs:
                    logger.info(
                        f"Cleaned up {len(expired_jobs)} expired jobs"
                    )
            except Exception as e:
                logger.error(f"Error in job cleanup: {e}", exc_info=True)

    # Start cleanup task on FastAPI startup
    @app.on_event("startup")
    async def startup_event():
        """Start background tasks on FastAPI startup."""
        asyncio.create_task(cleanup_expired_jobs())

    # API models with validation
    class QuestionInput(BaseModel):
        """Validated question input."""
        question_id: int = Field(..., gt=0, description="Question ID")
        question: str = Field(..., min_length=1, description="Question text")
        user_answer: str = Field(default="", description="Student's answer")
        solution: Optional[str] = Field(
            default=None, description="Model answer/solution"
        )
        model_answer: Optional[str] = Field(
            default=None, description="Alternative model answer field"
        )
        marks: int = Field(..., gt=0, le=100, description="Marks allocated")
        part: str = Field(default="", description="Question part")
        question_number: Optional[int] = Field(
            default=None, description="Question number"
        )
        topic_id: Optional[int] = Field(
            default=None, description="Topic ID for RAG context"
        )

        @model_validator(mode='after')
        def validate_answer_or_solution(self):
            """Ensure at least one answer field is provided."""
            if not self.solution and not self.model_answer:
                raise ValueError(
                    "Either 'solution' or 'model_answer' must be provided"
                )
            return self

    class MockStartRequest(BaseModel):
        """Request to start a mock exam grading job."""
        user_id: str = Field(
            ..., min_length=1, description="User ID (UUID format recommended)"
        )
        attempted_questions: List[QuestionInput] = Field(
            ..., min_length=1, max_length=100,
            description="List of attempted questions (1-100 questions)"
        )

        @field_validator('user_id')
        @classmethod
        def validate_user_id(cls, v: str) -> str:
            """Validate user_id format."""
            if not v or not v.strip():
                raise ValueError("user_id cannot be empty")
            return v.strip()

        @field_validator('attempted_questions')
        @classmethod
        def validate_questions(
            cls, v: List[QuestionInput]
        ) -> List[QuestionInput]:
            """Validate questions list."""
            if not v:
                raise ValueError(
                    "attempted_questions cannot be empty"
                )
            if len(v) > 100:
                raise ValueError(
                    "Maximum 100 questions allowed per exam"
                )
            return v

    class MockStartResponse(BaseModel):
        job_id: str
        status: str

    class MockStatusResponse(BaseModel):
        job_id: str
        status: str
        result: Optional[ExamReport] = None
        error: Optional[str] = None

    # Singleton agent
    _grading_agent: Optional[MockExamGradingAgent] = None

    def get_agent() -> MockExamGradingAgent:
        """Get or create the grading agent."""
        global _grading_agent
        if _grading_agent is None:
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                raise ValueError("OPENAI_API_KEY not found")
            _grading_agent = MockExamGradingAgent(api_key)
        return _grading_agent

    # Background task
    async def run_grading_task(
        job_id: str,
        user_id: str,
        attempted_questions: List[Dict],
        request_id: str,
    ):
        """Background grading workflow with improved error handling."""
        start_time = time.time()
        try:
            JOB_STORE[job_id]["status"] = "processing"
            JOB_STORE[job_id]["started_at"] = datetime.now().isoformat()

            agent = get_agent()

            # Convert QuestionInput to Dict for backward compatibility
            questions_dict = [
                q.model_dump() if isinstance(q, QuestionInput) else q
                for q in attempted_questions
            ]

            exam_report = await run_mock_exam_graph(
                agent, user_id, questions_dict, request_id, job_id
            )

            elapsed_time = time.time() - start_time
            JOB_STORE[job_id]["status"] = "completed"
            JOB_STORE[job_id]["result"] = exam_report
            JOB_STORE[job_id]["completed_at"] = datetime.now().isoformat()
            JOB_STORE[job_id]["duration_seconds"] = round(elapsed_time, 2)

            log_metric("jobs_completed")
            log_metric("questions_graded", len(questions_dict))

            logger.info(
                json.dumps(
                    {
                        "request_id": request_id,
                        "job_id": job_id,
                        "user_id": user_id,
                        "status": "completed",
                        "message": "Grading completed successfully",
                        "duration_seconds": round(elapsed_time, 2),
                        "questions_count": len(questions_dict),
                        "percentage": exam_report.percentage_score,
                    }
                )
            )
        except Exception as e:
            elapsed_time = time.time() - start_time
            JOB_STORE[job_id]["status"] = "failed"
            JOB_STORE[job_id]["error"] = str(e)
            JOB_STORE[job_id]["failed_at"] = datetime.now().isoformat()
            JOB_STORE[job_id]["duration_seconds"] = round(elapsed_time, 2)

            log_metric("jobs_failed")

            logger.error(
                json.dumps(
                    {
                        "request_id": request_id,
                        "job_id": job_id,
                        "user_id": user_id,
                        "status": "failed",
                        "error": str(e),
                        "error_type": type(e).__name__,
                        "duration_seconds": round(elapsed_time, 2),
                    }
                ),
                exc_info=True,
            )

    # Endpoints
    @app.post(
        "/start",
        response_model=MockStartResponse,
        summary="Start Mock Exam Grading",
        description=(
            "Submit a mock exam for asynchronous grading. Returns a job_id "
            "that can be used to check the status and retrieve results."
        ),
        responses={
            200: {
                "description": "Job created successfully",
                "content": {
                    "application/json": {
                        "example": {
                            "job_id": "123e4567-e89b-12d3-a456-426614174000",
                            "status": "pending"
                        }
                    }
                }
            },
            400: {"description": "Invalid request data"},
            429: {"description": "Rate limit exceeded"},
        },
    )
    async def start_mock_exam(
        request: MockStartRequest, http_request: Request
    ):
        """
        Start a mock exam grading job.

        The grading process runs asynchronously. Use the returned job_id
        to check status via GET /api/v1/mock/status/{job_id}.
        """
        request_id = http_request.state.request_id

        try:
            job_id = str(uuid4())
            JOB_STORE[job_id] = {
                "status": "pending",
                "result": None,
                "error": None,
                "created_at": datetime.now().isoformat(),
                "user_id": request.user_id,
                "questions_count": len(request.attempted_questions),
            }

            asyncio.create_task(
                run_grading_task(
                    job_id,
                    request.user_id,
                    request.attempted_questions,
                    request_id,
                )
            )

            log_metric("jobs_created")

            logger.info(
                json.dumps(
                    {
                        "request_id": request_id,
                        "job_id": job_id,
                        "user_id": request.user_id,
                        "status": "pending",
                        "message": "Job created",
                        "questions_count": len(request.attempted_questions),
                    }
                )
            )

            return MockStartResponse(job_id=job_id, status="pending")
        except ValueError as e:
            logger.warning(
                json.dumps({
                    "request_id": request_id,
                    "error": str(e),
                    "user_id": request.user_id,
                })
            )
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            logger.error(
                json.dumps({
                    "request_id": request_id,
                    "error": str(e),
                    "error_type": type(e).__name__,
                }),
                exc_info=True,
            )
            raise HTTPException(
                status_code=500,
                detail="Internal server error. Please try again later."
            )

    @app.get(
        "/status/{job_id}",
        response_model=MockStatusResponse,
        summary="Get Job Status",
        description=(
            "Check the status of a mock exam grading job. Returns the "
            "current status (pending, processing, completed, or failed) "
            "and the result if available."
        ),
        responses={
            200: {"description": "Job status retrieved successfully"},
            404: {"description": "Job not found"},
        },
    )
    async def get_mock_status(job_id: str, http_request: Request):
        """
        Get the status of a mock exam grading job.

        Status values:
        - pending: Job is queued but not yet processing
        - processing: Job is currently being graded
        - completed: Job finished successfully (result available)
        - failed: Job encountered an error (error message available)
        """
        request_id = http_request.state.request_id

        if job_id not in JOB_STORE:
            logger.warning(
                json.dumps({
                    "request_id": request_id,
                    "job_id": job_id,
                    "message": "Job not found",
                })
            )
            raise HTTPException(
                status_code=404,
                detail=f"Job {job_id} not found. It may have expired or "
                       f"never existed."
            )

        job_data = JOB_STORE[job_id]

        return MockStatusResponse(
            job_id=job_id,
            status=job_data["status"],
            result=job_data.get("result"),
            error=job_data.get("error"),
        )

    @app.get(
        "/health",
        summary="Health Check",
        description="Check if the service is running and healthy.",
    )
    async def health_check():
        """Health check endpoint with metrics."""
        return {
            "status": "healthy",
            "service": "mock_exam_grading",
            "timestamp": datetime.now().isoformat(),
            "metrics": get_metrics(),
            "active_jobs": len([
                j for j in JOB_STORE.values()
                if j.get("status") in ["pending", "processing"]
            ]),
            "total_jobs": len(JOB_STORE),
        }

    @app.get(
        "/metrics",
        summary="Service Metrics",
        description="Get service metrics and statistics.",
    )
    async def get_service_metrics():
        """Get service metrics."""
        return {
            "metrics": get_metrics(),
            "job_store_size": len(JOB_STORE),
            "active_jobs": len([
                j for j in JOB_STORE.values()
                if j.get("status") in ["pending", "processing"]
            ]),
            "completed_jobs": len([
                j for j in JOB_STORE.values()
                if j.get("status") == "completed"
            ]),
            "failed_jobs": len([
                j for j in JOB_STORE.values()
                if j.get("status") == "failed"
            ]),
        }

    # LangSmith tracing (observability)
    if os.getenv("LANGSMITH_API_KEY"):
        os.environ["LANGSMITH_API_KEY"] = os.getenv("LANGSMITH_API_KEY")
        os.environ["LANGSMITH_PROJECT"] = os.getenv(
            "LANGSMITH_PROJECT", "imtehaan-mock-exam"
        )
        os.environ["LANGSMITH_ENDPOINT"] = os.getenv(
            "LANGSMITH_ENDPOINT", "https://api.smith.langchain.com"
        )
        os.environ["LANGSMITH_TRACING"] = os.getenv(
            "LANGSMITH_TRACING", "true"
        )
        logger.info("✅ LangSmith tracing enabled")

