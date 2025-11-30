#!/usr/bin/env python3
"""
Caching layer for AI Tutor system.
Supports Redis if available, falls back to in-memory dict.
"""

import os
import json
import hashlib
from typing import Any, Optional
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

# Try to import Redis
redis_client = None
try:
    import redis
    redis_url = os.getenv("REDIS_URL")
    if redis_url:
        redis_client = redis.from_url(redis_url)
        logger.info("[OK] Redis client initialized")  # noqa: E501
    else:
        logger.info("[INFO] Redis URL not found, using in-memory cache")
except ImportError:
    logger.info("[INFO] Redis not installed, using in-memory cache")
except Exception as e:
    logger.warning(
        f"[WARNING] Redis connection failed: {e}, using in-memory cache"
    )

# In-memory fallback cache
_memory_cache: dict = {}
_cache_timestamps: dict = {}


def cache_set(key: str, value: Any, ttl: int = 3600) -> bool:
    """
    Set a value in cache with TTL.

    Args:
        key: Cache key
        value: Value to cache (must be JSON-serializable)
        ttl: Time to live in seconds (default: 3600)

    Returns:
        bool: True if successful, False otherwise
    """
    try:
        # Try Redis first
        if redis_client:
            try:
                redis_client.setex(
                    key,
                    ttl,
                    json.dumps(value)
                )
                return True
            except Exception as e:
                logger.warning(f"Redis set failed: {e}, using memory cache")

        # Fallback to in-memory cache
        _memory_cache[key] = value
        _cache_timestamps[key] = datetime.now() + timedelta(seconds=ttl)
        return True

    except Exception as e:
        logger.error(f"Cache set error: {e}")
        return False


def cache_get(key: str) -> Optional[Any]:
    """
    Get a value from cache.

    Args:
        key: Cache key

    Returns:
        Cached value or None if not found/expired
    """
    try:
        # Try Redis first
        if redis_client:
            try:
                cached = redis_client.get(key)
                if cached:
                    return json.loads(cached)
            except Exception as e:
                logger.warning(f"Redis get failed: {e}, using memory cache")

        # Fallback to in-memory cache
        if key in _memory_cache:
            # Check if expired
            if key in _cache_timestamps:
                if datetime.now() < _cache_timestamps[key]:
                    return _memory_cache[key]
                else:
                    # Expired, remove it
                    del _memory_cache[key]
                    del _cache_timestamps[key]
            else:
                return _memory_cache[key]

        return None

    except Exception as e:
        logger.error(f"Cache get error: {e}")
        return None


def cache_delete(key: str) -> bool:
    """
    Delete a value from cache.

    Args:
        key: Cache key

    Returns:
        bool: True if successful
    """
    try:
        if redis_client:
            try:
                redis_client.delete(key)
            except Exception:
                pass

        if key in _memory_cache:
            del _memory_cache[key]
        if key in _cache_timestamps:
            del _cache_timestamps[key]

        return True

    except Exception:
        return False


def _hash_string(text: str) -> str:
    """Generate a short hash for cache keys."""
    return hashlib.md5(text.encode()).hexdigest()[:12]
