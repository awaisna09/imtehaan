const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
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
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Get topics by chapter name
router.get('/:chapterName', async (req, res) => {
  try {
    const { chapterName } = req.params;
    logger.info('Fetching topics for chapter:', { chapterName });

    const { data, error } = await supabase
      .from('final_topics')
      .select('subtopic')
      .eq('chapter_name', chapterName);

    if (error) {
      logger.error('Error fetching topics:', {
        error: error.message,
        chapterName,
      });
      return res.status(500).json({
        error: 'Failed to fetch topics',
        details: error.message,
      });
    }

    logger.info('Topics fetched successfully:', {
      chapterName,
      count: data.length,
    });

    res.json(data);
  } catch (error) {
    logger.error('Exception in topics route:', {
      error: error.message,
      stack: error.stack,
      chapterName: req.params.chapterName,
    });

    res.status(500).json({
      error: 'Internal server error',
      details: error.message,
    });
  }
});

module.exports = router;
