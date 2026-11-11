/* ==========================================
   ONE-TO-ONE VOICE AND VIDEO CALLING
   WebRTC media + private Supabase Broadcast signaling
========================================== */
(() => {
  const $ = id => document.getElementById(id);
  if (document.body.dataset.page !== "messages") return;

  let userId = null;
  let ownDisplayName = "Friend";
  let ownSignalChannel = null;
  let ownChannelReady = null;
  const outgoingChannels = new Map();

  let peer = null;
  let localStream = null;
  let remoteStream = null;
  let activeCall = null;
  let pendingCandidates = [];
  let ringTimer = null;
  let durationTimer = null;
  let callStartedAt = null;
  let muted = false;
  let cameraEnabled = true;

  const rtcConfig = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" }
    ]
  };

  function setCallText(id, value) {
    const element = $(id);
    if (element) element.textContent = value;
  }

  function showOverlay() {
    $("call-overlay").hidden = false;
    $("call-error").textContent = "";
  }

  function setCallState(value) {
    setCallText("call-state", value);
  }

  function setVideoPlaceholder(show) {
    $("call-video-placeholder").hidden = !show;
  }

  function updateMediaButtons() {
    $("call-mute").textContent = muted ? "Unmute" : "Mute";
    $("call-camera").textContent = cameraEnabled ? "Camera off" : "Camera on";
    $("call-camera").disabled = !activeCall || activeCall.mode !== "video";
  }

  function getFriendName() {
    return $("message-friend-name")?.textContent || "Friend";
  }

  function getFriendId() {
    try {
      return activeMessageFriend || null;
    } catch {
      return null;
    }
  }

  function createCallId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
    return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" +
      hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
  }

  async function subscribeOwnChannel() {
    if (!userId) throw new Error("Sign in before making a call.");
    if (ownChannelReady) return ownChannelReady;

    ownSignalChannel = supabaseClient.channel("private-call-" + userId, {
      config: { private: true }
    });

    ownChannelReady = new Promise((resolve, reject) => {
      ownSignalChannel
        .on("broadcast", { event: "call-signal" }, ({ payload }) => {
          handleSignal(payload).catch(error => {
            console.error("Call signal error:", error);
            $("call-error").textContent = error.message || "Call connection error.";
          });
        })
        .subscribe(status => {
          if (status === "SUBSCRIBED") resolve(true);
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            ownChannelReady = null;
            reject(new Error("Could not connect to call notifications. Refresh and try again."));
          }
        });
    });

    return ownChannelReady;
  }

  async function getOutgoingChannel(targetId) {
    if (outgoingChannels.has(targetId)) {
      return outgoingChannels.get(targetId);
    }

    const channel = supabaseClient.channel("private-call-" + targetId, {
      config: { private: true }
    });

    const ready = new Promise((resolve, reject) => {
      channel.subscribe(status => {
        if (status === "SUBSCRIBED") resolve(channel);
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          outgoingChannels.delete(targetId);
          reject(new Error("Could not reach your friend. Check your connection."));
        }
      });
    });

    outgoingChannels.set(targetId, ready);
    return ready;
  }

  async function sendSignal(targetId, type, payload, callId) {
    const channel = await getOutgoingChannel(targetId);
    const result = await channel.send({
      type: "broadcast",
      event: "call-signal",
      payload: {
        call_id: callId,
        from_user: userId,
        to_user: targetId,
        signal_type: type,
        data: payload || {}
      }
    });

    if (result !== "ok" && result?.status !== "ok") {
      throw new Error("The call signal could not be delivered.");
    }
  }

  function createPeer(targetId) {
    peer = new RTCPeerConnection(rtcConfig);
    remoteStream = new MediaStream();
    $("call-remote-video").srcObject = remoteStream;

    peer.ontrack = event => {
      const stream = event.streams && event.streams[0];
      if (stream) {
        stream.getTracks().forEach(track => {
          if (!remoteStream.getTracks().some(item => item.id === track.id)) {
            remoteStream.addTrack(track);
          }
        });
      } else {
        remoteStream.addTrack(event.track);
      }
      $("call-remote-video").play().catch(() => {});
      setVideoPlaceholder(remoteStream.getTracks().length === 0);
    };

    peer.onicecandidate = event => {
      if (event.candidate && activeCall) {
        sendSignal(targetId, "candidate", {
          candidate: event.candidate.toJSON()
        }, activeCall.id).catch(error => {
          console.error("ICE candidate send failed:", error);
        });
      }
    };

    peer.onconnectionstatechange = () => {
      if (!peer) return;
      const state = peer.connectionState;
      if (state === "connected") {
        clearTimeout(ringTimer);
        setCallState("Connected");
        startDuration();
      } else if (state === "connecting") {
        setCallState("Connecting...");
      } else if (state === "disconnected") {
        setCallState("Connection interrupted...");
      } else if (state === "failed") {
        setCallState("Connection failed. Your network may require a TURN relay.");
        $("call-error").textContent = "Try again on another network. Some school or public networks block direct peer connections.";
      }
    };

    return peer;
  }

  async function addLocalMedia(mode) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser does not support camera or microphone access.");
    }

    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: mode === "video"
    });

    $("call-local-video").srcObject = localStream;
    $("call-local-video").hidden = mode !== "video";
    $("call-local-video").play().catch(() => {});
  }

  async function flushCandidates() {
    if (!peer || !peer.remoteDescription) return;
    const candidates = pendingCandidates.splice(0);
    for (const candidate of candidates) {
      try {
        await peer.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.warn("Could not add queued ICE candidate:", error);
      }
    }
  }

  async function startOutgoingCall(mode) {
    const friendId = getFriendId();
    if (!userId || !friendId || !activeMessageConversation) {
      alert("Open a friend's conversation before starting a call.");
      return;
    }
    if (activeCall) {
      alert("Finish your current call first.");
      return;
    }

    const callId = createCallId();
    activeCall = {
      id: callId,
      peerId: friendId,
      peerName: getFriendName(),
      mode,
      role: "caller"
    };

    $("call-person-name").textContent = activeCall.peerName;
    $("call-incoming-actions").hidden = true;
    $("call-active-actions").hidden = false;
    $("call-video-placeholder").hidden = false;
    $("call-remote-video").srcObject = null;
    muted = false;
    cameraEnabled = true;
    updateMediaButtons();
    showOverlay();
    setCallState(mode === "video" ? "Starting video call..." : "Starting voice call...");

    try {
      await subscribeOwnChannel();
      await addLocalMedia(mode);
      createPeer(friendId);
      localStream.getTracks().forEach(track => peer.addTrack(track, localStream));

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      await sendSignal(friendId, "offer", {
        description: peer.localDescription.toJSON(),
        mode,
        caller_name: ownDisplayName
      }, callId);

      setCallState("Calling " + activeCall.peerName + "...");
      ringTimer = setTimeout(async () => {
        if (activeCall?.id === callId && peer?.connectionState !== "connected") {
          try { await sendSignal(friendId, "cancel", {}, callId); } catch {}
          setCallState("No answer");
          setTimeout(cleanupCall, 1200);
        }
      }, 35000);

    } catch (error) {
      console.error("Could not start call:", error);
      $("call-error").textContent = error.message || "Could not start the call.";
      setCallState("Call could not start");
      setTimeout(cleanupCall, 2200);
    }
  }

  async function handleSignal(signal) {
    if (!signal || signal.to_user !== userId || !signal.call_id) return;

    const type = signal.signal_type;
    const senderId = signal.from_user;

    if (type === "offer") {
      if (activeCall) {
        await sendSignal(senderId, "busy", {}, signal.call_id);
        return;
      }

      activeCall = {
        id: signal.call_id,
        peerId: senderId,
        peerName: signal.data?.caller_name || "Friend",
        mode: signal.data?.mode === "video" ? "video" : "voice",
        role: "callee",
        offer: signal.data?.description
      };

      $("call-person-name").textContent = activeCall.peerName;
      $("call-incoming-actions").hidden = false;
      $("call-active-actions").hidden = true;
      $("call-local-video").hidden = true;
      $("call-remote-video").srcObject = null;
      setVideoPlaceholder(true);
      showOverlay();
      setCallState("Incoming " + activeCall.mode + " call");
      return;
    }

    if (!activeCall || activeCall.id !== signal.call_id) return;

    if (type === "answer" && activeCall.role === "caller" && peer) {
      await peer.setRemoteDescription(new RTCSessionDescription(signal.data.description));
      await flushCandidates();
      setCallState("Connecting...");
      return;
    }

    if (type === "candidate" && signal.data?.candidate) {
      if (peer && peer.remoteDescription) {
        try {
          await peer.addIceCandidate(new RTCIceCandidate(signal.data.candidate));
        } catch (error) {
          console.warn("ICE candidate could not be added:", error);
        }
      } else {
        // Candidates can arrive before the recipient accepts the call.
        pendingCandidates.push(signal.data.candidate);
      }
      return;
    }

    if (["hangup", "decline", "cancel", "busy"].includes(type)) {
      const messages = {
        hangup: "Call ended",
        decline: "Call declined",
        cancel: "Call cancelled",
        busy: "Your friend is busy"
      };
      setCallState(messages[type]);
      setTimeout(cleanupCall, 900);
    }
  }

  async function acceptIncomingCall() {
    if (!activeCall || activeCall.role !== "callee") return;

    const call = activeCall;
    $("call-incoming-actions").hidden = true;
    $("call-active-actions").hidden = false;
    setCallState("Connecting...");

    try {
      await addLocalMedia(call.mode);
      createPeer(call.peerId);
      localStream.getTracks().forEach(track => peer.addTrack(track, localStream));

      await peer.setRemoteDescription(new RTCSessionDescription(call.offer));
      await flushCandidates();

      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      await sendSignal(call.peerId, "answer", {
        description: peer.localDescription.toJSON()
      }, call.id);

      updateMediaButtons();
    } catch (error) {
      console.error("Could not accept call:", error);
      $("call-error").textContent = error.message || "Could not connect the call.";
      setCallState("Call failed");
      try { await sendSignal(call.peerId, "hangup", {}, call.id); } catch {}
      setTimeout(cleanupCall, 1800);
    }
  }

  function startDuration() {
    if (durationTimer) return;
    callStartedAt = Date.now();
    durationTimer = setInterval(() => {
      const seconds = Math.floor((Date.now() - callStartedAt) / 1000);
      const minutes = Math.floor(seconds / 60);
      $("call-duration").textContent =
        String(minutes).padStart(2, "0") + ":" +
        String(seconds % 60).padStart(2, "0");
    }, 1000);
  }

  async function endCall(signalType) {
    if (!activeCall) return;
    const call = activeCall;
    if (signalType) {
      try { await sendSignal(call.peerId, signalType, {}, call.id); }
      catch (error) { console.warn("Could not notify the other caller:", error); }
    }
    setCallState(signalType === "decline" ? "Call declined" : "Call ended");
    cleanupCall();
  }

  function cleanupCall() {
    clearTimeout(ringTimer);
    clearInterval(durationTimer);
    ringTimer = null;
    durationTimer = null;
    callStartedAt = null;

    if (peer) {
      peer.ontrack = null;
      peer.onicecandidate = null;
      peer.close();
    }
    peer = null;

    if (localStream) localStream.getTracks().forEach(track => track.stop());
    if (remoteStream) remoteStream.getTracks().forEach(track => track.stop());
    localStream = null;
    remoteStream = null;
    pendingCandidates = [];
    activeCall = null;
    muted = false;
    cameraEnabled = true;

    $("call-remote-video").srcObject = null;
    $("call-local-video").srcObject = null;
    $("call-local-video").hidden = true;
    $("call-duration").textContent = "";
    $("call-overlay").hidden = true;
    $("call-incoming-actions").hidden = true;
    $("call-active-actions").hidden = true;
  }

  function setupButtons() {
    // Delegate call-start clicks so they still work if the message header is rebuilt.
    document.addEventListener("click", event => {
      const button = event.target.closest("#voice-call-button, #video-call-button");
      if (!button) return;
      event.preventDefault();
      if (button.id === "voice-call-button") startOutgoingCall("voice");
      else startOutgoingCall("video");
    });

    $("call-accept")?.addEventListener("click", acceptIncomingCall);
    $("call-decline")?.addEventListener("click", () => endCall("decline"));
    $("call-hangup")?.addEventListener("click", () => endCall("hangup"));

    $("call-mute")?.addEventListener("click", () => {
      if (!localStream) return;
      muted = !muted;
      localStream.getAudioTracks().forEach(track => track.enabled = !muted);
      updateMediaButtons();
    });

    $("call-camera")?.addEventListener("click", () => {
      if (!localStream || activeCall?.mode !== "video") return;
      cameraEnabled = !cameraEnabled;
      localStream.getVideoTracks().forEach(track => track.enabled = cameraEnabled);
      updateMediaButtons();
    });
  }

  async function initialize() {
    setupButtons();

    const { data, error } = await supabaseClient.auth.getSession();
    if (error) console.error("Call auth check failed:", error);
    userId = data.session?.user?.id || null;

    if (userId && data.session?.access_token) {
      // Make sure Realtime has the signed-in user's JWT before joining private channels.
      await supabaseClient.realtime.setAuth(data.session.access_token);

      const { data: profile } = await supabaseClient
        .from("user_profiles")
        .select("display_name")
        .eq("user_id", userId)
        .maybeSingle();
      ownDisplayName = profile?.display_name || data.session.user.user_metadata?.full_name || "Friend";

      subscribeOwnChannel().catch(error => {
        console.error("Call notification subscription failed:", error);
      });
    }

    supabaseClient.auth.onAuthStateChange((event, session) => {
      userId = session?.user?.id || null;
      if (userId && session?.access_token) {
        supabaseClient.realtime.setAuth(session.access_token)
          .then(() => subscribeOwnChannel())
          .catch(error => console.error("Call notification subscription failed:", error));
        supabaseClient.from("user_profiles")
          .select("display_name")
          .eq("user_id", userId)
          .maybeSingle()
          .then(({ data: profile }) => {
            ownDisplayName = profile?.display_name || "Friend";
          });
      } else {
        cleanupCall();
        if (ownSignalChannel) supabaseClient.removeChannel(ownSignalChannel);
        ownSignalChannel = null;
        ownChannelReady = null;
      }
    });

    window.addEventListener("beforeunload", () => {
      if (activeCall) {
        sendSignal(activeCall.peerId, "hangup", {}, activeCall.id).catch(() => {});
      }
      cleanupCall();
    });
  }

  initialize();
})();
