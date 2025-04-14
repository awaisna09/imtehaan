const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client with environment variables
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Get topics by chapter name
router.get('/:chapterName', async (req, res) => {
    try {
        const { chapterName } = req.params;
        console.log('Fetching topics for chapter:', chapterName);

        const { data, error } = await supabase
            .from('final_topics')
            .select('subtopic')
            .eq('chapter_name', chapterName);

        if (error) {
            console.error('Error fetching topics:', error);
            return res.status(500).json({
                error: 'Failed to fetch topics',
                details: error.message
            });
        }

        console.log('Topics fetched successfully:', data);
        res.json(data);

    } catch (error) {
        console.error('Exception in topics route:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error.message
        });
    }
});

module.exports = router;