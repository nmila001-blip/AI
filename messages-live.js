
/* ==========================================
   MESSAGES - ONLINE STATUS, LAST SEEN,
   AND TYPING INDICATORS
========================================== */

(() => {
  let userId = null;
  let activeChannel = null;
  let activeConversationId = null;
  let activeFriendId = null;
  let friendIsOnline = false;
  let typingTimer = null;
  let lastSeenTimer = null;
  let typingTimeout = null;
  let lastTypingBroadcast = 0;
  let threadObserver = null;

  const $ = id => document.getElementById(id);

  function getActiveConversation() {
    try {
      return activeMessageConversation || null;
    } catch {
      return null;
    }
  }

  function getStatusElement() {
    let status = $("message-live-status");

    if (!status) {
      status = document.createElement("span");
      status.id = "message-live-status";
      status.className = "message-live-status";

      const name = $("message-friend-name");

      if (name) {
        name.insertAdjacentElement("afterend", status);
      } else {
        $("message-thread")?.prepend(status);
      }
    }

    return status;
  }

  function setStatus(text, online = false, typing = false) {
    const status = getStatusElement();

    if (!status) return;

    status.textContent = text;
    status.classList.toggle("online", online);
    status.classList.toggle("typing", typing);
  }

  function updateFriendOnlineDot(online) {
    if (!activeFriendId) return;

    const button = document.querySelector(
      `[data-message-user="${activeFriendId}"]`
    );

    if (!button) return;

    let dot = button.querySelector(".friend-presence-dot");

    if (online) {
      if (!dot) {
        dot = document.createElement("span");
        dot.className = "friend-presence-dot";
        dot.title = "Online";
        button.appendChild(dot);
      }
    } else {
      dot?.remove();
    }
  }

  function relativeTime(timestamp) {
    if (!timestamp) return "Offline";

    const difference = Math.max(
      0,
      Date.now() - new Date(timestamp).getTime()
    );

    const seconds = Math.floor(difference / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return "Last seen just now";
    if (minutes < 60) {
      return `Last seen ${minutes}m ago`;
    }
    if (hours < 24) {
      return `Last seen ${hours}h ago`;
    }

    return `Last seen ${days}d ago`;
  }

  async function updateMyLastSeen() {
    if (!userId) return;

    const { error } = await supabaseClient
      .from("user_profiles")
      .update({
        last_seen: new Date().toISOString()
      })
      .eq("user_id", userId);

    if (error) {
      console.error("Last seen update error:", error);
    }
  }

  async function loadFriendLastSeen() {
    if (!activeFriendId || friendIsOnline) return;

    const { data, error } = await supabaseClient
      .from("user_profiles")
      .select("last_seen")
      .eq("user_id", activeFriendId)
      .maybeSingle();

    if (error) {
      console.error("Friend last seen error:", error);
      setStatus("Offline");
      return;
    }

    if (!friendIsOnline) {
      setStatus(relativeTime(data?.last_seen));
    }
  }

  function updatePresenceFromChannel() {
    if (!activeChannel || !userId) return;

    const state = activeChannel.presenceState();

    const people = Object.values(state).flat();

    friendIsOnline = people.some(person =>
      person.user_id === activeFriendId &&
      person.user_id !== userId
    );

    updateFriendOnlineDot(friendIsOnline);

    if (friendIsOnline) {
      setStatus("Online", true);
    } else {
      loadFriendLastSeen();
    }
  }

  async function stopActiveChannel() {
    if (activeChannel) {
      await supabaseClient.removeChannel(activeChannel);
    }

    activeChannel = null;
    activeConversationId = null;
    activeFriendId = null;
    friendIsOnline = false;

    clearTimeout(typingTimeout);
    updateFriendOnlineDot(false);
  }

  async function startConversationChannel() {
    const conversationId = getActiveConversation();

    if (!userId || !conversationId) return;

    if (conversationId === activeConversationId) return;

    await stopActiveChannel();

    activeConversationId = conversationId;

    const { data: conversation, error } = await supabaseClient
      .from("conversations")
      .select("id, user_one, user_two")
      .eq("id", conversationId)
      .maybeSingle();

    if (error || !conversation) {
      console.error("Could not load live conversation:", error);
      return;
    }

    if (
      conversation.user_one !== userId &&
      conversation.user_two !== userId
    ) {
      return;
    }

    activeFriendId =
      conversation.user_one === userId
        ? conversation.user_two
        : conversation.user_one;

    friendIsOnline = false;
    setStatus("Connecting...");

    const topic = `private-chat-live-${conversationId}`;

    activeChannel = supabaseClient.channel(topic, {
      config: {
        private: true,
        presence: {
          key: userId
        }
      }
    });

    activeChannel
      .on("presence", { event: "sync" }, () => {
        updatePresenceFromChannel();
      })
      .on("presence", { event: "join" }, () => {
        updatePresenceFromChannel();
      })
      .on("presence", { event: "leave" }, () => {
        updatePresenceFromChannel();
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (!payload || payload.user_id === userId) return;

        if (payload.typing) {
          setStatus("Typing...", friendIsOnline, true);

          clearTimeout(typingTimeout);

          typingTimeout = setTimeout(() => {
            if (friendIsOnline) {
              setStatus("Online", true);
            } else {
              loadFriendLastSeen();
            }
          }, 1800);

        } else {
          clearTimeout(typingTimeout);

          if (friendIsOnline) {
            setStatus("Online", true);
          } else {
            loadFriendLastSeen();
          }
        }
      })
      .subscribe(async status => {
        if (status === "SUBSCRIBED") {
          const { error: trackError } = await activeChannel.track({
            user_id: userId,
            online_at: new Date().toISOString()
          });

          if (trackError) {
            console.error("Presence tracking error:", trackError);
          }

          updatePresenceFromChannel();
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("Live channel connection failed:", status);
          setStatus("Live status unavailable");
        }
      });
  }

  async function broadcastTyping(isTyping) {
    if (!activeChannel || !userId) return;

    const now = Date.now();

    // Avoid sending an event for every single keystroke.
    if (isTyping && now - lastTypingBroadcast < 700) return;

    lastTypingBroadcast = now;

    const { error } = await activeChannel.send({
      type: "broadcast",
      event: "typing",
      payload: {
        user_id: userId,
        typing: isTyping
      }
    });

    if (error) {
      console.error("Typing broadcast error:", error);
    }
  }

  function setupTypingInput() {
    const input = $("message-input");

    if (!input) return;

    input.addEventListener("input", () => {
      if (!getActiveConversation()) return;

      broadcastTyping(true);

      clearTimeout(typingTimer);

      typingTimer = setTimeout(() => {
        broadcastTyping(false);
      }, 1200);
    });

    input.addEventListener("blur", () => {
      clearTimeout(typingTimer);
      broadcastTyping(false);
    });
  }

  function watchConversationChanges() {
    const thread = $("message-thread");

    if (!thread) return;

    threadObserver = new MutationObserver(() => {
      startConversationChannel();
    });

    threadObserver.observe(thread, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden"]
    });

    $("message-friends")?.addEventListener("click", () => {
      setTimeout(startConversationChannel, 400);
      setTimeout(startConversationChannel, 1000);
    });
  }

  async function initialize() {
    if (document.body.dataset.page !== "messages") return;

    const { data, error } = await supabaseClient.auth.getSession();

    if (error || !data.session) return;

    userId = data.session.user.id;

    await updateMyLastSeen();

    // Refresh last_seen while the messages page is open.
    lastSeenTimer = setInterval(updateMyLastSeen, 60000);

    setupTypingInput();
    watchConversationChanges();

    // Catch a conversation that was already opened.
    setTimeout(startConversationChannel, 500);
  }

  supabaseClient.auth.onAuthStateChange((event, session) => {
    userId = session?.user?.id || null;

    if (userId && event === "SIGNED_IN") {
      updateMyLastSeen();
    }

    if (!userId) {
      stopActiveChannel();
      clearInterval(lastSeenTimer);
    }
  });

  window.addEventListener("pagehide", () => {
    updateMyLastSeen();

    if (activeChannel) {
      supabaseClient.removeChannel(activeChannel);
    }
  });

  initialize();
})();
