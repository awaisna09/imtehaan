#!/usr/bin/env python3
"""
Concept Service - Handles concept-related operations
Wraps ConceptAgent internally.
"""

import hashlib
import logging
import os
from typing import Optional, List, Dict

logger = logging.getLogger(__name__)


class ConceptService:
    """
    Handles embeddings, concept similarity search, and concept metadata.
    Wraps ConceptAgent internally.
    """

    def __init__(self, concept_agent, cache_get=None, cache_set=None):
        """
        Initialize ConceptService.

        Args:
            concept_agent: ConceptAgent instance to wrap
            cache_get: Optional cache get function
            cache_set: Optional cache set function
        """
        self.concept_agent = concept_agent
        self.cache_get = cache_get
        self.cache_set = cache_set
        self.logger = logging.getLogger(__name__)

    def generate_embedding(self, text: str) -> Optional[List[float]]:
        """
        Generate an embedding vector for a text string.
        Delegates to ConceptAgent.

        Args:
            text: Text to generate embedding for

        Returns:
            List of floats (embedding vector) or None
        """
        if not self.concept_agent:
            return None
        return self.concept_agent.generate_embedding(text)

    def find_related_concepts(
        self,
        message_text: str,
        subject_id: Optional[str] = None,
        topic_id: Optional[str] = None,
        k: int = 5,
        min_similarity: Optional[float] = None
    ) -> List[Dict]:
        """
        Find related concepts using pgvector similarity search.
        Delegates to ConceptAgent.retrieve_concepts().
        Uses caching (60 seconds TTL).

        Args:
            message_text: User message to search for
            subject_id: Optional subject ID filter
            topic_id: Optional topic ID filter
            k: Number of concepts to retrieve (default: 5)
            min_similarity: Minimum similarity threshold (default: None)

        Returns:
            List of concept dicts with concept_id, name, description, distance
        """
        if not self.concept_agent:
            return []

        # Check cache first
        if self.cache_get:
            message_hash = hashlib.md5(
                message_text.encode()
            ).hexdigest()[:8]
            subject_key = subject_id or "all"
            topic_key = topic_id or "all"
            similarity_key = f"{min_similarity}" if min_similarity else "none"
            cache_key = (
                f"concept_rag:{subject_key}:{topic_key}:"
                f"{similarity_key}:{k}:{message_hash}"
            )
            cached = self.cache_get(cache_key)
            if cached is not None:
                if os.getenv("DEBUG", "0") == "1":
                    self.logger.info(f"Cache hit for concept RAG: {cache_key}")
                return cached

        # Fetch from ConceptAgent
        concepts = self.concept_agent.retrieve_concepts(
            message_text, subject_id, topic_id, k, min_similarity
        )

        # Cache the result (60 seconds TTL for RAG)
        if self.cache_set and concepts:
            message_hash = hashlib.md5(
                message_text.encode()
            ).hexdigest()[:8]
            subject_key = subject_id or "all"
            topic_key = topic_id or "all"
            similarity_key = f"{min_similarity}" if min_similarity else "none"
            cache_key = (
                f"concept_rag:{subject_key}:{topic_key}:"
                f"{similarity_key}:{k}:{message_hash}"
            )
            self.cache_set(cache_key, concepts, ttl=60)

        return concepts

    def keyword_match(
        self,
        message_text: str,
        subject_id: Optional[str] = None,
        topic_id: Optional[str] = None
    ) -> List[Dict]:
        """
        Fallback keyword-based concept search when embedding search returns
        no results. Searches for concepts by matching keywords in message
        against concept and explanation columns.

        Args:
            message_text: User message to search for
            subject_id: Optional subject ID filter
            topic_id: Optional topic ID filter (from topic selection)

        Returns:
            List of concept dicts with concept_id, name, description, distance
        """
        if not self.concept_agent:
            return []

        # Delegate to ConceptAgent
        return self.concept_agent.keyword_match(
            message_text, subject_id, topic_id
        )

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
        if not self.concept_agent:
            return []

        # Delegate to ConceptAgent
        return self.concept_agent.fetch_concepts_by_topic(
            topic_id, limit, random_order
        )

    def fetch_concept_details(
        self, concept_ids: List[str]
    ) -> Dict[str, Dict]:
        """
        Fetch metadata (name, description) for given concept_ids.
        Delegates to ConceptAgent.

        Args:
            concept_ids: List of concept IDs to fetch

        Returns:
            Dict mapping concept_id to {"name": str, "description": str}
        """
        if not self.concept_agent:
            return {}
        return self.concept_agent.fetch_concept_details(concept_ids)

    def get_prerequisites_and_next_concepts(
        self, concept_ids: List[str]
    ) -> Dict:
        """
        Fetch prerequisite concepts and next-step concepts.
        Delegates to ConceptAgent.

        Args:
            concept_ids: List of concept IDs to get prerequisites/next for

        Returns:
            Dict with "prerequisites" and "next_concepts" lists
        """
        if not self.concept_agent:
            return {
                "prerequisites": [],
                "next_concepts": []
            }
        return self.concept_agent.get_prerequisites_and_next_concepts(
            concept_ids
        )

    def refresh_embedding(self, concept_id: str) -> bool:
        """
        Refresh the embedding for a concept by regenerating it.

        Args:
            concept_id: Concept ID to refresh embedding for

        Returns:
            bool: True if successful, False otherwise
        """
        if not self.concept_agent or not self.concept_agent.supabase:
            return False

        try:
            # Fetch concept details
            concept_details = self.concept_agent.fetch_concept_details(
                [concept_id]
            )
            if not concept_details or concept_id not in concept_details:
                return False

            concept = concept_details[concept_id]
            # Combine name and description for embedding
            name = concept.get('name', '')
            desc = concept.get('description', '')
            text_to_embed = f"{name} {desc}".strip()

            if not text_to_embed:
                return False

            # Generate new embedding
            embedding = self.concept_agent.generate_embedding(text_to_embed)
            if embedding is None:
                return False

            # Update in database
            self.concept_agent.supabase.table("concepts").update({
                "embedding": embedding,
                "updated_at": "now()"
            }).eq("concept_id", concept_id).execute()

            if os.getenv("DEBUG", "0") == "1":
                self.logger.info(
                    f"Refreshed embedding for concept: {concept_id}"
                )
            return True

        except Exception as e:
            self.logger.error(f"Error refreshing embedding: {e}")
            return False
