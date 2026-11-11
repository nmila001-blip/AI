/* ==========================================
   GROUP CHATS
========================================== */
(() => {
  const $ = id => document.getElementById(id);
  const list = $("group-chat-list");
  const form = $("message-form");
  let groupChannel = null;
  let activeGroup = null;
  let knownGroups = [];

  const escape = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  })[ch]);

  function showStatus(message, error = false) {
    const el = $("message-status");
    if (el) {
      el.textContent = message || "";
      el.style.color = error ? "#ff9299" : "#9bdcb8";
    }
  }

  async function closeGroupChannel() {
    if (groupChannel) await supabaseClient.removeChannel(groupChannel);
    groupChannel = null;
  }
  window.closeGroupChatChannel = closeGroupChannel;
  window.deactivateGroupChat = async function() {
    activeGroup = null;
    window.activeGroupChatId = null;
    await closeGroupChannel();
    await loadGroups();
  };

  async function loadGroups() {
    if (!currentUser || !list) return;
    list.innerHTML = '<div class="messages-placeholder">Loading groups...</div>';

    try {
      const { data: memberships, error: memberError } = await supabaseClient
        .from("group_members")
        .select("group_id")
        .eq("user_id", currentUser.id);
      if (memberError) throw memberError;

      const ids = (memberships || []).map(row => row.group_id);
      if (!ids.length) {
        knownGroups = [];
        list.innerHTML = '<div class="group-list-empty">No group chats yet.</div>';
        return;
      }

      const { data, error } = await supabaseClient
        .from("group_conversations")
        .select("id,name,created_by")
        .in("id", ids)
        .order("created_at", { ascending: false });
      if (error) throw error;

      knownGroups = data || [];
      list.innerHTML = knownGroups.map(group => (
        '<button type="button" class="message-friend group-friend ' +
        (activeGroup === group.id ? "active" : "") +
        '" data-group-chat="' + escape(group.id) + '">' +
        '<span class="message-friend-avatar">#</span>' +
        '<span class="message-friend-info"><strong>' + escape(group.name) +
        '</strong><p>Group conversation</p></span></button>'
      )).join("");
    } catch (error) {
      console.error("Group list error:", error);
      list.innerHTML = '<div class="group-list-empty">Could not load groups.</div>';
    }
  }

  async function loadAcceptedFriends() {
    const { data: requests, error } = await supabaseClient
      .from("friend_requests")
      .select("sender_id,receiver_id")
      .eq("status", "accepted");
    if (error) throw error;

    const ids = [...new Set((requests || []).map(row =>
      row.sender_id === currentUser.id ? row.receiver_id :
      row.receiver_id === currentUser.id ? row.sender_id : null
    ).filter(Boolean))];

    if (!ids.length) return [];
    const { data: profiles, error: profileError } = await supabaseClient
      .from("user_profiles")
      .select("user_id,display_name")
      .in("user_id", ids);
    if (profileError) throw profileError;
    return profiles || [];
  }

  async function openCreateGroup() {
    if (!currentUser) {
      showStatus("Sign in before creating a group.", true);
      return;
    }

    try {
      const friends = await loadAcceptedFriends();
      if (!friends.length) {
        showStatus("Add accepted friends before creating a group.", true);
        return;
      }

      let dialog = $("create-group-dialog");
      if (!dialog) {
        dialog = document.createElement("dialog");
        dialog.id = "create-group-dialog";
        dialog.className = "group-create-dialog";
        document.body.appendChild(dialog);
      }

      const checks = friends.map(friend =>
        '<label class="group-member-option"><input type="checkbox" name="group-member" value="' +
        escape(friend.user_id) + '"><span>' + escape(friend.display_name || "Student") +
        '</span></label>'
      ).join("");

      dialog.innerHTML =
        '<form id="create-group-form" method="dialog">' +
        '<h2>Create a group chat</h2>' +
        '<p>Choose a name and the friends you want to add.</p>' +
        '<label class="group-name-label">Group name' +
        '<input id="new-group-name" maxlength="60" required placeholder="Study group"></label>' +
        '<div class="group-member-choices">' + checks + '</div>' +
        '<p id="create-group-status" class="message-status"></p>' +
        '<div class="group-dialog-actions"><button type="button" id="cancel-group-create">Cancel</button>' +
        '<button type="submit" id="save-group-create">Create group</button></div></form>';

      dialog.showModal();
      $("cancel-group-create").addEventListener("click", () => dialog.close());

      $("create-group-form").addEventListener("submit", async event => {
        event.preventDefault();
        const name = $("new-group-name").value.trim();
        const selected = [...dialog.querySelectorAll('input[name="group-member"]:checked')]
          .map(input => input.value);
        const status = $("create-group-status");
        const submit = $("save-group-create");

        if (!name) {
          status.textContent = "Enter a group name.";
          return;
        }
        if (!selected.length) {
          status.textContent = "Choose at least one friend.";
          return;
        }

        submit.disabled = true;
        status.textContent = "Creating group...";
        try {
          const { data: created, error: createError } = await supabaseClient
            .from("group_conversations")
            .insert({ name, created_by: currentUser.id })
            .select("id,name,created_by")
            .single();
          if (createError) throw createError;

          const rows = [
            { group_id: created.id, user_id: currentUser.id, role: "owner" },
            ...selected.map(userId => ({
              group_id: created.id, user_id: userId, role: "member"
            }))
          ];
          const { error: membersError } = await supabaseClient
            .from("group_members")
            .insert(rows);
          if (membersError) throw membersError;

          dialog.close();
          await loadGroups();
          await openGroupChat(created);
        } catch (error) {
          console.error("Create group error:", error);
          status.textContent = error.message || "Could not create the group.";
          submit.disabled = false;
        }
      });
    } catch (error) {
      console.error("Could not prepare group dialog:", error);
      showStatus(error.message || "Could not load your friends.", true);
    }
  }

  async function renderGroupMessage(message, profileMap) {
    const target = $("message-list");
    if (!target || target.querySelector('[data-group-message="' + message.id + '"]')) return;
    target.querySelector(".messages-placeholder")?.remove();

    const mine = message.sender_id === currentUser.id;
    const row = document.createElement("div");
    row.className = "message-row " + (mine ? "mine" : "");
    row.dataset.groupMessage = message.id;

    const sender = document.createElement("span");
    sender.className = "message-sender";
    sender.textContent = mine ? "You" : (profileMap[message.sender_id] || "Student");

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    if (message.body) bubble.appendChild(document.createTextNode(message.body));

    if (message.image_path) {
      const image = document.createElement("img");
      image.className = "shared-chat-image";
      image.alt = "Photo attachment";
      image.loading = "lazy";
      bubble.appendChild(image);
      try {
        image.src = await window.getChatImageUrl(message.image_path);
      } catch (error) {
        console.error("Could not load group photo:", error);
      }
    }

    const time = document.createElement("span");
    time.className = "message-time";
    time.textContent = new Date(message.created_at).toLocaleTimeString([], {
      hour: "numeric", minute: "2-digit"
    });

    row.append(sender, bubble, time);
    target.appendChild(row);
    target.scrollTop = target.scrollHeight;
  }

  async function loadGroupMessages(groupId) {
    const target = $("message-list");
    target.innerHTML = '<div class="messages-placeholder">Loading group messages...</div>';

    const { data, error } = await supabaseClient
      .from("group_messages")
      .select("id,group_id,sender_id,body,image_path,created_at")
      .eq("group_id", groupId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw error;

    target.innerHTML = "";
    if (!data?.length) {
      target.innerHTML = '<div class="messages-placeholder">No messages yet. Say hello!</div>';
      return;
    }

    const ids = [...new Set(data.map(item => item.sender_id))];
    const { data: profiles, error: profileError } = await supabaseClient
      .from("user_profiles")
      .select("user_id,display_name")
      .in("user_id", ids);
    if (profileError) throw profileError;

    const map = Object.fromEntries((profiles || []).map(profile =>
      [profile.user_id, profile.display_name || "Student"]
    ));
    for (const message of data) await renderGroupMessage(message, map);
  }

  async function openGroupChat(group) {
    if (!currentUser) return;
    await closeGroupChannel();
    if (typeof closeMessageChannel === "function") await closeMessageChannel();

    activeGroup = group.id;
    window.activeGroupChatId = group.id;
    activeMessageConversation = null;
    activeMessageFriend = null;

    $("message-empty").hidden = true;
    $("message-thread").hidden = false;
    $("message-friend-name").textContent = group.name;
    $("message-friend-avatar").textContent = "#";
    const subtitle = $("message-friend-name").parentElement.querySelector("p");
    if (subtitle) subtitle.textContent = "Group conversation";
    const callActions = document.querySelector(".message-call-actions");
    if (callActions) callActions.hidden = true;
    $("message-input").disabled = false;
    $("message-send").disabled = false;

    document.querySelectorAll(".message-friend").forEach(button => {
      button.classList.toggle("active", button.dataset.groupChat === group.id);
    });
    await loadGroupMessages(group.id);

    groupChannel = supabaseClient
      .channel("group-chat-" + group.id)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "group_messages",
        filter: "group_id=eq." + group.id
      }, async payload => {
        if (activeGroup !== group.id) return;
        const { data: profile } = await supabaseClient
          .from("user_profiles")
          .select("user_id,display_name")
          .eq("user_id", payload.new.sender_id)
          .maybeSingle();
        const map = { [payload.new.sender_id]: profile?.display_name || "Student" };
        await renderGroupMessage(payload.new, map);
      })
      .subscribe(status => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          showStatus("Group live updates disconnected. Refresh to reconnect.", true);
        } else if (status === "SUBSCRIBED") {
          showStatus("");
        }
      });

    await loadGroups();
    $("message-input").focus();
  }

  async function sendGroupMessage() {
    const textInput = $("message-input");
    const send = $("message-send");
    const fileInput = $("message-image");
    const status = $("message-attachment-status");
    const body = textInput.value.trim();
    const file = fileInput?.files?.[0] || null;

    if (!body && !file) return;
    if (body.length > 4000) {
      showStatus("Messages must be 4,000 characters or fewer.", true);
      return;
    }

    send.disabled = true;
    textInput.disabled = true;
    if (status && file) status.textContent = "Uploading photo...";

    try {
      let imagePath = null;
      if (file) imagePath = await window.uploadChatImage(file, "groups/" + activeGroup);

      const { data, error } = await supabaseClient
        .from("group_messages")
        .insert({
          group_id: activeGroup,
          sender_id: currentUser.id,
          body,
          image_path: imagePath
        })
        .select("id,group_id,sender_id,body,image_path,created_at")
        .single();
      if (error) throw error;

      const { data: profile } = await supabaseClient
        .from("user_profiles")
        .select("user_id,display_name")
        .eq("user_id", currentUser.id)
        .maybeSingle();
      await renderGroupMessage(data, { [currentUser.id]: profile?.display_name || "Student" });

      textInput.value = "";
      if (fileInput) fileInput.value = "";
      if (status) status.textContent = "";
      showStatus("");
    } catch (error) {
      console.error("Group message error:", error);
      showStatus(error.message || "Could not send the group message.", true);
    } finally {
      send.disabled = false;
      textInput.disabled = false;
      textInput.focus();
    }
  }

  $("create-group-button")?.addEventListener("click", openCreateGroup);
  list?.addEventListener("click", event => {
    const button = event.target.closest("[data-group-chat]");
    if (!button) return;
    const group = knownGroups.find(item => item.id === button.dataset.groupChat);
    if (group) openGroupChat(group);
  });

  form?.addEventListener("submit", event => {
    if (!window.activeGroupChatId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    sendGroupMessage();
  }, true);

  document.addEventListener("DOMContentLoaded", loadGroups);
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (!session) {
      activeGroup = null;
      window.activeGroupChatId = null;
      closeGroupChannel();
      if (list) list.innerHTML = "";
    } else if (event === "SIGNED_IN") {
      setTimeout(loadGroups, 300);
    }
  });

  setTimeout(loadGroups, 800);
})();