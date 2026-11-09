
// ============================================
// AI TUTOR - PERSONAL PROFILE
// ============================================

const profilePanel = document.getElementById("profile-panel");
const profileForm = document.getElementById("profile-form");

const profileName = document.getElementById("profile-name");
const profileGrade = document.getElementById("profile-grade");
const profileAbout = document.getElementById("profile-about");
const profileSubjects = document.getElementById("profile-subjects");
const profileGoals = document.getElementById("profile-goals");
const profileStyle = document.getElementById("profile-style");

const profileMessage = document.getElementById("profile-message");
const profileSave = document.getElementById("profile-save");
const profileAvatar = document.getElementById("profile-avatar");

let profileUserId = null;

// ============================================
// PROFILE MESSAGES
// ============================================

function showProfileMessage(message, error = false) {
  profileMessage.textContent = message;
  profileMessage.style.color = error ? "#ff9299" : "#9bdcb8";
}

// ============================================
// AVATAR
// ============================================

function updateProfileAvatar(name) {
  const trimmed = name.trim();

  profileAvatar.textContent = trimmed
    ? trimmed.charAt(0).toUpperCase()
    : "✦";
}

// ============================================
// LOAD PROFILE
// ============================================

async function loadProfile() {
  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    console.error("Profile loading error:", error.message);
    return;
  }

  const user = data.session?.user;

  if (!user) {
    profilePanel.hidden = true;
    profileUserId = null;
    return;
  }

  profilePanel.hidden = false;
  profileUserId = user.id;

  const profile = user.user_metadata?.profile || {};

  profileName.value = profile.name || "";
  profileGrade.value = profile.grade || "";
  profileAbout.value = profile.about || "";
  profileSubjects.value = profile.subjects || "";
  profileGoals.value = profile.goals || "";
  profileStyle.value = profile.learningStyle || "";

  updateProfileAvatar(profileName.value);
}

// ============================================
// SAVE PROFILE
// ============================================

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!profileUserId) {
    showProfileMessage("Please sign in first.", true);
    return;
  }

  profileSave.disabled = true;
  profileSave.textContent = "Saving...";

  showProfileMessage("");

  try {
    const { data: userData, error: userError } =
      await supabaseClient.auth.getUser();

    if (userError) throw userError;

    const user = userData.user;

    if (!user || user.id !== profileUserId) {
      throw new Error("Your session expired. Please sign in again.");
    }

    const profile = {
      name: profileName.value.trim(),
      grade: profileGrade.value,
      about: profileAbout.value.trim(),
      subjects: profileSubjects.value.trim(),
      goals: profileGoals.value.trim(),
      learningStyle: profileStyle.value
    };

    const existingMetadata = user.user_metadata || {};

    const { error } = await supabaseClient.auth.updateUser({
      data: {
        ...existingMetadata,
        profile: profile
      }
    });

    if (error) throw error;

    updateProfileAvatar(profile.name);

    showProfileMessage("Profile saved successfully!");

  } catch (error) {
    console.error("Profile save error:", error);
    showProfileMessage(
      error.message || "Could not save your profile.",
      true
    );

  } finally {
    profileSave.disabled = false;
    profileSave.textContent = "Save Profile";
  }
});

// ============================================
// UPDATE AVATAR WHILE TYPING
// ============================================

profileName.addEventListener("input", () => {
  updateProfileAvatar(profileName.value);
});

// ============================================
// SOCIAL LOGIN
// ============================================

async function socialLogin(provider) {
  const message = document.getElementById("auth-message");

const buttons = [
  document.getElementById("google-login")
];

  try {
    buttons.forEach(button => {
      if (button) button.disabled = true;
    });

    if (message) {
      message.textContent = "Connecting to " + provider + "...";
      message.style.color = "#9bdcb8";
    }

    const options = {
      redirectTo: "https://nmila001-blip.github.io/account.html"
    };

    // Microsoft requires the email scope.
    if (provider === "azure") {
      options.scopes = "email";
    }

    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: provider,
      options: options
    });

    if (error) throw error;

  } catch (error) {
    console.error("Social login error:", error);

    if (message) {
      message.textContent = error.message;
      message.style.color = "#ff9299";
    }

    buttons.forEach(button => {
      if (button) button.disabled = false;
    });
  }
}

// Google
document.getElementById("google-login")?.addEventListener(
  "click",
  () => socialLogin("google")
);

// Microsoft
document.getElementById("microsoft-login")?.addEventListener(
  "click",
  () => socialLogin("azure")
);

// GitHub
document.getElementById("github-login")?.addEventListener(
  "click",
  () => socialLogin("github")
);

// ============================================
// AUTHENTICATION CHANGES
// ============================================

supabaseClient.auth.onAuthStateChange(() => {
  setTimeout(loadProfile, 0);
});

// Initial profile load
loadProfile();
