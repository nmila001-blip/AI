
// ============================================
// AI TUTOR - SHARED JAVASCRIPT
// ============================================

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
  { page: "friends", label: "Friends", icon: "♧", url: "friends.html" },
  { page: "history", label: "Study History", icon: "◷", url: "history.html" },
  { page: "account", label: "Account", icon: "◎", url: "account.html" }
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
// UTILITIES
// ============================================

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
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
    count.textContent =
      `${saved.length} saved question${saved.length === 1 ? "" : "s"}`;
  }

  if (saved.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⌕</div>
        <h3>No study history yet</h3>
        <p>Questions you send to your tutor will appear here.</p>
        <a class="primary-button" href="tutor.html">
          Ask your first question →
        </a>
      </div>
    `;
    return;
  }

  list.innerHTML = saved.map(item => `
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
  message.className =
    `message ${isUser ? "user-message" : "assistant-message"}`;

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
  if (!container) return;

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

  if (!input || !sendButton || !subjectSelect || !levelSelect) {
    console.error("AI Tutor: One or more chat elements are missing.");
    return;
  }

  input.addEventListener("keydown", event => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.isComposing
    ) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  const requestedSubject =
    new URLSearchParams(location.search).get("subject");

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

      const token =
        currentSession?.access_token || SUPABASE_ANON_KEY;

      const response = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token,
          "apikey": SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
          messages: chatMessages,
          subject,
          level,
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

  if (!emailInput || !passwordInput || !loginButton || !signupButton) {
    console.error("Account: One or more authentication elements are missing.");
    return;
  }

  function showAuthMessage(text, isError = false) {
    if (!message) return;
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
// FRIENDS - DISPLAY NAME ONLY
// ============================================

function setFriendsMessage(elementId, message, isError = false) {
  const element = document.getElementById(elementId);
  if (!element) return;

  element.textContent = message;
  element.style.color = isError ? "#ff9299" : "#9bdcb8";
}

function friendEmpty(message) {
  return `<div class="friends-empty">${escapeHTML(message)}</div>`;
}

function getInitial(name) {
  return String(name || "S").trim().charAt(0).toUpperCase() || "S";
}

function renderFriendCard(profile, actions = "") {
  const name = profile?.display_name || "Student";

  return `
    <article class="friend-card">
      <div class="friend-person">
        <div class="friend-avatar">${escapeHTML(getInitial(name))}</div>
        <div class="friend-details">
          <strong>${escapeHTML(name)}</strong>
        </div>
      </div>
      ${actions ? `<div class="friend-actions">${actions}</div>` : ""}
    </article>
  `;
}

async function getProfilesByIds(ids) {
  const uniqueIds = [...new Set(ids)].filter(Boolean);

  if (!uniqueIds.length) return {};

  const { data, error } = await supabaseClient
    .from("user_profiles")
    .select("user_id, display_name")
    .in("user_id", uniqueIds);

  if (error) throw error;

  return Object.fromEntries(
    (data || []).map(profile => [profile.user_id, profile])
  );
}

function setupFriends() {
  if (page !== "friends") return;

  const profileForm = document.getElementById("friends-profile-form");
  const profileInput = document.getElementById("friends-display-name");

  // IMPORTANT:
  // Listen for the search form submission at the document level.
  // Capture mode catches it before the browser can perform a normal
  // form submission and reload the page.
  document.addEventListener("submit", event => {
    if (event.target?.id !== "friends-search-form") return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const searchInput = document.getElementById("friends-search-input");
    const term = searchInput?.value.trim() || "";

    searchStudents(term);
  }, true);

  profileForm?.addEventListener("submit", async event => {
    event.preventDefault();

    if (!currentUser) {
      setFriendsMessage(
        "friends-profile-message",
        "Please sign in before saving your display name.",
        true
      );
      return;
    }

    const displayName = profileInput?.value.trim() || "";

    if (displayName.length < 2 || displayName.length > 40) {
      setFriendsMessage(
        "friends-profile-message",
        "Your display name must be between 2 and 40 characters.",
        true
      );
      return;
    }

    const saveButton = document.getElementById("friends-profile-save");
    if (saveButton) saveButton.disabled = true;

    setFriendsMessage("friends-profile-message", "Saving...");

    try {
      const { error } = await supabaseClient
        .from("user_profiles")
        .update({
          display_name: displayName,
          username: null,
          updated_at: new Date().toISOString()
        })
        .eq("user_id", currentUser.id);

      if (error) throw error;

      setFriendsMessage(
        "friends-profile-message",
        "Your display name has been saved!"
      );

      await loadFriendsPage();

    } catch (error) {
      setFriendsMessage(
        "friends-profile-message",
        error.message,
        true
      );

    } finally {
      if (saveButton) saveButton.disabled = false;
    }
  });

  document.getElementById("friends-search-results")
    ?.addEventListener("click", async event => {
      const button = event.target.closest("[data-friend-action='send']");
      if (!button) return;

      await sendFriendRequest(button.dataset.userId, button);
    });

  document.getElementById("friends-incoming")
    ?.addEventListener("click", async event => {
      const button = event.target.closest("[data-friend-action]");
      if (!button) return;

      const action = button.dataset.friendAction;

      if (action !== "accept" && action !== "decline") return;

      await respondToFriendRequest(
        button.dataset.requestId,
        action === "accept" ? "accepted" : "declined",
        button
      );
    });

  document.getElementById("friends-outgoing")
    ?.addEventListener("click", async event => {
      const button = event.target.closest("[data-friend-action='cancel']");
      if (!button) return;

      await cancelFriendRequest(button.dataset.requestId, button);
    });
}

async function loadFriendsPage() {
  if (page !== "friends") return;

  const profileInput = document.getElementById("friends-display-name");

  const searchResults = document.getElementById("friends-search-results");
  const incomingContainer = document.getElementById("friends-incoming");
  const outgoingContainer = document.getElementById("friends-outgoing");
  const friendsContainer = document.getElementById("friends-list");

  if (!currentUser) {
    if (profileInput) profileInput.disabled = true;

    setFriendsMessage(
      "friends-profile-message",
      "Sign in to set your display name."
    );

    if (searchResults) {
      searchResults.innerHTML =
        friendEmpty("Sign in to search for other students.");
    }

    if (incomingContainer) {
      incomingContainer.innerHTML =
        friendEmpty("Sign in to view incoming requests.");
    }

    if (outgoingContainer) {
      outgoingContainer.innerHTML =
        friendEmpty("Sign in to view sent requests.");
    }

    if (friendsContainer) {
      friendsContainer.innerHTML =
        friendEmpty("Sign in to see your friends.");
    }

    return;
  }

  if (profileInput) profileInput.disabled = false;

  try {
    const { data: ownProfile, error: profileError } =
      await supabaseClient
        .from("user_profiles")
        .select("display_name")
        .eq("user_id", currentUser.id)
        .maybeSingle();

    if (profileError) throw profileError;

    if (profileInput && document.activeElement !== profileInput) {
      profileInput.value = ownProfile?.display_name || "";
    }

    const { data: requests, error: requestError } =
      await supabaseClient
        .from("friend_requests")
        .select("id, sender_id, receiver_id, status, created_at")
        .order("created_at", { ascending: false });

    if (requestError) throw requestError;

    const allRequests = requests || [];

    const incoming = allRequests.filter(request =>
      request.receiver_id === currentUser.id &&
      request.status === "pending"
    );

    const outgoing = allRequests.filter(request =>
      request.sender_id === currentUser.id &&
      request.status === "pending"
    );

    const accepted = allRequests.filter(request =>
      request.status === "accepted" &&
      (
        request.sender_id === currentUser.id ||
        request.receiver_id === currentUser.id
      )
    );

    const otherIds = [
      ...incoming.map(request => request.sender_id),
      ...outgoing.map(request => request.receiver_id),
      ...accepted.map(request =>
        request.sender_id === currentUser.id
          ? request.receiver_id
          : request.sender_id
      )
    ];

    const profiles = await getProfilesByIds(otherIds);

    renderIncomingRequests(incoming, profiles);
    renderOutgoingRequests(outgoing, profiles);
    renderAcceptedFriends(accepted, profiles);

  } catch (error) {
    console.error("Friends loading error:", error);

    for (const id of [
      "friends-incoming",
      "friends-outgoing",
      "friends-list"
    ]) {
      const element = document.getElementById(id);
      if (element) {
        element.innerHTML = friendEmpty(
          "Couldn't load this section. Please refresh the page."
        );
      }
    }
  }
}

function renderIncomingRequests(requests, profiles) {
  const container = document.getElementById("friends-incoming");
  if (!container) return;

  if (!requests.length) {
    container.innerHTML = friendEmpty("You have no incoming requests.");
    return;
  }

  container.innerHTML = requests.map(request => {
    const profile = profiles[request.sender_id] || {
      display_name: "Student"
    };

    return renderFriendCard(profile, `
      <button type="button"
              class="friend-action accept"
              data-friend-action="accept"
              data-request-id="${escapeHTML(request.id)}">
        Accept
      </button>
      <button type="button"
              class="friend-action decline"
              data-friend-action="decline"
              data-request-id="${escapeHTML(request.id)}">
        Decline
      </button>
    `);
  }).join("");
}

function renderOutgoingRequests(requests, profiles) {
  const container = document.getElementById("friends-outgoing");
  if (!container) return;

  if (!requests.length) {
    container.innerHTML = friendEmpty("You haven't sent any requests.");
    return;
  }

  container.innerHTML = requests.map(request => {
    const profile = profiles[request.receiver_id] || {
      display_name: "Student"
    };

    return renderFriendCard(profile, `
      <button type="button"
              class="friend-action"
              data-friend-action="cancel"
              data-request-id="${escapeHTML(request.id)}">
        Cancel request
      </button>
    `);
  }).join("");
}

function renderAcceptedFriends(requests, profiles) {
  const container = document.getElementById("friends-list");
  if (!container) return;

  if (!requests.length) {
    container.innerHTML = friendEmpty(
      "You haven't added any friends yet. Search for someone above!"
    );
    return;
  }

  container.innerHTML = requests.map(request => {
    const otherId = request.sender_id === currentUser.id
      ? request.receiver_id
      : request.sender_id;

    const profile = profiles[otherId] || {
      display_name: "Student"
    };

    return renderFriendCard(profile);
  }).join("");
}

async function searchStudents(term) {
  const container = document.getElementById("friends-search-results");
  if (!container) return;

  if (!currentUser) {
    container.innerHTML = friendEmpty("Please sign in to search.");
    return;
  }

  if (term.length < 2) {
    container.innerHTML = friendEmpty(
      "Enter at least two characters to search."
    );
    return;
  }

  container.innerHTML =
    `<p class="friends-loading">Searching...</p>`;

  try {
    const safeTerm = term.replace(/[%_]/g, "\\$&");

    const { data: profiles, error } = await supabaseClient
      .from("user_profiles")
      .select("user_id, display_name")
      .ilike("display_name", `%${safeTerm}%`)
      .neq("user_id", currentUser.id)
      .order("display_name", { ascending: true })
      .limit(20);

    if (error) throw error;

    if (!profiles?.length) {
      container.innerHTML = friendEmpty(
        "No students found with that display name."
      );
      return;
    }

    const { data: requests, error: requestError } =
      await supabaseClient
        .from("friend_requests")
        .select("sender_id, receiver_id, status");

    if (requestError) throw requestError;

    container.innerHTML = profiles.map(profile => {
      const existing = (requests || []).find(request =>
        (
          (request.sender_id === currentUser.id &&
           request.receiver_id === profile.user_id) ||
          (request.sender_id === profile.user_id &&
           request.receiver_id === currentUser.id)
        ) &&
        ["pending", "accepted"].includes(request.status)
      );

      let action = "";

      if (existing?.status === "accepted") {
        action = `<span class="small-muted">Already friends</span>`;
      } else if (existing?.status === "pending") {
        action = existing.sender_id === currentUser.id
          ? `<span class="small-muted">Request sent</span>`
          : `<span class="small-muted">They requested you</span>`;
      } else {
        action = `
          <button type="button"
                  class="friend-action"
                  data-friend-action="send"
                  data-user-id="${escapeHTML(profile.user_id)}">
            Add friend
          </button>
        `;
      }

      return renderFriendCard(profile, action);
    }).join("");

  } catch (error) {
    console.error("Student search error:", error);

    container.innerHTML = friendEmpty(
      "Search failed. Please try again."
    );
  }
}

async function sendFriendRequest(userId, button) {
  if (!currentUser || !userId) return;

  button.disabled = true;
  button.textContent = "Sending...";

  try {
    const { error } = await supabaseClient.rpc(
      "send_friend_request",
      { target_user_id: userId }
    );

    if (error) throw error;

    button.textContent = "Request sent";

    await loadFriendsPage();

    const searchInput = document.getElementById("friends-search-input");

    if (searchInput) {
      await searchStudents(searchInput.value.trim());
    }

  } catch (error) {
    alert(error.message || "Could not send friend request.");
    button.disabled = false;
    button.textContent = "Add friend";
  }
}

async function respondToFriendRequest(requestId, decision, button) {
  if (!requestId) return;

  button.disabled = true;
  button.textContent = decision === "accepted"
    ? "Accepting..."
    : "Declining...";

  try {
    const { error } = await supabaseClient.rpc(
      "respond_to_friend_request",
      {
        request_id: requestId,
        decision
      }
    );

    if (error) throw error;

    await loadFriendsPage();

  } catch (error) {
    alert(error.message || "Could not update friend request.");
    button.disabled = false;
    button.textContent = decision === "accepted" ? "Accept" : "Decline";
  }
}

async function cancelFriendRequest(requestId, button) {
  if (!requestId) return;

  button.disabled = true;
  button.textContent = "Cancelling...";

  try {
    const { error } = await supabaseClient.rpc(
      "cancel_friend_request",
      { request_id: requestId }
    );

    if (error) throw error;

    await loadFriendsPage();

  } catch (error) {
    alert(error.message || "Could not cancel friend request.");
    button.disabled = false;
    button.textContent = "Cancel request";
  }
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
  setupFriends();

  await refreshAccount();

  if (page === "friends") {
    await loadFriendsPage();
  }

  supabaseClient.auth.onAuthStateChange((event, session) => {
    currentSession = session;
    currentUser = session?.user || null;

    setTimeout(() => {
      updateAccountUI();

      if (page === "friends") {
        loadFriendsPage();
      }
    }, 0);
  });

  renderHistory();
  updateDashboard();
}

startApp();
