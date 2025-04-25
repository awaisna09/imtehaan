// Initialize Supabase client
const supabaseUrl = 'https://mwhtclxabiraowerfmkz.supabase.co';
const supabaseKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13aHRjbHhhYmlyYW93ZXJmbWt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA3MDY2MjksImV4cCI6MjA1NjI4MjYyOX0.jwnn4sR78xx08p-8V8d-gSU9EHCjPPnT376Vt9KDO3Q';

// Webhook configuration
const QUESTIONS_WEBHOOK_URL =
  'https://imtehanh.app.n8n.cloud/webhook/62085562-ce3e-4f5a-bae0-5e52e83b3eb8/chat';
const REQUEST_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 3;

// Initialize Supabase client with error handling
let supabase;
try {
  supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
  console.log('Supabase client initialized successfully');
} catch (error) {
  console.error('Error initializing Supabase client:', error);
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

// Test webhook connection
async function testWebhook() {
  console.log('Testing webhook connection...');

  try {
    // Validate webhook URL first
    if (!isValidWebhookUrl(QUESTIONS_WEBHOOK_URL)) {
      console.error('Invalid webhook URL:', QUESTIONS_WEBHOOK_URL);
      return false;
    }

    const testMessage = 'Connection test';
    const payload = {
      sessionId: generateSessionId(),
      chatInput: testMessage,
      context: {
        test: true,
        timestamp: new Date().toISOString(),
      },
    };

    console.log('Sending test payload:', payload);

    const response = await fetch(QUESTIONS_WEBHOOK_URL, {
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

    // Try to parse as JSON first
    try {
      const responseData = await response.json();
      console.log('Webhook test response:', responseData);
      return true;
    } catch (e) {
      // If not JSON, try text
      const responseText = await response.text();
      console.log('Webhook test response (text):', responseText);
      return true;
    }
  } catch (error) {
    console.error('Webhook test failed:', error);
    return false;
  }
}

// Generate a unique session ID
function generateSessionId() {
  return (
    'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
  );
}

// State management
let allChapters = [];
let currentChapterIndex = -1;
let currentChapterId = null;
let currentQuestionIndex = 0;
let currentQuestions = [];

// DOM elements
let chapterNameElement;
let sidebarTopicsList;
let questionsBox;
let answerBox;
let noteText;
let detailedNotesText;

// Chat message handling
let currentSessionId = generateSessionId();

// Import notes functionality
import { initializeNotesPopup } from './notes.js';

// Function to initialize DOM elements
function initializeDOMElements() {
  console.log('Initializing DOM elements');

  // Get all required elements
  chapterNameElement = document.querySelector('.chapter-name');
  sidebarTopicsList = document.querySelector('.topics-list');
  questionsBox = document.querySelector('.questions-box');
  answerBox = document.querySelector('.answer-box');
  noteText = document.querySelector('.quick-notes');
  detailedNotesText = document.querySelector('.detailed-notes');

  // Log the found elements
  console.log('Found elements:', {
    chapterNameElement: !!chapterNameElement,
    sidebarTopicsList: !!sidebarTopicsList,
    questionsBox: !!questionsBox,
    answerBox: !!answerBox,
    noteText: !!noteText,
    detailedNotesText: !!detailedNotesText,
  });

  // Ensure questions box has the required structure
  if (questionsBox) {
    // Clear any existing loading/error messages
    questionsBox.innerHTML = '';

    const questionContent = document.createElement('div');
    questionContent.className = 'question-content';

    const statementElement = document.createElement('div');
    statementElement.className = 'question-statement';

    questionContent.appendChild(statementElement);
    questionsBox.appendChild(questionContent);
  }

  // Ensure answer box has the required structure
  if (answerBox) {
    // Clear any existing loading/error messages
    answerBox.innerHTML = '';

    const answerContent = document.createElement('div');
    answerContent.className = 'answer-content';
    answerBox.appendChild(answerContent);
  }

  // Initialize notes popup
  initializeNotesPopup();
}

// Function to load all chapters
async function loadChapters() {
  try {
    console.log('Starting loadChapters...');

    if (!supabase) {
      throw new Error('Supabase client not initialized');
    }

    initializeDOMElements();

    if (!chapterNameElement || !sidebarTopicsList) {
      console.error('Required DOM elements not found');
      return;
    }

    // Fetch unique chapter_id and chapter_name from topical_questions table
    console.log('Fetching chapters from topical_questions table...');
    const { data: questions, error } = await supabase
      .from('topical_questions')
      .select('chapter_id, chapter_name')
      .order('chapter_name');

    if (error) {
      console.error('Error fetching chapters:', error);
      throw error;
    }

    console.log('Raw chapter data:', questions);

    if (!questions || questions.length === 0) {
      console.error('No chapters found in database');
      throw new Error('No chapters found');
    }

    // Get unique chapters with their IDs
    const uniqueChapters = [];
    const seenIds = new Set();

    questions.forEach((q) => {
      if (!seenIds.has(q.chapter_id)) {
        seenIds.add(q.chapter_id);
        uniqueChapters.push({
          id: q.chapter_id,
          name: q.chapter_name,
        });
      }
    });

    console.log('Unique chapters:', uniqueChapters);

    // Sort chapters by name and ensure it's an array
    allChapters = Array.from(uniqueChapters).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    console.log('All chapters set:', allChapters);

    // Get URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const chapterName = urlParams.get('chapter');
    console.log('URL chapter name:', chapterName);

    // If we have a chapter name from URL, use it, otherwise use the first chapter
    if (chapterName) {
      currentChapterIndex = allChapters.findIndex(
        (ch) => ch.name === chapterName
      );
      if (currentChapterIndex === -1) {
        currentChapterIndex = 0;
      }
    } else {
      currentChapterIndex = 0;
    }

    console.log('Current chapter index:', currentChapterIndex);

    // Update navigation buttons state
    updateNavigationButtons();

    // Load the current chapter
    const currentChapter = allChapters[currentChapterIndex];
    currentChapterId = currentChapter.id;

    console.log('Setting chapter name to:', currentChapter.name);
    chapterNameElement.textContent = currentChapter.name;

    // Update URL with current chapter
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('chapter', currentChapter.name);
    window.history.pushState({}, '', newUrl);

    // Load questions for the current chapter
    await loadQuestionsByChapterId(currentChapterId);

    // Load the chapter list
    await loadRelatedTopics();
  } catch (error) {
    console.error('Error in loadChapters:', error);
    if (chapterNameElement) {
      chapterNameElement.textContent = 'Error loading chapters';
    }
    if (sidebarTopicsList) {
      sidebarTopicsList.innerHTML =
        '<div class="error-message">Error loading chapters</div>';
    }
  }
}

// Function to update navigation buttons state
function updateNavigationButtons() {
  const prevBtn = document.querySelector('.nav-btn.prev');
  const nextBtn = document.querySelector('.nav-btn.next');

  if (prevBtn) {
    prevBtn.disabled = currentQuestionIndex <= 0;
    prevBtn.style.opacity = currentQuestionIndex <= 0 ? '0.5' : '1';
    prevBtn.onclick = goToPreviousQuestion;
  }

  if (nextBtn) {
    nextBtn.disabled = currentQuestionIndex >= currentQuestions.length - 1;
    nextBtn.style.opacity =
      currentQuestionIndex >= currentQuestions.length - 1 ? '0.5' : '1';
    nextBtn.onclick = goToNextQuestion;
  }
}

// Function to navigate to next question
function goToNextQuestion() {
  if (currentQuestionIndex < currentQuestions.length - 1) {
    currentQuestionIndex++;
    displayQuestion(currentQuestionIndex);
    updateNavigationButtons();
  }
}

// Function to navigate to previous question
function goToPreviousQuestion() {
  if (currentQuestionIndex > 0) {
    currentQuestionIndex--;
    displayQuestion(currentQuestionIndex);
    updateNavigationButtons();
  }
}

// Function to display the current question
function displayQuestion(index) {
  console.log('Displaying question at index:', index);

  if (!currentQuestions || !currentQuestions[index]) {
    console.error('No question found at index:', index);
    return;
  }

  const question = currentQuestions[index];
  console.log('Question data:', question);

  // Get the statement and question text
  const statement = question.statement || 'No statement available';
  const questionText = question.questions || 'No question available';
  const marks = question.marks || 'N/A';

  // Initialize elements if they don't exist
  if (!questionsBox) {
    questionsBox = document.querySelector('.questions-box');
    if (!questionsBox) {
      console.error('Questions box not found in DOM');
      return;
    }
  }

  if (!answerBox) {
    answerBox = document.querySelector('.answer-box');
    if (!answerBox) {
      console.error('Answer box not found in DOM');
      return;
    }
  }

  // Ensure the questions box has the correct structure
  if (!questionsBox.querySelector('.question-content')) {
    questionsBox.innerHTML = `
            <div class="question-content">
                <div class="question-statement"></div>
            </div>
        `;
  }

  // Get or create question statement element
  const questionStatement = questionsBox.querySelector('.question-statement');
  if (questionStatement) {
    questionStatement.innerHTML = statement;
    questionStatement.style.color = '#fff';
    questionStatement.style.display = 'block';
  }

  // Handle answer content
  if (!answerBox.querySelector('.answer-content')) {
    answerBox.innerHTML = `
            <h3>Question</h3>
            <div class="answer-content"></div>
            <div class="marks-display">Marks: ${marks}</div>
        `;
  } else {
    const marksDisplay =
      answerBox.querySelector('.marks-display') ||
      document.createElement('div');
    marksDisplay.className = 'marks-display';
    marksDisplay.textContent = `Marks: ${marks}`;
    if (!answerBox.querySelector('.marks-display')) {
      answerBox.appendChild(marksDisplay);
    }
  }

  const answerContent = answerBox.querySelector('.answer-content');
  if (answerContent) {
    answerContent.textContent = questionText;
  }

  // Add click handler to answer box
  answerBox.addEventListener('click', () => {
    const messageInput = document.getElementById('message-input');
    if (messageInput) {
      // Combine statement and question text
      const combinedText = `Statement: ${statement}\nQuestion: ${questionText}`;
      messageInput.value = combinedText;
      messageInput.focus();
    }
  });

  // Ensure visibility
  questionsBox.style.display = 'block';
  answerBox.style.display = 'block';

  // Update navigation buttons
  updateNavigationButtons();
}

// Function to load questions for a chapter
async function loadQuestionsByChapterId(chapterId) {
  try {
    console.log('Loading questions for chapter_id:', chapterId);

    // Initialize DOM elements if not already done
    if (!questionsBox || !answerBox) {
      initializeDOMElements();
    }

    // Show loading state in a way that preserves structure
    const questionStatement = questionsBox.querySelector('.question-statement');
    if (questionStatement) {
      questionStatement.textContent = 'Loading questions...';
    }

    // Fetch questions
    const { data: questionData, error } = await supabase
      .from('topical_questions')
      .select('chapter_id, statement, questions, marks')
      .eq('chapter_id', chapterId);

    if (error) throw error;

    if (!questionData || questionData.length === 0) {
      throw new Error('No questions found');
    }

    // Store questions and display first one
    currentQuestions = questionData;
    currentQuestionIndex = 0;
    displayQuestion(0);
  } catch (error) {
    console.error('Error in loadQuestionsByChapterId:', error);
    const questionStatement = questionsBox.querySelector('.question-statement');
    if (questionStatement) {
      questionStatement.textContent = `Error: ${error.message}`;
    }
  } finally {
    updateNavigationButtons();
  }
}

// Function to load related topics
async function loadRelatedTopics() {
  try {
    console.log('Starting loadRelatedTopics...');
    console.log('Current chapters:', allChapters);

    if (!sidebarTopicsList) {
      console.error('sidebarTopicsList not found');
      return;
    }

    // Clear any existing topics
    sidebarTopicsList.innerHTML = '';
    console.log('Cleared existing topics');

    // Ensure allChapters is an array
    if (!Array.isArray(allChapters)) {
      console.error('allChapters is not an array:', allChapters);
      return;
    }

    // Display chapters and add click handlers
    allChapters.forEach((chapter, index) => {
      console.log('Creating element for chapter:', chapter);
      const chapterElement = document.createElement('div');
      chapterElement.className = 'topic-item';
      if (index === currentChapterIndex) {
        chapterElement.classList.add('active');
      }
      chapterElement.innerHTML = `
                <div class="topic-content">
                    <div class="topic-name">${chapter.name}</div>
                </div>
            `;

      // Add click handler
      chapterElement.addEventListener('click', () => {
        console.log('Chapter clicked:', chapter.name);

        // Remove active class from all chapter elements
        const chapterElements =
          sidebarTopicsList.querySelectorAll('.topic-item');
        chapterElements.forEach((c) => c.classList.remove('active'));

        // Add active class to clicked chapter
        chapterElement.classList.add('active');

        // Update the current chapter name display
        if (chapterNameElement) {
          chapterNameElement.textContent = chapter.name;
        }

        // Update URL with current chapter
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('chapter', chapter.name);
        window.history.pushState({}, '', newUrl);

        // Update current chapter index and ID
        currentChapterIndex = allChapters.findIndex((c) => c.id === chapter.id);
        currentChapterId = chapter.id;

        // Load questions for the new chapter
        loadQuestionsByChapterId(chapter.id);
      });

      sidebarTopicsList.appendChild(chapterElement);
    });

    console.log('Finished loading topics');
  } catch (error) {
    console.error('Error in loadRelatedTopics:', error);
    if (sidebarTopicsList) {
      sidebarTopicsList.innerHTML =
        '<div class="error-message">Error loading chapters</div>';
    }
  }
}

// Function to add message to chat with markdown support
function addMessageToChat(message, sender) {
  const chatContainer = document.getElementById('chat-container');
  if (!chatContainer) {
    console.error('Chat container not found');
    return;
  }

  const messageElement = document.createElement('div');
  messageElement.className = `chat-message ${sender}-message`;

  // Format the message with markdown
  const formattedMessage = formatMessageWithMarkdown(message);
  messageElement.innerHTML = formattedMessage;

  chatContainer.appendChild(messageElement);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Format message with markdown
function formatMessageWithMarkdown(text) {
  // Remove "output:" prefix and any leading/trailing whitespace
  text = text
    .toString()
    .replace(/^output:\s*/i, '')
    .trim();
  text = text.replace(/^output\s*:/i, '').trim();
  text = text.replace(/^output/i, '').trim();

  // Remove curly braces, backslashes, and double quotes
  text = text.replace(/[{}]/g, '');
  text = text.replace(/\\/g, '');
  text = text.replace(/"/g, '');

  // Handle bold text
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Handle italic text
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Handle code blocks
  text = text.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

  // Handle inline code
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Handle links
  text = text.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank">$1</a>'
  );

  // Handle lists
  text = text.replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>');
  text = text.replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>');

  // Handle line breaks
  text = text.replace(/\n/g, '<br>');

  // Handle tables
  const tableRegex = /\|([^\n]+)\|\n\|([^\n]+)\|\n((?:\|[^\n]+\|\n?)+)/g;
  text = text.replace(tableRegex, (match, header, separator, rows) => {
    const headers = header.split('|').filter((h) => h.trim());
    const cells = rows
      .split('\n')
      .map((row) => row.split('|').filter((cell) => cell.trim()));

    let tableHtml = '<table class="markdown-table"><thead><tr>';
    headers.forEach((h) => {
      tableHtml += `<th>${h.trim()}</th>`;
    });
    tableHtml += '</tr></thead><tbody>';

    cells.forEach((row) => {
      tableHtml += '<tr>';
      row.forEach((cell) => {
        tableHtml += `<td>${cell.trim()}</td>`;
      });
      tableHtml += '</tr>';
    });

    tableHtml += '</tbody></table>';
    return tableHtml;
  });

  return text;
}

// Handle sending messages to webhook
async function handleSendMessage(message) {
  if (!message || !message.trim()) {
    console.error('Empty message');
    return;
  }

  try {
    // Get current question data
    const currentQuestion = currentQuestions[currentQuestionIndex];
    if (!currentQuestion) {
      throw new Error('No current question found');
    }

    // Format the payload
    const payload = {
      sessionId: currentSessionId,
      chatInput: message,
      context: {
        chapter: {
          id: currentChapterId,
          name: allChapters[currentChapterIndex]?.name || 'Unknown',
        },
        question: {
          index: currentQuestionIndex,
          total: currentQuestions.length,
          statement: currentQuestion.statement,
          questions: currentQuestion.questions,
          marks: currentQuestion.marks,
        },
        timestamp: new Date().toISOString(),
      },
    };

    // Validate webhook URL
    if (!isValidWebhookUrl(QUESTIONS_WEBHOOK_URL)) {
      throw new Error('Invalid webhook URL');
    }

    // Send request to webhook
    const response = await fetch(QUESTIONS_WEBHOOK_URL, {
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

    // Handle response
    let responseData;
    try {
      const responseText = await response.text();
      console.log('Raw response:', responseText); // Debug log

      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        responseData = { message: responseText };
      }

      // Debug log the parsed data
      console.log('Parsed response data:', responseData);

      // Handle different response structures
      if (typeof responseData === 'string') {
        responseData = { message: responseData };
      }

      // Clean the response data
      const cleanResponse = (text) => {
        if (!text) return '';
        return text
          .toString()
          .replace(/^output:\s*/i, '')
          .replace(/^output\s*:/i, '')
          .replace(/^output/i, '')
          .trim();
      };

      // Clean all possible response fields
      if (responseData.message)
        responseData.message = cleanResponse(responseData.message);
      if (responseData.response)
        responseData.response = cleanResponse(responseData.response);
      if (responseData.text)
        responseData.text = cleanResponse(responseData.text);
      if (responseData.output)
        responseData.output = cleanResponse(responseData.output);

      // If the response is a string, clean it
      if (typeof responseData === 'string') {
        responseData = cleanResponse(responseData);
      }

      // Debug log the cleaned data
      console.log('Cleaned response data:', responseData);
    } catch (error) {
      console.error('Error processing response:', error);
      responseData = { message: 'Error processing response' };
    }

    // Display bot response
    const botResponse =
      responseData.message ||
      responseData.response ||
      responseData.text ||
      responseData.output ||
      JSON.stringify(responseData);
    addMessageToChat(botResponse, 'bot');
  } catch (error) {
    console.error('Error in handleSendMessage:', error);
    addMessageToChat(
      'Sorry, there was an error processing your message. Please try again.',
      'system'
    );
  }
}

// Initialize chat functionality
export function initializeChat() {
  const messageInput = document.getElementById('message-input');
  const sendButton = document.getElementById('send-button');
  const chatContainer = document.getElementById('chat-container');

  if (!messageInput || !sendButton || !chatContainer) {
    console.error('Chat elements not found');
    return;
  }

  // Clear any existing messages
  chatContainer.innerHTML = '';

  // Show initial welcome message
  const welcomeMessage = `
        <div class="welcome-message">
            <p>Lets start with questions</p>
            <p>You can:</p>
            <ul>
                <li>Ask questions about the current topic</li>
                <li>Get explanations for answers</li>
                <li>Request additional examples</li>
                <li>Ask for clarification on any concept</li>
            </ul>
        </div>
    `;
  chatContainer.innerHTML = welcomeMessage;

  // Handle send button click
  sendButton.addEventListener('click', async () => {
    const message = messageInput.value.trim();
    if (!message) return;

    // Disable input while processing
    messageInput.disabled = true;
    sendButton.disabled = true;

    // Add user message
    addMessageToChat(message, 'user');

    // Clear input
    messageInput.value = '';

    // Show typing indicator
    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'chat-message bot-message typing-indicator';
    typingIndicator.textContent = '...';
    chatContainer.appendChild(typingIndicator);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    try {
      // Send message to webhook
      await handleSendMessage(message);
    } catch (error) {
      console.error('Error in chat:', error);
      addMessageToChat(
        '⚠️ Sorry, I encountered an error. Please try again later.',
        'bot'
      );
    } finally {
      // Remove typing indicator
      typingIndicator.remove();

      // Re-enable input
      messageInput.disabled = false;
      sendButton.disabled = false;
      messageInput.focus();
    }
  });

  // Handle Enter key
  messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendButton.click();
    }
  });

  // Test webhook connection on initialization
  testWebhook()
    .then((success) => {
      if (success) {
        // Webhook is connected, no need to show additional message
        console.log('Webhook connection successful');
      } else {
        addMessageToChat(
          '⚠️ Connection error. Some features may not be available.',
          'bot'
        );
        console.error('Webhook connection test failed');
      }
    })
    .catch((error) => {
      console.error('Error testing webhook connection:', error);
      addMessageToChat(
        '⚠️ Unable to connect to the chat service. Please try again later.',
        'bot'
      );
    });
}

// Export functions
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
