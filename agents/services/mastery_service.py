#!/usr/bin/env python3
"""
Mastery Service - Handles student mastery tracking
Wraps MasteryAgent internally.
"""

import logging
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)


class MasteryService:
    """
    Handles applying mastery updates and managing mastery scores.
    Wraps MasteryAgent internally.
    """

    def __init__(self, mastery_agent):
        """
        Initialize MasteryService.

        Args:
            mastery_agent: MasteryAgent instance to wrap
        """
        self.mastery_agent = mastery_agent
        self.logger = logging.getLogger(__name__)

    def classify_student_reasoning(self, message_text: str) -> str:
        """
        Classify a student's message as 'good', 'neutral', or 'confused'.
        Delegates to MasteryAgent.

        Args:
            message_text: Student's message to classify

        Returns:
            str: 'good', 'neutral', or 'confused'
        """
        if not self.mastery_agent:
            return "neutral"
        return self.mastery_agent.classify_reasoning(message_text)

    def label_to_delta(self, label: str) -> int:
        """
        Convert reasoning label to mastery delta.
        Delegates to MasteryAgent.

        Args:
            label: 'good', 'neutral', or 'confused'

        Returns:
            int: Mastery delta (+2, 0, or -1)
        """
        if not self.mastery_agent:
            return 0
        return self.mastery_agent.label_to_delta(label)

    def apply_mastery_updates(
        self,
        user_id: Optional[str],
        updates: List[Dict]
    ) -> None:
        """
        Apply mastery score updates for multiple concepts.
        Delegates to MasteryAgent.

        Args:
            user_id: User ID to update mastery for
            updates: List of update dicts with:
                {
                    "concept_id": str,
                    "delta": int,
                    "reason": str
                }
        """
        if not self.mastery_agent:
            return
        self.mastery_agent.apply_updates(user_id, updates)
