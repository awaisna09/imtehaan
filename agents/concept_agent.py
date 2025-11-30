#!/usr/bin/env python3
"""
Concept Agent - Handles concept retrieval, embeddings, and concept graph
"""

import os
from typing import Any, Dict, List, Optional
from openai import OpenAI
import logging
import hashlib

# Import cache
try:
    from cache import cache_get, cache_set, _hash_string
except ImportError:
    # Fallback if cache not available
    def cache_get(key): return None
    def cache_set(key, value, ttl=3600): return False
    def _hash_string(text): return hashlib.md5(text.encode()).hexdigest()[:12]

logger = logging.getLogger(__name__)


class ConceptAgent:
    """
    Agent responsible for concept-related operations:
    - Embedding generation
    - Concept retrieval via pgvector
    - Lesson chunk retrieval
    - Concept graph (prerequisites/next concepts)
    """

    def __init__(
        self,
        api_key: str = None,
        supabase_client: Optional[Any] = None
    ):
        """
        Initialize Concept Agent

        Args:
            api_key: OpenAI API key for embeddings
            supabase_client: Supabase client instance
        """
        self.api_key = api_key or os.getenv('OPENAI_API_KEY')
        self._embed_client = OpenAI(api_key=self.api_key)
        self.supabase = supabase_client

    def generate_embedding(self, text: str) -> Optional[List[float]]:
        """
        Generate an embedding vector for a text string.
        Returns a list of floats compatible with Supabase pgvector.
        """
        try:
            resp = self._embed_client.embeddings.create(
                model=os.getenv("EMBEDDING_MODEL", "text-embedding-3-small"),
                input=text
            )
            return resp.data[0].embedding
        except Exception:
            return None

    def retrieve_concepts(
        self,
        message_text: str,
        subject_id: Optional[str] = None,
        topic_id: Optional[str] = None,
        k: int = 5,
        min_similarity: Optional[float] = None
    ) -> List[Dict]:
        """
        Given a user message, return the top-k related concepts from Supabase
        using pgvector similarity search.
        Uses cache with 10 minute TTL.

        Args:
            message_text: User message to search for
            subject_id: Optional subject ID filter
            topic_id: Optional topic ID filter
            k: Number of concepts to retrieve (default: 5)
            min_similarity: Minimum similarity threshold (default: None)

        Returns a list of dicts:
            {
                "concept_id": str,
                "name": str,  # Maps to "concept" column
                "description": str,  # Maps to "explanation" column
                "distance": float
            }
        """
        # Check cache first
        message_hash = _hash_string(
            f"{message_text}:{subject_id}:{topic_id}:{k}:{min_similarity}"
        )
        cache_key = (
            f"concepts:{subject_id or 'all'}:{topic_id or 'all'}:"
            f"{k}:{min_similarity or 'none'}:{message_hash}"
        )
        cached = cache_get(cache_key)
        if cached is not None:
            logger.info(f"Cache hit for concepts:{message_hash}")
            return cached

        if not self.supabase:
            return []

        # Generate embedding
        embedding = self.generate_embedding(message_text)
        if embedding is None:
            return []

        try:
            # Build RPC parameters - start with minimal required params
            rpc_params = {
                "query_embedding": embedding,
                "match_count": k
            }

            # Add optional parameters if provided
            if subject_id is not None:
                rpc_params["subject_filter"] = subject_id
            if topic_id is not None:
                # Ensure topic_id is converted to int if it's a string
                topic_id_int = (
                    int(topic_id) if isinstance(topic_id, str)
                    else topic_id
                )
                rpc_params["topic_filter"] = topic_id_int
            if min_similarity is not None:
                rpc_params["min_similarity"] = min_similarity

            # Import timeout wrapper (with fallback if not available)
            try:
                from langgraph_tutor import safe_supabase_query
            except ImportError:
                # Fallback: define inline if import fails
                import threading

                def safe_supabase_query(
                    query_func, timeout=5, default_return=None
                ):
                    if timeout <= 0:
                        try:
                            return query_func()
                        except Exception:
                            return default_return

                    result_container = {
                        "value": None,
                        "error": None,
                        "completed": False
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

            # Use Supabase RPC for pgvector search with timeout (5 seconds)
            # Try with all parameters first, then fall back to minimal

            def query_func():
                try:
                    return self.supabase.rpc(
                        "match_concepts",
                        rpc_params
                    ).execute()
                except Exception as rpc_error:
                    # If RPC fails with optional params,
                    # try with minimal params
                    logger.warning(
                        f"RPC call failed with optional params, "
                        f"trying minimal: {rpc_error}"
                    )
                    minimal_params = {
                        "query_embedding": embedding,
                        "match_count": k
                    }
                    return self.supabase.rpc(
                        "match_concepts",
                        minimal_params
                    ).execute()

            response = safe_supabase_query(
                query_func, timeout=5, default_return=None
            )

            if response is None:
                logger.warning(
                    "pgvector similarity search timed out or failed"
                )
                return []

            rows = response.data or []
            concepts = []
            for row in rows:
                # Handle both column name formats:
                # - New format: "concept" and "explanation"
                # - Old format: "name" and "description"
                concept_name = (
                    row.get("concept") or row.get("name") or ""
                )
                concept_desc = (
                    row.get("explanation") or row.get("description") or ""
                )
                concepts.append({
                    "concept_id": row.get("concept_id"),
                    "name": concept_name,
                    "description": concept_desc,
                    "distance": row.get("distance"),
                    "updated_at": row.get("updated_at"),
                    # Store topic_id if available for filtering
                    "topic_id": row.get("topic_id")
                })

            # Filter by topic_id in Python if RPC didn't filter and we have it
            if topic_id and concepts:
                topic_id_int = (
                    int(topic_id) if isinstance(topic_id, str)
                    else topic_id
                )
                # Only filter if topic_id is present in the rows
                concepts_with_topic = [
                    c for c in concepts
                    if c.get("topic_id") is not None
                ]
                if concepts_with_topic:
                    concepts = [
                        c for c in concepts_with_topic
                        if c.get("topic_id") == topic_id_int
                    ]
                # If no topic_id in rows, we can't filter - rely on RPC

            # Cache for 10 minutes (600 seconds)
            if concepts:
                cache_set(cache_key, concepts, ttl=600)

            return concepts

        except Exception as e:
            logger.error(f"Error in retrieve_concepts: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            return []

    def keyword_match(
        self,
        message_text: str,
        subject_id: Optional[str] = None,
        topic_id: Optional[str] = None
    ) -> List[Dict]:
        """
        Fallback keyword-based concept search when embedding search returns
        no results. Searches for concepts by matching keywords in message
        against concept and explanation columns using SQL LIKE queries.

        Args:
            message_text: User message to search for
            subject_id: Optional subject ID filter
            topic_id: Optional topic ID filter (from topic selection)

        Returns:
            List of concept dicts with concept_id, name, description, distance
        """
        if not self.supabase:
            return []

        try:
            # Extract keywords from message (simple: split by spaces)
            # Remove common stop words and short words
            words = message_text.lower().split()
            keywords = [
                w for w in words
                if len(w) > 3 and w not in [
                    'the', 'and', 'for', 'are', 'but', 'what', 'is', 'in',
                    'the', 'of', 'to', 'a', 'an'
                ]
            ][:5]  # Limit to top 5 keywords

            if not keywords:
                return []

            # Search for keywords in "concept" or "explanation" columns
            # Use OR conditions for multiple keywords
            results = []
            for keyword in keywords:
                try:
                    # Build fresh query for each keyword search
                    base_query = self.supabase.table("concepts").select(
                        "concept_id, concept, explanation, "
                        "topic_id, updated_at"
                    )

                    # Apply topic_id filter if provided (from topic selection)
                    if topic_id:
                        # Ensure topic_id is converted to int if it's a string
                        topic_id_int = (
                            int(topic_id) if isinstance(topic_id, str)
                            else topic_id
                        )
                        base_query = base_query.eq("topic_id", topic_id_int)

                    # Search in "concept" column with timeout protection
                    try:
                        from langgraph_tutor import safe_supabase_query
                    except ImportError:
                        import threading

                        def safe_supabase_query(
                            query_func, timeout=10, default_return=None
                        ):
                            if timeout <= 0:
                                try:
                                    return query_func()
                                except Exception:
                                    return default_return
                            result_container = {
                                "value": None,
                                "error": None,
                                "completed": False
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

                    def concept_query():
                        return (
                            base_query.ilike("concept", f"%{keyword}%")
                            .limit(10)
                            .execute()
                        )
                    concept_results = safe_supabase_query(
                        concept_query, timeout=10, default_return={"data": []}
                    )
                    if concept_results is None:
                        concept_results = {"data": []}
                    if concept_results.data:
                        results.extend(concept_results.data)

                    # Build fresh query for explanation search
                    expl_base_query = (
                        self.supabase.table("concepts").select(
                            "concept_id, concept, explanation, "
                            "topic_id, updated_at"
                        )
                    )
                    if topic_id:
                        # Ensure topic_id is converted to int if it's a string
                        topic_id_int = (
                            int(topic_id) if isinstance(topic_id, str)
                            else topic_id
                        )
                        expl_base_query = expl_base_query.eq(
                            "topic_id", topic_id_int
                        )

                    # Search in "explanation" column with timeout protection
                    def expl_query():
                        return (
                            expl_base_query.ilike(
                                "explanation", f"%{keyword}%"
                            )
                            .limit(10)
                            .execute()
                        )
                    expl_results = safe_supabase_query(
                        expl_query,
                        timeout=10,
                        default_return={"data": []}
                    )
                    if expl_results is None:
                        expl_results = {"data": []}
                    if expl_results.data:
                        results.extend(expl_results.data)
                except Exception as e:
                    logger.warning(
                        f"Error searching for keyword '{keyword}': {e}"
                    )
                    continue

            # Deduplicate by concept_id
            seen = set()
            concepts = []
            for row in results:
                concept_id = row.get("concept_id")
                if concept_id and concept_id not in seen:
                    seen.add(concept_id)
                    concepts.append({
                        "concept_id": concept_id,
                        # Map "concept" to "name"
                        "name": row.get("concept", ""),
                        # Map "explanation" to "description"
                        "description": row.get("explanation", ""),
                        "distance": 0.5,  # Placeholder for keyword match
                        "updated_at": row.get("updated_at")
                    })

            # Limit to top 7 results
            return concepts[:7]

        except Exception as e:
            logger.error(f"Error in keyword_match: {e}")
            return []

    def fetch_concepts_by_topic(
        self,
        topic_id: str,
        limit: int = 10,
        random_order: bool = True
    ) -> List[Dict]:
        """
        Fetch concepts directly from the database by topic_id.
        Returns concepts in random order for variety.

        Args:
            topic_id: Topic ID to fetch concepts for
            limit: Maximum number of concepts to return (default: 5)
            random_order: Whether to return concepts in random order
                (default: True)

        Returns:
            List of concept dicts with concept_id, name (concept),
            description (explanation)
        """
        if not self.supabase:
            return []

        try:
            # Ensure topic_id is converted to int if it's a string
            topic_id_int = (
                int(topic_id) if isinstance(topic_id, str) else topic_id
            )

            # Check cache first
            # Use consistent cache key that includes order preference
            order_suffix = 'random' if random_order else 'ordered'
            cache_key = (
                f"concepts_by_topic:{topic_id_int}:{limit}:{order_suffix}"
            )
            cached = cache_get(cache_key)
            if cached is not None:
                # If random_order is False, return cached as-is
                # (already ordered)
                if not random_order:
                    return cached[:limit]
                # If random_order is True, shuffle cached concepts
                import random
                import time
                random.seed(int(time.time() * 1000000) % 1000000)
                cached_copy = cached.copy()
                random.shuffle(cached_copy)
                random.seed()
                return cached_copy[:limit]

            # Import timeout wrapper (with fallback if not available)
            try:
                from langgraph_tutor import safe_supabase_query
            except ImportError:
                # Fallback: define inline if import fails
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
                        "value": None,
                        "error": None,
                        "completed": False
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

            # Wrap query with timeout (10 seconds - increased for reliability)
            def query_func():
                # Always order by concept_id for consistent ordering
                return (
                    self.supabase.table("concepts")
                    .select("concept_id, concept, explanation, topic_id")
                    .eq("topic_id", topic_id_int)
                    .order("concept_id", desc=False)
                    .execute()
                )

            # Execute query with timeout
            result = safe_supabase_query(
                query_func, timeout=10, default_return=None
            )

            if result is None or not result.data:
                if result is None:
                    logger.error(
                        f"[CONCEPT FETCH] Query timeout or error for "
                        f"topic_id: {topic_id_int}"
                    )
                    logger.error(
                        f"[CONCEPT FETCH] Supabase client status: "
                        f"{'Connected' if self.supabase else 'Not connected'}"
                    )
                else:
                    logger.warning(
                        f"[CONCEPT FETCH] No concepts found for "
                        f"topic_id: {topic_id_int} "
                        f"(query returned empty result)"
                    )
                return []

            # Convert to expected format
            concepts = []
            for row in result.data:
                concepts.append({
                    "concept_id": row.get("concept_id"),
                    # Map "concept" to "name"
                    "name": row.get("concept", ""),
                    # Map "explanation" to "description"
                    "description": row.get("explanation", ""),
                    # No distance for direct topic query
                    "distance": 0.0,
                    "topic_id": row.get("topic_id")
                })

            # Sort by concept_id for consistent ordering
            # This ensures the same order every time when random_order=False
            concepts.sort(key=lambda x: x.get("concept_id", 0))

            # Only shuffle if random_order is True
            if random_order and len(concepts) > 1:
                import random
                import time
                random.seed(int(time.time() * 1000000) % 1000000)
                random.shuffle(concepts)
                random.seed()

            # Limit results
            concepts = concepts[:limit]

            # Cache for 1 hour (3600 seconds) with order preference in key
            if concepts:
                cache_set(cache_key, concepts, ttl=3600)

            logger.info(
                f"Fetched {len(concepts)} concepts for "
                f"topic_id: {topic_id_int}"
            )

            return concepts

        except Exception as e:
            logger.error(f"Error in fetch_concepts_by_topic: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            return []

    def retrieve_lesson_chunks(
        self, question: str, lesson_id: str, k: int = 3
    ) -> List[Dict]:
        """
        Retrieve top-k relevant lesson chunks using pgvector similarity search.

        Args:
            question: Student's question text
            lesson_id: Lesson ID to search within
            k: Number of chunks to retrieve (default: 3)

        Returns:
            List of dicts with chunk_text and distance
        """
        if not self.supabase:
            return []

        # Generate embedding for question
        query_embedding = self.generate_embedding(question)
        if query_embedding is None:
            return []

        try:
            # Use Supabase RPC for pgvector similarity search
            response = self.supabase.rpc(
                "match_lesson_chunks",
                {
                    "query_embedding": query_embedding,
                    "lesson_id_filter": lesson_id,
                    "match_count": k
                }
            ).execute()

            rows = response.data or []
            chunks = []
            for row in rows:
                chunks.append({
                    "chunk_text": row.get("chunk_text", ""),
                    "distance": row.get("distance", 1.0)
                })

            return chunks

        except Exception:
            # Fallback: try direct table query if RPC doesn't exist
            try:
                try:
                    from langgraph_tutor import safe_supabase_query
                except ImportError:
                    import threading

                    def safe_supabase_query(
                        query_func, timeout=10, default_return=None
                    ):
                        if timeout <= 0:
                            try:
                                return query_func()
                            except Exception:
                                return default_return
                        result_container = {
                            "value": None,
                            "error": None,
                            "completed": False
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

                def table_query():
                    return (
                        self.supabase.table("lesson_embeddings")
                        .select("chunk_text, embedding")
                        .eq("lesson_id", lesson_id)
                        .limit(k * 2)
                        .execute()
                    )
                response = safe_supabase_query(
                    table_query, timeout=10, default_return={"data": []}
                )
                if response is None:
                    response = {"data": []}

                rows = response.data or []
                chunks = []
                for row in rows:
                    chunks.append({
                        "chunk_text": row.get("chunk_text", ""),
                        "distance": 0.5  # Placeholder
                    })

                return chunks[:k]

            except Exception as e:
                logger.error(f"Error retrieving lesson chunks: {e}")
                return []

    def generate_lesson_embeddings(
        self, lesson_id: str, lesson_content: str
    ) -> bool:
        """
        Generate embeddings for lesson content and store in lesson_embeddings
        table.

        If lesson content > 1000 chars, split into chunks of 500-800 tokens.
        Generate embeddings for each chunk and upsert into database.

        Args:
            lesson_id: The lesson ID from lessons table
            lesson_content: Full lesson text content

        Returns:
            bool: True if successful, False otherwise
        """
        if not self.supabase or not lesson_content:
            return False

        # Only process if content is substantial
        if len(lesson_content) < 1000:
            return False

        try:
            # Simple chunking: split by paragraphs
            # Target: 500-800 tokens per chunk (~2000-3200 chars)
            chunks = []
            paragraphs = lesson_content.split("\n\n")

            current_chunk = ""
            for para in paragraphs:
                # If adding this paragraph would exceed ~3000 chars, save chunk
                if len(current_chunk) + len(para) > 3000 and current_chunk:
                    chunks.append(current_chunk.strip())
                    current_chunk = para
                else:
                    current_chunk += "\n\n" + para if current_chunk else para

            # Add final chunk
            if current_chunk.strip():
                chunks.append(current_chunk.strip())

            # Generate embeddings and upsert
            rows_to_upsert = []
            for idx, chunk_text in enumerate(chunks):
                embedding = self.generate_embedding(chunk_text)
                if embedding is None:
                    continue

                chunk_id = f"{lesson_id}_chunk_{idx}"
                rows_to_upsert.append({
                    "lesson_id": lesson_id,
                    "chunk_id": chunk_id,
                    "chunk_text": chunk_text,
                    "embedding": embedding
                })

            if rows_to_upsert:
                # Upsert into lesson_embeddings table with timeout
                try:
                    from langgraph_tutor import safe_supabase_query
                except ImportError:
                    import threading

                    def safe_supabase_query(
                        query_func, timeout=10, default_return=None
                    ):
                        if timeout <= 0:
                            try:
                                return query_func()
                            except Exception:
                                return default_return
                        result_container = {
                            "value": None,
                            "error": None,
                            "completed": False
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

                def upsert_query():
                    return (
                        self.supabase.table("lesson_embeddings")
                        .upsert(rows_to_upsert)
                        .execute()
                    )
                safe_supabase_query(
                    upsert_query, timeout=10, default_return=None
                )
                logger.info(
                    f"Generated {len(rows_to_upsert)} embeddings for "
                    f"lesson_id: {lesson_id}"
                )
                return True

            return False

        except Exception as e:
            logger.error(f"Error generating lesson embeddings: {e}")
            return False

    def fetch_concept_details(
        self, concept_ids: List[str]
    ) -> Dict[str, Dict]:
        """
        Fetch metadata (concept, explanation) for given concept_ids from
        public.concepts.
        Return mapping: { concept_id: {"name":..., "description":...} }
        Note: Maps "concept" column to "name" and
        "explanation" to "description"
        """
        if not self.supabase or len(concept_ids) == 0:
            return {}

        try:
            # Add timeout protection
            try:
                from langgraph_tutor import safe_supabase_query
            except ImportError:
                import threading

                def safe_supabase_query(
                    query_func, timeout=10, default_return=None
                ):
                    if timeout <= 0:
                        try:
                            return query_func()
                        except Exception:
                            return default_return
                    result_container = {
                        "value": None,
                        "error": None,
                        "completed": False
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

            def fetch_query():
                return (
                    self.supabase.table("concepts")
                    .select("concept_id, concept, explanation")
                    .in_("concept_id", concept_ids)
                    .execute()
                )
            res = safe_supabase_query(
                fetch_query, timeout=10, default_return={"data": []}
            )
            if res is None:
                res = {"data": []}
            rows = res.data or []

            details_map = {}
            for row in rows:
                cid = row.get("concept_id")
                if cid:
                    details_map[cid] = {
                        # Map "concept" to "name"
                        "name": row.get("concept", ""),
                        # Map "explanation" to "description"
                        "description": row.get("explanation", "")
                    }

            logger.info(
                f"Fetched details for {len(details_map)} concept(s)"
            )
            return details_map

        except Exception as e:
            logger.error(f"Error fetching concept details: {e}")
            return {}

    def get_prerequisites_and_next_concepts(
        self, concept_ids: List[str]
    ) -> Dict:
        """
        Fetch prerequisite concepts and next-step concepts for a list of
        concept_ids.

        Returns:
        {
            "prerequisites": [
                # "name" maps to "concept" column
                {"concept_id": str, "name": str}
            ],
            "next_concepts": [
                # "name" maps to "concept" column
                {"concept_id": str, "name": str}
            ]
        }
        """
        if not self.supabase or len(concept_ids) == 0:
            return {
                "prerequisites": [],
                "next_concepts": []
            }

        prereq_ids = []
        next_ids = []

        try:
            # Fetch prerequisites with timeout protection
            try:
                from langgraph_tutor import safe_supabase_query
            except ImportError:
                import threading

                def safe_supabase_query(
                    query_func, timeout=10, default_return=None
                ):
                    if timeout <= 0:
                        try:
                            return query_func()
                        except Exception:
                            return default_return
                    result_container = {
                        "value": None,
                        "error": None,
                        "completed": False
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

            def prereq_query():
                return (
                    self.supabase.table("concept_prerequisites")
                    .select("prerequisite_concept_id")
                    .in_("concept_id", concept_ids)
                    .execute()
                )
            prereq_res = safe_supabase_query(
                prereq_query, timeout=10, default_return={"data": []}
            )
            if prereq_res is None:
                prereq_res = {"data": []}
            prereq_rows = prereq_res.data or []
            prereq_ids = [
                row["prerequisite_concept_id"]
                for row in prereq_rows
                if row.get("prerequisite_concept_id")
            ]

        except Exception as e:
            logger.error(f"Error fetching prerequisites: {e}")

        try:
            # Fetch next concepts with timeout protection
            def next_query():
                return (
                    self.supabase.table("concept_next")
                    .select("next_concept_id")
                    .in_("concept_id", concept_ids)
                    .execute()
                )
            next_res = safe_supabase_query(
                next_query, timeout=10, default_return={"data": []}
            )
            if next_res is None:
                next_res = {"data": []}
            next_rows = next_res.data or []
            next_ids = [
                row["next_concept_id"]
                for row in next_rows
                if row.get("next_concept_id")
            ]

        except Exception as e:
            logger.error(f"Error fetching next concepts: {e}")

        # Deduplicate both lists
        prereq_ids = list(set(prereq_ids))
        next_ids = list(set(next_ids))

        # Fetch concept details
        all_concept_ids = prereq_ids + next_ids
        details = self.fetch_concept_details(all_concept_ids)

        # Build structured results
        prerequisites = [
            {
                "concept_id": cid,
                "name": details.get(cid, {}).get("name", "")
            }
            for cid in prereq_ids
        ]

        next_concepts = [
            {
                "concept_id": cid,
                "name": details.get(cid, {}).get("name", "")
            }
            for cid in next_ids
        ]

        logger.info(
            f"Found {len(prerequisites)} prerequisite(s) and "
            f"{len(next_concepts)} next concept(s)"
        )

        return {
            "prerequisites": prerequisites,
            "next_concepts": next_concepts
        }
