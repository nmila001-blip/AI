/* ==========================================
   CHAT NOTIFICATIONS
   In-page alerts + optional browser notifications
========================================== */
(() => {
  if (document.body.dataset.page !== "messages") return;

  const button = document.getElementById("enable-chat-notifications");
  const muteButton = document.getElementById("mute-chat-notifications");
  let toastTimer = null;
  let notificationUserId = null;
  let currentMuteTarget = null;

  function mutedChatsKey(userId) {
    return "aiTutorMutedChats:" + userId;
  }

  function getMutedChats(userId = notificationUserId) {
    if (!userId) return {};
    try {
      return JSON.parse(localStorage.getItem(mutedChatsKey(userId)) || "{}");
    } catch {
      return {};
    }
  }

  function isChatMuted(kind, id, userId = notificationUserId) {
    if (!userId || !id) return false;
    return Boolean(getMutedChats(userId)[kind + ":" + id]);
  }

  function updateMuteButton() {
    if (!muteButton) return;
    if (!currentMuteTarget || !notificationUserId) {
      muteButton.hidden = true;
      return;
    }
    muteButton.hidden = false;
    const muted = isChatMuted(currentMuteTarget.kind, currentMuteTarget.id);
    muteButton.textContent = muted ? "🔕 Unmute" : "🔔 Mute";
    muteButton.classList.toggle("is-muted", muted);
    muteButton.title = muted
      ? "Turn notifications back on for this conversation"
      : "Mute notifications for this conversation";
    muteButton.setAttribute("aria-pressed", String(muted));
  }

  window.setCurrentChatMuteTarget = function(kind, id) {
    currentMuteTarget = kind && id ? { kind, id } : null;
    updateMuteButton();
  };

  muteButton?.addEventListener("click", () => {
    if (!currentMuteTarget || !notificationUserId) return;
    const chats = getMutedChats();
    const key = currentMuteTarget.kind + ":" + currentMuteTarget.id;
    if (chats[key]) delete chats[key];
    else chats[key] = true;
    try {
      localStorage.setItem(mutedChatsKey(notificationUserId), JSON.stringify(chats));
      const muted = Boolean(chats[key]);
      const dbChange = muted
        ? supabaseClient.from("notification_mutes").upsert({
            user_id: notificationUserId,
            chat_kind: currentMuteTarget.kind,
            chat_id: currentMuteTarget.id,
            muted: true,
            updated_at: new Date().toISOString()
          }, { onConflict: "user_id,chat_kind,chat_id" })
        : supabaseClient.from("notification_mutes").delete()
            .eq("user_id", notificationUserId)
            .eq("chat_kind", currentMuteTarget.kind)
            .eq("chat_id", currentMuteTarget.id);
      dbChange.then(({ error }) => {
        if (error) console.warn("Could not sync notification mute:", error);
      });
      updateMuteButton();
      showToast(
        muted ? "Conversation muted" : "Conversation unmuted",
        muted ? "You won't receive alerts for this chat." : "Notifications are back on for this chat."
      );
    } catch (error) {
      console.error("Could not save notification preference:", error);
      showToast("Could not save setting", "Your browser may be blocking local storage.");
    }
  });

  function updateButton() {
    if (!button) return;
    const supported = "Notification" in window;
    const enabled = supported && Notification.permission === "granted";
    button.textContent = enabled ? "♧ Notifications on" :
      (!supported ? "Notifications unavailable" : "♧ Notifications off");
    button.classList.toggle("enabled", enabled);
    button.disabled = !supported;
    button.title = enabled
      ? "Browser notifications are enabled"
      : "Click to allow browser notifications";
  }

  function showToast(title, body) {
    document.querySelector(".chat-notification-toast")?.remove();

    const toast = document.createElement("div");
    toast.className = "chat-notification-toast";
    toast.setAttribute("role", "status");

    const heading = document.createElement("strong");
    heading.textContent = title;

    const message = document.createElement("p");
    message.textContent = body || "You received a new message.";

    toast.append(heading, message);
    document.body.appendChild(toast);

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.remove(), 5500);
  }

  window.showChatNotification = function({ title, body, tag } = {}) {
    const safeTitle = title || "New message";
    const safeBody = body || "You received a new message.";

    // Do not interrupt someone who is already reading this conversation.
    if (!document.hidden && document.hasFocus()) return;

    showToast(safeTitle, safeBody);

    if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
      try {
        const notification = new Notification(safeTitle, {
          body: safeBody,
          tag: tag || "ai-tutor-message",
          icon: "https://nmila001-blip.github.io/AI/favicon.ico"
        });
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      } catch (error) {
        console.warn("Browser notification could not be shown:", error);
      }
    }
  };

  // Push subscription and permission controls are managed by push-notifications.js.

  updateButton();


  async function dispatchPush(eventType, messageId) {
    try {
      const { error } = await supabaseClient.functions.invoke("send-push-notification", {
        body: { event_type: eventType, message_id: messageId }
      });
      if (error) console.warn("Push dispatch failed:", error);
    } catch (error) {
      console.warn("Push dispatch request failed:", error);
    }
  }

  let notificationChannel = null;
  async function connectNotificationChannel(userId) {
    if (notificationChannel) {
      await supabaseClient.removeChannel(notificationChannel);
      notificationChannel = null;
    }
    notificationUserId = userId || null;
    updateMuteButton();
    if (!userId) return;
    try {
      // Preserve mute choices saved by the earlier local-only version.
      const oldLocalMutes = getMutedChats(userId);
      const legacyRows = Object.entries(oldLocalMutes).flatMap(([key, muted]) => {
        const splitAt = key.indexOf(":");
        if (!muted || splitAt < 1) return [];
        return [{
          user_id: userId,
          chat_kind: key.slice(0, splitAt),
          chat_id: key.slice(splitAt + 1),
          muted: true
        }];
      });
      if (legacyRows.length) {
        const { error: migrateError } = await supabaseClient
          .from("notification_mutes")
          .upsert(legacyRows, { onConflict: "user_id,chat_kind,chat_id" });
        if (migrateError) console.warn("Could not migrate older mute settings:", migrateError);
      }

      const { data: muteRows, error: muteError } = await supabaseClient
        .from("notification_mutes")
        .select("chat_kind,chat_id,muted")
        .eq("user_id", userId);
      if (!muteError) {
        const muted = {};
        (muteRows || []).forEach(row => {
          if (row.muted) muted[row.chat_kind + ":" + row.chat_id] = true;
        });
        localStorage.setItem(mutedChatsKey(userId), JSON.stringify(muted));
        updateMuteButton();
      }
    } catch (error) {
      console.warn("Could not load synced mute preferences:", error);
    }

    notificationChannel = supabaseClient
      .channel("all-chat-notification-events-" + userId)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "chat_messages"
      }, async payload => {
        const message = payload.new;
        if (!message) return;
        if (message.sender_id === userId) { dispatchPush("direct_message", message.id); return; }
        if (isChatMuted("group", message.group_id, userId)) return;
        if (isChatMuted("direct", message.conversation_id, userId)) return;
        if (typeof activeMessageConversation !== "undefined" &&
            activeMessageConversation === message.conversation_id &&
            !document.hidden && document.hasFocus()) return;

        const { data: conversation } = await supabaseClient
          .from("conversations")
          .select("user_one,user_two")
          .eq("id", message.conversation_id)
          .maybeSingle();
        if (!conversation) return;

        const friendId = conversation.user_one === userId
          ? conversation.user_two : conversation.user_one;
        const { data: profile } = await supabaseClient
          .from("user_profiles")
          .select("display_name")
          .eq("user_id", friendId)
          .maybeSingle();

        window.showChatNotification?.({
          title: profile?.display_name || "New private message",
          body: message.body || "📷 Photo",
          tag: "direct-" + message.conversation_id
        });
      })
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "group_messages"
      }, async payload => {
        const message = payload.new;
        if (!message) return;
        if (message.sender_id === userId) { dispatchPush("group_message", message.id); return; }
        if (typeof activeGroupChatId !== "undefined" &&
            activeGroupChatId === message.group_id &&
            !document.hidden && document.hasFocus()) return;

        const [{ data: group }, { data: sender }] = await Promise.all([
          supabaseClient.from("group_conversations")
            .select("name").eq("id", message.group_id).maybeSingle(),
          supabaseClient.from("user_profiles")
            .select("display_name").eq("user_id", message.sender_id).maybeSingle()
        ]);

        window.showChatNotification?.({
          title: group?.name || "Group message",
          body: (sender?.display_name || "Someone") + ": " + (message.body || "📷 Photo"),
          tag: "group-" + message.group_id
        });
      })
      .subscribe(status => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("Chat notification listener disconnected:", status);
        }
      });
  }

  supabaseClient.auth.getSession().then(({ data }) => {
    connectNotificationChannel(data.session?.user?.id || null);
  });

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
      connectNotificationChannel(session?.user?.id || null);
    } else if (event === "SIGNED_OUT") {
      connectNotificationChannel(null);
    }
  });
})();
