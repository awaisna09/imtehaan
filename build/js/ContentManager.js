import config from './config.js';
class ContentManager {
  constructor() {
    (this.contentCache = new Map()),
      (this.chaptersCache = null),
      (this.currentChapterIndex = -1),
      this.initializeElements();
  }
  initializeElements() {
    (this.chapterNameElement = document.querySelector('.chapter-name')),
      (this.lessonTitleElement = document.querySelector('.lesson-title')),
      (this.sidebarTopicsList = document.querySelector('.topics-list')),
      (this.contentBox = document.querySelector('.content-box')),
      (this.prevBtn = document.querySelector('.nav-btn.prev')),
      (this.nextBtn = document.querySelector('.nav-btn.next'));
  }
  async loadAllChapters() {
    try {
      if (this.chaptersCache) return this.chaptersCache;
      const { data: t, error: e } = await supabase
        .from('final_topics')
        .select('name')
        .order('name');
      if (e) throw e;
      return (
        (this.chaptersCache = [...new Set(t.map((t) => t.name))]),
        this.chaptersCache
      );
    } catch (t) {
      return this.showError('Failed to load chapters. Please try again.'), [];
    }
  }
  async loadTopicContent(t) {
    try {
      if (this.contentCache.has(t)) {
        const e = this.contentCache.get(t);
        if (Date.now() - e.timestamp < config.cache.ttl)
          return this.updateUI(e.data);
      }
      this.showLoadingState();
      const { data: e, error: n } = await supabase
        .from('final_topics')
        .select('name, content')
        .eq('name', t)
        .single();
      if (n) throw n;
      if (!e) throw new Error('Topic not found');
      if (
        (this.contentCache.set(t, { data: e, timestamp: Date.now() }),
        this.contentCache.size > config.cache.maxSize)
      ) {
        const t = Array.from(this.contentCache.entries()).sort(
          (t, e) => t[1].timestamp - e[1].timestamp
        )[0][0];
        this.contentCache.delete(t);
      }
      return this.updateUI(e);
    } catch (t) {
      this.showError('Failed to load topic content. Please try again.');
    }
  }
  async loadRelatedTopics(t) {
    try {
      const { data: e, error: n } = await supabase
        .from('final_topics')
        .select('name, subtopic')
        .eq('name', t)
        .order('subtopic', { ascending: !0 });
      if (n) throw n;
      this.updateTopicsList(e);
    } catch (t) {
      this.showError('Failed to load related topics. Please try again.');
    }
  }
  updateUI(t) {
    this.lessonTitleElement &&
      (this.lessonTitleElement.textContent = t.name || 'No title'),
      this.contentBox &&
        (t.content && t.content.trim()
          ? (this.contentBox.innerHTML = t.content)
          : (this.contentBox.innerHTML =
              '<div class="no-content">No content available</div>'));
  }
  updateTopicsList(t) {
    this.sidebarTopicsList &&
      ((this.sidebarTopicsList.innerHTML = ''),
      t && t.length > 0
        ? t.forEach((t) => {
            if (t.subtopic) {
              const e = document.createElement('div');
              (e.className = 'topic-item'),
                (e.textContent = t.subtopic),
                e.addEventListener('click', () =>
                  this.handleTopicClick(t.subtopic)
                ),
                this.sidebarTopicsList.appendChild(e);
            }
          })
        : (this.sidebarTopicsList.innerHTML =
            '<div class="no-topics">No topics found</div>'));
  }
  handleTopicClick(t) {
    const e = document.getElementById('message-input');
    if (e) {
      e.value = `Tell me about ${t}`;
      const n = document.getElementById('send-button');
      n && n.click();
    }
  }
  showLoadingState() {
    this.contentBox &&
      (this.contentBox.innerHTML =
        '\n                <div class="loading-spinner">\n                    <div class="spinner"></div>\n                    <p>Loading content...</p>\n                </div>\n            ');
  }
  showError(t) {
    this.contentBox &&
      (this.contentBox.innerHTML = `\n                <div class="error-message">\n                    <h3>Error</h3>\n                    <p>${t}</p>\n                </div>\n            `);
  }
  updateNavigationButtons() {
    this.prevBtn &&
      this.nextBtn &&
      ((this.prevBtn.disabled = this.currentChapterIndex <= 0),
      (this.nextBtn.disabled =
        this.currentChapterIndex >= (this.chaptersCache?.length || 0) - 1),
      this.prevBtn.classList.toggle('disabled', this.prevBtn.disabled),
      this.nextBtn.classList.toggle('disabled', this.nextBtn.disabled));
  }
  async goToNextChapter() {
    if (this.currentChapterIndex < (this.chaptersCache?.length || 0) - 1) {
      this.currentChapterIndex++;
      const t = this.chaptersCache[this.currentChapterIndex];
      await this.loadTopicContent(t),
        await this.loadRelatedTopics(t),
        this.updateNavigationButtons();
    }
  }
  async goToPreviousChapter() {
    if (this.currentChapterIndex > 0) {
      this.currentChapterIndex--;
      const t = this.chaptersCache[this.currentChapterIndex];
      await this.loadTopicContent(t),
        await this.loadRelatedTopics(t),
        this.updateNavigationButtons();
    }
  }
}
export default ContentManager;
