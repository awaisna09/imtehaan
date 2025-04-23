import config from './config.js';

class ContentManager {
  constructor() {
    this.contentCache = new Map();
    this.chaptersCache = null;
    this.currentChapterIndex = -1;
    this.initializeElements();
  }

  initializeElements() {
    this.chapterNameElement = document.querySelector('.chapter-name');
    this.lessonTitleElement = document.querySelector('.lesson-title');
    this.sidebarTopicsList = document.querySelector('.topics-list');
    this.contentBox = document.querySelector('.content-box');
    this.prevBtn = document.querySelector('.nav-btn.prev');
    this.nextBtn = document.querySelector('.nav-btn.next');
  }

  async loadAllChapters() {
    try {
      if (this.chaptersCache) {
        return this.chaptersCache;
      }

      const { data: chapters, error } = await supabase
        .from('final_topics')
        .select('name')
        .order('name');

      if (error) throw error;

      this.chaptersCache = [...new Set(chapters.map((topic) => topic.name))];
      return this.chaptersCache;
    } catch (error) {
      console.error('Error loading chapters:', error);
      this.showError('Failed to load chapters. Please try again.');
      return [];
    }
  }

  async loadTopicContent(topicName) {
    try {
      // Check cache first
      if (this.contentCache.has(topicName)) {
        const cachedData = this.contentCache.get(topicName);
        if (Date.now() - cachedData.timestamp < config.cache.ttl) {
          return this.updateUI(cachedData.data);
        }
      }

      this.showLoadingState();

      const { data, error } = await supabase
        .from('final_topics')
        .select('name, content')
        .eq('name', topicName)
        .single();

      if (error) throw error;

      if (!data) {
        throw new Error('Topic not found');
      }

      // Update cache
      this.contentCache.set(topicName, {
        data,
        timestamp: Date.now(),
      });

      // Clean up old cache entries if needed
      if (this.contentCache.size > config.cache.maxSize) {
        const oldestKey = Array.from(this.contentCache.entries()).sort(
          (a, b) => a[1].timestamp - b[1].timestamp
        )[0][0];
        this.contentCache.delete(oldestKey);
      }

      return this.updateUI(data);
    } catch (error) {
      console.error('Error loading topic content:', error);
      this.showError('Failed to load topic content. Please try again.');
    }
  }

  async loadRelatedTopics(chapterName) {
    try {
      const { data: topics, error } = await supabase
        .from('final_topics')
        .select('name, subtopic')
        .eq('name', chapterName)
        .order('subtopic', { ascending: true });

      if (error) throw error;

      this.updateTopicsList(topics);
    } catch (error) {
      console.error('Error loading related topics:', error);
      this.showError('Failed to load related topics. Please try again.');
    }
  }

  updateUI(data) {
    if (this.lessonTitleElement) {
      this.lessonTitleElement.textContent = data.name || 'No title';
    }

    if (this.contentBox) {
      if (data.content && data.content.trim()) {
        this.contentBox.innerHTML = data.content;
      } else {
        this.contentBox.innerHTML =
          '<div class="no-content">No content available</div>';
      }
    }
  }

  updateTopicsList(topics) {
    if (!this.sidebarTopicsList) return;

    this.sidebarTopicsList.innerHTML = '';

    if (topics && topics.length > 0) {
      topics.forEach((topic) => {
        if (topic.subtopic) {
          const div = document.createElement('div');
          div.className = 'topic-item';
          div.textContent = topic.subtopic;
          div.addEventListener('click', () =>
            this.handleTopicClick(topic.subtopic)
          );
          this.sidebarTopicsList.appendChild(div);
        }
      });
    } else {
      this.sidebarTopicsList.innerHTML =
        '<div class="no-topics">No topics found</div>';
    }
  }

  handleTopicClick(subtopic) {
    const messageInput = document.getElementById('message-input');
    if (messageInput) {
      messageInput.value = `Tell me about ${subtopic}`;
      const sendButton = document.getElementById('send-button');
      if (sendButton) {
        sendButton.click();
      }
    }
  }

  showLoadingState() {
    if (this.contentBox) {
      this.contentBox.innerHTML = `
                <div class="loading-spinner">
                    <div class="spinner"></div>
                    <p>Loading content...</p>
                </div>
            `;
    }
  }

  showError(message) {
    if (this.contentBox) {
      this.contentBox.innerHTML = `
                <div class="error-message">
                    <h3>Error</h3>
                    <p>${message}</p>
                </div>
            `;
    }
  }

  updateNavigationButtons() {
    if (this.prevBtn && this.nextBtn) {
      this.prevBtn.disabled = this.currentChapterIndex <= 0;
      this.nextBtn.disabled =
        this.currentChapterIndex >= (this.chaptersCache?.length || 0) - 1;

      this.prevBtn.classList.toggle('disabled', this.prevBtn.disabled);
      this.nextBtn.classList.toggle('disabled', this.nextBtn.disabled);
    }
  }

  async goToNextChapter() {
    if (this.currentChapterIndex < (this.chaptersCache?.length || 0) - 1) {
      this.currentChapterIndex++;
      const nextChapter = this.chaptersCache[this.currentChapterIndex];
      await this.loadTopicContent(nextChapter);
      await this.loadRelatedTopics(nextChapter);
      this.updateNavigationButtons();
    }
  }

  async goToPreviousChapter() {
    if (this.currentChapterIndex > 0) {
      this.currentChapterIndex--;
      const prevChapter = this.chaptersCache[this.currentChapterIndex];
      await this.loadTopicContent(prevChapter);
      await this.loadRelatedTopics(prevChapter);
      this.updateNavigationButtons();
    }
  }
}

export default ContentManager;
