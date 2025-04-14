// Initialize Supabase client
const supabaseUrl = 'https://mwhtclxabiraowerfmkz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13aHRjbHhhYmlyYW93ZXJmbWt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA3MDY2MjksImV4cCI6MjA1NjI4MjYyOX0.jwnn4sR78xx08p-8V8d-gSU9EHCjPPnT376Vt9KDO3Q';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// Webhook URL
const WEBHOOK_URL = 'https://imtehanh.app.n8n.cloud/webhook/35c57195-69e7-44ff-bebf-7c021c965089/chat';

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
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Validate webhook URL
function isValidWebhookUrl(url) {
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.protocol === 'https:' && parsedUrl.hostname.includes('n8n.cloud');
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
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
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
                    last_active: new Date().toISOString()
                }
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
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        await supabase
            .from('student_sessions')
            .update({ 
                last_active: new Date().toISOString()
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
        
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) return;
        
        await supabase
            .from('student_sessions')
            .update({ 
                ended_at: new Date().toISOString()
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
            chatInput: testMessage
        };
        
        console.log('Sending test payload:', payload);
        
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT)
        });
        
        if (!response.ok) {
            throw new Error(`Server responded with status ${response.status}`);
        }
        
        const responseText = await response.text();
        console.log('Webhook test response:', responseText);
        
        // Add success message to chat
        addMessageToChat('✅ Connected to server successfully!', 'bot');
        return true;
        
    } catch (error) {
        console.error('Webhook test failed:', error);
        
        let errorMessage;
        if (error.name === 'AbortError') {
            errorMessage = '⚠️ Connection timed out. Please check your internet connection.';
        } else if (!navigator.onLine) {
            errorMessage = '⚠️ You appear to be offline. Please check your internet connection.';
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

// Initialize chat functionality
export async function initializeChat() {
    console.log('Initializing chat...');
    
    // Select DOM elements
    chatContainer = document.getElementById('chat-container');
    messageInput = document.getElementById('message-input');
    sendButton = document.getElementById('send-button');
    
    if (!chatContainer || !messageInput || !sendButton) {
        console.error('Critical DOM elements not found');
        return false;
    }
    
    // Get session ID
    try {
        sessionId = await getOrCreateSessionId();
        console.log('Session established:', sessionId);
    } catch (error) {
        console.error('Failed to establish session:', error);
        return false;
    }
    
    // Add welcome message
    addMessageToChat('Hello! How can I help you today?', 'bot');
    
    console.log('Chat initialized successfully');
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
            <div class="message-timestamp">${new Date().toLocaleTimeString()}</div>
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
            chatInput: chatInput
        };
        
        console.log('Sending payload:', payload);
        
        while (retryCount < MAX_RETRIES) {
            try {
                // Send message to webhook
                const response = await fetch(WEBHOOK_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify(payload),
                    signal: AbortSignal.timeout(REQUEST_TIMEOUT)
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
                        } else {
                            throw new Error('No output field in response');
                        }
                    } else {
                        throw new Error('Empty response from server');
                    }
                } catch (e) {
                    console.error('Error processing response:', e);
                    message = "Sorry, I couldn't process the response properly. Please try again.";
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
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
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
            errorMessage = "The request took too long to complete. Please try again.";
        } else if (!navigator.onLine) {
            errorMessage = "You appear to be offline. Please check your internet connection.";
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
    const tableRegex = /(?:^|\n)([^\n]+)\n\|([^\n]+)\n\|([^\n]+)\n((?:\|[^\n]+\n)+)/g;
    let match;

    while ((match = tableRegex.exec(text)) !== null) {
        const title = match[1].trim().replace(/[#*]/g, '');
        const headers = match[2].split('|').map(h => h.trim().replace(/[#*]/g, '')).filter(h => h);
        const alignments = match[3].split('|').map(a => a.trim()).filter(a => a);
        const rows = match[4].trim().split('\n').map(row => {
            const cells = row.split('|').map(c => c.trim().replace(/[#*]/g, '')).filter(c => c);
            return cells;
        });

        // Process each cell to clean formatting and convert numbers
        const processedRows = rows.map(row => {
            const rowData = {};
            headers.forEach((header, index) => {
                let value = row[index] || '';
                // Clean formatting
                value = value.replace(/\*\*/g, '')
                           .replace(/_/g, '')
                           .replace(/`/g, '')
                           .replace(/[#*]/g, '')
                           .trim();
                
                // Convert numeric values
                if (/^[\(\-\d,]+\)$/.test(value)) {
                    // Handle negative numbers in parentheses
                    value = value.replace(/[\(\),]/g, '');
                    value = -parseFloat(value);
                } else if (/^[\d,]+$/.test(value)) {
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
            rows: processedRows
        });
    }

    return tables;
}

// Function to format tables as HTML
function formatTableAsHTML(table) {
    let html = '';
    if (table.title) {
        html += `<div class="table-title">${table.title}</div>`;
    }
    html += '<table class="markdown-table">';
    
    // Add headers
    html += '<thead><tr>';
    table.columns.forEach(header => {
        html += `<th>${header}</th>`;
    });
    html += '</tr></thead>';
    
    // Add rows
    html += '<tbody>';
    table.rows.forEach(row => {
        html += '<tr>';
        table.columns.forEach(column => {
            const value = row[column];
            const isNumeric = typeof value === 'number';
            const cellClass = isNumeric ? 'numeric-cell' : 'text-cell';
            const formattedValue = isNumeric ? 
                (value < 0 ? `(${Math.abs(value).toLocaleString()})` : value.toLocaleString()) : 
                value;
            html += `<td class="${cellClass}">${formattedValue}</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table>';
    
    return html;
}

// Update the formatBoldText function to handle tables
function formatBoldText(text) {
    // First remove all # and * characters from the text
    text = text.replace(/[#*]/g, '');
    
    // First extract and format tables
    const tables = extractMarkdownTables(text);
    let processedText = text;
    
    // Replace tables with placeholders
    tables.forEach((table, index) => {
        const placeholder = `__TABLE_${index}__`;
        processedText = processedText.replace(
            new RegExp(`(?:^|\n)([^\n]+)\n\\|([^\n]+)\n\\|([^\n]+)\n((?:\\|[^\n]+\n)+)`, 'g'),
            placeholder
        );
    });
    
    // Process other formatting
    processedText = processedText
        .replace(/\*\*"([^"]+)"\*\*/g, (match, content) => {
            const cleanedContent = content.trim();
            return `<span style="color: #00C46F">${cleanedContent}</span>`;
        })
        .replace(/\n\n/g, '</p><p>')
        .replace(/(\d+\.\s+[^\n]+)/g, '<li>$1</li>')
        .replace(/(?:^|\n)([•\-]\s+[^\n]+)/g, '<li>$1</li>');
    
    // Replace table placeholders with formatted HTML
    tables.forEach((table, index) => {
        const placeholder = `__TABLE_${index}__`;
        processedText = processedText.replace(placeholder, formatTableAsHTML(table));
    });
    
    return `<p>${processedText}</p>`;
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
    
    // Scroll to bottom
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Handle file selection
function handleFileSelection(event) {
    const files = Array.from(event.target.files);
    filePreview.innerHTML = '';
    
    files.forEach(file => {
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