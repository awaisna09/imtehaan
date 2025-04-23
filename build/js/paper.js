import { supabase } from './supabase-config.js';
let questionSets = [],
  currentSetIndex = -1,
  currentQuestionIndex = 0,
  questions = [],
  currentSessionId = null;
function generateSessionId() {
  return (
    'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
  );
}
function initializeSession() {
  return (
    currentSessionId || (currentSessionId = generateSessionId()),
    currentSessionId
  );
}
let chatHistory = [],
  answeredQuestions = new Set();
const WEBHOOK_URL =
    'https://imtehanh.app.n8n.cloud/webhook/ed194d37-5e64-4729-b6cd-93961bf48d2a/chat',
  CORS_PROXY = 'https://cors-anywhere.herokuapp.com/';
function getRightSideBoxContent() {
  const e = document.querySelector('.right-side-box');
  if (!e) return [];
  const t = e.querySelector('.chat-messages');
  if (!t) return [];
  const n = [];
  return (
    t.childNodes.forEach((e) => {
      if (e.classList && e.classList.contains('chat-message')) {
        const t = e.classList.contains('system-message') ? 'system' : 'user';
        n.push({ type: t, content: e.textContent });
      }
    }),
    n
  );
}
function formatChatMessagesForWebhook() {
  currentSessionId || (currentSessionId = generateSessionId());
  const e = getRightSideBoxContent(),
    t = e
      .filter((e) => 'separator' !== e.type)
      .map(
        (e) => `${'system' === e.type ? 'Question: ' : 'Answer: '}${e.content}`
      )
      .join('\n\n');
  return {
    sessionId: currentSessionId,
    chatInput: t,
    question_data: questions.map((t, n) => ({
      question_number: n + 1,
      marks: t.marks,
      statement: t.statement,
      messages: e.filter(
        (t, s) =>
          e.slice(0, s).filter((e) => 'separator' === e.type).length === n
      ),
    })),
    total_questions: questions.length,
    total_messages: e.length,
    metadata: { user_agent: navigator.userAgent },
  };
}
async function sendToWebhook() {
  const e = document.querySelector('.submit-btn');
  e && ((e.disabled = !0), (e.textContent = 'Submitting...'));
  try {
    const t = formatChatMessagesForWebhook(),
      n = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        mode: 'cors',
        credentials: 'omit',
        body: JSON.stringify(t),
      });
    if (!n.ok) {
      let e;
      try {
        e = await n.text();
      } catch (t) {
        e = 'No error details available';
      }
      throw new Error(`HTTP error! status: ${n.status} - ${e}`);
    }
    e && ((e.textContent = 'Submitted!'), (e.style.background = '#4CAF50')),
      (window.location.href = 'score.html');
  } catch (t) {
    throw (
      (e &&
        ((e.disabled = !1),
        (e.textContent = 'Submit Failed - Try Again'),
        (e.style.background = '#f44336')),
      setTimeout(() => {
        e && ((e.textContent = 'Submit'), (e.style.background = '#00C46F'));
      }, 3e3),
      t)
    );
  }
}
export async function initializePaperPage() {
  (currentSessionId = generateSessionId()),
    (questionSets = []),
    (currentSetIndex = -1),
    (currentQuestionIndex = 0),
    (questions = []),
    (chatHistory = []),
    initializeWelcomeMessage(),
    initializeChatBox(),
    initializeNotesPopup(),
    initializePaperNavigation(),
    initializeGuidelinesPopup(),
    initializeChatInput(),
    initializeFileInput(),
    initializePaperButtons(),
    initializeSubmitButton(),
    await fetchQuestions(),
    updateNavigationButtons();
}
function initializeWelcomeMessage() {
  const e = document.querySelector('.welcome-message');
  e &&
    setTimeout(() => {
      e.classList.add('show'),
        setTimeout(() => {
          e.classList.remove('show'),
            setTimeout(() => {
              e.remove();
            }, 800);
        }, 2500);
    }, 500);
}
async function fetchQuestions() {
  try {
    answeredQuestions.clear(), updateSubmitButton();
    const e = document.querySelector('.questions-list');
    if (!e) return;
    e.innerHTML = '<div class="loading-indicator">Loading questions...</div>';
    const { count: t, error: n } = await supabase
      .from('all_questions')
      .select('question_id', { count: 'exact' });
    if (n) return;
    const s = t;
    let i = [],
      o = 0;
    const r = 10,
      a = 100,
      c = 5;
    for (; o < r; ) {
      o++;
      const e = new Set();
      for (; e.size < 50; ) {
        const t = Math.floor(Math.random() * s) + 1;
        e.add(t);
      }
      const { data: t, error: n } = await supabase
        .from('topical_questions')
        .select('question_id, marks, statement, chapter_id')
        .in('question_id', Array.from(e))
        .limit(50);
      if (n) continue;
      if (!t || 0 === t.length) continue;
      const r = t.filter((e) => {
        const t = parseInt(e.marks);
        return !isNaN(t) && t > 0;
      });
      let u = i.reduce((e, t) => e + parseInt(t.marks), 0);
      for (const e of r) {
        const t = parseInt(e.marks);
        if ((u + t <= a + c && (i.push(e), (u += t)), u >= a - c && u <= a + c))
          break;
      }
      i = i.filter(
        (e, t, n) => t === n.findIndex((t) => t.question_id === e.question_id)
      );
      const d = i.reduce((e, t) => e + parseInt(t.marks), 0);
      if (d >= a - c && d <= a + c) break;
    }
    const u = i.reduce((e, t) => e + parseInt(t.marks), 0);
    if (u < a - c)
      return void (e.innerHTML = `<div class="error-message">Could not fetch enough questions to reach ${a} marks (current total: ${u}). Please try again.</div>`);
    displayQuestions(i.sort((e, t) => parseInt(e.marks) - parseInt(t.marks)));
  } catch (e) {
    const t = document.querySelector('.questions-list');
    t &&
      (t.innerHTML =
        '<div class="error-message">An error occurred. Please try again.</div>');
  }
}
function displayQuestions(e) {
  const t = document.querySelector('.questions-list'),
    n = document.querySelector('.prev-question-btn'),
    s = document.querySelector('.next-question-btn');
  t &&
    ((questions = e),
    (currentQuestionIndex = 0),
    (t.innerHTML = ''),
    displayCurrentQuestion(),
    updateNavigationButtons(),
    n &&
      n.addEventListener('click', () => {
        currentQuestionIndex > 0 &&
          (currentQuestionIndex--,
          displayCurrentQuestion(),
          updateNavigationButtons());
      }),
    s &&
      s.addEventListener('click', () => {
        currentQuestionIndex < questions.length - 1 &&
          (currentQuestionIndex++,
          displayCurrentQuestion(),
          updateNavigationButtons());
      }));
}
function displayCurrentQuestion() {
  const e = document.querySelector('.questions-list'),
    t = document.querySelector('.right-side-box');
  if (!e || !questions[currentQuestionIndex] || !t) return;
  const n = questions[currentQuestionIndex];
  e.innerHTML = '';
  const s = document.createElement('div');
  s.className = 'question-item';
  const i = document.createElement('h3'),
    o = parseInt(n.marks);
  (i.textContent = `Question ${currentQuestionIndex + 1} [${o} marks]`),
    s.appendChild(i);
  const r = document.createElement('p');
  (r.textContent = n.statement),
    s.appendChild(r),
    e.appendChild(s),
    document.querySelector('.chat-container') ||
      (t.innerHTML =
        '\n            <div class="chat-container">\n                <div class="chat-messages"></div>\n            </div>\n        ');
}
function displayChatHistory(e = !1) {
  const t = document.querySelector('.chat-messages');
  if (!t) return;
  if (((t.innerHTML = ''), e)) {
    const e = questions[currentQuestionIndex];
    addChatMessage(
      'system',
      `Question ${currentQuestionIndex + 1} [${e.marks} marks]:\n${e.statement}`
    );
  }
  (chatHistory[currentQuestionIndex] || []).forEach((e) => {
    addChatMessage('user', e);
  });
}
function initializeChatBox() {
  if (!document.querySelector('.chat-messages')) return;
  const e = questions[currentQuestionIndex];
  addChatMessage(
    'system',
    `Question ${currentQuestionIndex + 1} [${e.marks} marks]:\n${e.statement}`
  );
}
function addChatMessage(e, t) {
  const n = document.querySelector('.chat-messages');
  if (!n) return;
  const s = document.createElement('div');
  'separator' === e
    ? ((s.className = 'chat-separator'), (t = '─── Next Question ───'))
    : (s.className = `chat-message ${e}-message`),
    (s.textContent = t),
    n.appendChild(s),
    (n.scrollTop = n.scrollHeight);
}
function updateNavigationButtons() {
  const e = document.querySelector('.prev-question-btn'),
    t = document.querySelector('.next-question-btn');
  e && (e.disabled = 0 === currentQuestionIndex),
    t && (t.disabled = currentQuestionIndex === questions.length - 1),
    updateSubmitButton();
}
function initializeNotesPopup() {
  const e = document.querySelector('.expand-notes-btn'),
    t = document.querySelector('.notes-popup'),
    n = document.querySelector('.close-popup'),
    s = document.querySelector('.save-notes-btn'),
    i = document.querySelector('.detailed-notes'),
    o = document.querySelector('.quick-notes');
  e &&
    t &&
    n &&
    s &&
    i &&
    o &&
    (e.addEventListener('click', () => {
      t.classList.add('active'), (i.value = o.value), i.focus();
    }),
    n.addEventListener('click', () => {
      t.classList.remove('active');
    }),
    s.addEventListener('click', () => {
      (o.value = i.value), t.classList.remove('active');
    }),
    t.addEventListener('click', (e) => {
      e.target === t && t.classList.remove('active');
    }),
    document.addEventListener('keydown', (e) => {
      'Escape' === e.key &&
        t.classList.contains('active') &&
        t.classList.remove('active');
    }));
}
function initializePaperNavigation() {
  const e = document.querySelectorAll('.paper-btn'),
    t = document.querySelector('.nav-btn');
  e.forEach((t) => {
    t.addEventListener('click', async function () {
      e.forEach((e) => e.classList.remove('active')),
        this.classList.add('active'),
        (currentQuestionIndex = 0),
        (chatHistory = []);
      const t = document.querySelector('.right-side-box');
      t &&
        (t.innerHTML =
          '\n                    <h3>Answer Area</h3>\n                    <p>Type your answer in the input box below</p>\n                '),
        await fetchQuestions();
    });
  }),
    t &&
      t.addEventListener('click', async function () {
        (currentQuestionIndex = 0), (chatHistory = []);
        const e = document.querySelector('.right-side-box');
        e &&
          (e.innerHTML =
            '\n                    <h3>Answer Area</h3>\n                    <p>Type your answer in the input box below</p>\n                '),
          await fetchQuestions();
      });
  const n = document.querySelector('.prev-question-btn'),
    s = document.querySelector('.next-question-btn');
  n &&
    n.addEventListener('click', () => {
      currentQuestionIndex > 0 &&
        (currentQuestionIndex--,
        displayCurrentQuestion(),
        updateNavigationButtons());
    }),
    s &&
      s.addEventListener('click', () => {
        currentQuestionIndex < questions.length - 1 &&
          (currentQuestionIndex++,
          displayCurrentQuestion(),
          updateNavigationButtons());
      });
}
function initializeGuidelinesPopup() {
  const e = document.querySelector('.show-guidelines-btn'),
    t = document.querySelector('.guidelines-popup'),
    n = document.querySelector('.close-guidelines');
  e &&
    t &&
    n &&
    (e.addEventListener('click', () => {
      t.classList.add('active');
    }),
    n.addEventListener('click', () => {
      t.classList.remove('active');
    }),
    t.addEventListener('click', (e) => {
      e.target === t && t.classList.remove('active');
    }));
}
function initializeChatInput() {
  const e = document.querySelector('.message-input'),
    t = document.getElementById('send-button'),
    n = document.getElementById('file-input'),
    s = document.querySelector('.file-preview'),
    i = document.querySelector('.right-side-box');
  e &&
    t &&
    n &&
    s &&
    i &&
    (t.addEventListener('click', (t) => {
      t.preventDefault(), t.stopPropagation();
      const n = e.value.trim();
      if (n && questions[currentQuestionIndex]) {
        const t = document.querySelector('.chat-messages');
        if (t) {
          if (
            !chatHistory[currentQuestionIndex] ||
            0 === chatHistory[currentQuestionIndex].length
          ) {
            const e = questions[currentQuestionIndex];
            addChatMessage(
              'system',
              `Question ${currentQuestionIndex + 1} [${e.marks} marks]:\n${e.statement}`
            );
          }
          chatHistory[currentQuestionIndex] ||
            (chatHistory[currentQuestionIndex] = []),
            chatHistory[currentQuestionIndex].push(n),
            addChatMessage('user', n),
            (t.scrollTop = t.scrollHeight);
        }
        (e.value = ''),
          currentQuestionIndex < questions.length - 1
            ? setTimeout(() => {
                addChatMessage('separator', '─── Next Question ───'),
                  currentQuestionIndex++,
                  displayCurrentQuestion(),
                  updateNavigationButtons();
              }, 500)
            : updateSubmitButton();
      }
    }),
    e.addEventListener('keydown', (e) => {
      'Enter' !== e.key || e.shiftKey || (e.preventDefault(), t.click());
    }),
    n.addEventListener('change', () => {}));
}
const style = document.createElement('style');
style.textContent =
  '\n    .right-side-box {\n        padding: 0;\n        display: flex;\n        flex-direction: column;\n        background: #2A2A2A;\n        border-radius: 8px;\n        overflow: hidden;\n        height: 100%;\n        min-height: 300px;\n        position: relative;\n        flex: 1;\n    }\n\n    .chat-container {\n        display: flex;\n        flex-direction: column;\n        height: 100%;\n        position: absolute;\n        top: 0;\n        left: 0;\n        right: 0;\n        bottom: 0;\n    }\n\n    .chat-messages {\n        flex-grow: 1;\n        overflow-y: auto;\n        padding: 0.75rem;\n        display: flex;\n        flex-direction: column;\n        gap: 0.5rem;\n        height: 100%;\n        min-height: 0;\n    }\n\n    .chat-message {\n        padding: 0.5rem 0.75rem;\n        border-radius: 8px;\n        max-width: 75%;\n        white-space: pre-wrap;\n        word-break: break-word;\n        margin: 0;\n    }\n\n    .system-message {\n        background: #363636;\n        color: #fff;\n        align-self: flex-start;\n        border-bottom-left-radius: 4px;\n        font-size: 0.85rem;\n        line-height: 1.4;\n    }\n\n    .user-message {\n        background: #00C46F;\n        color: #fff;\n        align-self: flex-end;\n        border-bottom-right-radius: 4px;\n        font-size: 0.85rem;\n        line-height: 1.4;\n    }\n\n    .chat-separator {\n        width: 100%;\n        text-align: center;\n        color: rgba(255, 255, 255, 0.5);\n        font-size: 0.75rem;\n        margin: 0.25rem 0;\n        white-space: pre;\n        flex-shrink: 0;\n        padding: 0.25rem 0;\n    }\n\n    /* Custom scrollbar for chat messages */\n    .chat-messages::-webkit-scrollbar {\n        width: 4px;\n    }\n\n    .chat-messages::-webkit-scrollbar-track {\n        background: transparent;\n    }\n\n    .chat-messages::-webkit-scrollbar-thumb {\n        background: rgba(255, 255, 255, 0.2);\n        border-radius: 2px;\n    }\n\n    .chat-messages::-webkit-scrollbar-thumb:hover {\n        background: rgba(255, 255, 255, 0.3);\n    }\n\n    .submit-btn {\n        background: #666666;\n        color: #fff;\n        border: none;\n        border-radius: 8px;\n        padding: 0.75rem 1.5rem;\n        font-size: 1rem;\n        cursor: not-allowed;\n        opacity: 0.8;\n        transition: all 0.3s ease;\n        min-width: 120px;\n    }\n\n    .submit-btn.complete {\n        background: #00C46F;\n        cursor: pointer;\n        opacity: 1;\n    }\n\n    .submit-btn:disabled {\n        cursor: not-allowed;\n    }\n\n    .submit-btn.error {\n        background: #f44336;\n    }\n';
const parentStyles = document.createElement('style');
(parentStyles.textContent =
  '\n    .content-container {\n        display: flex;\n        height: 100%;\n        min-height: 0;\n    }\n\n    .questions-container {\n        flex: 1;\n        overflow-y: auto;\n        padding-right: 0.75rem;\n    }\n\n    .right-side-container {\n        flex: 1;\n        display: flex;\n        flex-direction: column;\n        min-height: 0;\n    }\n'),
  document.head.appendChild(style),
  document.head.appendChild(parentStyles);
export function initializeFileInput() {
  const e = document.getElementById('file-input'),
    t = document.querySelector('.file-preview'),
    n = document.querySelector('.attach-btn');
  e &&
    t &&
    n &&
    (n.addEventListener('click', () => {
      e.click();
    }),
    e.addEventListener('change', () => {
      (t.innerHTML = ''),
        Array.from(e.files).forEach((e) => {
          const n = document.createElement('div');
          if (((n.className = 'file-item'), e.type.startsWith('image/'))) {
            const t = document.createElement('img');
            (t.src = URL.createObjectURL(e)),
              (t.className = 'file-thumbnail'),
              n.appendChild(t);
          } else {
            const e = document.createElement('span');
            (e.className = 'file-icon'),
              (e.textContent = '📄'),
              n.appendChild(e);
          }
          const s = document.createElement('div');
          (s.className = 'file-info'),
            (s.innerHTML = `\n                <span class="file-name">${e.name}</span>\n                <span class="file-size">${(e.size / 1024).toFixed(1)} KB</span>\n            `),
            n.appendChild(s);
          const i = document.createElement('button');
          (i.className = 'remove-file'),
            (i.innerHTML = '×'),
            (i.onclick = () => n.remove()),
            n.appendChild(i),
            t.appendChild(n);
        });
    }));
}
export function initializePaperButtons() {
  const e = document.querySelectorAll('.paper-btn');
  e.forEach((t) => {
    t.addEventListener('click', () => {
      e.forEach((e) => e.classList.remove('active')), t.classList.add('active');
    });
  });
}
function updateSubmitButton() {
  const e = document.querySelector('.submit-btn'),
    t = document.querySelector('.next-question-btn');
  if (!e) return;
  t && t.disabled
    ? (e.classList.add('complete'), (e.disabled = !1))
    : (e.classList.remove('complete'), (e.disabled = !0));
}
function initializeSubmitButton() {
  const e = document.querySelector('.submit-btn');
  e &&
    e.addEventListener('click', async () => {
      e.classList.contains('complete') &&
        !e.disabled &&
        (await sendToWebhook());
    });
}
