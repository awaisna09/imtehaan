import config from './config.js';
import NotesManager from './NotesManager.js';
import ContentManager from './ContentManager.js';

// Initialize Supabase client
const supabase = window.supabase.createClient(
  config.supabase.url,
  config.supabase.key
);

// Initialize managers
const contentManager = new ContentManager();
const notesManager = new NotesManager();

// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
const topicName = urlParams.get('topic');
const chapterName = urlParams.get('chapter');

// DOM elements
const chapterNameElement = document.querySelector('.chapter-name');
const lessonTitleElement = document.querySelector('.lesson-title');
const sidebarTopicsList = document.querySelector('.topics-list');
const contentBox = document.querySelector('.content-box');
const noteText = document.querySelector('.quick-notes');
const detailedNotesText = document.querySelector('.detailed-notes');

// Get all chapters from the database
let allChapters = [];
let currentChapterIndex = -1;

// Function to load all chapters
async function loadAllChapters() {
  try {
    const { data: chapters, error } = await supabase
      .from('final_topics')
      .select('name')
      .order('name');

    if (error) throw error;

    // Get unique chapter names exactly as they appear in the chapters page
    allChapters = [...new Set(chapters.map((topic) => topic.name))];

    // Find current chapter index
    currentChapterIndex = allChapters.indexOf(chapterName);

    // Update navigation buttons state
    updateNavigationButtons();

    // If we have a chapter name, load its topics
    if (chapterName) {
      // Update chapter name display
      if (chapterNameElement) {
        chapterNameElement.textContent = chapterName;
      }
      await loadRelatedTopics(chapterName);
    } else if (allChapters.length > 0) {
      // Load first chapter by default
      const firstChapter = allChapters[0];
      currentChapterIndex = 0;
      if (chapterNameElement) {
        chapterNameElement.textContent = firstChapter;
      }
      await loadRelatedTopics(firstChapter);
    }
  } catch (error) {
    console.error('Error loading chapters:', error);
  }
}

// Function to update navigation buttons state
function updateNavigationButtons() {
  const prevBtn = document.querySelector('.nav-btn.prev');
  const nextBtn = document.querySelector('.nav-btn.next');

  if (prevBtn) {
    prevBtn.disabled = currentChapterIndex <= 0;
    prevBtn.style.opacity = currentChapterIndex <= 0 ? '0.5' : '1';
  }

  if (nextBtn) {
    nextBtn.disabled = currentChapterIndex >= allChapters.length - 1;
    nextBtn.style.opacity =
      currentChapterIndex >= allChapters.length - 1 ? '0.5' : '1';
  }
}

// Function to navigate to next chapter
function goToNextChapter() {
  if (currentChapterIndex < allChapters.length - 1) {
    const nextChapter = allChapters[currentChapterIndex + 1];
    currentChapterIndex++;

    // Update chapter name display
    if (chapterNameElement) {
      chapterNameElement.textContent = nextChapter;
    }

    // Update URL without reloading page
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('chapter', nextChapter);
    window.history.pushState({}, '', newUrl);

    // Load new chapter content and topics
    loadTopicContent(nextChapter);
    loadRelatedTopics(nextChapter);

    // Update navigation buttons state
    updateNavigationButtons();
  }
}

// Function to navigate to previous chapter
function goToPreviousChapter() {
  if (currentChapterIndex > 0) {
    const prevChapter = allChapters[currentChapterIndex - 1];
    currentChapterIndex--;

    // Update chapter name display
    if (chapterNameElement) {
      chapterNameElement.textContent = prevChapter;
    }

    // Update URL without reloading page
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('chapter', prevChapter);
    window.history.pushState({}, '', newUrl);

    // Load new chapter content and topics
    loadTopicContent(prevChapter);
    loadRelatedTopics(prevChapter);

    // Update navigation buttons state
    updateNavigationButtons();
  }
}

// Function to update chapter content
async function updateChapter(chapterName) {
  try {
    // Update URL without reloading page
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('chapter', chapterName);
    window.history.pushState({}, '', newUrl);

    // Update chapter name display
    if (chapterNameElement) {
      chapterNameElement.textContent = chapterName;
    }

    // Load new chapter content
    await loadTopicContent(chapterName);

    // Load related topics for the new chapter
    await loadRelatedTopics(chapterName);

    // Update navigation buttons state
    updateNavigationButtons();
  } catch (error) {
    console.error('Error updating chapter:', error);
  }
}

// Add event listeners for navigation buttons
document.addEventListener('DOMContentLoaded', () => {
  const prevBtn = document.querySelector('.nav-btn.prev');
  const nextBtn = document.querySelector('.nav-btn.next');

  if (prevBtn) {
    prevBtn.addEventListener('click', goToPreviousChapter);
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', goToNextChapter);
  }

  // Load all chapters when the page loads
  loadAllChapters();

  // Welcome message animation
  const welcomeMessage = document.querySelector('.welcome-message');
  if (welcomeMessage) {
    // Show the welcome message with a slight delay for page load
    setTimeout(() => {
      welcomeMessage.classList.add('show');

      // After the message is shown for a moment, begin fade out
      setTimeout(() => {
        welcomeMessage.classList.remove('show');

        // Complete removal after transition finishes
        setTimeout(() => {
          welcomeMessage.remove();
        }, 800); // Match this with CSS transition time
      }, 2500); // Duration to show the message
    }, 500); // Initial delay before showing
  }
});

// Load topic content
async function loadTopicContent(topicName) {
  try {
    console.log('Loading topic content for:', topicName);

    const chapterNameElement = document.querySelector('.chapter-name');
    const lessonTitleElement = document.querySelector('.lesson-title');

    if (!chapterNameElement || !lessonTitleElement) {
      console.error('Required DOM elements not found');
      return;
    }

    // Get chapter name from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const chapterName = urlParams.get('chapter');

    if (chapterName) {
      console.log('Using chapter name from URL:', chapterName);
      chapterNameElement.textContent = chapterName;
      // Store in localStorage for future reference
      localStorage.setItem('selectedChapter', chapterName);
    } else {
      console.error('No chapter name found in URL');
      chapterNameElement.textContent = 'Unknown Chapter';
    }

    const { data, error } = await supabase
      .from('final_topics')
      .select('name, content')
      .eq('name', topicName)
      .single();

    if (error) {
      console.error('Error fetching topic content:', error);
      throw error;
    }

    if (!data) {
      console.error('No topic data found for:', topicName);
      lessonTitleElement.textContent = 'Topic not found';
      return;
    }

    console.log('Found topic data:', data);

    // Update UI
    lessonTitleElement.textContent = data.name || 'No title';

    // Set up the content box
    const lessonContent = document.querySelector('.lesson-content');
    if (!lessonContent) {
      console.error('Lesson content element not found');
      return;
    }

    if (data.content && data.content.trim()) {
      console.log('Displaying topic content');
      lessonContent.innerHTML = data.content;
    } else {
      console.log('No content available, showing chat interface');
      lessonContent.innerHTML =
        '<div class="loading-message">Loading chat interface...</div>';
    }
  } catch (error) {
    console.error('Error loading topic content:', error);
    const lessonContent = document.querySelector('.lesson-content');
    if (lessonContent) {
      lessonContent.innerHTML =
        '<div class="error-message">Error loading content</div>';
    }
  }
}

// Load related topics
async function loadRelatedTopics(chapterName) {
  try {
    console.log('Loading topics for chapter:', chapterName);

    if (!chapterName) {
      console.error('No chapter name provided');
      return;
    }

    // Get all topics in the current chapter
    const { data: topics, error } = await supabase
      .from('final_topics')
      .select('name, subtopic')
      .eq('name', chapterName)
      .order('subtopic', { ascending: true });

    if (error) {
      console.error('Error fetching topics:', error);
      throw error;
    }

    // Update sidebar
    const sidebarTopicsList = document.querySelector('.topics-list');
    if (!sidebarTopicsList) {
      console.error('Topics list element not found');
      return;
    }

    // Add toggle button for topics list
    const topicsSection = document.querySelector('.topics-section');
    if (topicsSection) {
      // Remove any existing toggle buttons
      const existingToggleBtns =
        topicsSection.querySelectorAll('.toggle-topics-btn');
      existingToggleBtns.forEach((btn) => btn.remove());

      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'toggle-topics-btn';
      toggleBtn.innerHTML = '▼';
      toggleBtn.setAttribute('aria-label', 'Toggle topics list size');

      const topicsHeader = topicsSection.querySelector('h3');
      if (topicsHeader) {
        topicsHeader.appendChild(toggleBtn);

        toggleBtn.addEventListener('click', () => {
          sidebarTopicsList.classList.toggle('expanded');
          toggleBtn.classList.toggle('expanded');
        });
      }
    }

    if (topics && topics.length > 0) {
      console.log('Found topics:', topics);
      sidebarTopicsList.innerHTML = '';

      topics.forEach((topic) => {
        if (topic.subtopic) {
          const div = document.createElement('div');
          div.className = 'topic-item';

          // Add style to make it look clickable
          div.style.cursor = 'pointer';
          div.style.pointerEvents = 'auto';

          // Change click handler to send topic to chat instead of navigating
          div.addEventListener('click', () => {
            // Get chat input field
            const messageInput = document.getElementById('message-input');
            if (messageInput) {
              // Format the message with the topic name
              messageInput.value = `Tell me about ${topic.subtopic}`;

              // Find and trigger the send button
              const sendButton = document.getElementById('send-button');
              if (sendButton) {
                sendButton.click();
              } else {
                // Fallback if send button not found - try to import and call directly
                import('./chat.js')
                  .then((module) => {
                    if (module.handleSendMessage) {
                      module.handleSendMessage();
                    }
                  })
                  .catch((err) => {
                    console.error('Failed to send message:', err);
                  });
              }
            }
          });

          div.textContent = topic.subtopic;
          sidebarTopicsList.appendChild(div);
        }
      });
    } else {
      console.log('No topics found for this chapter');
      sidebarTopicsList.innerHTML =
        '<div class="no-topics">No topics found for this chapter</div>';
    }
  } catch (error) {
    console.error('Error loading topics:', error);
    const sidebarTopicsList = document.querySelector('.topics-list');
    if (sidebarTopicsList) {
      sidebarTopicsList.innerHTML =
        '<div class="error-message">Error loading topics</div>';
    }
  }
}

// Load saved notes
async function loadSavedNotes(topicName) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

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

    if (error && error.code !== 'PGRST116') {
      // PGRST116 is "not found"
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
    const {
      data: { user },
    } = await supabase.auth.getUser();

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
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.id);

      if (updateError) {
        console.error('Error updating notes:', updateError);
        alert('Failed to update notes');
        return;
      }
    } else {
      // Insert new notes
      const { error: insertError } = await supabase.from('user_notes').insert([
        {
          user_id: user.id,
          topic: topicName,
          quick_notes: quickNotesValue,
          detailed_notes: detailedNotesValue,
          updated_at: new Date().toISOString(),
        },
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

// Initialize chat
async function initializeLessonChat() {
  try {
    const chatModule = await import('./chat.js');
    if (chatModule.initializeChat) {
      return await chatModule.initializeChat();
    }
    return false;
  } catch (error) {
    console.error('Error initializing chat:', error);
    return false;
  }
}

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
  try {
    if (!topicName) {
      console.error('No topic specified in URL');
      return;
    }

    console.log('Initializing page for topic:', topicName);

    // Load all chapters first
    const chapters = await contentManager.loadAllChapters();

    // Find current chapter index
    contentManager.currentChapterIndex = chapters.indexOf(chapterName);

    // Load topic content
    await contentManager.loadTopicContent(topicName);

    // Load related topics
    await contentManager.loadRelatedTopics(chapterName);

    // Load saved notes
    await notesManager.loadSavedNotes(topicName);

    // Set up navigation buttons
    setupNavigationButtons();

    // Initialize chat with new function name
    await initializeLessonChat();
  } catch (error) {
    console.error('Error initializing page:', error);
    contentManager.showError('Failed to initialize page. Please try again.');
  }
});

// Set up navigation buttons
function setupNavigationButtons() {
  const prevBtn = document.querySelector('.nav-btn.prev');
  const nextBtn = document.querySelector('.nav-btn.next');

  if (prevBtn) {
    prevBtn.addEventListener('click', () =>
      contentManager.goToPreviousChapter()
    );
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => contentManager.goToNextChapter());
  }

  contentManager.updateNavigationButtons();
}

// Initialize notes functionality
function initializeNotes() {
  const notesHeader = document.querySelector('.notes-header');
  const notesModal = document.querySelector('.notes-modal');
  const modalOverlay = document.querySelector('.modal-overlay');
  const modalClose = document.querySelector('.notes-modal-close');
  const saveNotesBtn = document.querySelector('.save-notes-btn');
  const quickNotes = document.querySelector('.quick-notes');
  const detailedNotes = document.querySelector('.detailed-notes');

  if (notesHeader && notesModal && modalOverlay && modalClose && saveNotesBtn) {
    // Open modal when clicking notes header
    notesHeader.addEventListener('click', () => {
      notesModal.classList.add('expanded');
      modalOverlay.classList.add('expanded');
      document.body.style.overflow = 'hidden';
    });

    // Close modal when clicking close button
    modalClose.addEventListener('click', () => {
      notesModal.classList.remove('expanded');
      modalOverlay.classList.remove('expanded');
      document.body.style.overflow = '';
    });

    // Close modal when clicking overlay
    modalOverlay.addEventListener('click', () => {
      notesModal.classList.remove('expanded');
      modalOverlay.classList.remove('expanded');
      document.body.style.overflow = '';
    });

    // Close modal with Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && notesModal.classList.contains('expanded')) {
        notesModal.classList.remove('expanded');
        modalOverlay.classList.remove('expanded');
        document.body.style.overflow = '';
      }
    });

    // Save notes functionality
    saveNotesBtn.addEventListener('click', async () => {
      try {
        saveNotesBtn.disabled = true;
        saveNotesBtn.textContent = 'Saving...';

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          alert('Please log in to save notes');
          return;
        }

        const quickNotesValue = quickNotes.value.trim();
        const detailedNotesValue = detailedNotes.value.trim();

        // Check if notes exist
        const { data, error: checkError } = await supabase
          .from('user_notes')
          .select('id')
          .eq('user_id', user.id)
          .eq('topic', topicName)
          .single();

        if (checkError && checkError.code !== 'PGRST116') {
          throw checkError;
        }

        if (data) {
          // Update existing notes
          const { error: updateError } = await supabase
            .from('user_notes')
            .update({
              quick_notes: quickNotesValue,
              detailed_notes: detailedNotesValue,
              updated_at: new Date().toISOString(),
            })
            .eq('id', data.id);

          if (updateError) throw updateError;
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
                updated_at: new Date().toISOString(),
              },
            ]);

          if (insertError) throw insertError;
        }

        // Show success message
        const successMsg = document.createElement('div');
        successMsg.className = 'save-success';
        successMsg.textContent = 'Notes saved successfully!';
        successMsg.style.color = '#00C46F';
        successMsg.style.marginTop = '10px';
        successMsg.style.textAlign = 'center';

        const actionsContainer = saveNotesBtn.parentElement;
        actionsContainer.appendChild(successMsg);

        setTimeout(() => {
          successMsg.remove();
        }, 3000);
      } catch (error) {
        console.error('Error saving notes:', error);
        alert('Failed to save notes. Please try again.');
      } finally {
        saveNotesBtn.disabled = false;
        saveNotesBtn.textContent = 'Save Notes';
      }
    });
  }
}
