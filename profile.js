
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

// Show a message
function showProfileMessage(message, error = false) {
  profileMessage.textContent = message;
  profileMessage.style.color = error ? "#ff9299" : "#9bdcb8";
}

// Update avatar initials
function updateProfileAvatar(name) {
  const trimmed = name.trim();

  profileAvatar.textContent = trimmed
    ? trimmed.charAt(0).toUpperCase()
    : "✦";
}

// Load saved profile
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

// Save profile
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
    showProfileMessage(error.message || "Could not save your profile.", true);

  } finally {
    profileSave.disabled = false;
    profileSave.textContent = "Save Profile";
  }
});

// Update avatar as the name changes
profileName.addEventListener("input", () => {
  updateProfileAvatar(profileName.value);
});

// Load profile when authentication changes
supabaseClient.auth.onAuthStateChange(() => {
  setTimeout(loadProfile, 0);
});

// Initial load
loadProfile();
