from typing import TypedDict, Dict, List, Optional  # noqa: F401
from langgraph.graph import StateGraph, END  # noqa: F401
from agents.ai_tutor_agent import AITutorAgent  # to load services only
from dotenv import load_dotenv
import os
import logging
import hashlib
import time
import threading
from datetime import datetime
from uuid import uuid4
from contextlib import contextmanager

# Optional LangChain support
try:
    import langchain_openai  # noqa: F401
    LANGCHAIN_AVAILABLE = True
except ImportError:
    LANGCHAIN_AVAILABLE = False

# Import cache for potential cache invalidation if needed
try:
    from cache import cache_get, cache_set, cache_delete
except ImportError:
    def cache_get(key): return None
    def cache_set(key, value, ttl=3600): return False
    def cache_delete(key): return False

logger = logging.getLogger(__name__)

# Configure logging to show DEBUG messages
logging.basicConfig(
    level=logging.DEBUG if os.getenv("DEBUG", "0") == "1" else logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    force=True  # Force reconfiguration
)

# Debug mode toggle
DEBUG_MODE = os.getenv("DEBUG", "0") == "1"
if DEBUG_MODE:
    logger.info("="*60)
    logger.info("[DEBUG MODE ENABLED] LangGraph Tutor debug logging is active")
    logger.info(f"[DEBUG] Environment DEBUG value: {os.getenv('DEBUG', '0')}")
    logger.info("="*60)

# In-memory conversation history cache
# Stores last 20 messages per conversation_id for fast retrieval
conversation_cache = {}


def async_write(fn, *args, **kwargs):
    """
    Fire-and-forget wrapper for Supabase writes.
    Executes the function in a background thread to avoid blocking.
    """
    threading.Thread(
        target=lambda: fn(*args, **kwargs), daemon=True
    ).start()


@contextmanager
def timeout_context(seconds):
    """
    Context manager for timeout protection on blocking operations.
    Works on Windows using threading.Timer.
    """
    if seconds is None or seconds <= 0:
        yield
        return

    timeout_occurred = threading.Event()

    def timeout_handler():
        timeout_occurred.set()

    timer = threading.Timer(seconds, timeout_handler)
    timer.start()

    try:
        yield timeout_occurred
    finally:
        timer.cancel()


def safe_supabase_query(query_func, timeout=10, default_return=None):
    """
    Execute a Supabase query with timeout protection.
    Returns default_return if query times out or fails.

    Args:
        query_func: Function that executes the Supabase query
        timeout: Timeout in seconds (default: 10, increased from 3)
        default_return: Value to return on timeout/error

    Returns:
        Query result or default_return on timeout/error
    """
    if timeout <= 0:
        # No timeout, execute directly
        try:
            return query_func()
        except Exception as e:
            logger.error(f"Supabase query failed: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            return default_return

    result_container = {"value": None, "error": None, "completed": False}

    def execute_query():
        try:
            result_container["value"] = query_func()
            result_container["completed"] = True
        except Exception as e:
            result_container["error"] = e
            result_container["completed"] = True

    query_thread = threading.Thread(target=execute_query, daemon=True)
    query_thread.start()
    query_thread.join(timeout=timeout)

    if not result_container["completed"]:
        logger.error(
            f"Supabase query timed out after {timeout}s"
        )
        return default_return

    if result_container["error"]:
        err_msg = str(result_container["error"])
        logger.error(f"Supabase query error: {err_msg}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return default_return

    return result_container["value"]


def timed_node(fn):
    """
    Decorator to wrap LangGraph nodes with timing and logging.
    Measures execution time and logs to Supabase tutor_traces table.
    Also handles errors and logs to tutor_errors table.
    """
    def wrapper(state):
        node_name = fn.__name__
        start_time = time.time()

        try:
            result = fn(state)
            end_time = time.time()
            duration_ms = int((end_time - start_time) * 1000)

            # Log timing to Supabase (async fire-and-forget)
            if DEBUG_MODE and supabase_client:
                trace_data = {
                    "user_id": state.get("user_id"),
                    "topic": state.get("topic"),
                    "node_name": node_name,
                    "duration_ms": duration_ms,
                    "timestamp": datetime.now().isoformat(),
                    "trace_id": state.get("trace_id")
                }
                async_write(
                    lambda: supabase_client.table("tutor_traces").insert(
                        trace_data
                    ).execute()
                )

            return result

        except Exception as e:
            end_time = time.time()
            duration_ms = int((end_time - start_time) * 1000)

            # Log error timing to Supabase (async fire-and-forget)
            if DEBUG_MODE and supabase_client:
                trace_data = {
                    "user_id": state.get("user_id"),
                    "topic": state.get("topic"),
                    "node_name": node_name,
                    "duration_ms": duration_ms,
                    "timestamp": datetime.now().isoformat(),
                    "trace_id": state.get("trace_id"),
                    "error": str(e)
                }
                async_write(
                    lambda: supabase_client.table("tutor_traces").insert(
                        trace_data
                    ).execute()
                )

            # Log to console
            logger.error(f"[Node Error] {node_name}: {e}")

            # Log structured analytics to Supabase (async fire-and-forget)
            if DEBUG_MODE and supabase_client:
                error_data = {
                    "node": node_name,
                    "user_id": state.get("user_id"),
                    "topic": state.get("topic"),
                    "error": str(e)
                }
                async_write(
                    lambda: supabase_client.table("tutor_errors").insert(
                        error_data
                    ).execute()
                )

            return {}
    return wrapper


def safe_node(fn):
    """
    Decorator to wrap LangGraph nodes with error handling.
    Catches exceptions and logs them, returning empty dict to allow
    pipeline to continue.
    Also logs structured analytics to Supabase tutor_errors table.

    Note: Use timed_node instead for timing + error handling.
    """
    def wrapper(state):
        try:
            return fn(state)
        except Exception as e:
            # Log to console
            logger.error(f"[Node Error] {fn.__name__}: {e}")

            # Log structured analytics to Supabase (async fire-and-forget)
            if supabase_client:
                error_data = {
                    "node": fn.__name__,
                    "user_id": state.get("user_id"),
                    "topic": state.get("topic"),
                    "error": str(e)
                }
                async_write(
                    lambda: supabase_client.table("tutor_errors").insert(
                        error_data
                    ).execute()
                )

            return {}
    return wrapper


# Load environment variables from config.env
load_dotenv('config.env')

# Initialize Supabase client if available
supabase_client = None
try:
    from supabase import create_client
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_ANON_KEY") or os.getenv(
        "SUPABASE_SERVICE_ROLE_KEY"
    )
    if supabase_url and supabase_key:
        supabase_client = create_client(supabase_url, supabase_key)
        # Enable HTTP keep-alive for better performance
        if hasattr(supabase_client, 'postgrest') and hasattr(
            supabase_client.postgrest, 'session'
        ):
            supabase_client.postgrest.session.keep_alive = True
        if DEBUG_MODE:
            logger.info("[OK] Supabase client initialized for LangGraph tutor")
    else:
        if DEBUG_MODE:
            logger.info(
                "[WARNING] Supabase credentials not found - "
                "LangGraph tutor will work without Supabase features"
            )
except ImportError:
    logger.error(
        "[ERROR] Supabase Python client not installed - "
        "install with: pip install supabase"
    )
except Exception as e:
    logger.error(f"[ERROR] Error initializing Supabase client: {e}")

# Initialize AITutorAgent to build all services
api_key = os.getenv("OPENAI_API_KEY")
agent = AITutorAgent(
    api_key=api_key,
    supabase_client=supabase_client
)

# Get all services from agent
services = agent.build_services()
lesson_service = services["lesson"]
concept_service = services["concepts"]
history_service = services["history"]
llm_service = services["llm"]
mastery_service = services["mastery"]
readiness_service = services["readiness"]
message_service = services["messages"]
student_service = services["student"]


# Unified state object passed across LangGraph nodes
class TutorState(TypedDict):
    user_message: str
    topic: str
    user_id: str
    conversation_id: str
    explanation_style: str
    trace_id: str
    subject_id: Optional[int]

    # Data retrieved from AITutorAgent internals
    lesson_text: Optional[str]
    lesson_chunks: List[Dict]
    concept_rows: List[Dict]
    history: List[Dict]
    condensed_history: Optional[str]
    reasoning_label: str
    llm_response: str
    token_usage: Dict
    mastery_updates: List[Dict]
    readiness: Optional[Dict]
    learning_path: Optional[Dict]


# -----------------------------------------------------
# Node 0: LogUserMessage
# -----------------------------------------------------
def LogUserMessage(state: TutorState):
    """
    Log the student's message into Supabase at the start of the pipeline.
    This ensures the user message is stored before processing begins.
    """
    # Extract concept IDs (will be empty at this point, but structure is ready)
    concept_ids = []

    # Write the user message to Supabase (async fire-and-forget)
    async_write(
        message_service.log,
        user_id=state["user_id"],
        lesson_topic=state["topic"],
        conversation_id=state["conversation_id"],
        role="user",
        content=state["user_message"],
        concept_ids=concept_ids
    )

    # Update in-memory conversation cache
    conversation_id = state["conversation_id"]
    if conversation_id not in conversation_cache:
        conversation_cache[conversation_id] = []

    # Add user message to cache
    conversation_cache[conversation_id].append({
        "role": "user",
        "content": state["user_message"]
    })

    # Keep only last 20 messages in cache
    conversation_cache[conversation_id] = (
        conversation_cache[conversation_id][-20:]
    )

    return {}


# -----------------------------------------------------
# Node 0.5: ValidateInput
# -----------------------------------------------------
def ValidateInput(state: TutorState):
    """
    Validate and limit input sizes to prevent token overflow.

    Limits:
    - user_message: 800 tokens (summarize if over)
    - lesson_text: 4000 tokens (truncate if over)
    - lesson_chunks: 2000 tokens total (truncate if over)
    - concept descriptions: 500 tokens combined (truncate if over)

    Returns updated state with validated/truncated inputs.
    """
    # Helper function to estimate tokens (rough: 1 token ≈ 4 characters)
    def estimate_tokens(text: str) -> int:
        if not text:
            return 0
        return len(text) // 4

    # Helper function to truncate text to token limit
    def truncate_to_tokens(text: str, max_tokens: int) -> str:
        if not text:
            return text
        max_chars = max_tokens * 4
        if len(text) <= max_chars:
            return text
        # Truncate and add ellipsis
        return text[:max_chars - 3] + "..."

    updated_state = {}

    # 0. Quick check for obvious off-topic questions (Business Studies only)
    user_message = state.get("user_message", "")
    user_message_lower = user_message.lower()

    # List of non-Business Studies topics that should be rejected
    off_topic_keywords = [
        "solve this math", "calculate", "algebra", "geometry",
        "calculus", "physics", "chemistry", "biology",
        "science experiment", "write a poem", "literature",
        "novel", "poetry", "code", "programming", "python",
        "javascript", "html", "css", "history of", "world war",
        "ancient", "medieval", "translate", "language",
        "grammar", "vocabulary"
    ]

    # Check if message contains off-topic keywords
    is_off_topic = any(
        keyword in user_message_lower for keyword in off_topic_keywords
    )

    # If off-topic, add a flag to state (will be handled in LLM)
    if is_off_topic and DEBUG_MODE:
        logger.info(
            "[DEBUG] ValidateInput: Detected potential off-topic question. "
            "LLM will handle rejection."
        )

    # 1. Validate user_message (800 tokens limit)
    user_tokens = estimate_tokens(user_message)
    if user_tokens > 800:
        if DEBUG_MODE:
            logger.info(
                f"[DEBUG] User message exceeds 800 tokens ({user_tokens}). "
                f"Summarizing..."
            )
        # Summarize using llm_service
        try:
            summarized = llm_service.summarize_history(user_message)
            updated_state["user_message"] = summarized
            if DEBUG_MODE:
                new_tokens = estimate_tokens(summarized)
                logger.info(
                    f"[DEBUG] Summarized to {new_tokens} tokens "
                    f"(from {user_tokens})"
                )
        except Exception as e:
            # Fallback: truncate if summarization fails
            logger.warning(f"Summarization failed: {e}, truncating instead")
            updated_state["user_message"] = truncate_to_tokens(
                user_message, 800
            )
    else:
        updated_state["user_message"] = user_message

    # 2. Validate lesson_text (4000 tokens limit)
    lesson_text = state.get("lesson_text")
    if lesson_text:
        lesson_tokens = estimate_tokens(lesson_text)
        if lesson_tokens > 4000:
            if DEBUG_MODE:
                logger.info(
                    f"[DEBUG] Lesson text exceeds 4000 tokens "
                    f"({lesson_tokens}). Truncating..."
                )
            updated_state["lesson_text"] = truncate_to_tokens(
                lesson_text, 4000
            )
        else:
            updated_state["lesson_text"] = lesson_text

    # 3. Validate lesson_chunks (2000 tokens total limit)
    lesson_chunks = state.get("lesson_chunks", [])
    if lesson_chunks:
        total_chunk_tokens = sum(
            estimate_tokens(chunk.get("chunk_text", ""))
            for chunk in lesson_chunks
        )
        if total_chunk_tokens > 2000:
            if DEBUG_MODE:
                logger.info(
                    f"[DEBUG] Lesson chunks exceed 2000 tokens "
                    f"({total_chunk_tokens}). Truncating..."
                )
            # Truncate chunks, keeping most relevant (first ones)
            truncated_chunks = []
            remaining_tokens = 2000
            for chunk in lesson_chunks:
                chunk_text = chunk.get("chunk_text", "")
                chunk_tokens = estimate_tokens(chunk_text)
                if chunk_tokens <= remaining_tokens:
                    truncated_chunks.append(chunk)
                    remaining_tokens -= chunk_tokens
                else:
                    # Truncate this chunk to fit remaining tokens
                    if remaining_tokens > 0:
                        truncated_chunk = chunk.copy()
                        truncated_chunk["chunk_text"] = truncate_to_tokens(
                            chunk_text, remaining_tokens
                        )
                        truncated_chunks.append(truncated_chunk)
                    break
            updated_state["lesson_chunks"] = truncated_chunks
        else:
            updated_state["lesson_chunks"] = lesson_chunks

    # 4. Validate concept descriptions (500 tokens combined limit)
    concept_rows = state.get("concept_rows", [])
    if concept_rows:
        total_desc_tokens = sum(
            estimate_tokens(
                f"{c.get('name', '')} {c.get('description', '')}"
            )
            for c in concept_rows
        )
        if total_desc_tokens > 500:
            if DEBUG_MODE:
                logger.info(
                    f"[DEBUG] Concept descriptions exceed 500 tokens "
                    f"({total_desc_tokens}). Truncating..."
                )
            # Truncate descriptions proportionally
            truncated_concepts = []
            tokens_per_concept = 500 // len(concept_rows)
            for concept in concept_rows:
                truncated_concept = concept.copy()
                name = concept.get("name", "")
                desc = concept.get("description", "")
                combined = f"{name} {desc}"
                combined_tokens = estimate_tokens(combined)
                if combined_tokens > tokens_per_concept:
                    # Truncate description to fit
                    desc_tokens = tokens_per_concept - estimate_tokens(name)
                    if desc_tokens > 0:
                        truncated_concept["description"] = truncate_to_tokens(
                            desc, desc_tokens
                        )
                    else:
                        truncated_concept["description"] = ""
                truncated_concepts.append(truncated_concept)
            updated_state["concept_rows"] = truncated_concepts
        else:
            updated_state["concept_rows"] = concept_rows

    return updated_state


# -----------------------------------------------------
# Node 1: FetchLesson
# -----------------------------------------------------
def FetchLesson(state: TutorState):
    """
    Retrieve lesson content from Supabase lessons table
    based on topic_id (state['topic']), using LessonService.

    OPTIMIZED: Skip lesson chunks entirely for speed.
    Only fetch lesson text if not already in state.
    """
    topic = state["topic"]

    # FAST PATH: If lesson_text already exists in state and hash matches,
    # return immediately without any DB queries
    if state.get("lesson_text") and state.get("last_lesson_hash"):
        return {
            "lesson_text": state.get("lesson_text"),
            "lesson_chunks": []  # Skip chunks for speed
        }

    # Check cache for lesson content
    lesson_cache_key = f"lesson:{topic}"
    lesson_text = cache_get(lesson_cache_key)

    if lesson_text is None:
        # Fetch from service if not in cache
        if DEBUG_MODE:
            logger.info(f"[FetchLesson] Fetching lesson for topic_id: {topic}")
        lesson_text = lesson_service.fetch_lesson_content(topic)
        if lesson_text:
            if DEBUG_MODE:
                logger.info(
                    f"[FetchLesson] Successfully fetched lesson "
                    f"({len(lesson_text)} chars)"
                )
            # Cache for 1 hour (3600 seconds)
            cache_set(lesson_cache_key, lesson_text, ttl=3600)
        else:
            if DEBUG_MODE:
                logger.warning(
                    f"[FetchLesson] No lesson content returned for "
                    f"topic_id: {topic}"
                )

    # Skip lesson chunks entirely for speed (not critical for responses)
    # Compute hash and update state
    text_hash = (
        hashlib.md5(lesson_text.encode()).hexdigest()
        if lesson_text else None
    )
    updated_state = {
        "lesson_text": lesson_text or "",
        "lesson_chunks": [],  # Always empty for speed
        "last_lesson_hash": text_hash
    }

    return updated_state


# -----------------------------------------------------
# Node 2: FetchConcepts
# -----------------------------------------------------
def FetchConcepts(state: TutorState):
    """
    Retrieve concepts for the current topic.

    Priority (ALWAYS use topic_id when available):
    1. ALWAYS fetch concepts directly by topic_id if available
       (returns concepts in random order from database)
       This works for EVERY message, regardless of message length or content
    2. If topic_id fetch fails or returns empty, use pgvector similarity search
    3. Fallback to keyword matching if no concepts found

    The result is stored in state['concept_rows'].
    """
    user_message = state["user_message"]
    topic_id = state.get("topic")

    # Debug: Log topic_id value and type
    if DEBUG_MODE:
        logger.info(
            f"[DEBUG] FetchConcepts: topic_id from state: {topic_id} "
            f"(type: {type(topic_id).__name__})"
        )

    # Initialize concept_rows to track if we found concepts
    concept_rows = None

    # PRIORITY 1: ALWAYS try topic_id fetch first if available
    # This is the PRIMARY method and should work for EVERY message
    if topic_id:
        if DEBUG_MODE:
            logger.info(
                f"[DEBUG] FetchConcepts: ALWAYS using topic_id: {topic_id} "
                f"for message: '{user_message[:50]}...'"
            )
        try:
            # Fetch concepts directly from database for this topic
            # This works regardless of message length or content
            concept_rows = concept_service.fetch_concepts_by_topic(
                topic_id=str(topic_id),
                limit=10,  # Return 10 concepts in random order
                random_order=True
            )
            if DEBUG_MODE:
                logger.info(
                    f"[DEBUG] FetchConcepts: Fetched {len(concept_rows)} "
                    f"concepts for topic_id: {topic_id}"
                )
                if concept_rows:
                    concept_names = [
                        c.get('name', 'N/A') for c in concept_rows[:3]
                    ]
                    logger.info(
                        f"[DEBUG] FetchConcepts: Concepts found: "
                        f"{concept_names}"
                    )

            # If we got concepts from topic, return them immediately
            # This is the PRIMARY path - topic_id should ALWAYS work
            if concept_rows and len(concept_rows) > 0:
                if DEBUG_MODE:
                    logger.info(
                        f"[DEBUG] FetchConcepts: SUCCESS - Returning "
                        f"{len(concept_rows)} concepts from topic-based fetch "
                        f"(topic_id: {topic_id})"
                    )
                return {"concept_rows": concept_rows}
            else:
                # Topic fetch returned empty - log warning and try fallbacks
                if DEBUG_MODE:
                    logger.warning(
                        f"[DEBUG] FetchConcepts: Topic fetch returned empty "
                        f"for topic_id: {topic_id}. "
                        f"Trying fallback methods (embedding/keyword search)."
                    )
                # concept_rows is already None, continue to fallbacks
        except Exception as e:
            if DEBUG_MODE:
                logger.error(
                    f"[DEBUG] FetchConcepts: Error fetching by "
                    f"topic_id {topic_id}: {e}"
                )
                import traceback
                logger.error(f"[DEBUG] Traceback: {traceback.format_exc()}")
            # concept_rows is already None, continue to fallbacks
    else:
        # No topic_id available - log and use fallback methods
        if DEBUG_MODE:
            logger.warning(
                "[DEBUG] FetchConcepts: No topic_id in state. "
                "Using fallback methods (embedding/keyword search)."
            )

    # Priority 2: Use pgvector similarity search (original method)
    # Skip embeddings/RPC for short queries, but still try keyword matching
    subject_id = state.get("subject_id") or 101

    # Only try embedding search for messages with 4+ words
    # AND if we don't already have concepts from topic fetch
    needs_embedding = (
        len(user_message.split()) >= 4 and
        (concept_rows is None or len(concept_rows) == 0)
    )
    if needs_embedding:
        # Hash user message for cache key
        message_hash = hashlib.md5(
            user_message.encode('utf-8')
        ).hexdigest()
        concept_cache_key = f"concepts:{subject_id}:{message_hash}"

        # Check cache for concept rows
        cached_result = cache_get(concept_cache_key)

        # Only use cache if it has actual results (not empty list)
        concept_rows_from_cache = (
            cached_result
            if (cached_result and len(cached_result) > 0)
            else None
        )

        if DEBUG_MODE:
            logger.info(
                f"[DEBUG] FetchConcepts: Cache check - "
                f"cached={cached_result is not None}, "
                f"cached_count={len(cached_result) if cached_result else 0}, "
                f"using_cache={concept_rows_from_cache is not None}"
            )

        if concept_rows_from_cache is None:
            # Fetch from service if not in cache
            if DEBUG_MODE:
                logger.info(
                    f"[DEBUG] FetchConcepts: Fetching from service - "
                    f"message='{user_message[:50]}...', "
                    f"subject_id={subject_id}, "
                    f"topic_id={state.get('topic')}"
                )
            concept_rows_from_cache = concept_service.find_related_concepts(
                message_text=user_message,
                subject_id=subject_id,  # From state (backend)
                topic_id=state.get("topic"),
                k=7,
                min_similarity=0.18
            )
            if DEBUG_MODE:
                count = (
                    len(concept_rows_from_cache)
                    if concept_rows_from_cache else 0
                )
                logger.info(
                    f"[DEBUG] FetchConcepts: Embedding search returned "
                    f"{count} concepts"
                )
            if concept_rows_from_cache:
                # Cache for 2 hours (7200 seconds)
                cache_set(concept_cache_key, concept_rows_from_cache, ttl=7200)

        # Use embedding search results if found
        if concept_rows_from_cache:
            concept_rows = concept_rows_from_cache
    else:
        # Short message - skip embedding search, will try keyword matching
        if DEBUG_MODE:
            word_count = len(user_message.split())
            logger.info(
                f"[DEBUG] FetchConcepts: Message too short "
                f"({word_count} words), skipping embedding search, "
                f"will try keyword matching..."
            )

    # Priority 3: Fallback to keyword matching if no concepts found
    if not concept_rows or len(concept_rows) == 0:
        if DEBUG_MODE:
            logger.info(
                f"[DEBUG] FetchConcepts: No concepts found, "
                f"trying keyword_match fallback - "
                f"message='{user_message}', subject_id={subject_id}, "
                f"topic_id={topic_id}"
            )
        try:
            # Ensure subject_id is converted to string if it's an int
            subject_id_str = str(subject_id) if subject_id else None
            # Get topic_id from state (from topic selection)
            topic_id_str = (
                str(state.get("topic")) if state.get("topic") else None
            )
            concept_rows = concept_service.keyword_match(
                message_text=user_message,
                subject_id=subject_id_str,
                topic_id=topic_id_str
            )
            if DEBUG_MODE:
                logger.info(
                    f"[DEBUG] FetchConcepts: Keyword match returned "
                    f"{len(concept_rows) if concept_rows else 0} concepts"
                )
                if concept_rows:
                    concept_names = [
                        c.get('name', 'N/A') for c in concept_rows[:3]
                    ]
                    logger.info(
                        f"[DEBUG] FetchConcepts: Keyword match found "
                        f"concepts: {concept_names}"
                    )
        except Exception as e:
            if DEBUG_MODE:
                logger.error(
                    f"[DEBUG] FetchConcepts: Error in keyword_match: {e}"
                )
            concept_rows = []

    # Ensure concept_rows is always a list, never None
    if concept_rows is None:
        concept_rows = []

    # Debug: Embedding results
    if DEBUG_MODE:
        logger.info(
            f"[DEBUG] Embedding results: Found {len(concept_rows)} concepts"
        )
        for c in concept_rows[:3]:  # Show first 3
            logger.info(
                f"  - {c.get('name', 'N/A')} "
                f"(distance: {c.get('distance', 'N/A')})"
            )

    return {"concept_rows": concept_rows or []}


# -----------------------------------------------------
# Node 3: RetrieveHistory
# -----------------------------------------------------
def RetrieveHistory(state: TutorState):
    """
    Retrieve conversation history with optimized caching.

    Priority:
    1. Use history from state if already present (from frontend)
    2. Use in-memory conversation_cache if available
    3. Fetch only last 3 messages from Supabase (fallback)

    The method returns a list of dicts:
        { "role": "user" | "assistant", "content": str }

    These messages preserve the conversation context for the LLM.
    They are stored in state['history'].
    """
    conversation_id = state["conversation_id"]

    # 1. Check if history already exists in state (from frontend)
    if "history" in state and len(state.get("history", [])) > 0:
        if DEBUG_MODE:
            logger.info(
                f"[DEBUG] Using history from state: "
                f"{len(state['history'])} messages"
            )
        return {}  # No update needed

    # 2. Check in-memory cache
    if conversation_id in conversation_cache:
        cached_history = conversation_cache[conversation_id]
        if len(cached_history) > 0:
            if DEBUG_MODE:
                logger.info(
                    f"[DEBUG] Using cached history: "
                    f"{len(cached_history)} messages"
                )
            return {"history": cached_history}

    # 3. Fallback: Fetch only last 2 messages from Supabase (further reduced)
    # Skip DB query if cache exists (even if empty) to save time
    if DEBUG_MODE:
        logger.info(
            "[DEBUG] Cache miss, fetching last 2 messages from Supabase"
        )

    history = history_service.get_recent_messages(
        conversation_id=conversation_id,
        limit=2  # Reduced to 2 for speed
    )

    # Update cache with fetched messages (store up to 10 for speed)
    if history:
        conversation_cache[conversation_id] = history[:10]

    return {"history": history or []}


# -----------------------------------------------------
# Node 3.5: SummarizeHistory
# -----------------------------------------------------
def SummarizeHistory(state: TutorState):
    """
    Summarize conversation history if it exceeds token limits.

    If total tokens > 6000:
        Use llm_service.summarize_history() to summarize into a short abstract.
    Only summarizes every 3 turns to reduce LLM calls.
    Otherwise:
        condensed_history = the concatenated history.
    """
    history = state.get("history", [])

    if not history:
        return {"condensed_history": None}

    # Build history text
    history_text = "\n".join([
        f"{m['role']}: {m['content']}"
        for m in history
    ])

    # Estimate tokens (rough: 1 token ≈ 4 characters)
    total_chars = sum(
        len(msg.get("content", "")) for msg in history
    )
    estimated_tokens = total_chars // 4

    # Debug: History token count
    if DEBUG_MODE:
        logger.info(
            f"[DEBUG] History token count: {estimated_tokens} tokens "
            f"({len(history)} messages)"
        )

    # Fast path: If history is small, return immediately without LLM call
    # Increased threshold to 8000 tokens to skip summarization more often
    if estimated_tokens <= 8000:
        if DEBUG_MODE:
            logger.info(
                f"[DEBUG] History within limit ({estimated_tokens} tokens) - "
                f"skipping summarization"
            )
        return {"condensed_history": history_text}

    # Only summarize every 5 turns to reduce LLM calls (increased from 3)
    if len(history) % 5 != 0:
        if DEBUG_MODE:
            logger.info(
                f"[DEBUG] Skipping summarization (turn {len(history)} "
                f"not divisible by 5, tokens: {estimated_tokens})"
            )
        # Use last 8000 tokens worth of history instead of full summary
        # Approximate: keep last N messages that fit in 8000 tokens
        remaining_tokens = 8000
        trimmed_messages = []
        for msg in reversed(history):
            msg_tokens = len(msg.get("content", "")) // 4
            if remaining_tokens >= msg_tokens:
                trimmed_messages.insert(0, msg)
                remaining_tokens -= msg_tokens
            else:
                break
        trimmed_history = "\n".join([
            f"{m['role']}: {m['content']}"
            for m in trimmed_messages
        ])
        return {"condensed_history": trimmed_history}

    # Only summarize if tokens exceed threshold AND it's the right turn
    if estimated_tokens > 8000:
        # Summarize using llm_service with SHORT input (first 1500 chars)
        summary = llm_service.summarize_history(history_text[:1500])
        return {"condensed_history": summary}
    else:
        # Use concatenated history as-is
        return {"condensed_history": history_text}


# -----------------------------------------------------
# Node 4: ClassifyReasoning
# -----------------------------------------------------
def ClassifyReasoning(state: TutorState):
    """
    Classify the student's reasoning quality using MasteryService.

    The method analyzes the student message and returns EXACT labels:
      - 'good'
      - 'neutral'
      - 'confused'

    The result is stored in state['reasoning_label'].

    OPTIMIZATION: If no concepts found, skip classification and return
    'neutral' to avoid unnecessary LLM call.
    """
    # Fast path: Skip classification if no concepts (will be neutral anyway)
    concept_rows = state.get("concept_rows", [])
    if not concept_rows or len(concept_rows) == 0:
        if DEBUG_MODE:
            logger.info(
                "[DEBUG] No concepts found - skipping reasoning "
                "classification, returning 'neutral'"
            )
        return {"reasoning_label": "neutral"}

    label = mastery_service.classify_student_reasoning(
        message_text=state["user_message"]
    )

    # Debug: Reasoning label
    if DEBUG_MODE:
        logger.info(f"[DEBUG] Reasoning label: {label}")

    return {"reasoning_label": label}


# -----------------------------------------------------
# Node 5: GenerateLLMResponse
# -----------------------------------------------------
def GenerateLLMResponse(state: TutorState):
    """
    Generate the AI tutor's detailed explanation using LLMService.

    This method uses:
      - lesson_text
      - related concepts
      - conversation history
      - student question
    to produce the final answer.

    The result is stored in state['llm_response'].
    """
    # OPTIMIZED: Skip student profile fetch entirely for speed
    # Use default profile to avoid DB query
    student_profile = {
        "learning_style": "visual",
        "speed": "moderate",
        "grade_level": "intermediate",
        "subject_strengths": []
    }

    # 1. Limit lesson_text to first 500 chars (further reduced for speed)
    lesson_text = (state.get("lesson_text") or "")[:500]

    # 2. Limit history to last 2 messages
    trimmed_history = state["history"][-2:] if state.get("history") else []

    # 3. Skip lesson_chunks entirely (always empty for speed)
    trimmed_chunks = []

    # Trim context to fit within token budget (2000 tokens, further reduced)
    trimmed_history_final, trimmed_lesson_final, trimmed_chunks_final = (
        llm_service.trim_context(
            history=trimmed_history,
            lesson_text=lesson_text,
            chunks=trimmed_chunks,
            max_tokens=2000  # Further reduced for speed
        )
    )

    try:
        response_text, token_usage = llm_service.generate_reply(
            message=state["user_message"],
            topic=state["topic"],
            learning_level=student_profile.get("grade_level", "intermediate"),
            conversation_history=trimmed_history_final,
            lesson_content=trimmed_lesson_final,
            concept_rows=state["concept_rows"],
            explanation_style=state["explanation_style"],
            lesson_chunks=trimmed_chunks_final,
            condensed_history=state.get("condensed_history"),
            student_profile=student_profile
        )
    except Exception as e:
        logger.error(f"[LLM Failure] {e}")
        response_text = llm_service.fallback_reply(
            message=state["user_message"],
            topic=state["topic"]
        )
        token_usage = {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0
        }

    # Debug: Token usage
    if DEBUG_MODE:
        logger.info(
            f"[DEBUG] Token Usage: "
            f"Input={token_usage.get('prompt_tokens', 0)}, "
            f"Output={token_usage.get('completion_tokens', 0)}, "
            f"Total={token_usage.get('total_tokens', 0)}"
        )

    return {
        "llm_response": response_text,
        "token_usage": token_usage
    }


# -----------------------------------------------------
# Node 6: UpdateMastery
# -----------------------------------------------------
def UpdateMastery(state: TutorState):
    """
    Update student mastery scores based on reasoning quality.

    Steps:
      1. Convert reasoning label → mastery delta using MasteryService
      2. Create update objects for each detected concept
      3. Call MasteryService.apply_mastery_updates() to write updates
         into Supabase tables (student_mastery, student_weaknesses,
         student_trends).
      4. Store updates inside state['mastery_updates'].
    """

    concept_ids = [
        int(row["concept_id"])
        for row in state["concept_rows"]
        if row.get("concept_id") not in (None, "None", "")
    ]

    # Return empty updates if no concept_ids found
    if not concept_ids:
        return {"mastery_updates": []}

    label = state["reasoning_label"]

    # Convert label -> mastery delta using MasteryService
    delta = mastery_service.label_to_delta(label)

    updates = []
    if delta != 0:
        for cid in concept_ids:
            updates.append({
                "concept_id": cid,
                "delta": delta,
                "reason": f"tutor_chat_{label}"
            })

        # Apply full update logic using MasteryService (async fire-and-forget)
        async_write(
            mastery_service.apply_mastery_updates,
            user_id=state["user_id"],
            updates=updates
        )

        # Invalidate readiness cache for this user/concept combination
        # This ensures readiness reflects updated mastery scores
        concept_ids_str = [str(cid) for cid in concept_ids]
        # Invalidate cache using both cache key formats
        # Format 1: readiness_agent format (sorted concept IDs hash)
        try:
            from cache import _hash_string
            concept_ids_sorted = sorted(concept_ids_str)
            concept_ids_hash = _hash_string(":".join(concept_ids_sorted))
            cache_key_1 = f"readiness:{state['user_id']}:{concept_ids_hash}"
            cache_delete(cache_key_1)
        except Exception:
            pass
        # Format 2: langgraph_tutor format (hash of concept_ids list)
        try:
            cache_key_2 = (
                f"readiness:{state['user_id']}:{hash(str(concept_ids))}"
            )
            cache_delete(cache_key_2)
        except Exception:
            pass

        if DEBUG_MODE:
            logger.info(
                "[DEBUG] Invalidated readiness cache after mastery updates"
            )

    # Debug: Mastery deltas
    if DEBUG_MODE:
        logger.info(f"[DEBUG] Mastery deltas: {len(updates)} updates")
        for u in updates[:3]:  # Show first 3
            logger.info(f"  - Concept {u['concept_id']}: {u['delta']:+d}")

    # Save updates (may be empty)
    return {"mastery_updates": updates}


# -----------------------------------------------------
# Node 7: LogMessage
# -----------------------------------------------------
def LogMessage(state: TutorState):
    """
    Log the final AI message into Supabase using:
        MessageService.log()

    Stores:
      - user_id
      - lesson_topic (topic)
      - conversation_id
      - role="assistant"
      - AI message text
      - the list of related concept IDs detected during FetchConcepts

    Also invalidates relevant caches to ensure fresh data after updates.
    """

    # Extract concept IDs from concept_rows
    concept_ids = [
        row.get("concept_id")
        for row in state["concept_rows"]
        if row.get("concept_id")
    ]

    # Write the assistant message to Supabase (async fire-and-forget)
    async_write(
        message_service.log,
        user_id=state["user_id"],
        lesson_topic=state["topic"],
        conversation_id=state["conversation_id"],
        role="assistant",
        content=state["llm_response"],
        concept_ids=concept_ids
    )

    # Update in-memory conversation cache
    conversation_id = state["conversation_id"]
    if conversation_id not in conversation_cache:
        conversation_cache[conversation_id] = []

    # Add assistant message to cache
    conversation_cache[conversation_id].append({
        "role": "assistant",
        "content": state["llm_response"]
    })

    # Keep only last 20 messages in cache
    conversation_cache[conversation_id] = (
        conversation_cache[conversation_id][-20:]
    )

    # Invalidate conversation history cache only
    # (concepts and lesson_chunks caches persist for 1-2 hours)
    conversation_cache_key = (
        f"history:{state['conversation_id']}"
    )
    cache_delete(conversation_cache_key)

    return {}


# -----------------------------------------------------
# Node 8: ComputeReadiness
# -----------------------------------------------------
def ComputeReadiness(state: TutorState):
    """
    Compute the student's readiness level for the detected concepts.

    Uses:
        readiness_service.compute_readiness_signal(user_id, concept_ids)

    Produces:
        state['readiness'] = {
            "overall_readiness": str,
            "concept_readiness": [...],
            "average_mastery": float,
            "min_mastery": int
        }
    """

    # Extract concept_ids and convert to strings
    # (required by readiness service)
    concept_ids = [
        str(row.get("concept_id"))
        for row in state["concept_rows"]
        if row.get("concept_id") not in (None, "None", "")
    ]

    # FAST PATH: Return default readiness immediately if no concepts
    # This avoids DB query and computation
    if not concept_ids:
        if DEBUG_MODE:
            logger.info(
                "[DEBUG] ComputeReadiness: No concept_ids found! "
                "Returning default readiness immediately."
            )
        return {
            "readiness": {
                "overall_readiness": "unknown",
                "concept_readiness": [],
                "average_mastery": 50.0,  # Default baseline
                "min_mastery": 50
            }
        }

    # Check cache before computing
    cache_key = f"readiness:{state['user_id']}:{hash(str(concept_ids))}"
    cached = cache_get(cache_key)
    if cached:
        if DEBUG_MODE:
            logger.info(
                f"[DEBUG] ComputeReadiness: Cache hit for "
                f"{len(concept_ids)} concepts"
            )
        return {"readiness": cached}

    # Debug: Concept IDs extraction
    if DEBUG_MODE:
        logger.info(
            f"[DEBUG] ComputeReadiness: Found {len(concept_ids)} concept IDs"
        )
        if len(concept_ids) > 0:
            logger.info(
                f"[DEBUG] Concept IDs (first 3): {concept_ids[:3]}"
            )
        else:
            logger.warning(
                "[DEBUG] WARNING: No concept_ids found! "
                "Check FetchConcepts node."
            )
            logger.info(
                f"[DEBUG] concept_rows count: "
                f"{len(state.get('concept_rows', []))}"
            )
            if state.get("concept_rows"):
                logger.info(
                    f"[DEBUG] Sample concept_row: "
                    f"{state['concept_rows'][0]}"
                )

    # Apply mastery updates from current session before computing readiness
    # This ensures readiness reflects mastery changes from this conversation
    mastery_updates = state.get("mastery_updates", [])
    if mastery_updates and len(mastery_updates) > 0:
        if DEBUG_MODE:
            logger.info(
                f"[DEBUG] ComputeReadiness: Applying {len(mastery_updates)} "
                f"mastery updates from current session"
            )
        # Compute readiness with mastery updates applied
        readiness = readiness_service.compute_readiness_signal(
            user_id=state["user_id"],
            concept_ids=concept_ids,
            mastery_updates=mastery_updates
        )
    else:
        # No mastery updates in this session, use standard calculation
        readiness = readiness_service.compute_readiness_signal(
            user_id=state["user_id"],
            concept_ids=concept_ids
        )

    # Debug: Readiness computation
    if DEBUG_MODE:
        if readiness:
            logger.info(
                f"[DEBUG] Readiness computation: "
                f"overall={readiness.get('overall_readiness', 'N/A')}, "
                f"avg_mastery={readiness.get('average_mastery', 'N/A')}, "
                f"min_mastery={readiness.get('min_mastery', 'N/A')}, "
                f"concept_readiness_count="
                f"{len(readiness.get('concept_readiness', []))}"
            )

    # Store in cache (1 minute TTL - reduced to reflect mastery updates faster)
    # Mastery can change during session, so shorter cache ensures freshness
    cache_set(cache_key, readiness, ttl=60)

    return {"readiness": readiness}


# -----------------------------------------------------
# Node 9: ComputeLearningPath
# -----------------------------------------------------
def ComputeLearningPath(state: TutorState):
    """
    Determine the student's next recommended learning step.

    Uses:
        readiness_service.compute_next_learning_step(readiness, concept_ids)
    """
    # Extract concept_ids and ensure they're strings
    concept_ids = [
        str(row.get("concept_id"))
        for row in state["concept_rows"]
        if row.get("concept_id") not in (None, "None", "")
    ]

    # Return empty learning path if no concept_ids found
    if not concept_ids:
        if DEBUG_MODE:
            logger.warning(
                "[DEBUG] ComputeLearningPath: No concept_ids found! "
                "Returning unknown learning path."
            )
        return {
            "learning_path": {
                "decision": "unknown",
                "recommended_concept": None,
                "recommended_concept_name": None,
                "details": "No concepts available."
            }
        }

    # NO-REPEAT ROTATION: Track shown concepts per user/topic
    # Ensures all 10 concepts are shown before any repeat
    user_id = state.get("user_id", "")
    topic_id = state.get("topic", "")

    # Fetch ALL concepts for this topic (up to 10) to ensure we have
    # the complete set for rotation
    # Use a persistent cache key to ensure we always get the same order
    all_concepts_cache_key = f"all_concepts_ordered:{topic_id}"
    all_topic_concepts = cache_get(all_concepts_cache_key)

    if all_topic_concepts is None:
        # Fetch from database if not in cache
        try:
            all_topic_concepts = concept_service.fetch_concepts_by_topic(
                topic_id=str(topic_id),
                limit=10,
                random_order=False  # Get in consistent order
            )
            # Sort by concept_id to ensure consistent order
            all_topic_concepts.sort(
                key=lambda x: x.get("concept_id", 0)
            )
            # Cache the ordered list for 24 hours
            cache_set(all_concepts_cache_key, all_topic_concepts, ttl=86400)
            if DEBUG_MODE:
                logger.info(
                    f"[DEBUG] ComputeLearningPath: Fetched and cached "
                    f"{len(all_topic_concepts)} concepts for topic {topic_id}"
                )
        except Exception as e:
            if DEBUG_MODE:
                logger.warning(
                    f"[DEBUG] ComputeLearningPath: Error fetching all "
                    f"concepts: {e}"
                )
            # Fallback to concepts from state
            all_topic_concepts = state.get("concept_rows", [])
            # Sort by concept_id for consistency
            all_topic_concepts.sort(
                key=lambda x: x.get("concept_id", 0)
            )
    else:
        if DEBUG_MODE:
            logger.info(
                f"[DEBUG] ComputeLearningPath: Using cached ordered "
                f"concepts ({len(all_topic_concepts)} concepts) for "
                f"topic {topic_id}"
            )

    # Extract concept_ids from all topic concepts (already sorted)
    all_concept_ids = [
        str(c.get("concept_id"))
        for c in all_topic_concepts
        if c.get("concept_id") not in (None, "None", "")
    ]

    # If we have concepts from state but not from fetch, use state concepts
    if not all_concept_ids:
        all_concept_ids = concept_ids
        all_topic_concepts = state.get("concept_rows", [])
        # Sort by concept_id for consistency
        all_topic_concepts.sort(
            key=lambda x: x.get("concept_id", 0)
        )
        all_concept_ids = [
            str(c.get("concept_id"))
            for c in all_topic_concepts
            if c.get("concept_id") not in (None, "None", "")
        ]

    # Track shown concepts per user/topic combination
    # Use user_id + topic_id to track across all conversations
    shown_concepts_key = f"shown_concepts:{user_id}:{topic_id}"

    # Get list of already shown concept IDs from cache
    shown_concept_ids = cache_get(shown_concepts_key)
    if shown_concept_ids is None:
        shown_concept_ids = []

    # Find concepts that haven't been shown yet
    # Convert shown_concept_ids to set for faster lookup
    shown_set = set(str(cid) for cid in shown_concept_ids)
    unseen_concept_ids = [
        cid for cid in all_concept_ids
        if str(cid) not in shown_set
    ]

    # If all concepts have been shown, reset and start over
    if not unseen_concept_ids and all_concept_ids:
        if DEBUG_MODE:
            logger.info(
                f"[DEBUG] ComputeLearningPath: All {len(all_concept_ids)} "
                f"concepts shown, resetting for topic {topic_id}"
            )
        shown_concept_ids = []
        shown_set = set()
        unseen_concept_ids = all_concept_ids.copy()
        # Clear the cache to reset
        cache_set(shown_concepts_key, [], ttl=86400)

    # Select the next unseen concept (first in list for sequential order)
    recommended_concept_id = (
        unseen_concept_ids[0] if unseen_concept_ids else None
    )

    # Find the concept details from all_topic_concepts
    recommended_concept_id_str = (
        str(recommended_concept_id) if recommended_concept_id else None
    )
    concept_name = None
    for concept in all_topic_concepts:
        if str(concept.get("concept_id")) == recommended_concept_id_str:
            concept_name = concept.get("name", "")
            break

    # If we couldn't find the name, try to get it from concept service
    if not concept_name and recommended_concept_id:
        try:
            concept_details = concept_service.fetch_concept_details(
                [recommended_concept_id]
            )
            if (concept_details and
                    recommended_concept_id in concept_details):
                concept_name = (
                    concept_details[recommended_concept_id].get("name", "")
                )
        except Exception as e:
            if DEBUG_MODE:
                logger.warning(
                    f"[DEBUG] ComputeLearningPath: Error fetching concept "
                    f"details: {e}"
                )

    # Mark this concept as shown
    if recommended_concept_id:
        # Ensure we don't add duplicates
        recommended_concept_id_str = str(recommended_concept_id)
        # Check both list and set to avoid duplicates
        if recommended_concept_id_str not in shown_set:
            shown_concept_ids.append(recommended_concept_id_str)
            shown_set.add(recommended_concept_id_str)
        # Store updated list in cache (24 hour TTL to persist across sessions)
        # Always save to ensure persistence
        cache_set(shown_concepts_key, shown_concept_ids, ttl=86400)

        # Also store the ordered concept list to ensure consistency
        cache_set(all_concepts_cache_key, all_topic_concepts, ttl=86400)

        if DEBUG_MODE:
            logger.info(
                f"[DEBUG] ComputeLearningPath: Marked concept "
                f"{recommended_concept_id} as shown. "
                f"Total shown: "
                f"{len(shown_concept_ids)}/{len(all_concept_ids)}. "
                f"Shown list: {shown_concept_ids}. "
                f"Unseen list: {unseen_concept_ids}"
            )

    # Debug: Learning path computation
    if DEBUG_MODE:
        all_concept_names = [
            c.get('name', 'N/A') for c in all_topic_concepts[:10]
        ]
        logger.info(
            f"[DEBUG] ComputeLearningPath: "
            f"all_concept_ids={len(all_concept_ids)}, "
            f"shown_concepts={len(shown_concept_ids)}, "
            f"unseen_concepts={len(unseen_concept_ids)}, "
            f"concept_names={all_concept_names}, "
            f"recommended_concept_id={recommended_concept_id}, "
            f"recommended_concept_name={concept_name}"
        )

    # Build learning path directly from actual concepts in database
    # Don't use readiness service - use actual concepts from database
    # Always use "learn_next_concept" decision with sequential rotation
    if recommended_concept_id:
        if concept_name:
            details = (
                f"Continue exploring concepts in this topic. "
                f"Try asking questions about '{concept_name}' "
                f"to deepen your understanding."
            )
        else:
            details = (
                "Continue exploring concepts in this topic. "
                "Try asking questions about the recommended concept "
                "to deepen your understanding."
            )
        learning_path = {
            "decision": "learn_next_concept",
            "recommended_concept": recommended_concept_id,
            "recommended_concept_name": concept_name,
            "details": details
        }
    else:
        # Fallback if no concept found
        learning_path = {
            "decision": "unknown",
            "recommended_concept": None,
            "recommended_concept_name": None,
            "details": "No concepts available."
        }

    # Debug: Learning path result
    if DEBUG_MODE:
        decision = learning_path.get('decision', 'N/A')
        recommended = learning_path.get('recommended_concept', 'N/A')
        logger.info(
            f"[DEBUG] ComputeLearningPath result: "
            f"decision={decision}, recommended_concept={recommended}, "
            f"concept_name={concept_name}, "
            f"(shown: {len(shown_concept_ids)}/{len(all_concept_ids)})"
        )

    return {"learning_path": learning_path}


# -----------------------------------------------------
# BUILD LANGGRAPH PIPELINE
# -----------------------------------------------------

# Node execution order:
#   0. LogUserMessage     (log student message to Supabase)
#   0.5. ValidateInput    (validate and limit input token sizes)
#   1. FetchLesson        (load lesson content from Supabase)
#   2. RetrieveHistory    (load last N messages)
#   3. SummarizeHistory   (condense history if needed)
#   4. FetchConcepts      (pgvector similarity search)
#   5. ClassifyReasoning  (LLM classify reasoning)
#   6. GenerateLLMResponse (main ChatGPT tutor response)
#   7. UpdateMastery      (update mastery scores)
#   8. ComputeReadiness   (compute readiness levels)
#   9. ComputeLearningPath (determine next learning step)
#   10. LogMessage         (store AI message)

graph = StateGraph(TutorState)

# All nodes wrapped with timed_node for timing and error handling
graph.add_node("LogUserMessage", timed_node(LogUserMessage))
graph.add_node("ValidateInput", timed_node(ValidateInput))
graph.add_node("FetchLesson", timed_node(FetchLesson))
graph.add_node("RetrieveHistory", timed_node(RetrieveHistory))
graph.add_node("SummarizeHistory", timed_node(SummarizeHistory))
graph.add_node("FetchConcepts", timed_node(FetchConcepts))
graph.add_node("ClassifyReasoning", timed_node(ClassifyReasoning))
graph.add_node("GenerateLLMResponse", timed_node(GenerateLLMResponse))
graph.add_node("UpdateMastery", timed_node(UpdateMastery))
graph.add_node("ComputeReadiness", timed_node(ComputeReadiness))
graph.add_node("ComputeLearningPath", timed_node(ComputeLearningPath))
graph.add_node("LogMessage", timed_node(LogMessage))

# ------------------------------
# Define the linear flow
# ------------------------------
graph.set_entry_point("LogUserMessage")
graph.add_edge("LogUserMessage", "ValidateInput")
graph.add_edge("ValidateInput", "FetchLesson")
graph.add_edge("FetchLesson", "RetrieveHistory")
graph.add_edge("RetrieveHistory", "SummarizeHistory")
graph.add_edge("SummarizeHistory", "FetchConcepts")
graph.add_edge("FetchConcepts", "ClassifyReasoning")
graph.add_edge("ClassifyReasoning", "GenerateLLMResponse")
graph.add_edge("GenerateLLMResponse", "UpdateMastery")
graph.add_edge("UpdateMastery", "ComputeReadiness")
graph.add_edge("ComputeReadiness", "ComputeLearningPath")
graph.add_edge("ComputeLearningPath", "LogMessage")
graph.add_edge("LogMessage", END)

# Compile the graph into an executable app
tutor_app = graph.compile()


# -----------------------------------------------------
# FUNCTION: run_tutor_graph(input)
# -----------------------------------------------------
def run_tutor_graph(
    user_id: str,
    topic: str,
    message: str,
    conversation_id: str = None,
    explanation_style: str = "default",
    mode: str = "tutor",
    subject_id: Optional[int] = None,
    conversation_history: Optional[List[Dict[str, str]]] = None
):
    """
    High-level function to execute the LangGraph tutor pipeline.

    Inputs:
        - user_id         (str) required
        - topic            (str) topic_id from Supabase
        - message          (str) student's message/question
        - conversation_id  (optional str)
              if none provided → auto-generate "student_topic"
        - explanation_style (str) optional, default="default"
              Options: default, simple, detailed, steps, table,
              diagram, comparison, visual_prompt
        - mode             (str) optional, default="tutor"
              Options: "tutor", "exam", "essay"
        - subject_id       (int) optional, subject ID from Supabase

    Returns:
        dict containing:
          llm_response (or essay feedback for essay mode)
          related_concepts
          reasoning_label
          mastery_updates
          readiness
          learning_path
          conversation_id
    """

    # Ensure topic is always a string
    topic = str(topic)

    if DEBUG_MODE:
        logger.info("")
        logger.info("="*60)
        logger.info("[DEBUG] Starting LangGraph Tutor Pipeline")
        logger.info("="*60)
        logger.info(f"[DEBUG] User ID: {user_id}")
        logger.info(f"[DEBUG] Topic: {topic}")
        msg_preview = (
            f"{message[:100]}..." if len(message) > 100 else message
        )
        logger.info(f"[DEBUG] Message: {msg_preview}")
        logger.info(f"[DEBUG] Mode: {mode}")
        logger.info(f"[DEBUG] Explanation Style: {explanation_style}")
        logger.info("="*60)
        logger.info("")

    if conversation_id is None:
        conversation_id = f"{user_id}_{topic}"

    # Generate unique trace_id for this request
    trace_id = str(uuid4())

    if DEBUG_MODE:
        logger.info(f"[DEBUG] Conversation ID: {conversation_id}")
        logger.info(f"[DEBUG] Trace ID: {trace_id}")
        logger.info("")

    # Route based on mode
    if mode == "tutor":
        # Default tutor mode - run current graph
        # Use conversation_history from frontend if provided
        # Format: [{role: "user", content: "..."}, ...]
        history_from_frontend = conversation_history or []

        if DEBUG_MODE:
            logger.info(
                f"[DEBUG] Using conversation history from frontend: "
                f"{len(history_from_frontend)} messages"
            )

        initial_state = {
            "user_id": user_id,
            "topic": topic,
            "user_message": message,
            "conversation_id": conversation_id,
            "explanation_style": explanation_style,
            "trace_id": trace_id,
            "subject_id": subject_id,
            "lesson_text": None,
            "lesson_chunks": [],
            "history": history_from_frontend,  # Use history from frontend
            "condensed_history": None,
            "concept_rows": [],
            "reasoning_label": "neutral",
            "llm_response": "",
            "token_usage": {
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": 0
            },
            "mastery_updates": [],
            "readiness": None,
            "learning_path": None,
        }

        # Add timeout protection for graph execution
        import threading
        import time
        invoke_container = {
            "value": None, "error": None, "completed": False
        }

        if DEBUG_MODE:
            logger.info("[DEBUG] Starting graph execution with timeout...")

        start_time = time.time()

        def invoke_graph():
            try:
                if DEBUG_MODE:
                    logger.info("[DEBUG] Graph invoke thread started")
                invoke_container["value"] = tutor_app.invoke(initial_state)
                invoke_container["completed"] = True
                if DEBUG_MODE:
                    elapsed = time.time() - start_time
                    logger.info(
                        f"[DEBUG] Graph execution completed in {elapsed:.2f}s"
                    )
            except Exception as e:
                invoke_container["error"] = e
                invoke_container["completed"] = True
                if DEBUG_MODE:
                    elapsed = time.time() - start_time
                    logger.error(
                        f"[ERROR] Graph execution failed after "
                        f"{elapsed:.2f}s: {e}"
                    )

        invoke_thread = threading.Thread(target=invoke_graph, daemon=True)
        invoke_thread.start()
        invoke_thread.join()  # No timeout - let it complete

        elapsed = time.time() - start_time

        if not invoke_container["completed"]:
            logger.error(
                f"[ERROR] Graph execution did not complete after "
                f"{elapsed:.2f}s"
            )
            # Return a fallback response instead of raising
            return {
                "response": (
                    "I apologize, but I'm experiencing a delay. "
                    "Please try asking your question again."
                ),
                "suggestions": [],
                "related_concepts": [],
                "concept_ids": [],
                "reasoning_label": "neutral",
                "mastery_updates": [],
                "readiness": None,
                "learning_path": None,
                "token_usage": {
                    "prompt_tokens": 0,
                    "completion_tokens": 0,
                    "total_tokens": 0
                }
            }

        if invoke_container["error"]:
            logger.error(
                f"[ERROR] Graph execution failed after {elapsed:.2f}s: "
                f"{invoke_container['error']}"
            )
            raise invoke_container["error"]

        final_state = invoke_container["value"]

        if DEBUG_MODE:
            logger.info(
                f"[DEBUG] Graph execution successful, total time: "
                f"{elapsed:.2f}s"
            )

        if DEBUG_MODE:
            logger.info("")
            logger.info("="*60)
            logger.info("[DEBUG] Pipeline Execution Complete")
            logger.info("="*60)
            response_len = len(final_state.get('llm_response', ''))
            logger.info(f"[DEBUG] Response Length: {response_len} chars")
            concepts_count = len(final_state.get('concept_rows', []))
            logger.info(f"[DEBUG] Related Concepts: {concepts_count}")
            reasoning = final_state.get('reasoning_label', 'N/A')
            logger.info(f"[DEBUG] Reasoning Label: {reasoning}")
            mastery_count = len(final_state.get('mastery_updates', []))
            logger.info(f"[DEBUG] Mastery Updates: {mastery_count}")
            readiness_data = final_state.get('readiness')
            readiness_val = (
                readiness_data.get('overall_readiness', 'N/A')
                if readiness_data else 'N/A'
            )
            logger.info(f"[DEBUG] Readiness: {readiness_val}")
            learning_path_data = final_state.get('learning_path')
            learning_path_val = (
                learning_path_data.get('decision', 'N/A')
                if learning_path_data else 'N/A'
            )
            logger.info(f"[DEBUG] Learning Path: {learning_path_val}")
            logger.info("="*60)
            logger.info("")

        # Build standard API response
        # Ensure suggestions is always a list
        suggestions = final_state.get("suggestions", [])
        if not isinstance(suggestions, list):
            # Convert single suggestion to list if needed
            suggestions = [suggestions] if suggestions else []

        # Extract related concepts from concept_rows
        concept_rows = final_state.get("concept_rows", [])
        if DEBUG_MODE:
            logger.info(
                f"[DEBUG] Building response: concept_rows count = "
                f"{len(concept_rows)}"
            )
            if concept_rows:
                logger.info(
                    f"[DEBUG] Sample concept_row: {concept_rows[0]}"
                )

        related_concepts_list = [
            row.get("name") for row in concept_rows
            if row.get("name")
        ]
        concept_ids_list = [
            str(row.get("concept_id"))
            for row in concept_rows
            if row.get("concept_id") is not None
        ]

        if DEBUG_MODE:
            logger.info(
                f"[DEBUG] Extracted {len(related_concepts_list)} related "
                f"concepts and {len(concept_ids_list)} concept IDs"
            )

        return {
            "response": final_state["llm_response"],
            "suggestions": suggestions,
            "related_concepts": related_concepts_list,
            "concept_ids": concept_ids_list,
            "reasoning_label": final_state["reasoning_label"],
            "mastery_updates": final_state["mastery_updates"],
            "readiness": final_state.get("readiness"),
            "learning_path": final_state.get("learning_path"),
            "token_usage": final_state.get("token_usage", {
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": 0
            }),
            "conversation_id": final_state["conversation_id"],
            "lesson_chunks": final_state.get("lesson_chunks", [])
        }

    elif mode == "exam":
        # TODO: Build exam graph and run it
        # For now, return placeholder response
        logger.warning(
            "[TODO] Exam mode not yet implemented - "
            "returning placeholder response"
        )
        return {
            "response": (
                "Exam mode is not yet implemented. "
                "This will run a specialized exam graph in the future."
            ),
            "suggestions": [],
            "related_concepts": [],
            "concept_ids": [],
            "reasoning_label": "neutral",
            "mastery_updates": [],
            "readiness": None,
            "learning_path": None,
            "conversation_id": conversation_id
        }

    elif mode == "essay":
        # Call essay marker from LLM service
        try:
            essay_feedback = llm_service.essay_marker(
                essay_text=message,
                topic=topic,
                user_id=user_id
            )
            # Ensure suggestions is always a list
            essay_suggestions = essay_feedback.get("suggestions", [])
            if not isinstance(essay_suggestions, list):
                essay_suggestions = (
                    [essay_suggestions] if essay_suggestions else []
                )

            return {
                "response": essay_feedback.get("feedback", ""),
                "suggestions": essay_suggestions,
                "related_concepts": [],
                "concept_ids": [],
                "reasoning_label": "neutral",
                "mastery_updates": [],
                "readiness": None,
                "learning_path": None,
                "conversation_id": conversation_id,
                "score": essay_feedback.get("score")
            }
        except AttributeError:
            # essay_marker method doesn't exist yet
            logger.warning(
                "[TODO] essay_marker() not yet implemented in LLMService"
            )
            return {
                "response": (
                    "Essay marking is not yet implemented. "
                    "This will call llm_service.essay_marker() in the future."
                ),
                "suggestions": [],
                "related_concepts": [],
                "concept_ids": [],
                "reasoning_label": "neutral",
                "mastery_updates": [],
                "readiness": None,
                "learning_path": None,
                "conversation_id": conversation_id
            }

    else:
        # Invalid mode - default to tutor
        logger.warning(
            f"Invalid mode '{mode}' - defaulting to 'tutor' mode"
        )
        return run_tutor_graph(
            user_id=user_id,
            topic=topic,
            message=message,
            conversation_id=conversation_id,
            explanation_style=explanation_style,
            mode="tutor"
        )
