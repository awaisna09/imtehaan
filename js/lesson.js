// Initialize Supabase client
const supabaseUrl = 'https://mwhtclxabiraowerfmkz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13aHRjbHhhYmlyYW93ZXJmbWt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA3MDY2MjksImV4cCI6MjA1NjI4MjYyOX0.jwnn4sR78xx08p-8V8d-gSU9EHCjPPnT376Vt9KDO3Q';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// Import chat functionality
import { initializeChat } from './chat.js';

// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
const topicName = urlParams.get('topic');

// DOM elements
const chapterNameElement = document.querySelector('.chapter-name');
const lessonTitleElement = document.querySelector('.lesson-title');
const sidebarTopicsList = document.querySelector('.topics-list');
const contentBox = document.querySelector('.content-box');
const noteText = document.querySelector('.quick-notes');
const detailedNotesText = document.querySelector('.detailed-notes');

// Load topic content
async function loadTopicContent(topicName) {
    try {
        const { data, error } = await supabase
            .from('final_topics')
            .select('subtopic, name, content')
            .eq('name', topicName)
            .single();

        if (error) throw error;

        if (data) {
            // Update UI
            chapterNameElement.textContent = data.subtopic;
            lessonTitleElement.textContent = data.name;
            
            // Set up the content box
            const lessonContent = document.querySelector('.lesson-content');
            
            if (data.content && data.content.trim()) {
                // If there's content, display it
                lessonContent.innerHTML = data.content;
            } else {
                // If no content, initialize chat
                console.log('No content available, initializing chat interface');
                lessonContent.innerHTML = '<div class="loading-message">Loading chat interface...</div>';
                
                // Manual initialization to ensure it's called
                setTimeout(() => {
                    try {
                        initializeChat();
                    } catch (err) {
                        console.error('Error initializing chat:', err);
                        lessonContent.innerHTML = '<div class="error-message">Failed to load chat: ' + err.message + '</div>';
                    }
                }, 100);
            }
        }
    } catch (error) {
        console.error('Error loading topic content:', error);
    }
}

// Load related topics
async function loadRelatedTopics(topicName) {
    try {
        // Get the topic subtopic
        const { data: topicData, error: topicError } = await supabase
            .from('final_topics')
            .select('subtopic')
            .eq('name', topicName)
            .single();

        if (topicError) throw topicError;

        const subtopic = topicData.subtopic;

        // Get all topics in the same subtopic
        const { data: relatedTopics, error: relatedError } = await supabase
            .from('final_topics')
            .select('name')
            .eq('subtopic', subtopic)
            .order('name', { ascending: true });

        if (relatedError) throw relatedError;

        // Update sidebar
        if (relatedTopics && relatedTopics.length > 0) {
            sidebarTopicsList.innerHTML = '';
            
            relatedTopics.forEach(topic => {
                const li = document.createElement('li');
                li.className = 'topic-item';
                if (topic.name === topicName) {
                    li.classList.add('active');
                }
                li.textContent = topic.name;
                li.addEventListener('click', () => {
                    window.location.href = `lesson.html?topic=${encodeURIComponent(topic.name)}`;
                });
                sidebarTopicsList.appendChild(li);
            });
        }
    } catch (error) {
        console.error('Error loading related topics:', error);
    }
}

// Load saved notes
async function loadSavedNotes(topicName) {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            console.log('No authenticated user found');
            return;
        }
        
        const { data, error } = await supabase
            .from('user_notes')
            .select('quick_notes, detailed_notes')
            .eq('user_id', user.id)
            .eq('topic', topicName)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
            console.error('Error loading notes:', error);
            return;
        }

        if (data) {
            noteText.value = data.quick_notes || '';
            detailedNotesText.value = data.detailed_notes || '';
        }
    } catch (error) {
        console.error('Error loading saved notes:', error);
    }
}

// Save notes
async function saveNotes() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            alert('Please log in to save notes');
            return;
        }
        
        const quickNotesValue = noteText.value.trim();
        const detailedNotesValue = detailedNotesText.value.trim();
        
        // Check if notes exist
        const { data, error: checkError } = await supabase
            .from('user_notes')
            .select('id')
            .eq('user_id', user.id)
            .eq('topic', topicName)
            .single();

        if (checkError && checkError.code !== 'PGRST116') {
            console.error('Error checking notes:', checkError);
            return;
        }

        if (data) {
            // Update existing notes
            const { error: updateError } = await supabase
                .from('user_notes')
                .update({
                    quick_notes: quickNotesValue,
                    detailed_notes: detailedNotesValue,
                    updated_at: new Date().toISOString()
                })
                .eq('id', data.id);

            if (updateError) {
                console.error('Error updating notes:', updateError);
                alert('Failed to update notes');
                return;
            }
        } else {
            // Insert new notes
            const { error: insertError } = await supabase
                .from('user_notes')
                .insert([
                    {
                        user_id: user.id,
                        topic: topicName,
                        quick_notes: quickNotesValue,
                        detailed_notes: detailedNotesValue,
                        updated_at: new Date().toISOString()
                    }
                ]);

            if (insertError) {
                console.error('Error inserting notes:', insertError);
                alert('Failed to save notes');
                return;
            }
        }

        alert('Notes saved successfully!');
    } catch (error) {
        console.error('Error saving notes:', error);
        alert('An error occurred while saving notes');
    }
}

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Get topic name from URL
        const urlParams = new URLSearchParams(window.location.search);
        const topicName = urlParams.get('topic');
        
        if (!topicName) {
            console.error('No topic specified in URL');
            return;
        }
        
        // Initialize chat first
        console.log('Initializing chat system...');
        const chatInitialized = await initializeChat();
        if (!chatInitialized) {
            console.error('Failed to initialize chat system');
            return;
        }
        
        // Load topic content
        await loadTopicContent(topicName);
        
        // Load related topics
        await loadRelatedTopics(topicName);
        
        // Load saved notes
        await loadSavedNotes(topicName);
        
        // Set up navigation buttons
        setupNavigationButtons();
        
    } catch (error) {
        console.error('Error initializing page:', error);
    }
});