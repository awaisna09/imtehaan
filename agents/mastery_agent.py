#!/usr/bin/env python3
"""
Mastery Agent - Handles student reasoning classification and mastery updates
"""

from typing import Any, Dict, List, Optional
from openai import OpenAI
import logging
import hashlib

# Import cache
try:
    from cache import cache_get, cache_set
except ImportError:
    def cache_get(key): return None
    def cache_set(key, value, ttl=3600): return False

logger = logging.getLogger(__name__)


class MasteryAgent:
    """
    Agent responsible for mastery tracking:
    - Classifying student reasoning quality
    - Converting labels to mastery deltas
    - Applying mastery updates to Supabase
    """

    def __init__(
        self,
        api_key: str = None,
        supabase_client: Optional[Any] = None
    ):
        """
        Initialize Mastery Agent

        Args:
            api_key: OpenAI API key for classification
            supabase_client: Supabase client instance
        """
        self.api_key = api_key
        self.supabase = supabase_client

    def classify_reasoning(self, message_text: str) -> str:
        """
        Classify a student's message as 'good', 'neutral', or 'confused'
        based on reasoning quality.
        Uses direct OpenAI API with gpt-4o-mini for low-cost classification.
        OPTIMIZED: Added caching to avoid repeated LLM calls for same message.
        """
        if not self.api_key:
            return "neutral"

        # Check cache first (5 minute TTL - reasoning can change over time)
        message_hash = hashlib.md5(message_text.encode()).hexdigest()[:16]
        cache_key = f"reasoning_classify:{message_hash}"
        cached = cache_get(cache_key)
        if cached is not None:
            return cached

        try:
            import threading
            client = OpenAI(api_key=self.api_key, timeout=15.0)

            # Add timeout protection for OpenAI API call (15 seconds)
            result_container = {
                "value": None, "error": None, "completed": False
            }

            def invoke_classification():
                try:
                    # Enhanced prompt with Business Studies definitions
                    system_prompt = (
                        "Classify the student's message into ONE category: "
                        "good, neutral, or confused.\n\n"
                        "Use these strict definitions:\n\n"
                        '1. "good"\n'
                        "   The student demonstrates clear understanding of "
                        "the Business Studies concept, applies correct "
                        "reasoning, uses accurate terminology, or asks an "
                        "insightful higher-order question. "
                        "Signs of \"good\":\n"
                        "   • Correct definitions, explanations, or "
                        "applications\n"
                        "   • Logical reasoning using business concepts\n"
                        "   • Making comparisons (e.g., PLC vs Ltd, "
                        "economies of scale, etc.)\n"
                        "   • Asking advanced, analytical, or evaluative "
                        "questions\n"
                        "   • Building on prior concepts accurately\n\n"
                        '2. "neutral"\n'
                        "   The student asks a standard or basic question, "
                        "makes a simple factual statement, or seeks "
                        "clarification without showing misunderstanding or "
                        "deeper insight. Signs of \"neutral\":\n"
                        "   • Simple definition requests\n"
                        "   • Basic clarifying questions\n"
                        "   • Standard textbook-level inquiries\n"
                        "   • No obvious reasoning or misunderstanding\n\n"
                        '3. "confused"\n'
                        "   The student shows misunderstanding, incorrect "
                        "reasoning, incorrect definitions, contradictions, or "
                        "fundamental misconceptions. Signs of \"confused\":\n"
                        "   • Wrong definitions (e.g., \"a sole trader has "
                        "one customer\")\n"
                        "   • Incorrect relationships between concepts\n"
                        "   • Illogical reasoning or contradictions\n"
                        "   • Confusing unrelated business concepts\n\n"
                        "IMPORTANT:\n"
                        "Output ONLY one word:\n"
                        "good\n"
                        "neutral\n"
                        "confused"
                    )

                    resp = client.chat.completions.create(
                        model="gpt-4o-mini",
                        messages=[
                            {
                                "role": "system",
                                "content": system_prompt
                            },
                            {"role": "user", "content": message_text[:200]}
                        ],
                        max_tokens=10,  # Increased to allow for reasoning
                        temperature=0
                    )
                    result_container["value"] = resp
                    result_container["completed"] = True
                except Exception as e:
                    result_container["error"] = e
                    result_container["completed"] = True

            classify_thread = threading.Thread(
                target=invoke_classification, daemon=True
            )
            classify_thread.start()
            classify_thread.join(timeout=15)

            if not result_container["completed"]:
                logger.warning(
                    "Reasoning classification timed out, using 'neutral'"
                )
                return "neutral"

            if result_container["error"]:
                logger.warning(
                    f"Reasoning classification error: "
                    f"{result_container['error']}, using 'neutral'"
                )
                return "neutral"

            resp = result_container["value"]
            label = resp.choices[0].message.content.strip().lower()
            if label not in ["good", "neutral", "confused"]:
                label = "neutral"

            # Cache result (5 minutes TTL)
            cache_set(cache_key, label, ttl=300)
            return label

        except Exception as e:
            logger.warning(f"Reasoning classification failed: {e}")
            return "neutral"

    def label_to_delta(self, label: str) -> int:
        """
        Convert reasoning label to mastery delta.

        Args:
            label: 'good', 'neutral', or 'confused'

        Returns:
            int: Mastery delta (+2, 0, or -1)
        """
        if label == "good":
            return 2
        elif label == "confused":
            return -1
        else:
            return 0

    def apply_updates(
        self,
        user_id: Optional[str],
        updates: List[Dict]
    ) -> None:
        """
        Apply mastery score updates for multiple concepts.

        updates = [
            { "concept_id": str, "delta": int, "reason": str }
        ]

        Workflow:
        1. Fetch existing mastery rows for these concept IDs.
        2. If no row exists → assume baseline mastery = 50.
        3. Apply delta and clamp between 0–100.
        4. Write updated mastery to Supabase.
        5. For negative updates, create/update weakness entries.
        6. Update trends lightly (increase or decrease trend_score).
        """
        if not self.supabase or not user_id:
            return

        # Map concept_id → delta, reason
        concept_ids = [u["concept_id"] for u in updates]

        # Fetch existing mastery rows with timeout protection
        try:
            # Import timeout wrapper
            try:
                from langgraph_tutor import safe_supabase_query
            except ImportError:
                import threading

                def safe_supabase_query(
                    query_func, timeout=3, default_return=None
                ):
                    if timeout <= 0:
                        try:
                            return query_func()
                        except Exception:
                            return default_return
                    result_container = {
                        "value": None, "error": None, "completed": False
                    }

                    def execute_query():
                        try:
                            result_container["value"] = query_func()
                            result_container["completed"] = True
                        except Exception as e:
                            result_container["error"] = e
                            result_container["completed"] = True
                    query_thread = threading.Thread(
                        target=execute_query, daemon=True
                    )
                    query_thread.start()
                    query_thread.join(timeout=timeout)
                    if (not result_container["completed"] or
                            result_container["error"]):
                        return default_return
                    return result_container["value"]

            def fetch_func():
                return (
                    self.supabase.table("student_mastery")
                    .select("*")
                    .eq("user_id", user_id)
                    .in_("concept_id", concept_ids)
                    .execute()
                )

            res = safe_supabase_query(
                fetch_func, timeout=5, default_return={"data": []}
            )
            if res is None:
                res = {"data": []}
            existing = {row["concept_id"]: row for row in (res.data or [])}
        except Exception:
            existing = {}

        rows_to_upsert = []
        weakness_rows = []
        trend_rows = []

        for update in updates:
            cid = update["concept_id"]
            delta = update["delta"]
            reason = update.get("reason", "tutor_chat")

            current_mastery = 50  # baseline
            if cid in existing:
                current_mastery = existing[cid].get("mastery_score", 50)

            new_mastery = max(0, min(100, current_mastery + delta))

            # Prepare mastery row for upsert
            rows_to_upsert.append({
                "user_id": user_id,
                "concept_id": cid,
                "mastery_score": new_mastery
            })

            # Weakness logic (negative signals)
            if delta < 0:
                weakness_rows.append({
                    "user_id": user_id,
                    "concept_id": cid,
                    "severity": "high" if delta <= -5 else "medium",
                    "reason": reason
                })

            # Trend logic (tiny lightweight update)
            trend_rows.append({
                "user_id": user_id,
                "concept_id": cid,
                "trend_score": delta  # simple additive trend
            })

        # Write mastery rows with timeout protection
        try:
            def upsert_mastery_func():
                return (
                    self.supabase.table("student_mastery")
                    .upsert(rows_to_upsert)
                    .execute()
                )
            safe_supabase_query(
                upsert_mastery_func, timeout=5, default_return=None
            )
        except Exception:
            pass

        # Insert weakness rows with timeout protection
        if len(weakness_rows) > 0:
            try:
                def insert_weakness_func():
                    return (
                        self.supabase.table("student_weaknesses")
                        .insert(weakness_rows)
                        .execute()
                    )
                safe_supabase_query(
                    insert_weakness_func, timeout=5, default_return=None
                )
            except Exception:
                pass

        # Update trends with timeout protection
        try:
            def upsert_trends_func():
                return (
                    self.supabase.table("student_trends")
                    .upsert(trend_rows)
                    .execute()
                )
            safe_supabase_query(
                upsert_trends_func, timeout=5, default_return=None
            )
        except Exception:
            pass
