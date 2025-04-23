const supabaseUrl = 'https://mwhtclxabiraowerfmkz.supabase.co',
  supabaseKey =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13aHRjbHhhYmlyYW93ZXJmbWt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA3MDY2MjksImV4cCI6MjA1NjI4MjYyOX0.jwnn4sR78xx08p-8V8d-gSU9EHCjPPnT376Vt9KDO3Q',
  QUESTIONS_WEBHOOK_URL =
    'https://imtehanh.app.n8n.cloud/webhook/62085562-ce3e-4f5a-bae0-5e52e83b3eb8/chat',
  REQUEST_TIMEOUT = 3e4,
  MAX_RETRIES = 3;
let supabase;
try {
  supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
} catch (e) {}
function isValidWebhookUrl(e) {
  try {
    const t = new URL(e);
    return 'https:' === t.protocol && t.hostname.includes('n8n.cloud');
  } catch (e) {
    return !1;
  }
}
async function testWebhook() {
  try {
    if (!isValidWebhookUrl(QUESTIONS_WEBHOOK_URL)) return !1;
    const e = 'Connection test',
      t = {
        sessionId: generateSessionId(),
        chatInput: e,
        context: { test: !0, timestamp: new Date().toISOString() },
      },
      n = await fetch(QUESTIONS_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(t),
        signal: AbortSignal.timeout(3e4),
      });
    if (!n.ok) throw new Error(`Server responded with status ${n.status}`);
    try {
      await n.json();
      return !0;
    } catch (e) {
      await n.text();
      return !0;
    }
  } catch (e) {
    return !1;
  }
}
function generateSessionId() {
  return (
    'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
  );
}
let chapterNameElement,
  sidebarTopicsList,
  questionsBox,
  answerBox,
  noteText,
  detailedNotesText,
  allChapters = [],
  currentChapterIndex = -1,
  currentChapterId = null,
  currentQuestionIndex = 0,
  currentQuestions = [],
  currentSessionId = generateSessionId();
import { initializeNotesPopup } from './notes.js';
function initializeDOMElements() {
  if (
    ((chapterNameElement = document.querySelector('.chapter-name')),
    (sidebarTopicsList = document.querySelector('.topics-list')),
    (questionsBox = document.querySelector('.questions-box')),
    (answerBox = document.querySelector('.answer-box')),
    (noteText = document.querySelector('.quick-notes')),
    (detailedNotesText = document.querySelector('.detailed-notes')),
    questionsBox)
  ) {
    questionsBox.innerHTML = '';
    const e = document.createElement('div');
    e.className = 'question-content';
    const t = document.createElement('div');
    (t.className = 'question-statement'),
      e.appendChild(t),
      questionsBox.appendChild(e);
  }
  if (answerBox) {
    answerBox.innerHTML = '';
    const e = document.createElement('div');
    (e.className = 'answer-content'), answerBox.appendChild(e);
  }
  initializeNotesPopup();
}
async function loadChapters() {
  try {
    if (!supabase) throw new Error('Supabase client not initialized');
    if ((initializeDOMElements(), !chapterNameElement || !sidebarTopicsList))
      return;
    const { data: e, error: t } = await supabase
      .from('topical_questions')
      .select('chapter_id, chapter_name')
      .order('chapter_name');
    if (t) throw t;
    if (!e || 0 === e.length) throw new Error('No chapters found');
    const n = [],
      s = new Set();
    e.forEach((e) => {
      s.has(e.chapter_id) ||
        (s.add(e.chapter_id),
        n.push({ id: e.chapter_id, name: e.chapter_name }));
    }),
      (allChapters = Array.from(n).sort((e, t) =>
        e.name.localeCompare(t.name)
      ));
    const a = new URLSearchParams(window.location.search).get('chapter');
    a
      ? ((currentChapterIndex = allChapters.findIndex((e) => e.name === a)),
        -1 === currentChapterIndex && (currentChapterIndex = 0))
      : (currentChapterIndex = 0),
      updateNavigationButtons();
    const o = allChapters[currentChapterIndex];
    (currentChapterId = o.id), (chapterNameElement.textContent = o.name);
    const r = new URL(window.location.href);
    r.searchParams.set('chapter', o.name),
      window.history.pushState({}, '', r),
      await loadQuestionsByChapterId(currentChapterId),
      await loadRelatedTopics();
  } catch (e) {
    chapterNameElement &&
      (chapterNameElement.textContent = 'Error loading chapters'),
      sidebarTopicsList &&
        (sidebarTopicsList.innerHTML =
          '<div class="error-message">Error loading chapters</div>');
  }
}
function updateNavigationButtons() {
  const e = document.querySelector('.nav-btn.prev'),
    t = document.querySelector('.nav-btn.next');
  e &&
    ((e.disabled = currentQuestionIndex <= 0),
    (e.style.opacity = currentQuestionIndex <= 0 ? '0.5' : '1'),
    (e.onclick = goToPreviousQuestion)),
    t &&
      ((t.disabled = currentQuestionIndex >= currentQuestions.length - 1),
      (t.style.opacity =
        currentQuestionIndex >= currentQuestions.length - 1 ? '0.5' : '1'),
      (t.onclick = goToNextQuestion));
}
function goToNextQuestion() {
  currentQuestionIndex < currentQuestions.length - 1 &&
    (currentQuestionIndex++,
    displayQuestion(currentQuestionIndex),
    updateNavigationButtons());
}
function goToPreviousQuestion() {
  currentQuestionIndex > 0 &&
    (currentQuestionIndex--,
    displayQuestion(currentQuestionIndex),
    updateNavigationButtons());
}
function displayQuestion(e) {
  if (!currentQuestions || !currentQuestions[e]) return;
  const t = currentQuestions[e],
    n = t.statement || 'No statement available',
    s = t.questions || 'No question available',
    a = t.marks || 'N/A';
  if (
    !questionsBox &&
    ((questionsBox = document.querySelector('.questions-box')), !questionsBox)
  )
    return;
  if (
    !answerBox &&
    ((answerBox = document.querySelector('.answer-box')), !answerBox)
  )
    return;
  questionsBox.querySelector('.question-content') ||
    (questionsBox.innerHTML =
      '\n            <div class="question-content">\n                <div class="question-statement"></div>\n            </div>\n        ');
  const o = questionsBox.querySelector('.question-statement');
  if (
    (o &&
      ((o.innerHTML = n),
      (o.style.color = '#fff'),
      (o.style.display = 'block')),
    answerBox.querySelector('.answer-content'))
  ) {
    const e =
      answerBox.querySelector('.marks-display') ||
      document.createElement('div');
    (e.className = 'marks-display'),
      (e.textContent = `Marks: ${a}`),
      answerBox.querySelector('.marks-display') || answerBox.appendChild(e);
  } else
    answerBox.innerHTML = `\n            <h3>Question</h3>\n            <div class="answer-content"></div>\n            <div class="marks-display">Marks: ${a}</div>\n        `;
  const r = answerBox.querySelector('.answer-content');
  r && (r.textContent = s),
    answerBox.addEventListener('click', () => {
      const e = document.getElementById('message-input');
      if (e) {
        const t = `Statement: ${n}\nQuestion: ${s}`;
        (e.value = t), e.focus();
      }
    }),
    (questionsBox.style.display = 'block'),
    (answerBox.style.display = 'block'),
    updateNavigationButtons();
}
async function loadQuestionsByChapterId(e) {
  try {
    (questionsBox && answerBox) || initializeDOMElements();
    const t = questionsBox.querySelector('.question-statement');
    t && (t.textContent = 'Loading questions...');
    const { data: n, error: s } = await supabase
      .from('topical_questions')
      .select('chapter_id, statement, questions, marks')
      .eq('chapter_id', e);
    if (s) throw s;
    if (!n || 0 === n.length) throw new Error('No questions found');
    (currentQuestions = n), (currentQuestionIndex = 0), displayQuestion(0);
  } catch (e) {
    const t = questionsBox.querySelector('.question-statement');
    t && (t.textContent = `Error: ${e.message}`);
  } finally {
    updateNavigationButtons();
  }
}
async function loadRelatedTopics() {
  try {
    if (!sidebarTopicsList) return;
    if (((sidebarTopicsList.innerHTML = ''), !Array.isArray(allChapters)))
      return;
    allChapters.forEach((e, t) => {
      const n = document.createElement('div');
      (n.className = 'topic-item'),
        t === currentChapterIndex && n.classList.add('active'),
        (n.innerHTML = `\n                <div class="topic-content">\n                    <div class="topic-name">${e.name}</div>\n                </div>\n            `),
        n.addEventListener('click', () => {
          sidebarTopicsList
            .querySelectorAll('.topic-item')
            .forEach((e) => e.classList.remove('active')),
            n.classList.add('active'),
            chapterNameElement && (chapterNameElement.textContent = e.name);
          const t = new URL(window.location.href);
          t.searchParams.set('chapter', e.name),
            window.history.pushState({}, '', t),
            (currentChapterIndex = allChapters.findIndex((t) => t.id === e.id)),
            (currentChapterId = e.id),
            loadQuestionsByChapterId(e.id);
        }),
        sidebarTopicsList.appendChild(n);
    });
  } catch (e) {
    sidebarTopicsList &&
      (sidebarTopicsList.innerHTML =
        '<div class="error-message">Error loading chapters</div>');
  }
}
function addMessageToChat(e, t) {
  const n = document.getElementById('chat-container');
  if (!n) return;
  const s = document.createElement('div');
  s.className = `chat-message ${t}-message`;
  const a = formatMessageWithMarkdown(e);
  (s.innerHTML = a), n.appendChild(s), (n.scrollTop = n.scrollHeight);
}
function formatMessageWithMarkdown(e) {
  return (e = (e = (e = (e = (e = (e = (e = (e = (e = (e = (e = (e = (e = (e =
    (e = e
      .toString()
      .replace(/^output:\s*/i, '')
      .trim())
      .replace(/^output\s*:/i, '')
      .trim())
    .replace(/^output/i, '')
    .trim()).replace(/[{}]/g, '')).replace(/\\/g, '')).replace(
    /"/g,
    ''
  )).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')).replace(
    /\*(.*?)\*/g,
    '<em>$1</em>'
  )).replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')).replace(
    /`([^`]+)`/g,
    '<code>$1</code>'
  )).replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank">$1</a>'
  )).replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>')).replace(
    /(<li>.*<\/li>)/g,
    '<ul>$1</ul>'
  )).replace(/\n/g, '<br>')).replace(
    /\|([^\n]+)\|\n\|([^\n]+)\|\n((?:\|[^\n]+\|\n?)+)/g,
    (e, t, n, s) => {
      const a = t.split('|').filter((e) => e.trim()),
        o = s.split('\n').map((e) => e.split('|').filter((e) => e.trim()));
      let r = '<table class="markdown-table"><thead><tr>';
      return (
        a.forEach((e) => {
          r += `<th>${e.trim()}</th>`;
        }),
        (r += '</tr></thead><tbody>'),
        o.forEach((e) => {
          (r += '<tr>'),
            e.forEach((e) => {
              r += `<td>${e.trim()}</td>`;
            }),
            (r += '</tr>');
        }),
        (r += '</tbody></table>'),
        r
      );
    }
  ));
}
async function handleSendMessage(e) {
  if (e && e.trim())
    try {
      const t = currentQuestions[currentQuestionIndex];
      if (!t) throw new Error('No current question found');
      const n = {
        sessionId: currentSessionId,
        chatInput: e,
        context: {
          chapter: {
            id: currentChapterId,
            name: allChapters[currentChapterIndex]?.name || 'Unknown',
          },
          question: {
            index: currentQuestionIndex,
            total: currentQuestions.length,
            statement: t.statement,
            questions: t.questions,
            marks: t.marks,
          },
          timestamp: new Date().toISOString(),
        },
      };
      if (!isValidWebhookUrl(QUESTIONS_WEBHOOK_URL))
        throw new Error('Invalid webhook URL');
      const s = await fetch(QUESTIONS_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(n),
        signal: AbortSignal.timeout(3e4),
      });
      if (!s.ok) throw new Error(`Server responded with status ${s.status}`);
      let a;
      try {
        const e = await s.text();
        try {
          a = JSON.parse(e);
        } catch (t) {
          a = { message: e };
        }
        'string' == typeof a && (a = { message: a });
        const t = (e) =>
          e
            ? e
                .toString()
                .replace(/^output:\s*/i, '')
                .replace(/^output\s*:/i, '')
                .replace(/^output/i, '')
                .trim()
            : '';
        a.message && (a.message = t(a.message)),
          a.response && (a.response = t(a.response)),
          a.text && (a.text = t(a.text)),
          a.output && (a.output = t(a.output)),
          'string' == typeof a && (a = t(a));
      } catch (e) {
        a = { message: 'Error processing response' };
      }
      addMessageToChat(
        a.message || a.response || a.text || a.output || JSON.stringify(a),
        'bot'
      );
    } catch (e) {
      addMessageToChat(
        'Sorry, there was an error processing your message. Please try again.',
        'system'
      );
    }
}
export function initializeChat() {
  const e = document.getElementById('message-input'),
    t = document.getElementById('send-button'),
    n = document.getElementById('chat-container');
  if (!e || !t || !n) return;
  n.innerHTML = '';
  (n.innerHTML =
    '\n        <div class="welcome-message">\n            <p>Lets start with questions</p>\n            <p>You can:</p>\n            <ul>\n                <li>Ask questions about the current topic</li>\n                <li>Get explanations for answers</li>\n                <li>Request additional examples</li>\n                <li>Ask for clarification on any concept</li>\n            </ul>\n        </div>\n    '),
    t.addEventListener('click', async () => {
      const s = e.value.trim();
      if (!s) return;
      (e.disabled = !0),
        (t.disabled = !0),
        addMessageToChat(s, 'user'),
        (e.value = '');
      const a = document.createElement('div');
      (a.className = 'chat-message bot-message typing-indicator'),
        (a.textContent = '...'),
        n.appendChild(a),
        (n.scrollTop = n.scrollHeight);
      try {
        await handleSendMessage(s);
      } catch (e) {
        addMessageToChat(
          '⚠️ Sorry, I encountered an error. Please try again later.',
          'bot'
        );
      } finally {
        a.remove(), (e.disabled = !1), (t.disabled = !1), e.focus();
      }
    }),
    e.addEventListener('keypress', (e) => {
      'Enter' !== e.key || e.shiftKey || (e.preventDefault(), t.click());
    }),
    testWebhook()
      .then((e) => {
        e ||
          addMessageToChat(
            '⚠️ Connection error. Some features may not be available.',
            'bot'
          );
      })
      .catch((e) => {
        addMessageToChat(
          '⚠️ Unable to connect to the chat service. Please try again later.',
          'bot'
        );
      });
}
export {
  loadChapters,
  loadRelatedTopics,
  loadQuestionsByChapterId,
  goToNextQuestion,
  goToPreviousQuestion,
  handleSendMessage,
  testWebhook,
  addMessageToChat,
};
