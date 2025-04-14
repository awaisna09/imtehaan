// Function to create a chapter card element
function createChapterCard(chapter) {
    const card = document.createElement('a');
    card.href = `topics.html?chapter=${encodeURIComponent(chapter.name)}`;
    card.className = 'chapter-card';
    card.setAttribute('role', 'listitem');
    card.setAttribute('aria-label', `${chapter.name} chapter`);

    card.innerHTML = `
        <div class="chapter-content">
            <div class="chapter-header">
                <h3 class="chapter-title">${chapter.name}</h3>
            </div>
            <p class="chapter-subtitle">${chapter.description}</p>
        </div>
    `;

    return card;
}

// Function to fetch and update overall course progress
async function updateCourseProgress() {
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const progressSpinner = document.getElementById('progressSpinner');
    const progressError = document.getElementById('progressError');

    try {
        progressSpinner.style.display = 'block';
        progressError.style.display = 'none';

        // Fetch progress from your database
        const { data: progressData, error: progressError } = await supabase
            .from('user_progress')
            .select('overall_progress')
            .single();

        if (progressError) throw progressError;
        
        const progress = progressData?.overall_progress || 0;
        progressBar.style.width = `${progress}%`;
        progressText.textContent = `${progress}% Complete`;
    } catch (error) {
        console.error('Error fetching progress:', error);
        progressError.style.display = 'block';
    } finally {
        progressSpinner.style.display = 'none';
    }
}

// Function to fetch and display chapters
async function loadChapters() {
    const chaptersSpinner = document.getElementById('chaptersLoadingSpinner');
    const chaptersError = document.getElementById('chaptersError');
    const chaptersList = document.getElementById('chaptersList');

    try {
        chaptersSpinner.style.display = 'block';
        chaptersError.style.display = 'none';
        chaptersList.innerHTML = ''; // Clear existing chapters

        // Fetch distinct chapter names from final_topics table
        const { data: chapters, error } = await supabase
            .from('final_topics')
            .select('name')
            .order('name');

        if (error) throw error;

        if (!chapters || chapters.length === 0) {
            throw new Error('No chapters found');
        }

        // Get unique chapter names
        const uniqueChapters = [...new Set(chapters.map(topic => topic.name))];

        // Render each unique chapter
        uniqueChapters.forEach(chapterName => {
            const chapterCard = createChapterCard({
                name: chapterName,
                description: 'Chapter content' // Since we don't have descriptions in final_topics
            });
            chaptersList.appendChild(chapterCard);
        });
    } catch (error) {
        console.error('Error loading chapters:', error);
        chaptersError.style.display = 'block';
        chaptersError.textContent = error.message || 'Failed to load chapters';
    } finally {
        chaptersSpinner.style.display = 'none';
    }
}

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
    updateCourseProgress();
    loadChapters();
});