// Initialize Supabase client
const supabaseUrl = 'https://mwhtclxabiraowerfmkz.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13aHRjbHhhYmlyYW93ZXJmbWt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA3MDY2MjksImV4cCI6MjA1NjI4MjYyOX0.jwnn4sR78xx08p-8V8d-gSU9EHCjPPnT376Vt9KDO3Q'

// Function to fetch and display topics
async function loadTopics() {
    try {
        console.log('\n=== Starting Topic Load Process ===');
        console.log('Creating Supabase client...');
        const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
        
        console.log('Fetching topics from Supabase...');
        const { data: topics, error } = await supabase
            .from('final_topics')
            .select('*');  // Select all columns to see what we get

        if (error) {
            console.error('Error fetching topics:', error);
            return;
        }

        console.log('\nRaw topics data from Supabase:');
        console.log(topics);

        if (!topics || topics.length === 0) {
            console.log('No topics found in database');
            return;
        }

        console.log('\nListing all subtopics:');
        topics.forEach((topic, index) => {
            console.log(`${index + 1}. ${topic.subtopic}`);
        });

        // Get the topics list container
        const topicsList = document.querySelector('.topics-list');
        if (!topicsList) {
            console.error('Topics list container not found');
            return;
        }

        // Clear existing topics
        topicsList.innerHTML = '';

        // Add each topic to the list
        topics.forEach(topic => {
            const topicElement = document.createElement('div');
            topicElement.className = 'topic-item';
            topicElement.textContent = topic.subtopic;
            
            // Add click event listener if needed
            topicElement.addEventListener('click', () => {
                // Handle topic selection
                console.log('Selected topic:', topic.subtopic);
                // Add any additional functionality here
            });

            topicsList.appendChild(topicElement);
        });

        console.log('\n=== Topic Load Process Complete ===');

    } catch (error) {
        console.error('Unexpected error loading topics:', error);
        console.error('Error details:', error.message);
        console.error('Stack trace:', error.stack);
        const topicsList = document.querySelector('.topics-list');
        if (topicsList) {
            topicsList.innerHTML = '<div class="loading-topics">Error loading topics</div>';
        }
    }
}

// Export the function
export { loadTopics }; 