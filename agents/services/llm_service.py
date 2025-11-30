#!/usr/bin/env python3
"""
LLM Service - Handles Large Language Model operations
"""

import json
import logging
import os
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


class LLMService:
    """
    Handles LLM response generation and prompt management.
    """

    def __init__(self, llm, langchain_available: bool):
        """
        Initialize LLMService.

        Args:
            llm: LangChain ChatOpenAI instance (or None if unavailable)
            langchain_available: Whether LangChain is available
        """
        self.llm = llm
        self.langchain_available = langchain_available
        self.logger = logging.getLogger(__name__)
        # Initialize OpenAI client for direct API calls (e.g., summarization)
        try:
            import os
            from openai import OpenAI
            api_key = os.getenv("OPENAI_API_KEY")
            if api_key:
                self.openai_client = OpenAI(api_key=api_key)
            else:
                self.openai_client = None
        except ImportError:
            self.openai_client = None

    def generate_reply(
        self,
        message: str,
        topic: str,
        learning_level: str,
        conversation_history: List[Dict],
        lesson_content: Optional[str] = None,
        concept_rows: Optional[List[Dict]] = None,
        explanation_style: str = "default",
        lesson_chunks: Optional[List[Dict]] = None,
        condensed_history: Optional[str] = None,
        student_profile: Optional[Dict] = None
    ) -> tuple:
        """
        Generate AI tutor reply. Uses LangChain if available, otherwise
        fallback.

        Args:
            message: Student's message/question
            topic: Topic/subject
            learning_level: Student's learning level
            conversation_history: List of conversation messages
            lesson_content: Optional lesson content
            concept_rows: Optional related concepts
            explanation_style: Explanation style preference
            lesson_chunks: Optional relevant lesson chunks
            condensed_history: Optional condensed history text
            student_profile: Optional student profile

        Returns:
            tuple: (response_text, token_usage_dict)
                token_usage_dict: {
                    "prompt_tokens": int,
                    "completion_tokens": int,
                    "total_tokens": int
                }
        """
        if self.langchain_available and self.llm:
            try:
                return self._generate_with_langchain(
                    message,
                    topic,
                    learning_level,
                    conversation_history,
                    lesson_content,
                    concept_rows,
                    explanation_style,
                    lesson_chunks,
                    condensed_history,
                    student_profile
                )
            except Exception:
                fallback_response = self._generate_fallback_response(
                    message, topic
                )
                return (fallback_response, {
                    "prompt_tokens": 0,
                    "completion_tokens": 0,
                    "total_tokens": 0
                })
        else:
            fallback_response = self._generate_fallback_response(
                message, topic
            )
            return (fallback_response, {
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": 0
            })

    def _generate_with_langchain(
        self,
        message: str,
        topic: str,
        learning_level: str,
        conversation_history: List[Dict],
        lesson_content: Optional[str] = None,
        concept_rows: Optional[List[Dict]] = None,
        explanation_style: str = "default",
        lesson_chunks: Optional[List[Dict]] = None,
        condensed_history: Optional[str] = None,
        student_profile: Optional[Dict] = None
    ) -> str:
        """Generate response using LangChain and gpt-4o-mini"""

        # Use condensed history if provided, otherwise build from full history
        if condensed_history:
            history_text = condensed_history
        else:
            # Build history text from full conversation
            history_text = ""
            for m in conversation_history:
                history_text += f"{m['role']}: {m['content']}\n"

        # Build concept summaries (OPTIMIZED: only names, no descriptions)
        concept_summaries = ""
        if concept_rows:
            # Only include concept names for speed (descriptions add tokens)
            names = [
                c.get("name", "") for c in concept_rows[:5] if c.get("name")
            ]
            concept_summaries = ", ".join(names) if names else ""

        # OPTIMIZED: Skip student profile to reduce prompt size
        # Use default learning level from parameter instead
        profile_context = ""

        # Build lesson chunks text
        lesson_chunks_text = ""
        if lesson_chunks:
            lesson_chunks_text = "\n\n".join([
                chunk.get("chunk_text", "")
                for chunk in lesson_chunks
                if chunk.get("chunk_text")
            ])

        # Create structured RAG prompt with Business Studies restriction
        prompt = f"""
        You are an expert Business Studies AI tutor helping a student
        learn Business Studies concepts related to {topic}.

        CRITICAL RESTRICTION: You MUST ONLY answer questions about
        Business Studies topics. This includes:
        - Business organizations (sole traders, partnerships, etc.)
        - Business finance and accounting
        - Marketing and market research
        - Human resources and management
        - Operations and production
        - Business strategy and planning
        - Economics and business environment
        - Business ethics and social responsibility
        - International business
        - Entrepreneurship

        If the student asks about topics OUTSIDE of Business Studies
        (e.g., mathematics, science, history, literature, programming,
        etc.), you MUST politely decline and redirect them to Business
        Studies topics.
        
        {profile_context}
        ================================
        LESSON CONTENT
        ================================
        {lesson_content or "No lesson content was provided."}

        ================================
        MOST RELEVANT LESSON PASSAGES
        ================================
        {lesson_chunks_text or "No specific lesson passages found."}

        ================================
        KEY CONCEPTS (Supabase/pgvector search)
        ================================
        {concept_summaries or "No related concepts found."}

        ================================
        RECENT CONVERSATION (Supabase memory)
        ================================
        {history_text or "No prior messages."}

        ================================
        STUDENT QUESTION
        ================================
        {message}

        ================================
        EXPLANATION FORMAT (Style Requested)
        ================================
        The student requested this explanation style: {explanation_style}

        Follow these rules:
        - If "simple": Give a very short, beginner-friendly explanation.
        - If "detailed": Give a long, deep explanation with layered reasoning.
        - If "steps": Break the solution into clear numbered steps.
        - If "table": Present the core explanation using a clean Markdown
          table.
        - If "diagram": Provide an ASCII diagram or conceptual sketch.
        - If "comparison": Present a comparison chart of key differences.
        - If "visual_prompt": Instead of explaining, output a prompt suitable
          for an image generation model (no more than 2–3 sentences).
        - If "default": Use your best judgment.

        Make sure the format is consistent with the requested style.

        ================================
        YOUR TASK
        ================================
        1. FIRST: Check if the question is about Business Studies.
           If not, politely decline and suggest asking about Business
           Studies topics instead.
        2. Answer clearly and accurately using Business Studies
           terminology and concepts.
        3. Use the lesson content and related concepts when relevant.
        4. Match the student's learning level: {learning_level}.
        5. Provide examples where useful.
        6. Encourage the student to ask follow-up questions about
           Business Studies.
        """

        # Add timeout protection for LLM invoke (30 seconds)
        import threading
        result_container = {"value": None, "error": None, "completed": False}
        
        def invoke_llm():
            try:
                result_container["value"] = self.llm.invoke(prompt)
                result_container["completed"] = True
            except Exception as e:
                result_container["error"] = e
                result_container["completed"] = True
        
        invoke_thread = threading.Thread(target=invoke_llm, daemon=True)
        invoke_thread.start()
        invoke_thread.join(timeout=30)
        
        if not result_container["completed"]:
            raise TimeoutError("LLM invoke timed out after 30 seconds")
        
        if result_container["error"]:
            raise result_container["error"]
        
        response = result_container["value"]

        # Extract token usage from response metadata
        token_usage = {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0
        }

        if hasattr(response, 'response_metadata'):
            metadata = response.response_metadata
            if metadata and 'token_usage' in metadata:
                usage = metadata['token_usage']
                token_usage = {
                    "prompt_tokens": usage.get('prompt_tokens', 0),
                    "completion_tokens": usage.get('completion_tokens', 0),
                    "total_tokens": usage.get('total_tokens', 0)
                }

        return (response.content, token_usage)

    def trim_context(
        self,
        history: List[Dict],
        lesson_text: Optional[str],
        chunks: Optional[List[Dict]],
        max_tokens: int = 6000
    ) -> tuple:
        """
        Trim context to fit within token budget.

        Args:
            history: Conversation history list
            lesson_text: Optional lesson content
            chunks: Optional lesson chunks
            max_tokens: Maximum token budget (default: 6000)

        Returns:
            tuple: (trimmed_history, trimmed_lesson_text, trimmed_chunks)
        """
        # Estimate tokens (rough: 1 token ≈ 4 characters)
        def estimate_tokens(text: str) -> int:
            return len(text) // 4 if text else 0

        # Calculate current token usage
        history_tokens = sum(
            estimate_tokens(msg.get("content", "")) for msg in history
        )
        lesson_tokens = estimate_tokens(lesson_text or "")
        chunks_tokens = sum(
            estimate_tokens(chunk.get("chunk_text", ""))
            for chunk in (chunks or [])
        )

        total_tokens = history_tokens + lesson_tokens + chunks_tokens

        # If within budget, return as-is
        if total_tokens <= max_tokens:
            return history, lesson_text, chunks

        # Need to trim - prioritize keeping lesson and chunks, trim history
        available_for_history = max_tokens - lesson_tokens - chunks_tokens
        available_for_history = max(0, available_for_history)

        # Trim oldest messages from history
        trimmed_history = []
        current_tokens = 0
        # Iterate in reverse to keep newest messages
        for msg in reversed(history):
            msg_tokens = estimate_tokens(msg.get("content", ""))
            if current_tokens + msg_tokens <= available_for_history:
                trimmed_history.insert(0, msg)
                current_tokens += msg_tokens
            else:
                # Can't fit this message, stop
                break

        # Only log in debug mode
        if os.getenv("DEBUG", "0") == "1":
            self.logger.info(
                f"Trimmed context: {len(history)} -> {len(trimmed_history)} "
                f"messages ({total_tokens} -> "
                f"{current_tokens + lesson_tokens + chunks_tokens} tokens)"
            )

        return trimmed_history, lesson_text, chunks

    def fallback_reply(self, message: str, topic: str) -> str:
        """
        Generate a safe fallback response when LLM generation fails.

        Args:
            message: Student's message/question
            topic: Topic/subject

        Returns:
            str: Safe fallback message
        """
        return "Let's approach this step-by-step."

    def essay_marker(
        self,
        essay_text: str,
        topic: str,
        user_id: Optional[str] = None
    ) -> Dict:
        """
        Mark/grade an essay submission.

        TODO: Full implementation pending.
        This will provide detailed feedback, scoring, and suggestions.

        Args:
            essay_text: The student's essay text
            topic: Topic/subject of the essay
            user_id: Optional user ID for personalization

        Returns:
            Dict with:
            {
                "feedback": str,
                "score": float (0-100),
                "suggestions": List[str]
            }
        """
        # TODO: Implement full essay marking logic
        # For now, return placeholder
        self.logger.warning(
            "[TODO] essay_marker() not yet fully implemented"
        )
        return {
            "feedback": (
                "Essay marking is not yet fully implemented. "
                "This will provide detailed feedback, scoring, "
                "and suggestions in the future."
            ),
            "score": 0.0,
            "suggestions": []
        }

    def _generate_fallback_response(
        self, message: str, topic: str
    ) -> str:
        """Generate fallback response when LangChain is unavailable"""
        return (
            f"I'm here to help you with {topic}! "
            f"Your question: '{message}' is important. "
            "Let me provide you with a comprehensive explanation..."
        )

    def generate_lesson(
        self,
        topic: str,
        learning_objectives: List[str],
        difficulty_level: str = "intermediate"
    ):
        """
        Generate a structured lesson. Uses LangChain if available,
        otherwise fallback.

        Args:
            topic: Lesson topic
            learning_objectives: List of learning objectives
            difficulty_level: Difficulty level

        Returns:
            LessonResponse object
        """
        if self.langchain_available and self.llm:
            try:
                return self._generate_lesson_with_langchain(
                    topic, learning_objectives, difficulty_level
                )
            except Exception:
                return self._generate_fallback_lesson(
                    topic, learning_objectives, difficulty_level
                )
        else:
            return self._generate_fallback_lesson(
                topic, learning_objectives, difficulty_level
            )

    def _generate_lesson_with_langchain(
        self,
        topic: str,
        learning_objectives: List[str],
        difficulty_level: str
    ):
        """Generate structured lesson using LangChain"""

        prompt = f"""
        Create a comprehensive lesson on {topic} with the following
        learning objectives:
        {', '.join(learning_objectives)}

        Difficulty level: {difficulty_level}

        Provide:
        1. Lesson content (detailed explanation)
        2. Key points (bullet points)
        3. Practice questions (3-5 questions)
        4. Estimated duration in minutes

        Format as JSON:
        {{
            "lesson_content": "...",
            "key_points": ["...", "..."],
            "practice_questions": ["...", "..."],
            "estimated_duration": 30
        }}
        """

        # Add timeout protection for LLM invoke (30 seconds)
        import threading
        result_container = {"value": None, "error": None, "completed": False}
        
        def invoke_llm():
            try:
                result_container["value"] = self.llm.invoke(prompt)
                result_container["completed"] = True
            except Exception as e:
                result_container["error"] = e
                result_container["completed"] = True
        
        invoke_thread = threading.Thread(target=invoke_llm, daemon=True)
        invoke_thread.start()
        invoke_thread.join(timeout=30)
        
        if not result_container["completed"]:
            raise TimeoutError("LLM invoke timed out after 30 seconds")
        
        if result_container["error"]:
            raise result_container["error"]
        
        response = result_container["value"]

        try:
            lesson_data = json.loads(response.content)
            # Return dict instead of LessonResponse to avoid dependency
            return lesson_data
        except json.JSONDecodeError:
            # Fallback if JSON parsing fails
            return self._generate_fallback_lesson(
                topic, learning_objectives, difficulty_level
            )

    def _generate_fallback_lesson(
        self,
        topic: str,
        learning_objectives: List[str],
        difficulty_level: str
    ):
        """Generate fallback lesson when LangChain is unavailable"""
        objectives_str = ', '.join(learning_objectives)
        return {
            "lesson_content": (
                f"Here's a comprehensive lesson on {topic} "
                f"covering {objectives_str}."
            ),
            "key_points": [
                f"Understanding {topic}",
                f"Key concepts in {topic}",
                f"Applications of {topic}"
            ],
            "practice_questions": [
                f"What is {topic}?",
                f"How does {topic} work?",
                f"Give examples of {topic}"
            ],
            "estimated_duration": 45
        }

    def summarize_history(self, history_text: str) -> str:
        """
        Summarize conversation history using gpt-4o-mini.

        Args:
            history_text: Concatenated conversation history text

        Returns:
            str: Summarized history (3-4 sentences) or original text on error
        """
        if not self.openai_client:
            # Fallback: return original text if OpenAI client unavailable
            return history_text

        try:
            import threading
            # Add timeout protection for OpenAI API call (15 seconds)
            result_container = {
                "value": None, "error": None, "completed": False
            }

            def invoke_summarize():
                try:
                    response = self.openai_client.chat.completions.create(
                        model="gpt-4o-mini",
                        messages=[
                            {
                                "role": "system",
                                "content": (
                                    "Summarize the following conversation "
                                    "history into 3-4 concise sentences. "
                                    "Focus on key questions asked and topics "
                                    "discussed."
                                )
                            },
                            {
                                "role": "user",
                                "content": (
                                    f"Conversation history:\n\n{history_text}"
                                )
                            }
                        ],
                        temperature=0,
                        max_tokens=150,
                        timeout=15.0
                    )
                    result_container["value"] = response
                    result_container["completed"] = True
                except Exception as e:
                    result_container["error"] = e
                    result_container["completed"] = True

            summarize_thread = threading.Thread(
                target=invoke_summarize, daemon=True
            )
            summarize_thread.start()
            summarize_thread.join(timeout=15)

            if not result_container["completed"]:
                self.logger.warning(
                    "History summarization timed out, using original text"
                )
                return history_text

            if result_container["error"]:
                self.logger.warning(
                    f"History summarization error: "
                    f"{result_container['error']}, using original text"
                )
                return history_text

            response = result_container["value"]
            return response.choices[0].message.content.strip()
        except Exception as e:
            self.logger.error(f"Error summarizing history: {e}")
            # Fallback: return original text
            return history_text
