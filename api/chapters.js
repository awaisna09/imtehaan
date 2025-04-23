const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

// Initialize Supabase client
// Initialize Supabase client with environment variables
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Get all chapters
router.get('/', async (req, res) => {
  try {
    logger.info('Fetching chapters from final_topics table');

    // Fetch chapters from final_topics table
    const { data: topics, error } = await supabase
      .from('final_topics')
      .select('chapter, description')
      .order('chapter', { ascending: true });

    if (error) {
      logger.error('Error fetching chapters:', error);
      return res.status(500).json({
        error: 'Failed to fetch chapters',
        details: error.message,
      });
    }

    // Process chapters to get unique entries with descriptions
    const chaptersMap = new Map();
    topics.forEach((topic) => {
      if (topic.chapter && !chaptersMap.has(topic.chapter)) {
        chaptersMap.set(topic.chapter, {
          name: topic.chapter,
          description: topic.description || 'Click to view topics',
        });
      }
    });

    const chapters = Array.from(chaptersMap.values());
    logger.info(`Successfully fetched ${chapters.length} chapters`);

    res.json({
      success: true,
      data: chapters,
    });
  } catch (error) {
    logger.error('Server error in chapters route:', {
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      error: 'Internal server error',
      details: error.message,
    });
  }
});

module.exports = router;
