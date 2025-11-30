#!/usr/bin/env python3
"""
Unified Backend Service
Combines AI Tutor and Grading API on a single port (8000)
"""

import os
import json
from typing import Dict, List, Optional
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
from dotenv import load_dotenv

# Load environment variables from config.env (if exists) or use system env vars
# On Railway, environment variables are set directly, so config.env is optional
load_dotenv('config.env', override=False)  # Don't override existing env vars

# Optional LangChain support
try:
    import langchain_openai  # noqa: F401
    LANGCHAIN_AVAILABLE = True
except ImportError:
    LANGCHAIN_AVAILABLE = False
    # ENABLE_DEBUG not yet defined, skip debug print

# Import all agents from agents folder
try:
    import sys
    # Add agents folder to path so we can import directly
    agents_path = os.path.join(os.path.dirname(__file__), 'agents')
    if agents_path not in sys.path:
        sys.path.insert(0, agents_path)

    from agents.ai_tutor_agent import AITutorAgent  # to load services only
    from langgraph_tutor import run_tutor_graph
    from answer_grading_agent import (
        AnswerGradingAgent, GradingResult
    )
    from mock_exam_grading_agent import (
        MockExamGradingAgent, ExamReport, QuestionGrade,
        run_mock_exam_graph
    )
    GRADING_AVAILABLE = True
    AI_TUTOR_AVAILABLE = True

    # Import Mock Exam FastAPI app if available
    # Note: app is created at module level if FASTAPI_AVAILABLE
    try:
        # Re-import to ensure app is created (it's created at module level)
        import importlib
        import mock_exam_grading_agent
        # Reload to ensure app is initialized
        mock_exam_module = importlib.reload(mock_exam_grading_agent)
        if (hasattr(mock_exam_module, 'app') and
                mock_exam_module.app is not None):
            mock_exam_app = mock_exam_module.app
            MOCK_EXAM_APP_AVAILABLE = True
            print("[OK] Mock Exam FastAPI app found and loaded")
        else:
            MOCK_EXAM_APP_AVAILABLE = False
            mock_exam_app = None
            print("[WARNING] Mock Exam app not found in module")
    except (ImportError, AttributeError) as e:
        MOCK_EXAM_APP_AVAILABLE = False
        mock_exam_app = None
        print(f"[WARNING] Could not import Mock Exam app: {e}")
except ImportError:
    GRADING_AVAILABLE = False
    AI_TUTOR_AVAILABLE = False
    AITutorAgent = None
    AnswerGradingAgent = None
    GradingResult = None
    MockExamGradingAgent = None
    ExamReport = None
    QuestionGrade = None
    # ENABLE_DEBUG not yet defined, skip debug print

# Configuration with better error handling
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
LANGSMITH_API_KEY = os.getenv("LANGSMITH_API_KEY")
LANGSMITH_PROJECT = os.getenv(
    "LANGSMITH_PROJECT", "imtehaan-ai-tutor"
)
LANGSMITH_ENDPOINT = os.getenv(
    "LANGSMITH_ENDPOINT", "https://api.smith.langchain.com"
)

# AI Tutor Configuration - Use faster model
TUTOR_MODEL = os.getenv("TUTOR_MODEL", "gpt-4o-mini")
TUTOR_TEMPERATURE = float(os.getenv("TUTOR_TEMPERATURE", "1"))
# Reduced for speed
TUTOR_MAX_TOKENS = int(os.getenv("TUTOR_MAX_TOKENS", "2000"))

# Grading Configuration - Use faster model
GRADING_MODEL = os.getenv("GRADING_MODEL", "gpt-4o-mini")
GRADING_TEMPERATURE = float(os.getenv("GRADING_TEMPERATURE", "0.1"))
# Reduced for speed
GRADING_MAX_TOKENS = int(os.getenv("GRADING_MAX_TOKENS", "2000"))

# Server Configuration
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

# Logging Configuration
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
ENABLE_DEBUG = os.getenv("ENABLE_DEBUG", "true").lower() == "true"

# Performance Configuration
REQUEST_TIMEOUT = int(os.getenv("REQUEST_TIMEOUT", "30"))
MAX_CONCURRENT_REQUESTS = int(os.getenv("MAX_CONCURRENT_REQUESTS", "10"))

# CORS Configuration
# For production, set ALLOWED_ORIGINS env var to your frontend domain
# Example: ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
ALLOWED_ORIGINS_RAW = os.getenv("ALLOWED_ORIGINS", "*")
ALLOWED_ORIGINS = [origin.strip() for origin in ALLOWED_ORIGINS_RAW.split(",")]

# Only allow localhost in development mode
ENVIRONMENT = os.getenv("ENVIRONMENT", "production")
if ENVIRONMENT == "development" and "*" not in ALLOWED_ORIGINS:
    localhost_origins = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000"
    ]
    for origin in localhost_origins:
        if origin not in ALLOWED_ORIGINS:
            ALLOWED_ORIGINS.append(origin)

ALLOW_CREDENTIALS = os.getenv("ALLOW_CREDENTIALS", "true").lower() == "true"

# Security warning for production
if (
    "*" in ALLOWED_ORIGINS and
    os.getenv("ENVIRONMENT", "development") == "production"
):
    print("[ERROR] CORS is set to allow all origins (*) in production!")
    print(
        "   Set ALLOWED_ORIGINS environment variable to "
        "specific domains for security"
    )
    print("   Example: ALLOWED_ORIGINS=https://yourdomain.com")

# Validate required configuration
if not OPENAI_API_KEY:
    print("[ERROR] CRITICAL ERROR: OPENAI_API_KEY not found")
    print("   Please check config.env and ensure OPENAI_API_KEY is set")
    exit(1)

# Set LangSmith environment variables if available
if LANGSMITH_API_KEY:
    os.environ["LANGSMITH_API_KEY"] = LANGSMITH_API_KEY
    os.environ["LANGSMITH_PROJECT"] = LANGSMITH_PROJECT
    os.environ["LANGSMITH_ENDPOINT"] = LANGSMITH_ENDPOINT
    os.environ["LANGSMITH_TRACING"] = os.getenv("LANGSMITH_TRACING", "true")
    if ENABLE_DEBUG:
        print(f"[OK] LangSmith configured: {LANGSMITH_PROJECT}")
else:
    if ENABLE_DEBUG:
        print("[WARNING] LANGSMITH_API_KEY not found - tracing disabled")

# Initialize Grading Agents (will be set in lifespan)
grading_agent = None
mock_exam_grading_agent = None

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
        if ENABLE_DEBUG:
            print("[OK] Supabase client initialized for backend")
    else:
        if ENABLE_DEBUG:
            print(
                "[WARNING] Supabase credentials not found - "
                "backend will work without Supabase features"
            )
except ImportError:
    print(
        "[ERROR] Supabase Python client not installed - "
        "install with: pip install supabase"
    )
except Exception as e:
    print(f"[ERROR] Error initializing Supabase client: {e}")

# Initialize AI Tutor Agent (global, initialized once on boot)
ai_tutor_agent = None
if AI_TUTOR_AVAILABLE and AITutorAgent:
    try:
        ai_tutor_agent = AITutorAgent(
            api_key=OPENAI_API_KEY,
            model=TUTOR_MODEL,
            temperature=TUTOR_TEMPERATURE,
            max_tokens=TUTOR_MAX_TOKENS,
            supabase_client=supabase_client
        )
        if ENABLE_DEBUG:
            print("[OK] AI Tutor Agent initialized successfully")
            print(f"   Model: {TUTOR_MODEL}")
            print(f"   Temperature: {TUTOR_TEMPERATURE}")
            print(f"   Max Tokens: {TUTOR_MAX_TOKENS}")
    except Exception as e:
        print(f"[ERROR] Error initializing AI Tutor agent: {e}")
        ai_tutor_agent = None
else:
    if ENABLE_DEBUG:
        print("[WARNING] AI Tutor agent not available")
    ai_tutor_agent = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler for startup and shutdown"""
    global grading_agent, mock_exam_grading_agent

    # Startup: Initialize all agents
    if ENABLE_DEBUG:
        print("[STARTUP] Initializing agents...")

    # Initialize Answer Grading Agent
    if GRADING_AVAILABLE and AnswerGradingAgent:
        try:
            grading_agent = AnswerGradingAgent(
                api_key=OPENAI_API_KEY,
                model=GRADING_MODEL,
                temperature=GRADING_TEMPERATURE,
                max_tokens=GRADING_MAX_TOKENS
            )
            if ENABLE_DEBUG:
                print("[OK] Answer Grading Agent initialized successfully")
                print(f"   Model: {GRADING_MODEL}")
                print(f"   Temperature: {GRADING_TEMPERATURE}")
                print(f"   Max Tokens: {GRADING_MAX_TOKENS}")
        except Exception as e:
            print(f"[ERROR] Error initializing grading agent: {e}")
            import traceback
            print(f"Traceback: {traceback.format_exc()}")
    else:
        if ENABLE_DEBUG:
            print("[WARNING] Answer Grading agent not available")
            print(f"   GRADING_AVAILABLE: {GRADING_AVAILABLE}")
            print(f"   AnswerGradingAgent: {AnswerGradingAgent}")

    # Initialize Mock Exam Grading Agent
    if GRADING_AVAILABLE and MockExamGradingAgent:
        try:
            mock_exam_grading_agent = MockExamGradingAgent(
                api_key=OPENAI_API_KEY
            )
            if ENABLE_DEBUG:
                print("[OK] Mock Exam Grading Agent initialized successfully")
        except Exception as e:
            print(
                f"[ERROR] Error initializing mock exam grading agent: {e}"
            )
    else:
        if ENABLE_DEBUG:
            print("[WARNING] Mock Exam Grading agent not available")

    if ENABLE_DEBUG:
        print("[STARTUP] All agents initialized\n")

    yield  # Server runs here

    # Shutdown: Cleanup if needed
    if ENABLE_DEBUG:
        print("[SHUTDOWN] Shutting down gracefully...")


# Initialize FastAPI app with lifespan
app = FastAPI(
    title="Imtehaan AI EdTech Platform",
    version="2.0.0",
    description="Unified backend combining AI Tutor and Grading services",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Mock Exam Grading FastAPI app if available
try:
    if MOCK_EXAM_APP_AVAILABLE and mock_exam_app:
        app.mount("/api/v1/mock", mock_exam_app)
        if ENABLE_DEBUG:
            print("[OK] Mock Exam Grading API mounted at /api/v1/mock")
except NameError:
    # MOCK_EXAM_APP_AVAILABLE not defined (import failed)
    pass


# Pydantic models for AI Tutor
class TutorRequest(BaseModel):
    message: str
    topic: int
    lesson_content: Optional[str] = None
    user_id: Optional[str] = None
    conversation_history: Optional[List[Dict[str, str]]] = []
    conversation_id: Optional[str] = None
    learning_level: Optional[str] = "intermediate"
    explanation_style: Optional[str] = "default"


class TutorResponse(BaseModel):
    response: str
    suggestions: List[str]
    related_concepts: List[str]
    related_concept_ids: List[str] = []
    confidence_score: float
    reasoning_label: str = "neutral"
    mastery_updates: List[Dict] = []
    readiness: Optional[Dict] = None
    learning_path: Optional[Dict] = None
    token_usage: Optional[Dict] = None
    lesson_chunks: Optional[List[Dict]] = []


class LessonRequest(BaseModel):
    topic: str
    learning_objectives: List[str]
    difficulty_level: str = "intermediate"


class LessonResponse(BaseModel):
    lesson_content: str
    key_points: List[str]
    practice_questions: List[str]
    estimated_duration: int


# Pydantic models for Grading API
class GradingRequest(BaseModel):
    question: str
    model_answer: str
    student_answer: str
    subject: str = "Business Studies"
    topic: str = ""
    user_id: Optional[str] = None
    question_id: Optional[str] = None
    topic_id: Optional[str] = None
    max_marks: Optional[int] = None
    difficulty_level: Optional[int] = None


class GradingResponse(BaseModel):
    success: bool
    # Using Dict instead of GradingResult to avoid import issues
    result: Optional[Dict] = None
    message: str = ""


# Pydantic models for Mock Exam Grading
class MockExamGradingRequest(BaseModel):
    attempted_questions: List[Dict]
    exam_type: str = "P1"  # P1 or P2
    user_id: Optional[str] = None


class QuestionGradeResponse(BaseModel):
    question_id: int
    question_number: int = 1
    part: str = ""
    question_text: str
    student_answer: str
    model_answer: str
    marks_allocated: int
    marks_awarded: float
    percentage_score: float
    feedback: str
    strengths: List[str]
    improvements: List[str]


class MockExamGradingResponse(BaseModel):
    success: bool
    total_questions: int
    questions_attempted: int
    total_marks: int
    marks_obtained: float
    percentage_score: float
    overall_grade: str
    question_grades: List[QuestionGradeResponse]
    overall_feedback: str
    recommendations: List[str]
    strengths_summary: List[str]
    weaknesses_summary: List[str]
    message: str = ""


# ============================================================
#  TIME TRACKING SERVICE — NEW
# ============================================================

class TimeStartRequest(BaseModel):
    user_id: str
    page_type: str     # mock_exam | flashcards | topical_exam | lessons


class TimeStopRequest(BaseModel):
    tracking_id: str


# ===== AI TUTOR ENDPOINTS =====

@app.post("/tutor/chat", response_model=TutorResponse)
async def chat_with_tutor(request: TutorRequest):
    """Chat with the AI tutor using LangGraph pipeline"""
    if not AI_TUTOR_AVAILABLE:
        raise HTTPException(
            status_code=503, detail="AI Tutor not available"
        )

    # Validate required user_id
    if not request.user_id:
        raise HTTPException(
            status_code=400, detail="user_id is required"
        )

    # Generate conversation_id if not provided
    conversation_id = (
        request.conversation_id or f"{request.user_id}_{request.topic}"
    )

    try:
        # Use LangGraph tutor pipeline with timeout protection
        if ENABLE_DEBUG:
            print(
                f"[Backend] Calling run_tutor_graph for user: "
                f"{request.user_id}, topic: {request.topic}"
            )

        # Add overall timeout for graph execution (90 seconds)
        # Increased from 60s to allow for LLM processing time
        import threading
        result_container = {
            "value": None, "error": None, "completed": False
        }

        def execute_graph():
            try:
                result_container["value"] = run_tutor_graph(
                    user_id=request.user_id,
                    topic=str(request.topic),
                    message=request.message,
                    conversation_id=conversation_id,
                    explanation_style=request.explanation_style or "default",
                    subject_id=101,
                    conversation_history=request.conversation_history
                )
                result_container["completed"] = True
            except Exception as e:
                result_container["error"] = e
                result_container["completed"] = True

        graph_thread = threading.Thread(
            target=execute_graph, daemon=True
        )
        graph_thread.start()
        graph_thread.join()  # No timeout - let it complete

        if not result_container["completed"]:
            raise HTTPException(
                status_code=504,
                detail="AI Tutor request did not complete"
            )

        if result_container["error"]:
            error = result_container["error"]
            error_msg = str(error)
            if ENABLE_DEBUG:
                print(f"[ERROR] Graph execution failed: {error_msg}")
                print(f"Error type: {type(error).__name__}")
            raise HTTPException(
                status_code=500,
                detail=f"AI Tutor processing error: {error_msg}"
            )

        result = result_container["value"]

        if result is None:
            raise HTTPException(
                status_code=500,
                detail="AI Tutor returned no result"
            )

        # Ensure result is a dict
        if not isinstance(result, dict):
            raise HTTPException(
                status_code=500,
                detail=(
                    f"AI Tutor returned invalid result type: {type(result)}"
                )
            )

        # Serialize and deserialize to handle non-serializable types
        try:
            result = json.loads(json.dumps(result, default=str))
        except Exception as json_error:
            if ENABLE_DEBUG:
                print(f"[ERROR] JSON serialization failed: {json_error}")
            raise HTTPException(
                status_code=500,
                detail=(
                    f"Failed to serialize AI Tutor response: "
                    f"{str(json_error)}"
                )
            )

        # Convert concept_ids to strings immediately after getting result
        if "concept_ids" in result and result["concept_ids"]:
            result["concept_ids"] = [
                str(cid) if cid is not None else ""
                for cid in result["concept_ids"]
            ]
            # Filter out empty strings
            result["concept_ids"] = [
                cid for cid in result["concept_ids"] if cid
            ]

        if ENABLE_DEBUG:
            response_len = len(result.get('response', ''))
            print(f"[Backend] Tutor response length: {response_len} chars")
            concept_ids = result.get('concept_ids', [])
            concept_type = (
                type(concept_ids[0]) if concept_ids else 'N/A'
            )
            print(
                f"[Backend] Concept IDs: {concept_ids} "
                f"(type: {concept_type})"
            )

        # Normalize readiness structure to exact format
        readiness_raw = result.get("readiness")
        readiness_normalized = None
        if readiness_raw:
            # Ensure all required fields are present
            # Handle average_mastery and min_mastery - they might be None
            avg_mastery = readiness_raw.get("average_mastery")
            min_mastery = readiness_raw.get("min_mastery")

            # Calculate dynamic readiness based on average_mastery
            # Convert mastery (0-100) to readiness (0.0-1.0)
            if avg_mastery is not None:
                # Convert mastery score to readiness score
                # This makes readiness responsive to actual mastery changes
                overall = float(avg_mastery) / 100.0
                # Clamp between 0.0 and 1.0
                overall = max(0.0, min(1.0, overall))
                if ENABLE_DEBUG:
                    print(
                        f"[DEBUG] Readiness calculated from mastery: "
                        f"avg_mastery={avg_mastery} -> overall={overall}"
                    )
            else:
                # Fallback: Convert readiness string to numeric if no mastery
                overall = readiness_raw.get("overall_readiness")
                if isinstance(overall, str):
                    # Map readiness strings to numeric scores (fallback only)
                    readiness_map = {
                        "ready": 1.0,
                        "almost_ready": 0.75,
                        "needs_reinforcement": 0.5,
                        "review_prerequisites": 0.25,
                        "unknown": 0.0
                    }
                    overall = readiness_map.get(overall, 0.0)
                    if ENABLE_DEBUG:
                        print(
                            f"[DEBUG] Readiness from string mapping: "
                            f"'{readiness_raw.get('overall_readiness')}' -> "
                            f"{overall}"
                        )
                elif overall is None:
                    overall = 0.0
                else:
                    overall = (
                        float(overall) if overall is not None else 0.0
                    )

            readiness_normalized = {
                "overall_readiness": float(overall),
                "overall": float(overall),  # Frontend expects 'overall' field
                "average_mastery": (
                    float(avg_mastery) if avg_mastery is not None else 0.0
                ),
                "min_mastery": (
                    float(min_mastery) if min_mastery is not None else 0.0
                ),
                "concept_readiness": readiness_raw.get("concept_readiness", {})
            }
            # Convert concept_readiness list to dict if needed
            if isinstance(readiness_normalized["concept_readiness"], list):
                concept_dict = {}
                for item in readiness_normalized["concept_readiness"]:
                    if isinstance(item, dict) and "concept_id" in item:
                        concept_dict[item["concept_id"]] = item
                readiness_normalized["concept_readiness"] = concept_dict
        else:
            # Return structure with null values if missing
            readiness_normalized = {
                "overall_readiness": 0.0,
                "average_mastery": 0.0,
                "min_mastery": 0.0,
                "concept_readiness": {}
            }

        # Normalize learning_path structure to exact format
        learning_path_raw = result.get("learning_path")
        learning_path_normalized = None
        if learning_path_raw:
            learning_path_normalized = {
                "decision": str(learning_path_raw.get("decision", "unknown")),
                "recommended_concept": (
                    str(learning_path_raw.get("recommended_concept"))
                    if learning_path_raw.get("recommended_concept") is not None
                    else None
                ),
                "recommended_concept_name": (
                    str(learning_path_raw.get("recommended_concept_name"))
                    if learning_path_raw.get(
                        "recommended_concept_name"
                    ) is not None
                    else None
                ),
                "details": str(learning_path_raw.get("details", ""))
            }
        else:
            # Return structure with null values if missing
            learning_path_normalized = {
                "decision": "unknown",
                "recommended_concept": None,
                "recommended_concept_name": None,
                "details": ""
            }

        # Ensure suggestions is always a list
        suggestions_list = result.get("suggestions", [])
        if not isinstance(suggestions_list, list):
            # Convert single suggestion to list if needed
            suggestions_list = [suggestions_list] if suggestions_list else []

        # Ensure related_concepts is always a list
        related_concepts_list = result.get("related_concepts", [])
        if related_concepts_list is None:
            related_concepts_list = []
        elif not isinstance(related_concepts_list, list):
            # Convert single value or string to list if needed
            related_concepts_list = (
                [related_concepts_list] if related_concepts_list else []
            )

        # Ensure mastery_updates is always a list
        mastery_updates_list = result.get("mastery_updates", [])
        if mastery_updates_list is None:
            mastery_updates_list = []
        elif not isinstance(mastery_updates_list, list):
            # Convert single value to list if needed
            mastery_updates_list = (
                [mastery_updates_list] if mastery_updates_list else []
            )

        # Ensure concept_ids are strings
        concept_ids_list = result.get("concept_ids", [])
        if concept_ids_list:
            concept_ids_list = [
                str(cid) if cid is not None else ""
                for cid in concept_ids_list
            ]
            # Filter out empty strings
            concept_ids_list = [cid for cid in concept_ids_list if cid]

        # Ensure response field exists (required)
        response_text = (
            result.get("response") or result.get("llm_response", "")
        )
        if not response_text:
            if ENABLE_DEBUG:
                print("[WARNING] No response text in result, using fallback")
            response_text = (
                "I apologize, but I'm having trouble generating a response. "
                "Please try again."
            )

        try:
            return TutorResponse(
                response=response_text,
                suggestions=suggestions_list,
                related_concepts=related_concepts_list,
                related_concept_ids=concept_ids_list,
                confidence_score=result.get("confidence_score", 0.95),
                reasoning_label=result.get("reasoning_label", "neutral"),
                mastery_updates=mastery_updates_list,
                readiness=readiness_normalized,
                learning_path=learning_path_normalized,
                token_usage=result.get("token_usage"),
                lesson_chunks=result.get("lesson_chunks", [])
            )
        except Exception as validation_error:
            if ENABLE_DEBUG:
                print(
                    f"[ERROR] Response validation failed: "
                    f"{validation_error}"
                )
                import traceback
                print(f"Traceback: {traceback.format_exc()}")
            raise HTTPException(
                status_code=500,
                detail=(
                    f"Failed to validate tutor response: "
                    f"{str(validation_error)}"
                )
            )
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"[ERROR] Error in tutor chat: {e}")
        print(f"Traceback: {error_trace}")
        if ENABLE_DEBUG:
            print(f"Full error details: {error_trace}")
        raise HTTPException(
            status_code=500,
            detail=f"Error processing tutor request: {str(e)}"
        )


@app.post("/tutor/lesson", response_model=LessonResponse)
async def create_lesson(request: LessonRequest):
    """Create a structured lesson using LLMService"""
    if not AI_TUTOR_AVAILABLE or not ai_tutor_agent:
        raise HTTPException(
            status_code=503, detail="AI Tutor not available"
        )

    try:
        # Get LLM service from agent
        services = ai_tutor_agent.build_services()
        llm_service = services["llm"]

        # Generate lesson using LLMService
        lesson_data = llm_service.generate_lesson(
            topic=request.topic,
            learning_objectives=request.learning_objectives,
            difficulty_level=request.difficulty_level
        )

        # Convert to LessonResponse
        return LessonResponse(
            lesson_content=lesson_data.get("lesson_content", ""),
            key_points=lesson_data.get("key_points", []),
            practice_questions=lesson_data.get("practice_questions", []),
            estimated_duration=lesson_data.get("estimated_duration", 30)
        )

    except Exception as e:
        print(f"Error creating lesson: {e}")
        raise HTTPException(
            status_code=500, detail="Error creating lesson"
        )


@app.get("/tutor/health")
async def tutor_health():
    """Health check for AI Tutor service"""
    return {
        "status": "healthy",
        "service": "AI Tutor",
        "langchain_available": LANGCHAIN_AVAILABLE,
        "openai_configured": bool(OPENAI_API_KEY)
    }


# ===== GRADING API ENDPOINTS =====

@app.post("/grade-answer", response_model=GradingResponse)
async def grade_answer(request: GradingRequest):
    """Grade a student answer against the model answer"""

    if not GRADING_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Grading service not available"
        )

    if not grading_agent:
        raise HTTPException(
            status_code=500,
            detail=(
                "Grading agent not initialized. "
                "Check API key configuration."
            )
        )

    try:
        # Validate input
        if not request.student_answer.strip():
            raise HTTPException(
                status_code=400,
                detail="Student answer cannot be empty"
            )

        if not request.model_answer.strip():
            raise HTTPException(
                status_code=400,
                detail="Model answer cannot be empty"
            )

        # Grade the answer with timeout protection (45 seconds)
        import threading
        result_container = {
            "value": None, "error": None, "completed": False
        }

        def execute_grading():
            try:
                result_container["value"] = grading_agent.grade_answer(
                    question=request.question,
                    model_answer=request.model_answer,
                    student_answer=request.student_answer,
                    user_id=request.user_id,
                    max_marks=request.max_marks,
                    question_id=request.question_id,
                    topic_id=request.topic_id,
                    difficulty_level=request.difficulty_level
                )
                result_container["completed"] = True
            except Exception as e:
                result_container["error"] = e
                result_container["completed"] = True

        grading_thread = threading.Thread(
            target=execute_grading, daemon=True
        )
        grading_thread.start()
        grading_thread.join(timeout=45)

        if not result_container["completed"]:
            raise HTTPException(
                status_code=504,
                detail="Grading request timed out after 45 seconds"
            )

        if result_container["error"]:
            raise result_container["error"]

        result = result_container["value"]

        # Convert GradingResult Pydantic model to dict
        if hasattr(result, 'model_dump'):
            result_dict = result.model_dump()
        elif hasattr(result, 'dict'):
            result_dict = result.dict()
        else:
            result_dict = result

        return GradingResponse(
            success=True,
            result=result_dict,
            message="Answer graded successfully"
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error during grading: {str(e)}"
        )


@app.post("/grade-mock-exam", response_model=MockExamGradingResponse)
async def grade_mock_exam(request: MockExamGradingRequest):
    """Grade a complete mock exam with all attempted questions"""

    if not GRADING_AVAILABLE or not mock_exam_grading_agent:
        raise HTTPException(
            status_code=503,
            detail="Mock exam grading service not available"
        )

    try:
        # Validate input
        if not request.attempted_questions:
            raise HTTPException(
                status_code=400,
                detail="No attempted questions provided"
            )

        print(
            f"📝 Grading {request.exam_type} mock exam with "
            f"{len(request.attempted_questions)} questions"
        )

        # Validate user_id is provided (allow 'anonymous' for testing)
        user_id = request.user_id or "anonymous"
        if user_id == "anonymous":
            print(
                "[WARNING] Exam submitted without user_id. "
                "Using 'anonymous' - results may not persist correctly."
            )

        # Generate request_id and job_id for tracing
        from uuid import uuid4
        request_id = f"exam-{uuid4().hex[:8]}"
        job_id = f"job-{uuid4().hex[:8]}"

        print(
            f"[DEBUG] Starting exam grading workflow: "
            f"user_id={user_id}, questions={len(request.attempted_questions)}"
        )

        # Run the full LangGraph workflow which includes:
        # 1. Grading questions
        # 2. Computing mastery and readiness
        # 3. Persisting results to database (exam_attempts,
        #    exam_question_results, student_mastery, student_weaknesses,
        #    student_readiness)
        try:
            report = await run_mock_exam_graph(
                agent=mock_exam_grading_agent,
                user_id=user_id,
                attempted_questions=request.attempted_questions,
                request_id=request_id,
                job_id=job_id
            )
            print(
                f"[DEBUG] Exam grading workflow completed successfully. "
                f"Score: {report.percentage_score}%"
            )
        except Exception as workflow_error:
            print(
                f"[ERROR] Workflow error: {workflow_error}",
                exc_info=True
            )
            # Re-raise to return error to client
            raise

        # Convert QuestionGrade to QuestionGradeResponse
        question_grades_response = [
            QuestionGradeResponse(
                question_id=g.question_id,
                question_number=g.question_number,
                part=g.part,
                question_text=g.question_text,
                student_answer=g.student_answer,
                model_answer=g.model_answer,
                marks_allocated=g.marks_allocated,
                marks_awarded=g.marks_awarded,
                percentage_score=g.percentage_score,
                feedback=g.feedback,
                strengths=g.strengths,
                improvements=g.improvements
            )
            for g in report.question_grades
        ]

        return MockExamGradingResponse(
            success=True,
            total_questions=report.total_questions,
            questions_attempted=report.questions_attempted,
            total_marks=report.total_marks,
            marks_obtained=report.marks_obtained,
            percentage_score=report.percentage_score,
            overall_grade=report.overall_grade,
            question_grades=question_grades_response,
            overall_feedback=report.overall_feedback,
            recommendations=report.recommendations,
            strengths_summary=report.strengths_summary,
            weaknesses_summary=report.weaknesses_summary,
            message="Exam graded successfully"
        )

    except Exception as e:
        print(f"[ERROR] Error during mock exam grading: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error during grading: {str(e)}"
        )


@app.get("/grading/health")
async def grading_health():
    """Health check for grading service"""
    return {
        "status": "healthy" if GRADING_AVAILABLE else "unavailable",
        "grading_agent_ready": grading_agent is not None,
        "mock_exam_grading_agent_ready": mock_exam_grading_agent is not None,
        "service": "Answer Grading API"
    }


# ============================================================
#  TIME TRACKING ENDPOINTS  (NEW)
# ============================================================

@app.post("/analytics/start")
async def analytics_start(req: TimeStartRequest):
    """
    Start timing when a page is opened.
    Returns a tracking_id that frontend must store.
    """
    if not supabase_client:
        raise HTTPException(
            status_code=500, detail="Supabase not configured"
        )

    record = {
        "user_id": req.user_id,
        "page_type": req.page_type,
        "start_time": datetime.now(timezone.utc).isoformat()
    }

    try:
        result = (
            supabase_client.table("time_tracking")
            .insert(record)
            .execute()
        )
        tracking_id = result.data[0]["id"]

        return {
            "success": True,
            "tracking_id": tracking_id
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to start tracking: {str(e)}"
        )


@app.post("/analytics/stop")
async def analytics_stop(req: TimeStopRequest):
    """
    Stop timer when user leaves the page.
    Duration is calculated and stored.
    """
    if not supabase_client:
        raise HTTPException(
            status_code=500, detail="Supabase not configured"
        )

    try:
        # Get existing record
        result = (
            supabase_client.table("time_tracking")
            .select("*")
            .eq("id", req.tracking_id)
            .single()
            .execute()
        )

        if not result.data:
            raise HTTPException(
                status_code=404, detail="Tracking ID not found"
            )

        rec = result.data
        start_time_str = rec["start_time"]
        # Handle both ISO format with Z and without
        if start_time_str.endswith("Z"):
            start_time = datetime.fromisoformat(
                start_time_str.replace("Z", "+00:00")
            )
        else:
            start_time = datetime.fromisoformat(
                start_time_str.replace("Z", "")
            )
        end_time = datetime.now(timezone.utc)

        duration_seconds = int((end_time - start_time).total_seconds())

        # Update record
        supabase_client.table("time_tracking").update({
            "end_time": end_time.isoformat(),
            "duration_seconds": duration_seconds
        }).eq("id", req.tracking_id).execute()

        return {
            "success": True,
            "duration": duration_seconds
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to stop tracking: {str(e)}"
        )


# ------------------------------------------------------------
# DAILY ROLLUP — Sync time_tracking to daily_analytics
# ------------------------------------------------------------
@app.post("/analytics/rollup/{user_id}")
async def analytics_rollup(user_id: str):
    """
    Rollup function to sync time_tracking data to daily_analytics.
    This ensures weekly and monthly calculations include today's time.
    """
    if not supabase_client:
        raise HTTPException(
            status_code=500, detail="Supabase not configured"
        )

    try:
        today = datetime.now(timezone.utc).date()
        today_start = (
            datetime.combine(today, datetime.min.time())
            .replace(tzinfo=timezone.utc)
        )
        today_end = (
            datetime.combine(today, datetime.max.time())
            .replace(tzinfo=timezone.utc)
        )

        # Get all time_tracking records for today
        result = (
            supabase_client.table("time_tracking")
            .select("duration_seconds")
            .eq("user_id", user_id)
            .gte("start_time", today_start.isoformat())
            .lt("start_time", today_end.isoformat())
            .not_.is_("duration_seconds", "null")
            .execute()
        )

        # Calculate total time from time_tracking
        total_seconds = sum(
            record.get("duration_seconds", 0) or 0
            for record in (result.data or [])
        )

        # Get current daily_analytics record
        daily_result = (
            supabase_client.table("daily_analytics")
            .select("*")
            .eq("user_id", user_id)
            .eq("date", today.isoformat())
            .execute()
        )

        current_daily = daily_result.data[0] if daily_result.data else None

        # Use upsert to avoid duplicate entries
        # This ensures only one record per user per day
        session_count = len(result.data or [])

        # Preserve existing values if record exists, only update time
        existing_time = (
            current_daily.get("total_time_spent", 0) or 0
            if current_daily else 0
        )
        existing_activities = (
            current_daily.get("total_activities", 0) or 0
            if current_daily else 0
        )
        existing_session_count = (
            current_daily.get("session_count", 0) or 0
            if current_daily else 0
        )

        # Use the larger value to avoid overwriting with smaller time
        # (in case of race conditions)
        final_time = max(existing_time, total_seconds)
        final_session_count = max(existing_session_count, session_count)
        avg_session = (
            final_time // final_session_count
            if final_session_count > 0 else 0
        )

        # Use upsert with conflict resolution
        # This ensures only one record per user per day
        upsert_data = {
            "user_id": user_id,
            "date": today.isoformat(),
            "total_time_spent": final_time,
            "total_activities": existing_activities,
            "session_count": final_session_count,
            "average_session_length": avg_session,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }

        # First try to update existing record
        if current_daily:
            (
                supabase_client.table("daily_analytics")
                .update(upsert_data)
                .eq("user_id", user_id)
                .eq("date", today.isoformat())
                .execute()
            )
        else:
            # Insert new record only if it doesn't exist
            (
                supabase_client.table("daily_analytics")
                .insert(upsert_data)
                .execute()
            )

        was_updated = final_time != existing_time

        return {
            "success": True,
            "message": (
                "Daily analytics created" if not current_daily
                else "Daily analytics updated"
            ),
            "total_time_seconds": final_time,
            "time_tracking_records": session_count,
            "was_updated": was_updated,
            "was_created": not current_daily
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to rollup analytics: {str(e)}"
        )


# ===== UNIFIED ENDPOINTS =====

@app.get("/")
async def root():
    """Root endpoint with unified API information"""
    return {
        "message": "Imtehaan AI EdTech Platform - Unified Backend",
        "version": "2.0.0",
        "services": {
            "ai_tutor": {
                "status": "available",
                "endpoints": {
                    "chat": "/tutor/chat",
                    "lesson": "/tutor/lesson",
                    "health": "/tutor/health"
                }
            },
            "grading": {
                "status": "available" if GRADING_AVAILABLE else "unavailable",
                "endpoints": {
                    "grade_answer": "/grade-answer",
                    "health": "/grading/health"
                }
            }
        },
        "port": PORT,
        "documentation": "/docs"
    }


@app.get("/health")
async def unified_health():
    """Unified health check for all services"""
    return {
        "status": "healthy",
        "services": {
            "ai_tutor": {
                "status": "healthy",
                "langchain_available": LANGCHAIN_AVAILABLE,
                "openai_configured": bool(OPENAI_API_KEY)
            },
            "grading": {
                "status": (
                    "healthy" if GRADING_AVAILABLE and grading_agent
                    else "unavailable"
                ),
                "agent_ready": grading_agent is not None
            }
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


if __name__ == "__main__":
    if ENABLE_DEBUG:
        print("Starting Unified Backend Service...")
    print("AI Tutor endpoints: /tutor/*")
    print("Grading endpoints: /grade-answer, /grading/health")
    print("Health checks: /health, /tutor/health, /grading/health")
    print("Documentation: http://localhost:8000/docs")
    print("Server: http://localhost:8000")

    uvicorn.run(
        app,
        host=HOST,
        port=PORT,
        log_level=LOG_LEVEL.lower()
    )
