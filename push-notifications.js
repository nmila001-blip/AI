/* ==========================================
   WEB PUSH NOTIFICATIONS
   Delivers system notifications through the service worker.
========================================== */
(() => {
  if (document.body.dataset.page !== "messages") return;

  const button = document.getElementById("enable-chat-notifications");
  const status = document.getElementById("push-notification-status");
  const PUBLIC_VAPID_KEY = "BMmRr1LQ1EwFCKuqDJgMg1OMDI3yVj3iZl9GanLQBONZ5SBcHHrViYKb_hqP5knzBuFo9Kh9O4DDhydtPGVR8YQ";
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
      setStatus("This browser does not support Web Push. Try the latest Chrome or Edge.");
      return;
    }

    try {
      const registration = await navigator.serviceWorker.getRegistration("/AI/");
      const subscription = registration
        ? await registration.pushManager.getSubscription()
        : null;
      const enabled = Boolean(subscription);

      button.textContent = enabled ? "♧ Notifications on" : "♧ Notifications off";
      button.classList.toggle("enabled", enabled);
      button.disabled = busy;
      button.title = enabled
        ? "Click to turn system notifications off"
        : "Click to turn system notifications on";

      if (Notification.permission === "denied") {
        setStatus("Browser permission is blocked. Allow notifications in this site's browser settings.");
      } else if (enabled) {
        setStatus("System notifications are enabled on this browser.");
      } else if (!status?.dataset.error) {
        setStatus("Click the button to enable notifications.");
      }
    } catch (error) {
      console.error("Could not inspect push subscription:", error);
      button.textContent = "♧ Notifications off";
      button.disabled = busy;
      setStatus("Could not check notification status: " + (error.message || error));
    }
  }

  async function enablePush(permissionPromise) {
    if (!supported()) throw new Error("This browser does not support Web Push.");
    if (Notification.permission === "denied") {
      throw new Error("Notifications are blocked for this site. Open browser site settings and change Notifications to Allow.");
    }

    // The permission request is started directly inside the button click,
    // before any asynchronous work, so browsers recognize the user gesture.
    const permission = await permissionPromise;
    if (permission !== "granted") {
      throw new Error("Notification permission was not granted. Check this site's browser permissions.");
    }

    setStatus("Permission granted. Setting up notifications…");
    const registration = await getRegistration();
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(PUBLIC_VAPID_KEY)
      });
    }

    if (typeof supabaseClient === "undefined") {
      throw new Error("The app connection is not ready. Refresh Messages and try again.");
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
    setStatus("Notifications are enabled on this browser.");
  }

  async function disablePush() {
    const registration = await navigator.serviceWorker.getRegistration("/AI/");
    if (!registration) throw new Error("No notification registration was found. Refresh and try again.");

    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      setStatus("Notifications are already off.");
      return;
    }

    if (typeof supabaseClient === "undefined") {
      throw new Error("The app connection is not ready. Refresh Messages and try again.");
    }

    const endpoint = subscription.endpoint;
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError) throw sessionError;

    if (sessionData.session) {
      const { error } = await supabaseClient.from("push_subscriptions")
        .delete()
        .eq("user_id", sessionData.session.user.id)
        .eq("endpoint", endpoint);
      if (error) throw error;
    }

    await subscription.unsubscribe();
    setStatus("Notifications have been turned off on this browser.");
  }

  if (!button) {
    console.error("Notification toggle button was not found on Messages page.");
    return;
  }

  button.addEventListener("click", async event => {
    event.preventDefault();
    if (busy) return;

    busy = true;
    button.disabled = true;
    button.textContent = "Setting up…";
    if (status) delete status.dataset.error;

    let permissionPromise = null;
    try {
      if (!supported()) throw new Error("This browser does not support Web Push.");

      const registration = await navigator.serviceWorker.getRegistration("/AI/");
      const subscription = registration
        ? await registration.pushManager.getSubscription()
        : null;

      if (subscription) {
        await disablePush();
      } else {
        if (Notification.permission === "denied") {
          throw new Error("Notifications are blocked. Allow them in browser site settings, then try again.");
        }
        // Request permission before doing any more awaits.
        permissionPromise = Notification.permission === "granted"
          ? Promise.resolve("granted")
          : Notification.requestPermission();
        await enablePush(permissionPromise);
      }

      if (status) delete status.dataset.error;
    } catch (error) {
      console.error("Web Push setup failed:", error);
      const message = error?.message || String(error) || "Could not change notification settings.";
      if (status) {
        status.dataset.error = "true";
        setStatus("Couldn't change notifications: " + message);
      }
    } finally {
      busy = false;
      await updateButton();
      if (status?.dataset.error) {
        // updateButton refreshes the label but must not erase the actual error.
        const currentError = status.textContent;
        if (!currentError.startsWith("Couldn't change notifications:")) {
          setStatus("Couldn't change notifications. Please try again and check browser permissions.");
        }
      }
    }
  });

  async function start() {
    if (!supported()) {
      await updateButton();
      return;
    }
    try {
      await getRegistration();
    } catch (error) {
      console.warn("Service worker registration failed:", error);
    }
    await updateButton();
  }

  start();
})();
