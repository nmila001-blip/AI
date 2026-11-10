
// ============================================
// AI TUTOR - SHARED JAVASCRIPT
// ============================================

// Your existing Supabase project
const SUPABASE_URL = "https://vjvhqaxhmvkvydnwcbgr.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_dmwhgYb21RnE0gQpU5hlQA_HZ4Uktt1";
const FUNCTION_URL = SUPABASE_URL + "/functions/v1/Tutor";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

const page = document.body.dataset.page;
const sessionId = getSessionId();

let currentSession = null;
let currentUser = null;
let chatMessages = [];

// ============================================
// SESSION
// ============================================

function getSessionId() {
  let id = sessionStorage.getItem("ai-tutor-session");

  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("ai-tutor-session", id);
  }

  return id;
}

// ============================================
// SIDEBAR NAVIGATION
// ============================================

const navigation = [
  { page: "dashboard", label: "Dashboard", icon: "⌂", url: "index.html" },
  { page: "tutor", label: "AI Tutor", icon: "✦", url: "tutor.html" },
  { page: "subjects", label: "Subjects", icon: "▦", url: "subjects.html" },
  { page: "history", label: "Study History", icon: "◷", url: "history.html" },
  { page: "account", label: "Account", icon: "◎", url: "account.html" }
  { page: "friends", label: "Friends", icon: "♧", url: "friends.html" },
];

function createSidebar() {
  const app = document.getElementById("app");

  if (!app) return;

  const links = navigation.map(item => `
    <a class="nav-link ${page === item.page ? "active" : ""}"
       href="${item.url}">
      <span class="nav-icon">${item.icon}</span>
      <span>${item.label}</span>
    </a>
  `).join("");

  app.innerHTML = `
    <aside class="sidebar">
      <a class="brand" href="index.html">
        <span class="brand-mark">✦</span>
        <span>
          <span class="brand-name">AI Tutor</span>
          <span class="brand-sub">LEARN WITHOUT LIMITS</span>
        </span>
      </a>

      <p class="nav-label">WORKSPACE</p>

      <nav class="nav-links">
        ${links}
      </nav>

      <div class="sidebar-bottom">
        <div class="sidebar-tip">
          <strong>✧ Keep learning</strong>
          <p>Small steps every day can make a big difference.</p>
        </div>
      </div>
    </aside>
  `;
}

// ============================================
// LOCAL STUDY HISTORY
// ============================================

function getHistoryKey() {
  return currentUser
    ? "ai-tutor-history-" + currentUser.id
    : "ai-tutor-history-guest";
}

function getSavedHistory() {
  try {
    return JSON.parse(localStorage.getItem(getHistoryKey()) || "[]");
  } catch {
    return [];
  }
}

function saveHistory(question, subject) {
  const saved = getSavedHistory();

  saved.unshift({
    question,
    subject,
    date: new Date().toISOString()
  });

  // Keep the latest 100 questions
  localStorage.setItem(
    getHistoryKey(),
    JSON.stringify(saved.slice(0, 100))
  );
}

function renderHistory() {
  const list = document.getElementById("history-list");
  const count = document.getElementById("history-count");

  if (!list) return;

  const saved = getSavedHistory();

  if (count) {
    count.textContent = `${saved.length} saved question${saved.length === 1 ? "" : "s"}`;
  }

  if (saved.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⌕</div>
        <h3>No study history yet</h3>
        <p>Questions you send to your tutor will appear here.</p>
        <a class="primary-button" href="tutor.html">Ask your first question →</a>
      </div>
    `;
    return;
  }

  list.innerHTML = saved.map((item, index) => `
    <article class="history-item">
      <div>
        <h3>${escapeHTML(item.question)}</h3>
        <p>${escapeHTML(item.subject)} · ${formatDate(item.date)}</p>
      </div>
      <a href="tutor.html?subject=${encodeURIComponent(item.subject)}">
        Ask more →
      </a>
    </article>
  `).join("");
}

function formatDate(date) {
  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) return "Date unavailable";

  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

// ============================================
// DASHBOARD
// ============================================

function updateDashboard() {
  const count = document.getElementById("dashboard-count");

  if (count) {
    count.textContent = getSavedHistory().length;
  }
}

// ============================================
// CHAT DISPLAY
// ============================================

function addMessage(role, text) {
  const container = document.getElementById("chat-messages");

  if (!container) return;

  const isUser = role === "user";

  const message = document.createElement("div");
  message.className = `message ${isUser ? "user-message" : "assistant-message"}`;

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = isUser ? "U" : "✦";

  const content = document.createElement("div");
  content.className = "message-content";

  const name = document.createElement("strong");
  name.textContent = isUser ? "You" : "Your AI Tutor";

  const paragraph = document.createElement("p");
  paragraph.textContent = text;

  content.append(name, paragraph);
  message.append(avatar, content);
  container.appendChild(message);

  container.scrollTop = container.scrollHeight;
}

function showTyping() {
  const container = document.getElementById("chat-messages");

  const typing = document.createElement("div");
  typing.className = "message assistant-message";
  typing.id = "typing-indicator";

  typing.innerHTML = `
    <div class="message-avatar">✦</div>
    <div class="message-content">
      <strong>Your AI Tutor</strong>
      <p>Thinking...</p>
    </div>
  `;

  container.appendChild(typing);
  container.scrollTop = container.scrollHeight;
}

function removeTyping() {
  document.getElementById("typing-indicator")?.remove();
}

// ============================================
// AI TUTOR
// ============================================

function setupChat() {
  const form = document.getElementById("chat-form");

  if (!form) return;

  const input = document.getElementById("chat-input");
  const sendButton = document.getElementById("send-button");
  const subjectSelect = document.getElementById("subject");
  const levelSelect = document.getElementById("level");
  const clearButton = document.getElementById("clear-chat");
  
  input.addEventListener("keydown", (event) => {
      if (
          event.key === "Enter" &&
          !event.shiftKey &&
          !event.isComposing
      ) {
          event.preventDefault();
          form.requestSubmit();
      }
  });
  
  const requestedSubject = new URLSearchParams(location.search).get("subject");

  if (requestedSubject && subjectSelect) {
    const matchingOption = [...subjectSelect.options].find(
      option => option.value.toLowerCase() === requestedSubject.toLowerCase()
    );

    if (matchingOption) {
      subjectSelect.value = matchingOption.value;
    }
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const question = input.value.trim();

    if (!question) return;

    const subject = subjectSelect.value;
    const level = levelSelect.value;

    input.value = "";
    sendButton.disabled = true;

    addMessage("user", question);
    saveHistory(question, subject);

    chatMessages.push({
      role: "user",
      content: question
    });

    showTyping();

    try {
      const { data: sessionData, error: sessionError } =
        await supabaseClient.auth.getSession();

      if (sessionError) throw sessionError;

      currentSession = sessionData.session;

      const token = currentSession?.access_token || SUPABASE_ANON_KEY;

      const response = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token,
          "apikey": SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
          messages: chatMessages,
          subject: subject,
          level: level,
          session_id: sessionId
        })
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result.error ||
          result.message ||
          `Tutor request failed (${response.status})`
        );
      }

      // Accept common response formats from the Edge Function.
      const answer =
        result.reply ||
        result.answer ||
        result.response ||
        result.message ||
        result.choices?.[0]?.message?.content;

      if (typeof answer !== "string" || !answer.trim()) {
        throw new Error("The tutor returned an empty response.");
      }

      chatMessages.push({
        role: "assistant",
        content: answer
      });

      removeTyping();
      addMessage("assistant", answer);

    } catch (error) {
      removeTyping();

      // Remove the failed question from the in-memory conversation.
      chatMessages.pop();

      addMessage(
        "assistant",
        "Sorry, I couldn't reach the tutor. " +
        error.message +
        " Please try again."
      );

    } finally {
      sendButton.disabled = false;
      input.focus();
    }
  });

  clearButton?.addEventListener("click", () => {
    chatMessages = [];

    document.getElementById("chat-messages").innerHTML = "";

    addMessage(
      "assistant",
      "Chat cleared! What would you like to learn about next?"
    );
  });
}

// ============================================
// ACCOUNT AND AUTHENTICATION
// ============================================

async function refreshAccount() {
  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    console.error("Could not retrieve session:", error.message);
    return;
  }

  currentSession = data.session;
  currentUser = currentSession?.user || null;

  updateAccountUI();
}

function updateAccountUI() {
  const topUser = document.getElementById("top-user");

  if (topUser) {
    topUser.textContent = currentUser
      ? currentUser.email
      : "My Account";
  }

  const status = document.getElementById("account-status");
  const accountName = document.getElementById("account-name");
  const accountEmail = document.getElementById("account-email");
  const authForms = document.getElementById("auth-forms");
  const signedInPanel = document.getElementById("signed-in-panel");
  const signedInEmail = document.getElementById("signed-in-email");

  if (status) {
    status.textContent = currentUser ? "● Signed in" : "Guest";
  }

  if (accountName) {
    accountName.textContent = currentUser
      ? "Welcome back!"
      : "Welcome!";
  }

  if (accountEmail) {
    accountEmail.textContent = currentUser
      ? currentUser.email
      : "Create an account to sign in and keep your session available across visits.";
  }

  if (signedInEmail) {
    signedInEmail.textContent = currentUser?.email || "";
  }

  if (authForms) {
    authForms.hidden = !!currentUser;
  }

  if (signedInPanel) {
    signedInPanel.hidden = !currentUser;
  }

  updateDashboard();
  renderHistory();
}

function setupAccount() {
  const form = document.getElementById("auth-form");

  if (!form) return;

  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const message = document.getElementById("auth-message");
  const loginButton = document.getElementById("login-button");
  const signupButton = document.getElementById("signup-button");
  const logoutButton = document.getElementById("logout-button");

  function showAuthMessage(text, isError = false) {
    message.textContent = text;
    message.style.color = isError ? "#ff9299" : "#9bdcb8";
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    loginButton.disabled = true;
    signupButton.disabled = true;
    showAuthMessage("Signing in...");

    try {
      const { data, error } =
        await supabaseClient.auth.signInWithPassword({
          email,
          password
        });

      if (error) throw error;

      currentSession = data.session;
      currentUser = data.user;

      showAuthMessage("Signed in successfully!");

      updateAccountUI();

    } catch (error) {
      showAuthMessage(error.message, true);

    } finally {
      loginButton.disabled = false;
      signupButton.disabled = false;
    }
  });

  signupButton?.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || password.length < 6) {
      showAuthMessage(
        "Enter a valid email and a password with at least 6 characters.",
        true
      );
      return;
    }

    signupButton.disabled = true;
    loginButton.disabled = true;
    showAuthMessage("Creating your account...");

    try {
      const { data, error } =
        await supabaseClient.auth.signUp({
          email,
          password
        });

      if (error) throw error;

      if (data.session) {
        currentSession = data.session;
        currentUser = data.user;

        showAuthMessage("Account created successfully!");
        updateAccountUI();

      } else {
        showAuthMessage(
          "Account created! Check your email for a confirmation link before signing in."
        );
      }

    } catch (error) {
      showAuthMessage(error.message, true);

    } finally {
      signupButton.disabled = false;
      loginButton.disabled = false;
    }
  });

  logoutButton?.addEventListener("click", async () => {
    logoutButton.disabled = true;

    const { error } = await supabaseClient.auth.signOut();

    if (error) {
      showAuthMessage(error.message, true);
      logoutButton.disabled = false;
      return;
    }

    currentSession = null;
    currentUser = null;

    updateAccountUI();
    showAuthMessage("You have signed out.");
    logoutButton.disabled = false;
  });
}

// ============================================
// BUTTONS
// ============================================

function setupHistoryButtons() {
  const clearButton = document.getElementById("clear-history");

  clearButton?.addEventListener("click", () => {
    const confirmed = confirm(
      "Are you sure you want to delete your saved study history?"
    );

    if (!confirmed) return;

    localStorage.removeItem(getHistoryKey());

    renderHistory();
    updateDashboard();
  });
}

// ============================================
// START THE APP
// ============================================

async function startApp() {
  createSidebar();

  setupChat();
  setupAccount();
  setupHistoryButtons();

  await refreshAccount();

  // Update the interface after login/logout events.
  supabaseClient.auth.onAuthStateChange((event, session) => {
    currentSession = session;
    currentUser = session?.user || null;

    // Defer UI updates until after the auth callback completes.
    setTimeout(() => {
      updateAccountUI();
    }, 0);
  });

  renderHistory();
  updateDashboard();
}

startApp();
