
/* ==========================================
   MESSAGES - READ RECEIPTS & UNREAD COUNTS
========================================== */

(() => {
  let userId = null;
  let refreshChannel = null;
  let observer = null;
  let refreshRunning = false;
  let readRunning = false;

  const $ = id => document.getElementById(id);

  async function initialize() {
    if (document.body.dataset.page !== "messages") return;

    const { data } = await supabaseClient.auth.getSession();

    if (!data.session) return;

    userId = data.session.user.id;

    await refreshUnreadCounts();

    subscribeToMessageChanges();

    const messageList = $("message-list");

    if (messageList) {
      observer = new MutationObserver(() => {
        updateReadReceipts();
        markActiveConversationRead();
      });

      observer.observe(messageList, {
        childList: true,
        subtree: true
      });
    }

    // Also refresh unread counts when the user returns to this tab.
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        refreshUnreadCounts();
        updateReadReceipts();
      }
    });

    // Refresh after switching between conversations.
    $("message-friends")?.addEventListener("click", () => {
      setTimeout(() => {
        updateReadReceipts();
        markActiveConversationRead();
      }, 250);
    });
  }

  async function getUnreadCounts() {
    const { data: conversations, error: conversationError } =
      await supabaseClient
        .from("conversations")
        .select("id, user_one, user_two")
        .or(`user_one.eq.${userId},user_two.eq.${userId}`);

    if (conversationError) throw conversationError;

    const ids = (conversations || []).map(item => item.id);

    if (!ids.length) return {};

    const { data: unread, error: unreadError } =
      await supabaseClient
        .from("chat_messages")
        .select("conversation_id")
        .in("conversation_id", ids)
        .neq("sender_id", userId)
        .is("read_at", null);

    if (unreadError) throw unreadError;

    const counts = {};

    (unread || []).forEach(message => {
      counts[message.conversation_id] =
        (counts[message.conversation_id] || 0) + 1;
    });

    return Object.fromEntries(
      (conversations || []).map(conversation => {
        const friendId = conversation.user_one === userId
          ? conversation.user_two
          : conversation.user_one;

        return [
          friendId,
          counts[conversation.id] || 0
        ];
      })
    );
  }

  async function refreshUnreadCounts() {
    if (!userId || refreshRunning) return;

    refreshRunning = true;

    try {
      const counts = await getUnreadCounts();

      document.querySelectorAll("[data-message-user]").forEach(button => {
        const friendId = button.dataset.messageUser;
        const count = counts[friendId] || 0;

        let badge = button.querySelector(".message-unread-count");

        if (count > 0) {
          if (!badge) {
            badge = document.createElement("span");
            badge.className = "message-unread-count";
            button.appendChild(badge);
          }

          badge.textContent = count > 99 ? "99+" : String(count);
        } else {
          badge?.remove();
        }
      });

    } catch (error) {
      console.error("Unread count error:", error);
    } finally {
      refreshRunning = false;
    }
  }

  async function markActiveConversationRead() {
    if (
      !userId ||
      !activeMessageConversation ||
      document.hidden ||
      readRunning
    ) return;

    const thread = $("message-thread");

    if (!thread || thread.hidden) return;

    readRunning = true;

    try {
      const { error } = await supabaseClient
        .from("chat_messages")
        .update({
          read_at: new Date().toISOString()
        })
        .eq("conversation_id", activeMessageConversation)
        .neq("sender_id", userId)
        .is("read_at", null);

      if (error) throw error;

      await refreshUnreadCounts();

    } catch (error) {
      console.error("Mark read error:", error);
    } finally {
      readRunning = false;
    }
  }

  async function updateReadReceipts() {
    if (!userId || !activeMessageConversation) return;

    try {
      const { data, error } = await supabaseClient
        .from("chat_messages")
        .select("id, sender_id, read_at")
        .eq("conversation_id", activeMessageConversation);

      if (error) throw error;

      (data || []).forEach(message => {
        if (message.sender_id !== userId) return;

        const row = document.querySelector(
          `[data-message-id="${message.id}"]`
        );

        if (!row) return;

        let receipt = row.querySelector(".message-read-status");

        if (!receipt) {
          receipt = document.createElement("span");
          receipt.className = "message-read-status";
          row.appendChild(receipt);
        }

        receipt.textContent = message.read_at ? "Seen" : "Sent";
        receipt.classList.toggle("seen", !!message.read_at);
      });

    } catch (error) {
      console.error("Read receipt error:", error);
    }
  }

  function subscribeToMessageChanges() {
    if (refreshChannel) {
      supabaseClient.removeChannel(refreshChannel);
    }

    refreshChannel = supabaseClient
      .channel("message-receipt-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_messages"
        },
        async payload => {
          if (payload.eventType === "INSERT") {
            await refreshUnreadCounts();
          }

          if (
            payload.eventType === "UPDATE" &&
            payload.new?.conversation_id === activeMessageConversation
          ) {
            await updateReadReceipts();
          }

          if (payload.eventType === "UPDATE") {
            await refreshUnreadCounts();
          }
        }
      )
      .subscribe();
  }

  supabaseClient.auth.onAuthStateChange((event, session) => {
    userId = session?.user?.id || null;

    if (userId) {
      setTimeout(() => {
        refreshUnreadCounts();
        updateReadReceipts();
      }, 300);
    } else {
      if (refreshChannel) {
        supabaseClient.removeChannel(refreshChannel);
        refreshChannel = null;
      }
    }
  });

  initialize();
})();
