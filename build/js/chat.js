// Initialize Supabase client
const supabaseUrl = 'https://mwhtclxabiraowerfmkz.supabase.co';
const supabaseKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13aHRjbHhhYmlyYW93ZXJmbWt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA3MDY2MjksImV4cCI6MjA1NjI4MjYyOX0.jwnn4sR78xx08p-8V8d-gSU9EHCjPPnT376Vt9KDO3Q';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// Webhook URLs
const DEFAULT_WEBHOOK_URL =
  'https://imtehanh.app.n8n.cloud/webhook/35c57195-69e7-44ff-bebf-7c021c965089/chat';
const QUESTIONS_WEBHOOK_URL =
  'https://imtehanh.app.n8n.cloud/webhook/62085562-ce3e-4f5a-bae0-5e52e83b3eb8/chat';

// Get the appropriate webhook URL based on the current page
function getWebhookUrl() {
  return window.location.pathname.includes('questions.html')
    ? QUESTIONS_WEBHOOK_URL
    : DEFAULT_WEBHOOK_URL;
}

// Network settings
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // ms
const REQUEST_TIMEOUT = 30000; // Increased timeout to 30 seconds

// Chat container and input elements
let chatContainer;
let messageInput;
let sendButton;
let attachButton;
let fileInput;
let filePreview;
let sessionId;

// Generate UUID
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Validate webhook URL
function isValidWebhookUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return (
      parsedUrl.protocol === 'https:' &&
      parsedUrl.hostname.includes('n8n.cloud')
    );
  } catch (e) {
    console.error('Invalid webhook URL:', e);
    return false;
  }
}

// Get or create session ID from Supabase
async function getOrCreateSessionId() {
  try {
    console.log('Getting current user...');

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      console.error('Error getting user:', userError);
      throw new Error('Failed to get user information');
    }

    if (!user) {
      console.error('No user found');
      // For testing, generate a temporary session ID
      const tempId = generateUUID();
      console.log('Generated temporary session ID for anonymous user:', tempId);
      return tempId;
    }

    console.log('User found:', user.id);

    // Check for existing session
    const { data: existingSessions, error: queryError } = await supabase
      .from('student_sessions')
      .select('id')
      .eq('student_id', user.id)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1);

    if (queryError) {
      console.warn('Error querying sessions:', queryError);
    } else if (existingSessions && existingSessions.length > 0) {
      console.log('Found existing session:', existingSessions[0].id);
      return existingSessions[0].id;
    }

    // Create new session
    const { data: newSession, error: insertError } = await supabase
      .from('student_sessions')
      .insert([
        {
          student_id: user.id,
          topic_id: 1, // Default value
          started_at: new Date().toISOString(),
          last_active: new Date().toISOString(),
        },
      ])
      .select();

    if (insertError) {
      console.error('Failed to create session:', insertError);
      throw new Error('Failed to create session');
    }

    if (newSession && newSession.length > 0) {
      console.log('Created new session:', newSession[0].id);
      return newSession[0].id;
    }

    throw new Error('No session data returned');
  } catch (error) {
    console.error('Session creation error:', error);
    // Generate a fallback session ID
    const fallbackId = generateUUID();
    console.log('Using fallback session ID:', fallbackId);
    return fallbackId;
  }
}

// Update session activity
async function updateSessionActivity() {
  try {
    if (!sessionId) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('student_sessions')
      .update({
        last_active: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .eq('student_id', user.id);
  } catch (error) {
    console.error('Error updating session activity:', error);
  }
}

// End session when leaving the page
async function endSession() {
  try {
    if (!sessionId) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    await supabase
      .from('student_sessions')
      .update({
        ended_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .eq('student_id', user.id);
  } catch (error) {
    console.error('Error ending session:', error);
  }
}

// Test webhook connection
export async function testWebhook() {
  console.log('Testing webhook connection...');

  if (!sessionId) {
    sessionId = await getOrCreateSessionId();
  }

  try {
    const testMessage = 'Connection test';
    const payload = {
      sessionId: sessionId,
      chatInput: testMessage,
    };

    console.log('Sending test payload:', payload);

    const response = await fetch(getWebhookUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });

    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }

    const responseText = await response.text();
    console.log('Webhook test response:', responseText);

    // Add welcome message only if it hasn't been added yet
    if (!document.querySelector('.chat-message')) {
      addMessageToChat(
        'Welcome! Im your AI tutor for IGCSE Business Studies, trained to align with the examiners requirements. I can help with case studies, examples, and detailed lessons, providing clear explanations and real-world examples. Im also here to assist with practice questions, mark schemes, and exam strategies. Let me know what topic youd like to explore!',
        'bot'
      );
    }

    return true;
  } catch (error) {
    console.error('Webhook test failed:', error);

    let errorMessage;
    if (error.name === 'AbortError') {
      errorMessage =
        '⚠️ Connection timed out. Please check your internet connection.';
    } else if (!navigator.onLine) {
      errorMessage =
        '⚠️ You appear to be offline. Please check your internet connection.';
    } else {
      errorMessage = `⚠️ Connection error: ${error.message}`;
    }

    addMessageToChat(errorMessage, 'bot');
    return false;
  }
}

// Add test button to chat interface
function addTestButton() {
  const testButton = document.createElement('button');
  testButton.className = 'test-webhook-btn';
  testButton.textContent = 'Test Webhook';
  testButton.onclick = testWebhook;

  const chatControls = document.querySelector('.chat-controls');
  if (chatControls) {
    chatControls.appendChild(testButton);
  }
}

// Initialize chat functionality for lessons
export async function initializeLessonChat() {
  console.log('Initializing lesson chat...');

  // Select DOM elements
  chatContainer = document.getElementById('chat-container');
  messageInput = document.getElementById('message-input');
  sendButton = document.getElementById('send-button');

  if (!chatContainer || !messageInput || !sendButton) {
    console.error('Critical DOM elements not found for lesson chat');
    return false;
  }

  // Get session ID
  try {
    sessionId = await getOrCreateSessionId();
    console.log('Lesson chat session established:', sessionId);
  } catch (error) {
    console.error('Failed to establish lesson chat session:', error);
    return false;
  }

  // Test webhook connection and show appropriate messages
  const connectionSuccessful = await testWebhook();
  if (connectionSuccessful) {
    console.log('Lesson chat connection established');
  }

  // Set up message input handlers
  messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  if (sendButton) {
    sendButton.addEventListener('click', handleSendMessage);
  }

  console.log('Lesson chat initialized successfully');
  return true;
}

// Handle sending messages
export async function handleSendMessage() {
  console.log('handleSendMessage called');

  if (!messageInput || !chatContainer) {
    console.error('Critical elements missing');
    return;
  }

  const chatInput = messageInput.value.trim();
  if (!chatInput) return;

  console.log('Processing message:', chatInput);

  if (sendButton) {
    sendButton.disabled = true;
    sendButton.innerHTML = '⌛';
  }

  let retryCount = 0;
  let thinkingMessage;

  try {
    // Add user message to chat
    addMessageToChat(chatInput, 'user');

    // Add thinking message
    thinkingMessage = document.createElement('div');
    thinkingMessage.className = 'chat-message bot-message';
    thinkingMessage.innerHTML = `
            <div class="message-content">
                <div class="thinking-animation">
                    <span>.</span><span>.</span><span>.</span>
                </div>
            </div>
        `;
    chatContainer.appendChild(thinkingMessage);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // Ensure session ID exists
    if (!sessionId) {
      sessionId = await getOrCreateSessionId();
    }

    // Prepare payload
    const payload = {
      sessionId: sessionId,
      chatInput: chatInput,
    };

    console.log('Sending payload:', payload);

    while (retryCount < MAX_RETRIES) {
      try {
        // Send message to webhook using the appropriate URL
        const response = await fetch(getWebhookUrl(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT),
        });

        if (!response.ok) {
          throw new Error(`Server responded with status ${response.status}`);
        }

        const responseText = await response.text();
        console.log('Webhook response:', responseText);

        // Process response
        let message;
        try {
          if (responseText && responseText.trim()) {
            const responseData = JSON.parse(responseText);
            // Always look for the output field
            if (responseData.output) {
              message = responseData.output;

              // Special processing for "---" in messages (debug)
              console.log('Before special processing:', message);

              // Make sure the line break sequence is consistent
              message = message.replace(/\r\n/g, '\n');

              console.log('After special processing:', message);
            } else {
              throw new Error('No output field in response');
            }
          } else {
            throw new Error('Empty response from server');
          }
        } catch (e) {
          console.error('Error processing response:', e);
          message =
            "Sorry, I couldn't process the response properly. Please try again.";
        }

        // Remove thinking message
        thinkingMessage.remove();

        // Add bot message
        addMessageToChat(message, 'bot');
        messageInput.value = '';

        // Update session activity
        await updateSessionActivity();

        return; // Success, exit the function
      } catch (error) {
        retryCount++;
        console.error(`Attempt ${retryCount} failed:`, error);

        if (retryCount < MAX_RETRIES) {
          // Wait before retrying
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
          continue;
        }

        throw error; // Re-throw if all retries failed
      }
    }
  } catch (error) {
    console.error('Error sending message:', error);

    // Remove thinking message
    if (thinkingMessage) {
      thinkingMessage.remove();
    }

    let errorMessage;
    if (error.name === 'AbortError') {
      errorMessage = 'The request took too long to complete. Please try again.';
    } else if (!navigator.onLine) {
      errorMessage =
        'You appear to be offline. Please check your internet connection.';
    } else {
      errorMessage = `Error: ${error.message}`;
    }

    addMessageToChat(errorMessage, 'bot');
  } finally {
    if (sendButton) {
      sendButton.disabled = false;
      sendButton.innerHTML = '➤';
    }
  }
}

// Function to extract and format markdown tables
function extractMarkdownTables(text) {
  const tables = [];
  // Improved GFM table pattern that's more flexible with whitespace and captures table structure better
  const tableRegex =
    /(?:^|\n)([^\n]*)\n\|(.*)\|\n\|([-: |]+)\|\n((?:\|.*\|\n?)+)/g;
  let match;

  while ((match = tableRegex.exec(text)) !== null) {
    const title = match[1].trim();
    const headerRow = match[2].trim();
    const alignmentRow = match[3].trim();
    const dataRows = match[4].trim();

    // Process headers - don't remove formatting yet
    const headers = headerRow
      .split('|')
      .map((h) => h.trim())
      .filter((h) => h !== '');

    // Process alignments
    const alignments = alignmentRow
      .split('|')
      .map((a) => {
        a = a.trim();
        if (a.startsWith(':') && a.endsWith(':')) return 'center';
        if (a.endsWith(':')) return 'right';
        return 'left';
      })
      .filter((a) => a);

    // Process rows - preserve exact content for now
    const rows = dataRows
      .split('\n')
      .map((row) => {
        if (!row.trim()) return null;
        return row
          .split('|')
          .map((c) => c.trim())
          .filter((c) => c !== '');
      })
      .filter((row) => row && row.length > 0);

    // Process each cell to clean formatting and convert numbers
    const processedRows = rows.map((row) => {
      const rowData = {};
      headers.forEach((header, index) => {
        if (index >= row.length) {
          rowData[header] = '';
          return;
        }

        let value = row[index] || '';

        // Convert numeric values
        if (/^\([0-9,.-]+\)$/.test(value)) {
          // Handle negative numbers in parentheses
          value = value.replace(/[(),]/g, '');
          value = -parseFloat(value);
        } else if (/^[0-9,.]+$/.test(value)) {
          // Handle positive numbers with commas
          value = parseFloat(value.replace(/,/g, ''));
        }

        rowData[header] = value;
      });
      return rowData;
    });

    tables.push({
      title: title,
      columns: headers,
      alignments: alignments,
      rows: processedRows,
    });
  }

  console.log('Extracted tables:', tables.length);
  return tables;
}

// Function to format tables as HTML
function formatTableAsHTML(table) {
  console.log(
    'Formatting table:',
    table.title,
    'with',
    table.columns.length,
    'columns'
  );

  let html = '<div class="markdown-table-container">';
  if (table.title && table.title.length > 0) {
    html += `<div class="table-title">${table.title}</div>`;
  }

  html += '<table class="markdown-table">';

  // Add headers
  html += '<thead><tr>';
  table.columns.forEach((header, index) => {
    const alignment =
      table.alignments && index < table.alignments.length
        ? table.alignments[index]
        : 'left';
    html += `<th style="text-align: ${alignment}">${header}</th>`;
  });
  html += '</tr></thead>';

  // Add rows
  html += '<tbody>';
  table.rows.forEach((row) => {
    html += '<tr>';
    table.columns.forEach((column, index) => {
      const value = row[column];
      const isNumeric = typeof value === 'number';
      const cellClass = isNumeric ? 'numeric-cell' : 'text-cell';
      const alignment =
        table.alignments && index < table.alignments.length
          ? table.alignments[index]
          : isNumeric
            ? 'right'
            : 'left';

      let formattedValue;
      if (isNumeric) {
        formattedValue =
          value < 0
            ? `(${Math.abs(value).toLocaleString()})`
            : value.toLocaleString();
      } else {
        formattedValue = value || '';

        // Process any Markdown formatting within the cell
        formattedValue = formattedValue
          .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
          .replace(/\*([^*]+)\*/g, '<em>$1</em>')
          .replace(/`([^`]+)`/g, '<code>$1</code>');
      }

      html += `<td class="${cellClass}" style="text-align: ${alignment}">${formattedValue}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table></div>';

  // Add table styles
  html += `
    <style>
    .markdown-table-container {
        margin: 15px 0;
        overflow-x: auto;
    }
    .markdown-table {
        border-collapse: collapse;
        width: 100%;
        margin: 8px 0;
        font-size: 0.9em;
    }
    .markdown-table th {
        background-color: #2a2a2a;
        color: white;
        font-weight: bold;
        padding: 10px;
        border: 1px solid #444;
    }
    .markdown-table td {
        padding: 8px 10px;
        border: 1px solid #444;
    }
    .markdown-table tr:nth-child(even) {
        background-color: #333;
    }
    .markdown-table tr:hover {
        background-color: #3a3a3a;
    }
    .table-title {
        font-weight: bold;
        margin-bottom: 8px;
        font-size: 1.1em;
    }
    .numeric-cell {
        font-variant-numeric: tabular-nums;
    }
    </style>`;

  return html;
}

// Update the formatBoldText function to handle tables
function formatBoldText(text) {
  console.log('Original text:', text);

  // First check if marked library is loaded
  if (typeof marked === 'undefined') {
    // Load marked library dynamically
    loadMarkedLibrary().then(() => {
      // Once loaded, re-run formatBoldText
      const formattedText = formatBoldText(text);
      // Update any pending message with the formatted content
      const pendingMsg = document.querySelector('.pending-format');
      if (pendingMsg) {
        pendingMsg.innerHTML = formattedText;
        pendingMsg.classList.remove('pending-format');
      }
    });
    // Return placeholder while loading
    return `<div class="pending-format">Loading formatter...</div>`;
  }

  // Configure marked options for GFM support
  marked.setOptions({
    gfm: true,
    breaks: true,
    headerIds: false,
    mangle: false,
  });

  // Preprocess text before passing to marked
  let processedText = text;

  // Handle multiple dashes (more than 3) as spaces
  processedText = processedText.replace(/----+/g, ' ');

  // Handle custom formatting for bold green text
  processedText = processedText
    .replace(
      /\*\*"([^"]+)"\*\*/g,
      '<span style="color: #00C46F; font-weight: bold;">$1</span>'
    )
    .replace(
      /\*\*([^*\n]+)\*\*/g,
      '<span style="color: #00C46F; font-weight: bold;">$1</span>'
    );

  // Use marked to parse the Markdown
  try {
    const html = marked.parse(processedText);

    // Apply additional custom styles
    const styledHtml = html
      // Add custom table styling
      .replace(/<table>/g, '<table class="markdown-table">')
      // Add responsive container for tables
      .replace(
        /<table class="markdown-table">/g,
        '<div class="table-container"><table class="markdown-table">'
      )
      .replace(/<\/table>/g, '</table></div>');

    console.log('Final formatted text:', styledHtml);

    // Add CSS styles for tables
    const tableStyles = `
        <style>
        .table-container {
            overflow-x: auto;
            margin: 15px 0;
        }
        .markdown-table {
            border-collapse: collapse;
            width: 100%;
            margin: 0;
            font-size: 0.9em;
        }
        .markdown-table th {
            background-color: #2a2a2a;
            color: white;
            font-weight: bold;
            padding: 10px;
            border: 1px solid #444;
            text-align: left;
        }
        .markdown-table td {
            padding: 8px 10px;
            border: 1px solid #444;
            text-align: left;
        }
        .markdown-table tr:nth-child(even) {
            background-color: #333;
        }
        .markdown-table tr:hover {
            background-color: #3a3a3a;
        }
        code {
            background-color: #f0f0f0;
            padding: 2px 4px;
            border-radius: 3px;
            font-family: monospace;
            color: #333;
        }
        pre {
            background-color: #2d2d2d;
            padding: 16px;
            border-radius: 4px;
            overflow-x: auto;
            color: #ccc;
        }
        pre code {
            background-color: transparent;
            padding: 0;
            color: inherit;
        }
        </style>
        `;

    return tableStyles + styledHtml;
  } catch (error) {
    console.error('Error parsing markdown:', error);
    // Fallback to basic formatting if marked fails
    return `<p>${text}</p>`;
  }
}

function addMessageToChat(message, sender) {
  const chatContainer = document.getElementById('chat-container');
  if (!chatContainer) {
    console.error('Chat container not found');
    return;
  }

  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message ${sender}-message`;

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';

  try {
    // Format the message content with proper error handling
    const formattedMessage = formatBoldText(message);
    contentDiv.innerHTML = formattedMessage;
  } catch (error) {
    console.error('Error formatting message:', error);
    contentDiv.textContent = message;
  }

  messageDiv.appendChild(contentDiv);
  chatContainer.appendChild(messageDiv);

  // Scroll to the start of the new message
  messageDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Load marked library dynamically
function loadMarkedLibrary() {
  return new Promise((resolve, reject) => {
    if (typeof marked !== 'undefined') {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Handle file selection
function handleFileSelection(event) {
  const files = Array.from(event.target.files);
  filePreview.innerHTML = '';

  files.forEach((file) => {
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';

    if (file.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.className = 'file-thumbnail';
      fileItem.appendChild(img);
    } else {
      const icon = document.createElement('span');
      icon.className = 'file-icon';
      icon.textContent = '📄';
      fileItem.appendChild(icon);
    }

    const fileInfo = document.createElement('div');
    fileInfo.className = 'file-info';
    fileInfo.textContent = file.name;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-file';
    removeBtn.textContent = '×';
    removeBtn.onclick = () => fileItem.remove();

    fileItem.appendChild(fileInfo);
    fileItem.appendChild(removeBtn);
    filePreview.appendChild(fileItem);
  });
}

// Clear file preview
function clearFilePreview() {
  if (!filePreview) return;
  filePreview.innerHTML = '';
  if (fileInput) fileInput.value = '';
}

// Show error message
function showError(message) {
  console.error(message);

  if (!chatContainer) {
    return;
  }

  const errorElement = document.createElement('div');
  errorElement.className = 'chat-error';
  errorElement.textContent = message;

  chatContainer.appendChild(errorElement);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  // Remove after delay
  setTimeout(() => {
    if (errorElement.parentNode === chatContainer) {
      errorElement.remove();
    }
  }, 5000);
}

// Add click event listener to answer box
function addAnswerBoxClickListeners() {
  const answerBoxes = document.querySelectorAll('.chat-message.bot-message');
  answerBoxes.forEach((box) => {
    box.addEventListener('click', function () {
      const messageContent = this.querySelector('.message-content');
      if (messageContent) {
        const messageText = messageContent.textContent;
        const questionText = this.querySelector('.question-text').textContent;
        const combinedText = `Statement: ${messageText}\nQuestion: ${questionText}`;
        messageInput.value = combinedText;
        messageInput.focus();
      }
    });
  });
}

// Initialize chat with new function name
(async () => {
  await initializeLessonChat();
})();
