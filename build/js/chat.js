const supabaseUrl = 'https://mwhtclxabiraowerfmkz.supabase.co',
  supabaseKey =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13aHRjbHhhYmlyYW93ZXJmbWt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA3MDY2MjksImV4cCI6MjA1NjI4MjYyOX0.jwnn4sR78xx08p-8V8d-gSU9EHCjPPnT376Vt9KDO3Q',
  supabase = window.supabase.createClient(supabaseUrl, supabaseKey),
  DEFAULT_WEBHOOK_URL =
    'https://imtehanh.app.n8n.cloud/webhook/35c57195-69e7-44ff-bebf-7c021c965089/chat',
  QUESTIONS_WEBHOOK_URL =
    'https://imtehanh.app.n8n.cloud/webhook/62085562-ce3e-4f5a-bae0-5e52e83b3eb8/chat';
function getWebhookUrl() {
  return window.location.pathname.includes('questions.html')
    ? QUESTIONS_WEBHOOK_URL
    : DEFAULT_WEBHOOK_URL;
}
const MAX_RETRIES = 3,
  RETRY_DELAY = 1e3,
  REQUEST_TIMEOUT = 3e4;
let chatContainer,
  messageInput,
  sendButton,
  attachButton,
  fileInput,
  filePreview,
  sessionId;
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (e) {
    const t = (16 * Math.random()) | 0;
    return ('x' === e ? t : (3 & t) | 8).toString(16);
  });
}
function isValidWebhookUrl(e) {
  try {
    const t = new URL(e);
    return 'https:' === t.protocol && t.hostname.includes('n8n.cloud');
  } catch (e) {
    return !1;
  }
}
async function getOrCreateSessionId() {
  try {
    const {
      data: { user: e },
      error: t,
    } = await supabase.auth.getUser();
    if (t) throw new Error('Failed to get user information');
    if (!e) {
      return generateUUID();
    }
    const { data: n, error: a } = await supabase
      .from('student_sessions')
      .select('id')
      .eq('student_id', e.id)
      .is('ended_at', null)
      .order('started_at', { ascending: !1 })
      .limit(1);
    if (a);
    else if (n && n.length > 0) return n[0].id;
    const { data: o, error: r } = await supabase
      .from('student_sessions')
      .insert([
        {
          student_id: e.id,
          topic_id: 1,
          started_at: new Date().toISOString(),
          last_active: new Date().toISOString(),
        },
      ])
      .select();
    if (r) throw new Error('Failed to create session');
    if (o && o.length > 0) return o[0].id;
    throw new Error('No session data returned');
  } catch (e) {
    return generateUUID();
  }
}
async function updateSessionActivity() {
  try {
    if (!sessionId) return;
    const {
      data: { user: e },
    } = await supabase.auth.getUser();
    if (!e) return;
    await supabase
      .from('student_sessions')
      .update({ last_active: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('student_id', e.id);
  } catch (e) {}
}
async function endSession() {
  try {
    if (!sessionId) return;
    const {
      data: { user: e },
    } = await supabase.auth.getUser();
    if (!e) return;
    await supabase
      .from('student_sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('student_id', e.id);
  } catch (e) {}
}
export async function testWebhook() {
  sessionId || (sessionId = await getOrCreateSessionId());
  try {
    const e = { sessionId, chatInput: 'Connection test' },
      t = await fetch(getWebhookUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(e),
        signal: AbortSignal.timeout(3e4),
      });
    if (!t.ok) throw new Error(`Server responded with status ${t.status}`);
    await t.text();
    return (
      document.querySelector('.chat-message') ||
        addMessageToChat(
          'Welcome! Im your AI tutor for IGCSE Business Studies, trained to align with the examiners requirements. I can help with case studies, examples, and detailed lessons, providing clear explanations and real-world examples. Im also here to assist with practice questions, mark schemes, and exam strategies. Let me know what topic youd like to explore!',
          'bot'
        ),
      !0
    );
  } catch (e) {
    let t;
    return (
      (t =
        'AbortError' === e.name
          ? '⚠️ Connection timed out. Please check your internet connection.'
          : navigator.onLine
            ? `⚠️ Connection error: ${e.message}`
            : '⚠️ You appear to be offline. Please check your internet connection.'),
      addMessageToChat(t, 'bot'),
      !1
    );
  }
}
function addTestButton() {
  const e = document.createElement('button');
  (e.className = 'test-webhook-btn'),
    (e.textContent = 'Test Webhook'),
    (e.onclick = testWebhook);
  const t = document.querySelector('.chat-controls');
  t && t.appendChild(e);
}
export async function initializeLessonChat() {
  if (
    ((chatContainer = document.getElementById('chat-container')),
    (messageInput = document.getElementById('message-input')),
    (sendButton = document.getElementById('send-button')),
    !chatContainer || !messageInput || !sendButton)
  )
    return !1;
  try {
    sessionId = await getOrCreateSessionId();
  } catch (e) {
    return !1;
  }
  await testWebhook();
  return (
    messageInput.addEventListener('keypress', (e) => {
      'Enter' !== e.key ||
        e.shiftKey ||
        (e.preventDefault(), handleSendMessage());
    }),
    sendButton && sendButton.addEventListener('click', handleSendMessage),
    !0
  );
}
export async function handleSendMessage() {
  if (!messageInput || !chatContainer) return;
  const e = messageInput.value.trim();
  if (!e) return;
  sendButton && ((sendButton.disabled = !0), (sendButton.innerHTML = '⌛'));
  let t,
    n = 0;
  try {
    addMessageToChat(e, 'user'),
      (t = document.createElement('div')),
      (t.className = 'chat-message bot-message'),
      (t.innerHTML =
        '\n            <div class="message-content">\n                <div class="thinking-animation">\n                    <span>.</span><span>.</span><span>.</span>\n                </div>\n            </div>\n        '),
      chatContainer.appendChild(t),
      (chatContainer.scrollTop = chatContainer.scrollHeight),
      sessionId || (sessionId = await getOrCreateSessionId());
    const a = { sessionId, chatInput: e };
    for (; n < 3; )
      try {
        const e = await fetch(getWebhookUrl(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(a),
          signal: AbortSignal.timeout(3e4),
        });
        if (!e.ok) throw new Error(`Server responded with status ${e.status}`);
        const n = await e.text();
        let o;
        try {
          if (!n || !n.trim()) throw new Error('Empty response from server');
          {
            const e = JSON.parse(n);
            if (!e.output) throw new Error('No output field in response');
            (o = e.output), (o = o.replace(/\r\n/g, '\n'));
          }
        } catch (e) {
          o =
            "Sorry, I couldn't process the response properly. Please try again.";
        }
        return (
          t.remove(),
          addMessageToChat(o, 'bot'),
          (messageInput.value = ''),
          void (await updateSessionActivity())
        );
      } catch (e) {
        if ((n++, n < 3)) {
          await new Promise((e) => setTimeout(e, 1e3));
          continue;
        }
        throw e;
      }
  } catch (e) {
    let n;
    t && t.remove(),
      (n =
        'AbortError' === e.name
          ? 'The request took too long to complete. Please try again.'
          : navigator.onLine
            ? `Error: ${e.message}`
            : 'You appear to be offline. Please check your internet connection.'),
      addMessageToChat(n, 'bot');
  } finally {
    sendButton && ((sendButton.disabled = !1), (sendButton.innerHTML = '➤'));
  }
}
function extractMarkdownTables(e) {
  const t = [],
    n = /(?:^|\n)([^\n]*)\n\|(.*)\|\n\|([-: |]+)\|\n((?:\|.*\|\n?)+)/g;
  let a;
  for (; null !== (a = n.exec(e)); ) {
    const e = a[1].trim(),
      n = a[2].trim(),
      o = a[3].trim(),
      r = a[4].trim(),
      s = n
        .split('|')
        .map((e) => e.trim())
        .filter((e) => '' !== e),
      i = o
        .split('|')
        .map((e) =>
          (e = e.trim()).startsWith(':') && e.endsWith(':')
            ? 'center'
            : e.endsWith(':')
              ? 'right'
              : 'left'
        )
        .filter((e) => e),
      c = r
        .split('\n')
        .map((e) =>
          e.trim()
            ? e
                .split('|')
                .map((e) => e.trim())
                .filter((e) => '' !== e)
            : null
        )
        .filter((e) => e && e.length > 0)
        .map((e) => {
          const t = {};
          return (
            s.forEach((n, a) => {
              if (a >= e.length) return void (t[n] = '');
              let o = e[a] || '';
              /^\([0-9,.-]+\)$/.test(o)
                ? ((o = o.replace(/[(),]/g, '')), (o = -parseFloat(o)))
                : /^[0-9,.]+$/.test(o) && (o = parseFloat(o.replace(/,/g, ''))),
                (t[n] = o);
            }),
            t
          );
        });
    t.push({ title: e, columns: s, alignments: i, rows: c });
  }
  return t;
}
function formatTableAsHTML(e) {
  let t = '<div class="markdown-table-container">';
  return (
    e.title &&
      e.title.length > 0 &&
      (t += `<div class="table-title">${e.title}</div>`),
    (t += '<table class="markdown-table">'),
    (t += '<thead><tr>'),
    e.columns.forEach((n, a) => {
      const o =
        e.alignments && a < e.alignments.length ? e.alignments[a] : 'left';
      t += `<th style="text-align: ${o}">${n}</th>`;
    }),
    (t += '</tr></thead>'),
    (t += '<tbody>'),
    e.rows.forEach((n) => {
      (t += '<tr>'),
        e.columns.forEach((a, o) => {
          const r = n[a],
            s = 'number' == typeof r,
            i = s ? 'numeric-cell' : 'text-cell',
            c =
              e.alignments && o < e.alignments.length
                ? e.alignments[o]
                : s
                  ? 'right'
                  : 'left';
          let l;
          s
            ? (l =
                r < 0
                  ? `(${Math.abs(r).toLocaleString()})`
                  : r.toLocaleString())
            : ((l = r || ''),
              (l = l
                .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                .replace(/\*([^*]+)\*/g, '<em>$1</em>')
                .replace(/`([^`]+)`/g, '<code>$1</code>'))),
            (t += `<td class="${i}" style="text-align: ${c}">${l}</td>`);
        }),
        (t += '</tr>');
    }),
    (t += '</tbody></table></div>'),
    (t +=
      '\n    <style>\n    .markdown-table-container {\n        margin: 15px 0;\n        overflow-x: auto;\n    }\n    .markdown-table {\n        border-collapse: collapse;\n        width: 100%;\n        margin: 8px 0;\n        font-size: 0.9em;\n    }\n    .markdown-table th {\n        background-color: #2a2a2a;\n        color: white;\n        font-weight: bold;\n        padding: 10px;\n        border: 1px solid #444;\n    }\n    .markdown-table td {\n        padding: 8px 10px;\n        border: 1px solid #444;\n    }\n    .markdown-table tr:nth-child(even) {\n        background-color: #333;\n    }\n    .markdown-table tr:hover {\n        background-color: #3a3a3a;\n    }\n    .table-title {\n        font-weight: bold;\n        margin-bottom: 8px;\n        font-size: 1.1em;\n    }\n    .numeric-cell {\n        font-variant-numeric: tabular-nums;\n    }\n    </style>'),
    t
  );
}
function formatBoldText(e) {
  if ('undefined' == typeof marked)
    return (
      loadMarkedLibrary().then(() => {
        const t = formatBoldText(e),
          n = document.querySelector('.pending-format');
        n && ((n.innerHTML = t), n.classList.remove('pending-format'));
      }),
      '<div class="pending-format">Loading formatter...</div>'
    );
  marked.setOptions({ gfm: !0, breaks: !0, headerIds: !1, mangle: !1 });
  let t = e;
  (t = t.replace(/----+/g, ' ')),
    (t = t
      .replace(
        /\*\*"([^"]+)"\*\*/g,
        '<span style="color: #00C46F; font-weight: bold;">$1</span>'
      )
      .replace(
        /\*\*([^*\n]+)\*\*/g,
        '<span style="color: #00C46F; font-weight: bold;">$1</span>'
      ));
  try {
    const e = marked
      .parse(t)
      .replace(/<table>/g, '<table class="markdown-table">')
      .replace(
        /<table class="markdown-table">/g,
        '<div class="table-container"><table class="markdown-table">'
      )
      .replace(/<\/table>/g, '</table></div>');
    return (
      '\n        <style>\n        .table-container {\n            overflow-x: auto;\n            margin: 15px 0;\n        }\n        .markdown-table {\n            border-collapse: collapse;\n            width: 100%;\n            margin: 0;\n            font-size: 0.9em;\n        }\n        .markdown-table th {\n            background-color: #2a2a2a;\n            color: white;\n            font-weight: bold;\n            padding: 10px;\n            border: 1px solid #444;\n            text-align: left;\n        }\n        .markdown-table td {\n            padding: 8px 10px;\n            border: 1px solid #444;\n            text-align: left;\n        }\n        .markdown-table tr:nth-child(even) {\n            background-color: #333;\n        }\n        .markdown-table tr:hover {\n            background-color: #3a3a3a;\n        }\n        code {\n            background-color: #f0f0f0;\n            padding: 2px 4px;\n            border-radius: 3px;\n            font-family: monospace;\n            color: #333;\n        }\n        pre {\n            background-color: #2d2d2d;\n            padding: 16px;\n            border-radius: 4px;\n            overflow-x: auto;\n            color: #ccc;\n        }\n        pre code {\n            background-color: transparent;\n            padding: 0;\n            color: inherit;\n        }\n        </style>\n        ' +
      e
    );
  } catch (t) {
    return `<p>${e}</p>`;
  }
}
function addMessageToChat(e, t) {
  const n = document.getElementById('chat-container');
  if (!n) return;
  const a = document.createElement('div');
  a.className = `chat-message ${t}-message`;
  const o = document.createElement('div');
  o.className = 'message-content';
  try {
    const t = formatBoldText(e);
    o.innerHTML = t;
  } catch (t) {
    o.textContent = e;
  }
  a.appendChild(o),
    n.appendChild(a),
    a.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function loadMarkedLibrary() {
  return new Promise((e, t) => {
    if ('undefined' != typeof marked) return void e();
    const n = document.createElement('script');
    (n.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js'),
      (n.onload = e),
      (n.onerror = t),
      document.head.appendChild(n);
  });
}
function handleFileSelection(e) {
  const t = Array.from(e.target.files);
  (filePreview.innerHTML = ''),
    t.forEach((e) => {
      const t = document.createElement('div');
      if (((t.className = 'file-item'), e.type.startsWith('image/'))) {
        const n = document.createElement('img');
        (n.src = URL.createObjectURL(e)),
          (n.className = 'file-thumbnail'),
          t.appendChild(n);
      } else {
        const e = document.createElement('span');
        (e.className = 'file-icon'), (e.textContent = '📄'), t.appendChild(e);
      }
      const n = document.createElement('div');
      (n.className = 'file-info'), (n.textContent = e.name);
      const a = document.createElement('button');
      (a.className = 'remove-file'),
        (a.textContent = '×'),
        (a.onclick = () => t.remove()),
        t.appendChild(n),
        t.appendChild(a),
        filePreview.appendChild(t);
    });
}
function clearFilePreview() {
  filePreview &&
    ((filePreview.innerHTML = ''), fileInput && (fileInput.value = ''));
}
function showError(e) {
  if (!chatContainer) return;
  const t = document.createElement('div');
  (t.className = 'chat-error'),
    (t.textContent = e),
    chatContainer.appendChild(t),
    (chatContainer.scrollTop = chatContainer.scrollHeight),
    setTimeout(() => {
      t.parentNode === chatContainer && t.remove();
    }, 5e3);
}
function addAnswerBoxClickListeners() {
  document.querySelectorAll('.chat-message.bot-message').forEach((e) => {
    e.addEventListener('click', function () {
      const e = this.querySelector('.message-content');
      if (e) {
        const t = `Statement: ${e.textContent}\nQuestion: ${this.querySelector('.question-text').textContent}`;
        (messageInput.value = t), messageInput.focus();
      }
    });
  });
}
(async () => {
  await initializeLessonChat();
})();
