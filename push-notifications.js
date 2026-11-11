/* ==========================================
   WEB PUSH NOTIFICATIONS
   Delivers system notifications through the service worker,
   including when the messages page is closed.
========================================== */
(() => {
  if (document.body.dataset.page !== "messages") return;

  const button = document.getElementById("enable-chat-notifications");
  const status = document.getElementById("push-notification-status");
  const PUBLIC_VAPID_KEY = "BMmRr1LQ1EwFCKuqDJgMg1OMDI3yVj3iZl9GanLQBONZ5SBcHHrViYKb_hqP5knzBuFo9Kh9O4DDhydtPGVR8YQ";
  const SUPABASE_URL = "https://vjvhqaxhmvkvydnwcbgr.supabase.co";
  let busy = false;

  function setStatus(message) {
    if (status) status.textContent = message || "";
  }

  function supported() {
    return "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
  }

  function base64UrlToBytes(value) {
    const padding = "=".repeat((4 - value.length % 4) % 4);
    const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    return Uint8Array.from(raw, char => char.charCodeAt(0));
  }

  async function getRegistration() {
    return navigator.serviceWorker.register("/AI/sw.js", { scope: "/AI/" });
  }

  async function updateButton() {
    if (!button) return;
    if (!supported()) {
      button.textContent = "Notifications unavailable";
      button.disabled = true;
      setStatus("This browser does not support Web Push.");
      return;
    }

    try {
      const registration = await navigator.serviceWorker.getRegistration("/AI/");
      const subscription = registration
        ? await registration.pushManager.getSubscription()
        : null;
      const enabled = Boolean(subscription);
      button.textContent = enabled ? "♧ Notifications on" : "♧ Enable system notifications";
      button.classList.toggle("enabled", enabled);
      button.disabled = busy;
      button.title = enabled
        ? "System notifications are enabled, including when this page is closed"
        : "Enable notifications for messages and incoming calls";
      if (Notification.permission === "denied") {
        setStatus("Notifications are blocked for this site. Allow them in Chrome site settings first.");
      } else if (enabled) {
        setStatus("System notifications are enabled on this browser.");
      } else {
        setStatus("Enable this once to receive alerts when AI Tutor is closed.");
      }
    } catch (error) {
      console.warn("Could not inspect push subscription:", error);
      button.textContent = "♧ Enable system notifications";
      button.disabled = busy;
    }
  }

  async function enablePush() {
    if (!supported()) throw new Error("Web Push is not supported by this browser.");
    if (Notification.permission === "denied") {
      throw new Error("Notifications are blocked. Open Chrome site settings and allow notifications for this website.");
    }

    const permission = Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Notification permission was not granted.");

    const registration = await getRegistration();
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(PUBLIC_VAPID_KEY)
      });
    }

    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError) throw sessionError;
    if (!sessionData.session) throw new Error("Sign in before enabling system notifications.");

    const json = subscription.toJSON();
    const { error } = await supabaseClient.from("push_subscriptions").upsert({
      user_id: sessionData.session.user.id,
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      updated_at: new Date().toISOString()
    }, { onConflict: "endpoint" });
    if (error) throw error;

    setStatus("System notifications are ready. You can close this page and still receive alerts.");
  }

  async function disablePush() {
    const registration = await navigator.serviceWorker.getRegistration("/AI/");
    if (!registration) return;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    const endpoint = subscription.endpoint;
    const { data: sessionData } = await supabaseClient.auth.getSession();
    if (sessionData.session) {
      const { error } = await supabaseClient.from("push_subscriptions")
        .delete()
        .eq("user_id", sessionData.session.user.id)
        .eq("endpoint", endpoint);
      if (error) throw error;
    }
    await subscription.unsubscribe();
    setStatus("System notifications have been turned off on this browser.");
  }

  button?.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    button.disabled = true;
    try {
      const registration = await navigator.serviceWorker.getRegistration("/AI/");
      const subscription = registration
        ? await registration.pushManager.getSubscription()
        : null;
      if (subscription) await disablePush();
      else await enablePush();
    } catch (error) {
      console.error("Web Push setup failed:", error);
      setStatus(error.message || "Could not enable system notifications.");
      window.showChatNotification?.({
        title: "Notification setup",
        body: error.message || "Could not enable system notifications."
      });
    } finally {
      busy = false;
      await updateButton();
    }
  });

  async function start() {
    if (supported()) {
      try { await getRegistration(); }
      catch (error) { console.warn("Service worker registration failed:", error); }
    }
    await updateButton();
  }

  start();
})();
