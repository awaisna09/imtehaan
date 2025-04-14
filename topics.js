// Initialize Supabase client
const supabaseUrl = 'https://mwhtclxabiraowerfmkz.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13aHRjbHhhYmlyYW93ZXJmbWt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA3MDY2MjksImV4cCI6MjA1NjI4MjYyOX0.jwnn4sR78xx08p-8V8d-gSU9EHCjPPnT376Vt9KDO3Q';
const supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

// Get the chapter name from URL parameters
const urlParams = new URLSearchParams(window.location.search);
const chapterName = urlParams.get('chapter');

// Update page title and navigation with chapter name
const navTitle = document.querySelector('.nav-title');
const sectionTitle = document.querySelector('.section-title');
if (chapterName) {
    document.title = `${chapterName} - Topics`;
    navTitle.textContent = chapterName;
    sectionTitle.textContent = `Topics under ${chapterName}`;
}

// Get DOM elements
const modal = document.getElementById('topicModal');
const modalTitle = modal.querySelector('.modal-title');
const modalBody = modal.querySelector('.modal-body');
const closeBtn = modal.querySelector('.close-btn');
const topicsList = document.querySelector('.topics-list');

// Function to create topic card
function createTopicCard(topic) {
    if (!topic || !topic.subtopic) {
        console.warn('Invalid topic data:', topic);
        return null;
    }

    const card = document.createElement('div');
    card.className = 'topic-card';
    card.setAttribute('role', 'listitem');
    card.setAttribute('aria-label', `${topic.subtopic.trim()} topic`);
    
    const topicTitle = topic.subtopic.trim();
    const topicDescription = topic.description || 'Click to explore this topic';

    card.innerHTML = `
        <div class="topic-content">
            <div class="topic-header">
                <h3 class="topic-title">${topicTitle}</h3>
            </div>
            <p class="topic-subtitle">${topicDescription}</p>
            <div class="topic-details">
                <span class="topic-arrow">→</span>
            </div>
        </div>
    `;

    card.addEventListener('click', () => openModal(topicTitle));
    return card;
}

// Function to load topics
async function loadTopics() {
    const loadingSpinner = document.querySelector('.loading-spinner');
    const errorContainer = document.querySelector('.error-message');
    
    try {
        if (!chapterName) {
            // Redirect to chapters page if no chapter name is provided
            window.location.href = 'chapters.html';
            return;
        }

        loadingSpinner.style.display = 'block';
        if (errorContainer) errorContainer.style.display = 'none';

        // Fetch topics from final_topics table where name matches
        const { data: topics, error } = await supabase
            .from('final_topics')
            .select('subtopic, description')
            .eq('name', chapterName)
            .order('subtopic');

        if (error) throw error;

        topicsList.innerHTML = ''; // Clear existing topics

        if (!topics || topics.length === 0) {
            topicsList.innerHTML = `
                <div class="error-message">
                    <p>No topics found for ${chapterName}.</p>
                    <p>Please try selecting a different chapter.</p>
                </div>
            `;
            return;
        }

        // Create container for topics
        const topicsContainer = document.createElement('div');
        topicsContainer.className = 'topics-container';
        topicsContainer.setAttribute('role', 'list');
        topicsContainer.setAttribute('aria-label', `Topics for ${chapterName}`);

        // Add topic cards to the container
        topics.forEach(topic => {
            if (topic && topic.subtopic) {
                const card = createTopicCard(topic);
                if (card) {
                    topicsContainer.appendChild(card);
                }
            }
        });

        topicsList.appendChild(topicsContainer);

    } catch (error) {
        console.error('Error loading topics:', error);
        topicsList.innerHTML = `
            <div class="error-message">
                <p>Failed to load topics.</p>
                <p>Error: ${error.message}</p>
                <p>Please try again later.</p>
            </div>
        `;
    } finally {
        loadingSpinner.style.display = 'none';
    }
}

// Function to open modal
function openModal(topic) {
    modalTitle.textContent = topic;
    modalBody.innerHTML = `
        <div class="modal-section">
            <h3>Learning Objectives</h3>
            <ul class="objectives-list">
                <li>Understand key concepts of ${topic}</li>
                <li>Apply theoretical principles to real-world scenarios</li>
                <li>Analyze business cases and examples</li>
                <li>Develop practical problem-solving skills</li>
            </ul>
        </div>
        <div class="modal-section">
            <h3>What You'll Learn</h3>
            <div class="learning-points">
                <div class="point">
                    <span class="point-number">1</span>
                    <p>Core concepts and terminology</p>
                </div>
                <div class="point">
                    <span class="point-number">2</span>
                    <p>Practical applications</p>
                </div>
                <div class="point">
                    <span class="point-number">3</span>
                    <p>Case study analysis</p>
                </div>
                <div class="point">
                    <span class="point-number">4</span>
                    <p>Assessment preparation</p>
                </div>
            </div>
        </div>
        <a href="lesson.html?topic=${encodeURIComponent(topic)}" class="get-started-btn">Begin Learning</a>
    `;
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
    
    // Animate progress bar
    const progressBar = modal.querySelector('.progress-bar');
    setTimeout(() => {
        progressBar.style.width = '100%';
    }, 100);
}

// Function to close modal
function closeModal() {
    modal.classList.remove('show');
    document.body.style.overflow = ''; // Restore scrolling
}

// Event listeners
closeBtn.addEventListener('click', closeModal);

// Close modal when clicking outside
modal.addEventListener('click', (e) => {
    if (e.target === modal) {
        closeModal();
    }
});

// Close modal with Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('show')) {
        closeModal();
    }
});

// Load topics when the page loads
loadTopics();