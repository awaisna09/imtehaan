const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();

// Initialize Supabase client
// Initialize Supabase client with environment variables
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Get all chapters
router.get('/', async (req, res) => {
    try {
        // Fetch chapters from final_topics table
        const { data: topics, error } = await supabase
            .from('final_topics')
            .select('chapter, description')
            .order('chapter', { ascending: true });

        if (error) {
            console.error('Error fetching chapters:', error);
            return res.status(500).json({
                error: 'Failed to fetch chapters',
                details: error.message
            });
        }

        // Process chapters to get unique entries with descriptions
        const chaptersMap = new Map();
        topics.forEach(topic => {
            if (topic.chapter && !chaptersMap.has(topic.chapter)) {
                chaptersMap.set(topic.chapter, {
                    name: topic.chapter,
                    description: topic.description || 'Click to view topics'
                });
            }
        });

        const chapters = Array.from(chaptersMap.values());

        res.json({
            success: true,
            data: chapters
        });
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error.message
        });
    }
});

module.exports = router;