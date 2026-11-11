/* ==========================================
   PRIVATE CHAT PHOTO ATTACHMENTS
========================================== */
(() => {
  const $ = id => document.getElementById(id);
  const input = $("message-image");
  const form = $("message-form");
  const status = $("message-attachment-status");

  window.uploadChatImage = async function(file, folder) {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!file || !allowed.includes(file.type)) {
      throw new Error("Choose a JPG, PNG, WEBP, or GIF image.");
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error("Images must be 10 MB or smaller.");
    }

    const extension = file.type === "image/jpeg" ? "jpg" :
      file.type === "image/png" ? "png" :
      file.type === "image/webp" ? "webp" : "gif";
    const path = folder + "/" + crypto.randomUUID() + "." + extension;
    const { error } = await supabaseClient.storage
      .from("chat-media")
      .upload(path, file, { contentType: file.type, upsert: false });

    if (error) throw error;
    return path;
  };

  window.getChatImageUrl = async function(path) {
    const { data, error } = await supabaseClient.storage
      .from("chat-media")
      .createSignedUrl(path, 3600);
    if (error) throw error;
    return data.signedUrl;
  };

  input?.addEventListener("change", () => {
    const file = input.files?.[0];
    if (status) status.textContent = file ? "Selected: " + file.name : "";
  });

  form?.addEventListener("submit", async event => {
    if (window.activeGroupChatId) return;
    const file = input?.files?.[0];
    if (!file) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const textInput = $("message-input");
    const send = $("message-send");
    const body = textInput.value.trim();

    if (!currentUser || !activeMessageConversation) {
      if (status) status.textContent = "Open a private conversation first.";
      return;
    }

    if (body.length > 4000) {
      if (status) status.textContent = "Messages must be 4,000 characters or fewer.";
      return;
    }

    send.disabled = true;
    textInput.disabled = true;
    if (status) status.textContent = "Uploading photo...";

    try {
      const imagePath = await window.uploadChatImage(file, "direct/" + activeMessageConversation);
      const { data, error } = await supabaseClient
        .from("chat_messages")
        .insert({
          conversation_id: activeMessageConversation,
          sender_id: currentUser.id,
          body: body || "",
          image_path: imagePath
        })
        .select("id, conversation_id, sender_id, body, image_path, created_at")
        .single();

      if (error) throw error;

      appendPrivateMessage(data);
      textInput.value = "";
      input.value = "";
      if (status) status.textContent = "";
      await loadMessagesPage();
    } catch (error) {
      console.error("Photo message error:", error);
      if (status) status.textContent = error.message || "Photo could not be sent.";
    } finally {
      send.disabled = false;
      textInput.disabled = false;
      textInput.focus();
    }
  });
})();