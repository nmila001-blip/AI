/* ==========================================
   WEB PUSH NOTIFICATIONS
========================================== */
(() => {
  if (document.body.dataset.page !== "messages") return;

  const button = document.getElementById("enable-chat-notifications");
  const status = document.getElementById("push-notification-status");
  const PUBLIC_VAPID_KEY = "BMmRr1LQ1EwFCKuqDJgMg1OMDI3yVj3iZl9GanLQBONZ5SBcHHrViYKb_hqP5knzBuFo9Kh9O4DDhydtPGVR8YQ";
  let busy = false;

  const setStatus = message => { if (status) status.textContent = message || ""; };
  const withTimeout = (promise, label, milliseconds = 8000) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label + " timed out. Check browser service-worker support and reload.")), milliseconds))
  ]);
  const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  function base64UrlToBytes(value) {
    const padding = "=".repeat((4 - value.length % 4) % 4);
    const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, char => char.charCodeAt(0));
  }

  async function getRegistration() {
    return navigator.serviceWorker.register("/AI/sw.js", { scope: "/AI/" });
  }

  async function getSubscription() {
    const registration = await navigator.serviceWorker.getRegistration("/AI/");
    return registration ? registration.pushManager.getSubscription() : null;
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
      setStatus("Browser APIs detected. Checking this browser’s notification subscription…");
      const subscription = await withTimeout(getSubscription(), "Notification subscription check");
      const enabled = Boolean(subscription);
      button.textContent = enabled ? "♧ Notifications on" : "♧ Notifications off";
      button.classList.toggle("enabled", enabled);
      button.disabled = busy;
      button.title = enabled ? "Click to turn system notifications off" : "Click to turn system notifications on";

      if (Notification.permission === "denied" && !enabled) {
        setStatus("Notifications are blocked. Allow them in this site's browser settings.");
      } else if (enabled) {
        setStatus("System notifications are enabled on this browser.");
      } else if (!status?.dataset.error) {
        setStatus("Click the button to enable notifications.");
      }
    } catch (error) {
      console.error("Could not inspect push subscription:", error);
      button.textContent = "♧ Notifications off";
      button.disabled = busy;
      if (!status?.dataset.error) setStatus("Could not check notification status: " + (error.message || error));
    }
  }

  async function enablePush(permissionPromise) {
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

    const { data, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError) throw sessionError;
    if (!data.session) throw new Error("Sign in before enabling system notifications.");

    const json = subscription.toJSON();
    const { error } = await supabaseClient.from("push_subscriptions").upsert({
      user_id: data.session.user.id,
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      updated_at: new Date().toISOString()
    }, { onConflict: "endpoint" });
    if (error) throw error;

    setStatus("Notifications are enabled on this browser.");
  }

  async function disablePush(subscription) {
    if (!subscription) {
      setStatus("Notifications are already off.");
      return;
    }

    if (typeof supabaseClient === "undefined") {
      throw new Error("The app connection is not ready. Refresh Messages and try again.");
    }

    const { data, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError) throw sessionError;

    if (data.session) {
      const { error } = await supabaseClient.from("push_subscriptions")
        .delete()
        .eq("user_id", data.session.user.id)
        .eq("endpoint", subscription.endpoint);
      if (error) throw error;
    }

    await subscription.unsubscribe();
    setStatus("Notifications have been turned off on this browser.");
  }

  if (!button) {
    console.error("Notification toggle button was not found on Messages page.");
    return;
  }

  // Attach the click handler immediately, before any initialization awaits.
  button.addEventListener("click", async event => {
    event.preventDefault();
    if (busy) return;

    if (!supported()) {
      setStatus("This browser does not support Web Push.");
      return;
    }

    // IMPORTANT: trigger the browser permission prompt synchronously from
    // the click, before the first await (browser user-activation requirement).
    const permissionAtClick = Notification.permission;
    let permissionPromise = null;
    if (permissionAtClick === "default") {
      try {
        permissionPromise = Notification.requestPermission();
      } catch (error) {
        permissionPromise = Promise.reject(error);
      }
    } else {
      permissionPromise = Promise.resolve(permissionAtClick);
    }

    busy = true;
    button.disabled = true;
    button.textContent = "Setting up…";
    if (status) delete status.dataset.error;
    let failureMessage = "";

    try {
      const subscription = await getSubscription();

      if (subscription) {
        await disablePush(subscription);
      } else {
        if (permissionAtClick === "denied") {
          throw new Error("Notifications are blocked for this site. Open the site settings, set Notifications to Allow, then reload.");
        }
        await enablePush(permissionPromise);
      }
    } catch (error) {
      console.error("Web Push setup failed:", error);
      failureMessage = error?.message || String(error) || "Unknown notification error.";
      if (status) status.dataset.error = "true";
    } finally {
      busy = false;
      await updateButton();
      if (failureMessage) setStatus("Couldn't change notifications: " + failureMessage);
    }
  });

  // Initialization never blocks the click handler.
  setStatus("Browser APIs detected. Starting the notification service worker…");
  updateButton();
  withTimeout(getRegistration(), "Service worker registration", 10000)
    .then(() => updateButton())
    .catch(error => {
      console.warn("Service worker registration failed:", error);
      if (!status?.dataset.error) setStatus("Service worker could not start: " + (error.message || error));
    });
})();