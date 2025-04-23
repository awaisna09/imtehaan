import { supabase } from './supabase-config.js';

// Global variables to track question sets
let questionSets = [];
let currentSetIndex = -1;
let currentQuestionIndex = 0;
let questions = [];
let currentSessionId = null; // Initialize session ID variable

// Function to generate a unique session ID
function generateSessionId() {
  return (
    'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
  );
}

// Initialize session ID if not exists
function initializeSession() {
  if (!currentSessionId) {
    currentSessionId = generateSessionId();
    console.log('New session initialized:', currentSessionId);
  }
  return currentSessionId;
}

// Add chat history storage
let chatHistory = [];

// Add answered questions tracking
let answeredQuestions = new Set();

// Add webhook URL constant
const WEBHOOK_URL =
  'https://imtehanh.app.n8n.cloud/webhook/ed194d37-5e64-4729-b6cd-93961bf48d2a/chat';
const CORS_PROXY = 'https://cors-anywhere.herokuapp.com/';

// Function to get all content from right-side box
function getRightSideBoxContent() {
  const rightSideBox = document.querySelector('.right-side-box');
  if (!rightSideBox) return [];

  const chatMessages = rightSideBox.querySelector('.chat-messages');
  if (!chatMessages) return [];

  const messages = [];
  chatMessages.childNodes.forEach((node) => {
    if (node.classList && node.classList.contains('chat-message')) {
      const messageType = node.classList.contains('system-message')
        ? 'system'
        : 'user';
      messages.push({
        type: messageType,
        content: node.textContent,
      });
    }
  });

  return messages;
}

// Function to format chat messages for webhook
function formatChatMessagesForWebhook() {
  // Ensure session ID exists
  if (!currentSessionId) {
    currentSessionId = generateSessionId();
    console.log('Generated new session ID:', currentSessionId);
  }

  const rightSideContent = getRightSideBoxContent();

  // Combine all messages into a single chat input
  const chatInput = rightSideContent
    .filter((msg) => msg.type !== 'separator')
    .map(
      (msg) =>
        `${msg.type === 'system' ? 'Question: ' : 'Answer: '}${msg.content}`
    )
    .join('\n\n');

  const formattedData = {
    sessionId: currentSessionId,
    chatInput: chatInput, // Added chatInput field
    question_data: questions.map((question, index) => ({
      question_number: index + 1,
      marks: question.marks,
      statement: question.statement,
      messages: rightSideContent.filter((msg, i) => {
        const prevSeparators = rightSideContent
          .slice(0, i)
          .filter((m) => m.type === 'separator').length;
        return prevSeparators === index;
      }),
    })),
    total_questions: questions.length,
    total_messages: rightSideContent.length,
    metadata: {
      user_agent: navigator.userAgent,
    },
  };

  console.log('Formatted data with session ID:', currentSessionId);
  return formattedData;
}

// Function to send messages to webhook
async function sendToWebhook() {
  // Show loading state on submit button
  const submitBtn = document.querySelector('.submit-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';
  }

  try {
    const formattedData = formatChatMessagesForWebhook();

    // Log the request
    console.log('Sending webhook request:', {
      url: WEBHOOK_URL,
      data: formattedData,
    });

    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      mode: 'cors',
      credentials: 'omit',
      body: JSON.stringify(formattedData),
    });

    if (!response.ok) {
      let errorText;
      try {
        const errorData = await response.text();
        errorText = errorData;
      } catch (e) {
        errorText = 'No error details available';
      }
      throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }

    // Show success state
    if (submitBtn) {
      submitBtn.textContent = 'Submitted!';
      submitBtn.style.background = '#4CAF50';
    }

    // Only redirect to score page on successful submission
    window.location.href = 'score.html';
  } catch (error) {
    console.error('Error sending to webhook:', error);

    // Show error state on button
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Failed - Try Again';
      submitBtn.style.background = '#f44336';

      // Add error details to console
      console.log('Webhook request failed with:', {
        url: WEBHOOK_URL,
        error: error.message,
        details: error.stack,
      });
    }

    // Reset button state after delay
    setTimeout(() => {
      if (submitBtn) {
        submitBtn.textContent = 'Submit';
        submitBtn.style.background = '#00C46F';
      }
    }, 3000);

    throw error;
  }
}

// Update initialize function to ensure session is created
export async function initializePaperPage() {
  console.log('Initializing paper page...');

  // Generate new session ID first
  currentSessionId = generateSessionId();
  console.log('New session initialized:', currentSessionId);

  // Reset global variables
  questionSets = [];
  currentSetIndex = -1;
  currentQuestionIndex = 0;
  questions = [];
  chatHistory = [];

  // Initialize UI components
  initializeWelcomeMessage();
  initializeChatBox();
  initializeNotesPopup();
  initializePaperNavigation();
  initializeGuidelinesPopup();
  initializeChatInput();
  initializeFileInput();
  initializePaperButtons();
  initializeSubmitButton();

  // Fetch and display questions
  await fetchQuestions();
  updateNavigationButtons();
}

// Welcome message animation
function initializeWelcomeMessage() {
  const welcomeMessage = document.querySelector('.welcome-message');
  if (welcomeMessage) {
    setTimeout(() => {
      welcomeMessage.classList.add('show');
      setTimeout(() => {
        welcomeMessage.classList.remove('show');
        setTimeout(() => {
          welcomeMessage.remove();
        }, 800);
      }, 2500);
    }, 500);
  }
}

// Fetch questions from Supabase
async function fetchQuestions() {
  try {
    console.log('Fetching questions...');
    answeredQuestions.clear(); // Reset answered questions
    updateSubmitButton(); // Update submit button state

    const questionsList = document.querySelector('.questions-list');
    if (!questionsList) {
      console.error('Questions list element not found');
      return;
    }

    // Show loading state
    questionsList.innerHTML =
      '<div class="loading-indicator">Loading questions...</div>';

    // First, get the total count of questions
    const { count, error: countError } = await supabase
      .from('all_questions')
      .select('question_id', { count: 'exact' });

    if (countError) {
      console.error('Error getting question count:', countError);
      return;
    }

    console.log('Total questions in database:', count);

    const totalQuestions = count;
    let validQuestions = [];
    let attempts = 0;
    const maxAttempts = 10;
    const targetMarks = 100;
    const marksTolerance = 5;

    while (attempts < maxAttempts) {
      attempts++;
      console.log(`Attempt ${attempts} to fetch questions`);

      const randomIndices = new Set();
      while (randomIndices.size < 50) {
        const randomIndex = Math.floor(Math.random() * totalQuestions) + 1;
        randomIndices.add(randomIndex);
      }

      const { data, error } = await supabase
        .from('topical_questions')
        .select('question_id, marks, statement, chapter_id')
        .in('question_id', Array.from(randomIndices))
        .limit(50);

      if (error) {
        console.error('Error fetching questions:', error);
        continue;
      }

      if (!data || data.length === 0) {
        console.log('No data returned from query');
        continue;
      }

      // Filter valid questions and calculate total marks
      const newValidQuestions = data.filter((question) => {
        const marks = parseInt(question.marks);
        return !isNaN(marks) && marks > 0;
      });

      console.log(
        `Found ${newValidQuestions.length} valid questions in this batch`
      );

      // Add new questions while checking total marks
      let currentTotalMarks = validQuestions.reduce(
        (sum, q) => sum + parseInt(q.marks),
        0
      );

      for (const question of newValidQuestions) {
        const questionMarks = parseInt(question.marks);
        if (currentTotalMarks + questionMarks <= targetMarks + marksTolerance) {
          validQuestions.push(question);
          currentTotalMarks += questionMarks;
        }

        if (
          currentTotalMarks >= targetMarks - marksTolerance &&
          currentTotalMarks <= targetMarks + marksTolerance
        ) {
          break;
        }
      }

      // Remove duplicates
      validQuestions = validQuestions.filter(
        (question, index, self) =>
          index ===
          self.findIndex((q) => q.question_id === question.question_id)
      );

      // Check if we've reached our target marks within tolerance
      const totalMarks = validQuestions.reduce(
        (sum, q) => sum + parseInt(q.marks),
        0
      );
      console.log(`Current total marks: ${totalMarks}`);

      if (
        totalMarks >= targetMarks - marksTolerance &&
        totalMarks <= targetMarks + marksTolerance
      ) {
        break;
      }
    }

    const totalMarks = validQuestions.reduce(
      (sum, q) => sum + parseInt(q.marks),
      0
    );
    if (totalMarks < targetMarks - marksTolerance) {
      console.error(
        `Could not fetch enough questions to reach ${targetMarks} marks (current total: ${totalMarks})`
      );
      questionsList.innerHTML = `<div class="error-message">Could not fetch enough questions to reach ${targetMarks} marks (current total: ${totalMarks}). Please try again.</div>`;
      return;
    }

    // Sort questions by marks
    const sortedQuestions = validQuestions.sort((a, b) => {
      const marksA = parseInt(a.marks);
      const marksB = parseInt(b.marks);
      return marksA - marksB;
    });

    console.log(
      'Successfully fetched and sorted questions. Total marks:',
      totalMarks
    );
    displayQuestions(sortedQuestions);
  } catch (error) {
    console.error('Error in fetchQuestions:', error);
    const questionsList = document.querySelector('.questions-list');
    if (questionsList) {
      questionsList.innerHTML =
        '<div class="error-message">An error occurred. Please try again.</div>';
    }
  }
}

// Display questions in the UI
function displayQuestions(questionsList) {
  const questionsListElement = document.querySelector('.questions-list');
  const prevButton = document.querySelector('.prev-question-btn');
  const nextButton = document.querySelector('.next-question-btn');

  if (!questionsListElement) return;

  // Store questions globally
  questions = questionsList;
  currentQuestionIndex = 0;

  // Clear existing questions
  questionsListElement.innerHTML = '';

  // Display first question
  displayCurrentQuestion();

  // Update navigation buttons
  updateNavigationButtons();

  // Add event listeners for navigation
  if (prevButton) {
    prevButton.addEventListener('click', () => {
      if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        displayCurrentQuestion();
        updateNavigationButtons();
      }
    });
  }

  if (nextButton) {
    nextButton.addEventListener('click', () => {
      if (currentQuestionIndex < questions.length - 1) {
        currentQuestionIndex++;
        displayCurrentQuestion();
        updateNavigationButtons();
      }
    });
  }
}

function displayCurrentQuestion() {
  const questionsListElement = document.querySelector('.questions-list');
  const rightSideBox = document.querySelector('.right-side-box');

  if (
    !questionsListElement ||
    !questions[currentQuestionIndex] ||
    !rightSideBox
  )
    return;

  const question = questions[currentQuestionIndex];
  questionsListElement.innerHTML = '';

  const questionElement = document.createElement('div');
  questionElement.className = 'question-item';

  // Create the question header with marks
  const questionHeader = document.createElement('h3');
  const marks = parseInt(question.marks);
  questionHeader.textContent = `Question ${currentQuestionIndex + 1} [${marks} marks]`;
  questionElement.appendChild(questionHeader);

  // Create the question statement
  const statementPara = document.createElement('p');
  statementPara.textContent = question.statement;
  questionElement.appendChild(statementPara);

  questionsListElement.appendChild(questionElement);

  // Only initialize empty chat container if it doesn't exist
  if (!document.querySelector('.chat-container')) {
    rightSideBox.innerHTML = `
            <div class="chat-container">
                <div class="chat-messages"></div>
            </div>
        `;
  }
}

function displayChatHistory(includeQuestion = false) {
  const chatMessages = document.querySelector('.chat-messages');
  if (!chatMessages) return;

  // Clear existing messages
  chatMessages.innerHTML = '';

  // Only add the system message if includeQuestion is true
  if (includeQuestion) {
    const currentQuestion = questions[currentQuestionIndex];
    addChatMessage(
      'system',
      `Question ${currentQuestionIndex + 1} [${currentQuestion.marks} marks]:\n${currentQuestion.statement}`
    );
  }

  // Display stored messages for this question
  const questionHistory = chatHistory[currentQuestionIndex] || [];
  questionHistory.forEach((message) => {
    addChatMessage('user', message);
  });
}

function initializeChatBox() {
  const chatMessages = document.querySelector('.chat-messages');
  if (!chatMessages) return;

  // Add the current question as a system message
  const currentQuestion = questions[currentQuestionIndex];
  addChatMessage(
    'system',
    `Question ${currentQuestionIndex + 1} [${currentQuestion.marks} marks]:\n${currentQuestion.statement}`
  );
}

function addChatMessage(type, content) {
  const chatMessages = document.querySelector('.chat-messages');
  if (!chatMessages) return;

  const messageDiv = document.createElement('div');

  if (type === 'separator') {
    messageDiv.className = 'chat-separator';
    content = '─── Next Question ───'; // Shorter separator text
  } else {
    messageDiv.className = `chat-message ${type}-message`;
  }

  messageDiv.textContent = content;
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function updateNavigationButtons() {
  const prevButton = document.querySelector('.prev-question-btn');
  const nextButton = document.querySelector('.next-question-btn');

  if (prevButton) {
    prevButton.disabled = currentQuestionIndex === 0;
  }

  if (nextButton) {
    nextButton.disabled = currentQuestionIndex === questions.length - 1;
  }

  // Update submit button state whenever navigation buttons are updated
  updateSubmitButton();
}

// Notes popup functionality
function initializeNotesPopup() {
  const expandNotesBtn = document.querySelector('.expand-notes-btn');
  const notesPopup = document.querySelector('.notes-popup');
  const closePopupBtn = document.querySelector('.close-popup');
  const saveNotesBtn = document.querySelector('.save-notes-btn');
  const detailedNotes = document.querySelector('.detailed-notes');
  const quickNotes = document.querySelector('.quick-notes');

  if (
    !expandNotesBtn ||
    !notesPopup ||
    !closePopupBtn ||
    !saveNotesBtn ||
    !detailedNotes ||
    !quickNotes
  ) {
    console.error('Required notes elements not found');
    return;
  }

  expandNotesBtn.addEventListener('click', () => {
    notesPopup.classList.add('active');
    detailedNotes.value = quickNotes.value;
    detailedNotes.focus();
  });

  closePopupBtn.addEventListener('click', () => {
    notesPopup.classList.remove('active');
  });

  saveNotesBtn.addEventListener('click', () => {
    quickNotes.value = detailedNotes.value;
    notesPopup.classList.remove('active');
  });

  notesPopup.addEventListener('click', (e) => {
    if (e.target === notesPopup) {
      notesPopup.classList.remove('active');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && notesPopup.classList.contains('active')) {
      notesPopup.classList.remove('active');
    }
  });
}

// Initialize paper navigation
function initializePaperNavigation() {
  console.log('Initializing paper navigation...');

  const paperButtons = document.querySelectorAll('.paper-btn');
  const nextPaperBtn = document.querySelector('.nav-btn');

  // Handle paper type selection
  paperButtons.forEach((button) => {
    button.addEventListener('click', async function () {
      paperButtons.forEach((btn) => btn.classList.remove('active'));
      this.classList.add('active');
      currentQuestionIndex = 0;
      chatHistory = []; // Reset chat history for new paper

      // Clean the right-side box
      const rightSideBox = document.querySelector('.right-side-box');
      if (rightSideBox) {
        rightSideBox.innerHTML = `
                    <h3>Answer Area</h3>
                    <p>Type your answer in the input box below</p>
                `;
      }

      await fetchQuestions();
    });
  });

  // Handle Next Paper button
  if (nextPaperBtn) {
    nextPaperBtn.addEventListener('click', async function () {
      currentQuestionIndex = 0;
      chatHistory = []; // Reset chat history for new paper

      // Clean the right-side box
      const rightSideBox = document.querySelector('.right-side-box');
      if (rightSideBox) {
        rightSideBox.innerHTML = `
                    <h3>Answer Area</h3>
                    <p>Type your answer in the input box below</p>
                `;
      }

      await fetchQuestions();
    });
  }

  // Initialize navigation buttons
  const prevButton = document.querySelector('.prev-question-btn');
  const nextButton = document.querySelector('.next-question-btn');

  if (prevButton) {
    prevButton.addEventListener('click', () => {
      if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        displayCurrentQuestion();
        updateNavigationButtons();
      }
    });
  }

  if (nextButton) {
    nextButton.addEventListener('click', () => {
      if (currentQuestionIndex < questions.length - 1) {
        currentQuestionIndex++;
        displayCurrentQuestion();
        updateNavigationButtons();
      }
    });
  }
}

// Guidelines popup functionality
function initializeGuidelinesPopup() {
  const showGuidelinesBtn = document.querySelector('.show-guidelines-btn');
  const guidelinesPopup = document.querySelector('.guidelines-popup');
  const closeGuidelinesBtn = document.querySelector('.close-guidelines');

  if (!showGuidelinesBtn || !guidelinesPopup || !closeGuidelinesBtn) {
    console.error('Required guidelines elements not found');
    return;
  }

  showGuidelinesBtn.addEventListener('click', () => {
    guidelinesPopup.classList.add('active');
  });

  closeGuidelinesBtn.addEventListener('click', () => {
    guidelinesPopup.classList.remove('active');
  });

  guidelinesPopup.addEventListener('click', (e) => {
    if (e.target === guidelinesPopup) {
      guidelinesPopup.classList.remove('active');
    }
  });
}

// Initialize chat input functionality
function initializeChatInput() {
  const messageInput = document.querySelector('.message-input');
  const sendBtn = document.getElementById('send-button');
  const fileInput = document.getElementById('file-input');
  const filePreview = document.querySelector('.file-preview');
  const rightSideBox = document.querySelector('.right-side-box');

  if (
    !messageInput ||
    !sendBtn ||
    !fileInput ||
    !filePreview ||
    !rightSideBox
  ) {
    console.error('Required chat input elements not found');
    return;
  }

  // Prevent any default form submission behavior
  sendBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const message = messageInput.value.trim();

    if (message && questions[currentQuestionIndex]) {
      const chatMessages = document.querySelector('.chat-messages');
      if (chatMessages) {
        // If this is the first message for this question, show the question first
        if (
          !chatHistory[currentQuestionIndex] ||
          chatHistory[currentQuestionIndex].length === 0
        ) {
          const currentQuestion = questions[currentQuestionIndex];
          addChatMessage(
            'system',
            `Question ${currentQuestionIndex + 1} [${currentQuestion.marks} marks]:\n${currentQuestion.statement}`
          );
        }

        // Store message in history
        if (!chatHistory[currentQuestionIndex]) {
          chatHistory[currentQuestionIndex] = [];
        }
        chatHistory[currentQuestionIndex].push(message);

        // Add user message to chat display
        addChatMessage('user', message);
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }

      // Clear the input
      messageInput.value = '';

      // Move to next question if available
      if (currentQuestionIndex < questions.length - 1) {
        setTimeout(() => {
          // Add a separator before moving to next question
          addChatMessage('separator', '─── Next Question ───');

          currentQuestionIndex++;
          displayCurrentQuestion();
          updateNavigationButtons();
        }, 500);
      } else {
        // If this is the last question, update the submit button
        updateSubmitButton();
      }
    }
  });

  // Add Enter key support
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendBtn.click();
    }
  });

  fileInput.addEventListener('change', () => {
    console.log('Files selected:', fileInput.files);
  });
}

// Update the styles
const style = document.createElement('style');
style.textContent = `
    .right-side-box {
        padding: 0;
        display: flex;
        flex-direction: column;
        background: #2A2A2A;
        border-radius: 8px;
        overflow: hidden;
        height: 100%;
        min-height: 300px;
        position: relative;
        flex: 1;
    }

    .chat-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
    }

    .chat-messages {
        flex-grow: 1;
        overflow-y: auto;
        padding: 0.75rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        height: 100%;
        min-height: 0;
    }

    .chat-message {
        padding: 0.5rem 0.75rem;
        border-radius: 8px;
        max-width: 75%;
        white-space: pre-wrap;
        word-break: break-word;
        margin: 0;
    }

    .system-message {
        background: #363636;
        color: #fff;
        align-self: flex-start;
        border-bottom-left-radius: 4px;
        font-size: 0.85rem;
        line-height: 1.4;
    }

    .user-message {
        background: #00C46F;
        color: #fff;
        align-self: flex-end;
        border-bottom-right-radius: 4px;
        font-size: 0.85rem;
        line-height: 1.4;
    }

    .chat-separator {
        width: 100%;
        text-align: center;
        color: rgba(255, 255, 255, 0.5);
        font-size: 0.75rem;
        margin: 0.25rem 0;
        white-space: pre;
        flex-shrink: 0;
        padding: 0.25rem 0;
    }

    /* Custom scrollbar for chat messages */
    .chat-messages::-webkit-scrollbar {
        width: 4px;
    }

    .chat-messages::-webkit-scrollbar-track {
        background: transparent;
    }

    .chat-messages::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 2px;
    }

    .chat-messages::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.3);
    }

    .submit-btn {
        background: #666666;
        color: #fff;
        border: none;
        border-radius: 8px;
        padding: 0.75rem 1.5rem;
        font-size: 1rem;
        cursor: not-allowed;
        opacity: 0.8;
        transition: all 0.3s ease;
        min-width: 120px;
    }

    .submit-btn.complete {
        background: #00C46F;
        cursor: pointer;
        opacity: 1;
    }

    .submit-btn:disabled {
        cursor: not-allowed;
    }

    .submit-btn.error {
        background: #f44336;
    }
`;

// Add styles for the parent container to ensure proper sizing
const parentStyles = document.createElement('style');
parentStyles.textContent = `
    .content-container {
        display: flex;
        height: 100%;
        min-height: 0;
    }

    .questions-container {
        flex: 1;
        overflow-y: auto;
        padding-right: 0.75rem;
    }

    .right-side-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-height: 0;
    }
`;
document.head.appendChild(style);
document.head.appendChild(parentStyles);

// File input functionality
export function initializeFileInput() {
  const fileInput = document.getElementById('file-input');
  const filePreview = document.querySelector('.file-preview');
  const attachBtn = document.querySelector('.attach-btn');

  if (!fileInput || !filePreview || !attachBtn) {
    console.error('Missing elements for file input');
    return;
  }

  attachBtn.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    filePreview.innerHTML = '';
    Array.from(fileInput.files).forEach((file) => {
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
      fileInfo.innerHTML = `
                <span class="file-name">${file.name}</span>
                <span class="file-size">${(file.size / 1024).toFixed(1)} KB</span>
            `;
      fileItem.appendChild(fileInfo);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-file';
      removeBtn.innerHTML = '×';
      removeBtn.onclick = () => fileItem.remove();
      fileItem.appendChild(removeBtn);

      filePreview.appendChild(fileItem);
    });
  });
}

// Paper button functionality
export function initializePaperButtons() {
  const paperBtns = document.querySelectorAll('.paper-btn');
  paperBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      paperBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

function updateSubmitButton() {
  const submitBtn = document.querySelector('.submit-btn');
  const nextButton = document.querySelector('.next-question-btn');
  if (!submitBtn) return;

  // Check if we're at the last question (next button is disabled)
  const isLastQuestion = nextButton && nextButton.disabled;

  if (isLastQuestion) {
    submitBtn.classList.add('complete');
    submitBtn.disabled = false;
  } else {
    submitBtn.classList.remove('complete');
    submitBtn.disabled = true;
  }
}

// Initialize submit button click handler
function initializeSubmitButton() {
  const submitBtn = document.querySelector('.submit-btn');
  if (!submitBtn) return;

  submitBtn.addEventListener('click', async () => {
    if (submitBtn.classList.contains('complete') && !submitBtn.disabled) {
      await sendToWebhook();
    }
  });
}
