/* ==========================================
   CHAT NOTIFICATIONS
   In-page alerts + optional browser notifications
========================================== */
(() => {
  if (document.body.dataset.page !== "messages") return;

  const button = document.getElementById("enable-chat-notifications");
  let toastTimer = null;

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

  button?.addEventListener("click", async () => {
    if (!("Notification" in window)) {
      showToast("Notifications unavailable", "This browser does not support desktop notifications.");
      return;
    }

    if (Notification.permission === "granted") {
      showToast("Notifications are on", "You'll get browser alerts when a new message arrives while this tab is in the background.");
      updateButton();
      return;
    }

    if (Notification.permission === "denied") {
      showToast("Notifications are blocked", "Allow notifications for this site in your browser's site settings, then refresh.");
      updateButton();
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      updateButton();
      showToast(
        permission === "granted" ? "Notifications enabled" : "Notifications not enabled",
        permission === "granted"
          ? "You'll get browser alerts when new messages arrive while this tab is in the background."
          : "You can enable them later in your browser's site settings."
      );
    } catch (error) {
      console.error("Notification permission error:", error);
      showToast("Could not enable notifications", "Check your browser's site permissions.");
    }
  });

  updateButton();
})();
