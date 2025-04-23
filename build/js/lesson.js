import config from './config.js';
import NotesManager from './NotesManager.js';
import ContentManager from './ContentManager.js';
const supabase = window.supabase.createClient(
    config.supabase.url,
    config.supabase.key
  ),
  contentManager = new ContentManager(),
  notesManager = new NotesManager(),
  urlParams = new URLSearchParams(window.location.search),
  topicName = urlParams.get('topic'),
  chapterName = urlParams.get('chapter'),
  chapterNameElement = document.querySelector('.chapter-name'),
  lessonTitleElement = document.querySelector('.lesson-title'),
  sidebarTopicsList = document.querySelector('.topics-list'),
  contentBox = document.querySelector('.content-box'),
  noteText = document.querySelector('.quick-notes'),
  detailedNotesText = document.querySelector('.detailed-notes');
let allChapters = [],
  currentChapterIndex = -1;
async function loadAllChapters() {
  try {
    const { data: e, error: t } = await supabase
      .from('final_topics')
      .select('name')
      .order('name');
    if (t) throw t;
    if (
      ((allChapters = [...new Set(e.map((e) => e.name))]),
      (currentChapterIndex = allChapters.indexOf(chapterName)),
      updateNavigationButtons(),
      chapterName)
    )
      chapterNameElement && (chapterNameElement.textContent = chapterName),
        await loadRelatedTopics(chapterName);
    else if (allChapters.length > 0) {
      const e = allChapters[0];
      (currentChapterIndex = 0),
        chapterNameElement && (chapterNameElement.textContent = e),
        await loadRelatedTopics(e);
    }
  } catch (e) {}
}
function updateNavigationButtons() {
  const e = document.querySelector('.nav-btn.prev'),
    t = document.querySelector('.nav-btn.next');
  e &&
    ((e.disabled = currentChapterIndex <= 0),
    (e.style.opacity = currentChapterIndex <= 0 ? '0.5' : '1')),
    t &&
      ((t.disabled = currentChapterIndex >= allChapters.length - 1),
      (t.style.opacity =
        currentChapterIndex >= allChapters.length - 1 ? '0.5' : '1'));
}
function goToNextChapter() {
  if (currentChapterIndex < allChapters.length - 1) {
    const e = allChapters[currentChapterIndex + 1];
    currentChapterIndex++,
      chapterNameElement && (chapterNameElement.textContent = e);
    const t = new URL(window.location.href);
    t.searchParams.set('chapter', e),
      window.history.pushState({}, '', t),
      loadTopicContent(e),
      loadRelatedTopics(e),
      updateNavigationButtons();
  }
}
function goToPreviousChapter() {
  if (currentChapterIndex > 0) {
    const e = allChapters[currentChapterIndex - 1];
    currentChapterIndex--,
      chapterNameElement && (chapterNameElement.textContent = e);
    const t = new URL(window.location.href);
    t.searchParams.set('chapter', e),
      window.history.pushState({}, '', t),
      loadTopicContent(e),
      loadRelatedTopics(e),
      updateNavigationButtons();
  }
}
async function updateChapter(e) {
  try {
    const t = new URL(window.location.href);
    t.searchParams.set('chapter', e),
      window.history.pushState({}, '', t),
      chapterNameElement && (chapterNameElement.textContent = e),
      await loadTopicContent(e),
      await loadRelatedTopics(e),
      updateNavigationButtons();
  } catch (e) {}
}
async function loadTopicContent(e) {
  try {
    const t = document.querySelector('.chapter-name'),
      a = document.querySelector('.lesson-title');
    if (!t || !a) return;
    const n = new URLSearchParams(window.location.search).get('chapter');
    n
      ? ((t.textContent = n), localStorage.setItem('selectedChapter', n))
      : (t.textContent = 'Unknown Chapter');
    const { data: o, error: r } = await supabase
      .from('final_topics')
      .select('name, content')
      .eq('name', e)
      .single();
    if (r) throw r;
    if (!o) return void (a.textContent = 'Topic not found');
    a.textContent = o.name || 'No title';
    const s = document.querySelector('.lesson-content');
    if (!s) return;
    o.content && o.content.trim()
      ? (s.innerHTML = o.content)
      : (s.innerHTML =
          '<div class="loading-message">Loading chat interface...</div>');
  } catch (e) {
    const t = document.querySelector('.lesson-content');
    t &&
      (t.innerHTML = '<div class="error-message">Error loading content</div>');
  }
}
async function loadRelatedTopics(e) {
  try {
    if (!e) return;
    const { data: t, error: a } = await supabase
      .from('final_topics')
      .select('name, subtopic')
      .eq('name', e)
      .order('subtopic', { ascending: !0 });
    if (a) throw a;
    const n = document.querySelector('.topics-list');
    if (!n) return;
    const o = document.querySelector('.topics-section');
    if (o) {
      o.querySelectorAll('.toggle-topics-btn').forEach((e) => e.remove());
      const e = document.createElement('button');
      (e.className = 'toggle-topics-btn'),
        (e.innerHTML = '▼'),
        e.setAttribute('aria-label', 'Toggle topics list size');
      const t = o.querySelector('h3');
      t &&
        (t.appendChild(e),
        e.addEventListener('click', () => {
          n.classList.toggle('expanded'), e.classList.toggle('expanded');
        }));
    }
    t && t.length > 0
      ? ((n.innerHTML = ''),
        t.forEach((e) => {
          if (e.subtopic) {
            const t = document.createElement('div');
            (t.className = 'topic-item'),
              (t.style.cursor = 'pointer'),
              (t.style.pointerEvents = 'auto'),
              t.addEventListener('click', () => {
                const t = document.getElementById('message-input');
                if (t) {
                  t.value = `Tell me about ${e.subtopic}`;
                  const a = document.getElementById('send-button');
                  a
                    ? a.click()
                    : import('./chat.js')
                        .then((e) => {
                          e.handleSendMessage && e.handleSendMessage();
                        })
                        .catch((e) => {});
                }
              }),
              (t.textContent = e.subtopic),
              n.appendChild(t);
          }
        }))
      : (n.innerHTML =
          '<div class="no-topics">No topics found for this chapter</div>');
  } catch (e) {
    const t = document.querySelector('.topics-list');
    t &&
      (t.innerHTML = '<div class="error-message">Error loading topics</div>');
  }
}
async function loadSavedNotes(e) {
  try {
    const {
      data: { user: t },
    } = await supabase.auth.getUser();
    if (!t) return;
    const { data: a, error: n } = await supabase
      .from('user_notes')
      .select('quick_notes, detailed_notes')
      .eq('user_id', t.id)
      .eq('topic', e)
      .single();
    if (n && 'PGRST116' !== n.code) return;
    a &&
      ((noteText.value = a.quick_notes || ''),
      (detailedNotesText.value = a.detailed_notes || ''));
  } catch (e) {}
}
async function saveNotes() {
  try {
    const {
      data: { user: e },
    } = await supabase.auth.getUser();
    if (!e) return void alert('Please log in to save notes');
    const t = noteText.value.trim(),
      a = detailedNotesText.value.trim(),
      { data: n, error: o } = await supabase
        .from('user_notes')
        .select('id')
        .eq('user_id', e.id)
        .eq('topic', topicName)
        .single();
    if (o && 'PGRST116' !== o.code) return;
    if (n) {
      const { error: e } = await supabase
        .from('user_notes')
        .update({
          quick_notes: t,
          detailed_notes: a,
          updated_at: new Date().toISOString(),
        })
        .eq('id', n.id);
      if (e) return void alert('Failed to update notes');
    } else {
      const { error: n } = await supabase
        .from('user_notes')
        .insert([
          {
            user_id: e.id,
            topic: topicName,
            quick_notes: t,
            detailed_notes: a,
            updated_at: new Date().toISOString(),
          },
        ]);
      if (n) return void alert('Failed to save notes');
    }
    alert('Notes saved successfully!');
  } catch (e) {
    alert('An error occurred while saving notes');
  }
}
async function initializeLessonChat() {
  try {
    const e = await import('./chat.js');
    return !!e.initializeChat && (await e.initializeChat());
  } catch (e) {
    return !1;
  }
}
function setupNavigationButtons() {
  const e = document.querySelector('.nav-btn.prev'),
    t = document.querySelector('.nav-btn.next');
  e && e.addEventListener('click', () => contentManager.goToPreviousChapter()),
    t && t.addEventListener('click', () => contentManager.goToNextChapter()),
    contentManager.updateNavigationButtons();
}
function initializeNotes() {
  const e = document.querySelector('.notes-header'),
    t = document.querySelector('.notes-modal'),
    a = document.querySelector('.modal-overlay'),
    n = document.querySelector('.notes-modal-close'),
    o = document.querySelector('.save-notes-btn'),
    r = document.querySelector('.quick-notes'),
    s = document.querySelector('.detailed-notes');
  e &&
    t &&
    a &&
    n &&
    o &&
    (e.addEventListener('click', () => {
      t.classList.add('expanded'),
        a.classList.add('expanded'),
        (document.body.style.overflow = 'hidden');
    }),
    n.addEventListener('click', () => {
      t.classList.remove('expanded'),
        a.classList.remove('expanded'),
        (document.body.style.overflow = '');
    }),
    a.addEventListener('click', () => {
      t.classList.remove('expanded'),
        a.classList.remove('expanded'),
        (document.body.style.overflow = '');
    }),
    document.addEventListener('keydown', (e) => {
      'Escape' === e.key &&
        t.classList.contains('expanded') &&
        (t.classList.remove('expanded'),
        a.classList.remove('expanded'),
        (document.body.style.overflow = ''));
    }),
    o.addEventListener('click', async () => {
      try {
        (o.disabled = !0), (o.textContent = 'Saving...');
        const {
          data: { user: e },
        } = await supabase.auth.getUser();
        if (!e) return void alert('Please log in to save notes');
        const t = r.value.trim(),
          a = s.value.trim(),
          { data: n, error: c } = await supabase
            .from('user_notes')
            .select('id')
            .eq('user_id', e.id)
            .eq('topic', topicName)
            .single();
        if (c && 'PGRST116' !== c.code) throw c;
        if (n) {
          const { error: e } = await supabase
            .from('user_notes')
            .update({
              quick_notes: t,
              detailed_notes: a,
              updated_at: new Date().toISOString(),
            })
            .eq('id', n.id);
          if (e) throw e;
        } else {
          const { error: n } = await supabase
            .from('user_notes')
            .insert([
              {
                user_id: e.id,
                topic: topicName,
                quick_notes: t,
                detailed_notes: a,
                updated_at: new Date().toISOString(),
              },
            ]);
          if (n) throw n;
        }
        const i = document.createElement('div');
        (i.className = 'save-success'),
          (i.textContent = 'Notes saved successfully!'),
          (i.style.color = '#00C46F'),
          (i.style.marginTop = '10px'),
          (i.style.textAlign = 'center');
        o.parentElement.appendChild(i),
          setTimeout(() => {
            i.remove();
          }, 3e3);
      } catch (e) {
        alert('Failed to save notes. Please try again.');
      } finally {
        (o.disabled = !1), (o.textContent = 'Save Notes');
      }
    }));
}
document.addEventListener('DOMContentLoaded', () => {
  const e = document.querySelector('.nav-btn.prev'),
    t = document.querySelector('.nav-btn.next');
  e && e.addEventListener('click', goToPreviousChapter),
    t && t.addEventListener('click', goToNextChapter),
    loadAllChapters();
  const a = document.querySelector('.welcome-message');
  a &&
    setTimeout(() => {
      a.classList.add('show'),
        setTimeout(() => {
          a.classList.remove('show'),
            setTimeout(() => {
              a.remove();
            }, 800);
        }, 2500);
    }, 500);
}),
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      if (!topicName) return;
      const e = await contentManager.loadAllChapters();
      (contentManager.currentChapterIndex = e.indexOf(chapterName)),
        await contentManager.loadTopicContent(topicName),
        await contentManager.loadRelatedTopics(chapterName),
        await notesManager.loadSavedNotes(topicName),
        setupNavigationButtons(),
        await initializeLessonChat();
    } catch (e) {
      contentManager.showError('Failed to initialize page. Please try again.');
    }
  });
