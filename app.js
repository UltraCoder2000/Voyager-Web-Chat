const STORAGE_KEY = 'voyager-chat-state';

const defaultApi = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
};

const modeCopy = {
  ask: {
    systemPrompt:
      'You are a helpful AI assistant. Answer clearly, concisely, and directly. Be practical, structured, and friendly.',
    placeholder: 'Ask anything',
  },
  agent: {
    systemPrompt:
      'You are an autonomous AI agent. Think through the task, create a plan when helpful, and give actionable next steps. Keep responses practical, structured, and concise. If the user asks for code, provide production-ready code blocks with brief explanations.',
    placeholder: 'Describe the task for the agent',
  },
};

const state = {
  chats: [],
  activeChatId: null,
  currentMode: 'ask',
  api: { ...defaultApi },
};

const elements = {
  chatList: document.getElementById('chatList'),
  messages: document.getElementById('messages'),
  emptyState: document.getElementById('emptyState'),
  promptInput: document.getElementById('promptInput'),
  sendButton: document.getElementById('sendButton'),
  settingsButton: document.getElementById('settingsButton'),
  settingsModal: document.getElementById('settingsModal'),
  closeSettings: document.getElementById('closeSettings'),
  saveSettings: document.getElementById('saveSettings'),
  resetSettings: document.getElementById('resetSettings'),
  apiBaseUrl: document.getElementById('apiBaseUrl'),
  apiKey: document.getElementById('apiKey'),
  apiModel: document.getElementById('apiModel'),
  modeButtons: document.querySelectorAll('.mode-button'),
  newChatButtons: document.querySelectorAll('[data-action="new-chat"]'),
};

function generateId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      state.chats = Array.isArray(parsed.chats) ? parsed.chats : [];
      state.activeChatId = parsed.activeChatId || null;
      state.api = { ...defaultApi, ...(parsed.api || {}) };
      state.currentMode = parsed.currentMode || 'ask';
    } catch (error) {
      console.warn('Could not parse saved state', error);
    }
  }

  if (!state.chats.length) {
    state.chats = [{
      id: generateId(),
      title: 'New chat',
      messages: [],
      mode: 'ask',
    }];
    state.activeChatId = state.chats[0].id;
  }

  if (!state.activeChatId) {
    state.activeChatId = state.chats[0].id;
  }
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    chats: state.chats,
    activeChatId: state.activeChatId,
    api: state.api,
    currentMode: state.currentMode,
  }));
}

function getActiveChat() {
  return state.chats.find((chat) => chat.id === state.activeChatId) || state.chats[0];
}

function getTitleFromPrompt(prompt) {
  const clean = prompt.trim().replace(/\s+/g, ' ');
  return clean.length > 28 ? `${clean.slice(0, 28)}…` : clean || 'New chat';
}

function renderChatList() {
  elements.chatList.innerHTML = '';

  state.chats.forEach((chat) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `chat-item ${chat.id === state.activeChatId ? 'active' : ''}`;
    button.innerHTML = `
      <span class="nav-icon">▣</span>
      <span class="title">${escapeHtml(chat.title || 'New chat')}</span>
    `;
    button.addEventListener('click', () => {
      state.activeChatId = chat.id;
      state.currentMode = chat.mode || 'ask';
      updateModeButtons();
      render();
    });
    elements.chatList.appendChild(button);
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderMessages() {
  const chat = getActiveChat();
  const messages = chat.messages;

  elements.messages.innerHTML = '';

  if (!messages.length) {
    elements.emptyState.classList.remove('hidden');
    elements.messages.classList.remove('visible');
    return;
  }

  elements.emptyState.classList.add('hidden');
  elements.messages.classList.add('visible');

  messages.forEach((message) => {
    const row = document.createElement('div');
    row.className = `message-row ${message.role}`;

    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${message.pending ? 'loading' : ''}`;
    bubble.textContent = message.content || (message.pending ? 'Thinking…' : '');

    row.appendChild(bubble);
    elements.messages.appendChild(row);
  });

  setTimeout(() => {
    elements.messages.scrollTop = elements.messages.scrollHeight;
  }, 0);
}

function render() {
  const chat = getActiveChat();
  if (chat) {
    state.currentMode = chat.mode || 'ask';
  }
  updateModeButtons();
  renderChatList();
  renderMessages();
  elements.promptInput.placeholder = modeCopy[state.currentMode].placeholder;
  persistState();
}

function updateModeButtons() {
  elements.modeButtons.forEach((button) => {
    const isActive = button.dataset.mode === state.currentMode;
    button.classList.toggle('active', isActive);
  });
}

function createChat() {
  const newChat = {
    id: generateId(),
    title: 'New chat',
    messages: [],
    mode: 'ask',
  };

  state.chats.unshift(newChat);
  state.activeChatId = newChat.id;
  state.currentMode = 'ask';
  render();
}

function setMode(mode) {
  state.currentMode = mode;
  const chat = getActiveChat();
  if (chat) {
    chat.mode = mode;
  }
  render();
}

function addMessage(role, content, options = {}) {
  const chat = getActiveChat();
  const message = {
    id: generateId(),
    role,
    content,
    pending: !!options.pending,
  };

  chat.messages.push(message);
  render();
  return message;
}

function updateMessage(messageId, updates) {
  const chat = getActiveChat();
  const target = chat.messages.find((item) => item.id === messageId);
  if (!target) return;
  Object.assign(target, updates);
  render();
}

async function callApi(messages, mode) {
  const apiBase = (state.api.baseUrl || defaultApi.baseUrl).replace(/\/$/, '');
  const url = `${apiBase}/chat/completions`;
  const apiKey = state.api.apiKey?.trim();

  if (!apiKey) {
    throw new Error('Missing API key. Open the settings panel and add your API key.');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: state.api.model || defaultApi.model,
      messages,
      temperature: mode === 'agent' ? 0.8 : 0.7,
      max_tokens: mode === 'agent' ? 1200 : 800,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request failed (${response.status}): ${errorText || 'Unknown error'}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('The API returned an empty response.');
  }

  return content;
}

async function sendPrompt() {
  const prompt = elements.promptInput.value.trim();
  if (!prompt) return;

  const chat = getActiveChat();
  const mode = state.currentMode;

  const userMessage = { id: generateId(), role: 'user', content: prompt };
  chat.messages.push(userMessage);

  const assistantMessage = {
    id: generateId(),
    role: 'assistant',
    content: '',
    pending: true,
  };
  chat.messages.push(assistantMessage);

  if (!chat.title || chat.title === 'New chat') {
    chat.title = getTitleFromPrompt(prompt);
  }

  elements.promptInput.value = '';
  render();

  try {
    const conversation = [
      { role: 'system', content: modeCopy[mode].systemPrompt },
      ...chat.messages.slice(-12).map(({ role, content }) => ({ role, content })),
    ];

    const result = await callApi(conversation, mode);
    assistantMessage.content = result.trim();
    assistantMessage.pending = false;
    render();
  } catch (error) {
    assistantMessage.content = `Error: ${error.message}`;
    assistantMessage.pending = false;
    render();
  }
}

function bindEvents() {
  elements.sendButton.addEventListener('click', sendPrompt);

  elements.promptInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendPrompt();
    }
  });

  elements.promptInput.addEventListener('input', () => {
    const textarea = elements.promptInput;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
  });

  elements.modeButtons.forEach((button) => {
    button.addEventListener('click', () => setMode(button.dataset.mode));
  });

  elements.newChatButtons.forEach((button) => {
    button.addEventListener('click', createChat);
  });

  elements.settingsButton.addEventListener('click', () => {
    elements.apiBaseUrl.value = state.api.baseUrl || defaultApi.baseUrl;
    elements.apiKey.value = state.api.apiKey || '';
    elements.apiModel.value = state.api.model || defaultApi.model;
    elements.settingsModal.classList.remove('hidden');
  });

  elements.closeSettings.addEventListener('click', () => {
    elements.settingsModal.classList.add('hidden');
  });

  elements.settingsModal.addEventListener('click', (event) => {
    if (event.target === elements.settingsModal) {
      elements.settingsModal.classList.add('hidden');
    }
  });

  elements.saveSettings.addEventListener('click', () => {
    state.api.baseUrl = elements.apiBaseUrl.value.trim() || defaultApi.baseUrl;
    state.api.apiKey = elements.apiKey.value.trim();
    state.api.model = elements.apiModel.value.trim() || defaultApi.model;
    persistState();
    elements.settingsModal.classList.add('hidden');
  });

  elements.resetSettings.addEventListener('click', () => {
    state.api = { ...defaultApi };
    elements.apiBaseUrl.value = defaultApi.baseUrl;
    elements.apiKey.value = '';
    elements.apiModel.value = defaultApi.model;
    persistState();
  });
}

function init() {
  loadState();
  bindEvents();
  updateModeButtons();
  render();
}

init();
