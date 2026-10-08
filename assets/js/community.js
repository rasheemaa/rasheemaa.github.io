import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  getCountFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  writeBatch,
  runTransaction
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const tabButtons = [...document.querySelectorAll("[data-community-tab]")];
const panels = [...document.querySelectorAll("[data-community-panel]")];
const validTabs = new Set(panels.map((panel) => panel.dataset.communityPanel));

const activateTab = (name, updateHash = true) => {
  const selected = validTabs.has(name) ? name : "feed";
  panels.forEach((panel) => {
    const active = panel.dataset.communityPanel === selected;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
  tabButtons.forEach((button) => {
    const active = button.dataset.communityTab === selected;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (updateHash) history.replaceState(null, "", selected === "feed" ? "#community" : "#" + selected);
  const layout = document.querySelector(".community-layout");
  if (layout) window.scrollTo({ top: layout.offsetTop - 86, behavior: "smooth" });
};

tabButtons.forEach((button) => button.addEventListener("click", () => activateTab(button.dataset.communityTab)));
document.querySelectorAll("[data-jump-tab]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    activateTab(link.dataset.jumpTab);
  });
});
const initialTab = location.hash.replace("#", "");
if (initialTab && initialTab !== "community") activateTab(initialTab, false);

const config = window.SHEEMA_COMMUNITY_CONFIG || {};
const configured = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
const giphyApiKey = String(config.giphyApiKey || "").trim();
// Built-in animated GIFs remain free and available without a third-party API key.
const LOCAL_GIFS = [
  { url: "/assets/community/paws/paws-zoomies.gif", title: "Zoomies", keywords: "dog puppy running zoomies funny cute pet animal" },
  { url: "/assets/community/paws/paws-treat.gif", title: "Treat reaction", keywords: "dog treat reaction excited hungry funny cute pet animal" },
  { url: "/assets/community/paws/paws-shake.gif", title: "Shake it off", keywords: "dog shake wet bath water funny cute pet animal" }
];
const $ = (id) => document.getElementById(id);

const authDialog = $("community-auth-dialog");
const profileDialog = $("community-profile-dialog");
const authButton = $("community-auth-button");
const authGateButton = $("community-auth-gate-button");
const railAuthButton = $("rail-auth-button");
const authGate = $("community-auth-gate");
const composer = $("community-composer");
const memberSection = $("member-feed-section");
const previewSection = $("community-preview-section");
const systemNote = $("community-system-note");
const signedOutRail = $("community-account-signed-out");
const signedInRail = $("community-account-signed-in");
const memberFeed = $("member-feed-list");
const memberFeedEmpty = $("member-feed-empty");
const leaderboard = $("community-leaderboard");
const gifDialog = $("community-gif-dialog");
const gifSearchForm = $("community-gif-search-form");
const gifSearchInput = $("community-gif-search");
const gifResults = $("community-gif-results");
const gifResultsTitle = $("community-gif-results-title");
const gifForm = $("community-gif-form");
const gifUrlInput = $("community-gif-url");
const gifDialogPreview = $("community-gif-dialog-preview");
const gifMessage = $("community-gif-message");
const gifRemoveButton = $("community-gif-remove");
const postGifInput = $("community-post-gif-url");
const postGifPreview = $("community-post-gif-preview");
const postGifButton = $("community-post-gif-button");
const feedForYouButton = $("feed-for-you");
const feedPersonalButton = $("feed-personal");
const feedFollowingButton = $("feed-following");
const postVideoInput = $("community-post-video-url");
const vibeFilterButtons = [...document.querySelectorAll("[data-community-vibe]")];
const vibes = {
  comedy: { name: "Comedy", emoji: "😂", legacySpace: "chaos" },
  animals: { name: "Cute animals", emoji: "🐾", legacySpace: "lifestyle" },
  motivation: { name: "Motivation", emoji: "✨", legacySpace: "chronic" },
  adhd: { name: "ADHD & mental wellness", emoji: "🧠", legacySpace: "mind" }
};
const validVibes = new Set(Object.keys(vibes));
const safeVideoId = (raw = "") => {
  try {
    const url = new URL(String(raw).trim());
    if (url.protocol !== "https:") return "";
    const host = url.hostname.toLowerCase();
    let id = "";
    if (host === "youtu.be" || host === "www.youtu.be") {
      id = url.pathname.split("/")[1] || "";
    } else if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)) {
      id = url.pathname === "/watch" ? (url.searchParams.get("v") || "")
        : /^\/(shorts|embed|live)\//.test(url.pathname) ? (url.pathname.split("/")[2] || "") : "";
    }
    return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : "";
  } catch { return ""; }
};
const videoCardHtml = (id) => {
  if (!/^[a-zA-Z0-9_-]{11}$/.test(String(id || ""))) return "";
  return `<div class="community-video-wrap"><iframe src="https://www.youtube-nocookie.com/embed/${id}"
    title="Shared YouTube video" loading="lazy" allowfullscreen
    referrerpolicy="strict-origin-when-cross-origin"
    allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share"></iframe></div>`;
};

const spaces = {
  mind: { name: "Mental Wellness & Unmasking", emoji: "🦋" },
  motherhood: { name: "Motherhood & Family", emoji: "🧸" },
  chronic: { name: "Chronic Illness & Real Life", emoji: "🌙" },
  lifestyle: { name: "Lifestyle & Beauty", emoji: "💄" },
  chaos: { name: "Relatable Chaos", emoji: "😭" }
};

const categoryLabels = {
  creator: "Creator",
  parent: "Parent",
  student: "Student",
  entrepreneur: "Entrepreneur",
  gamer: "Gamer",
  "beauty-lover": "Beauty lover",
  "lifestyle-lover": "Lifestyle lover",
  bookish: "Bookish",
  "music-lover": "Music lover",
  "here-to-connect": "Here to connect"
};

const interestLabels = {
  "mental-wellness": "Mental wellness",
  relationships: "Relationships",
  family: "Family",
  beauty: "Beauty",
  lifestyle: "Lifestyle",
  "self-growth": "Self growth",
  creativity: "Creativity",
  gaming: "Gaming",
  music: "Music",
  "relatable-chaos": "Relatable chaos"
};

const neurotypeLabels = {
  neurodivergent: "Neurodivergent",
  neurotypical: "Neurotypical",
  "figuring-it-out": "Still figuring it out",
  "prefer-not-to-say": "Prefer not to say"
};

const allowedCategories = new Set(Object.keys(categoryLabels));
const allowedInterests = new Set(Object.keys(interestLabels));
const allowedNeurotypes = new Set(Object.keys(neurotypeLabels));

let auth = null;
let db = null;
let currentUser = null;
let currentProfile = null;
let authMode = "signup";
let lastPosts = [];
let likedPostIds = new Set();
let reactionCheckedPostIds = new Set();
let stopFeed = null;
let stopLeaderboard = null;
let stopFollowing = null;
let openCommentsPostId = null;
const commentStops = new Map();
let activeGifTarget = null;
let gifSearchController = null;
let gifSearchTimer = null;
let followingIds = new Set();
const followingKey = (uid) => "sheema.community.localFollowing." + uid;
const locallyFollowed = (uid) => {
  try {
    const ids = JSON.parse(localStorage.getItem(followingKey(uid)) || "[]");
    return Array.isArray(ids) ? ids.filter((id) => typeof id === "string").slice(0, 250) : [];
  } catch { return []; }
};
const saveLocalFollowing = (uid) => {
  try { localStorage.setItem(followingKey(uid), JSON.stringify([...followingIds])); }
  catch { setMessage(systemNote, "Could not store follows on this device.", "error"); }
};
let feedMode = "all";
let activeVibe = "all";
const profileCache = new Map();

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const initials = (name = "Member") => name.trim().slice(0, 1).toUpperCase() || "♡";

const safeGifUrl = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw, location.origin);
    const host = url.hostname.toLowerCase();
    const trustedLocalGif = url.origin === location.origin && !url.search && !url.hash
      && LOCAL_GIFS.some((item) => item.url === url.pathname);
    const trusted = host === "giphy.com" || host.endsWith(".giphy.com") || host === "tenor.com" || host.endsWith(".tenor.com");
    if (trustedLocalGif) return url.href;
    if (url.protocol !== "https:" || !trusted) return "";
    return url.href;
  } catch {
    return "";
  }
};

const gifImageHtml = (url, alt = "Shared GIF") => {
  const safe = safeGifUrl(url);
  if (!safe) return "";
  return `<img class="community-gif" src="${escapeHtml(safe)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">`;
};

const renderGifPreview = (container, url, removable = true) => {
  if (!container) return;
  const safe = safeGifUrl(url);
  if (!safe) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }
  container.hidden = false;
  container.innerHTML = `<div class="gif-preview-frame">${gifImageHtml(safe, "GIF preview")}${removable ? '<button type="button" class="gif-remove" data-remove-gif aria-label="Remove GIF">×</button>' : ""}</div>`;
};

const giphyImageUrl = (item) =>
  item?.images?.fixed_width?.webp ||
  item?.images?.fixed_width?.url ||
  item?.images?.downsized_medium?.url ||
  item?.images?.original?.url ||
  "";

const renderGifResults = (items = []) => {
  if (!gifResults) return;
  if (!items.length) {
    gifResults.innerHTML = '<div class="gif-results-empty">No GIFs found. Try another search.</div>';
    return;
  }
  gifResults.innerHTML = items.map((item) => {
    const url = safeGifUrl(item.url || giphyImageUrl(item));
    if (!url) return "";
    const title = String(item.title || "GIF").trim() || "GIF";
    return `
      <button class="gif-result" type="button" data-gif-url="${escapeHtml(url)}" aria-label="Use ${escapeHtml(title)}">
        <img src="${escapeHtml(url)}" alt="${escapeHtml(title)}" loading="lazy" decoding="async">
      </button>`;
  }).join("");
};

const loadGiphyGifs = async (queryText = "") => {
  if (!gifResults) return;
  const queryTextTrimmed = String(queryText || "").trim();
  const source = $("community-gif-source");
  if (source) source.textContent = giphyApiKey ? "Powered by GIPHY" : "Community GIFs";
  if (!giphyApiKey) {
    gifResults.setAttribute("aria-busy", "false");
    if (gifResultsTitle) gifResultsTitle.textContent = queryTextTrimmed ? "Matching GIFs" : "Pick a reaction";
    const term = queryTextTrimmed.toLowerCase();
    const matching = LOCAL_GIFS.filter((item) =>
      !term || (item.title + " " + item.keywords).toLowerCase().includes(term));
    renderGifResults(matching);
    setMessage(gifMessage, matching.length
      ? "Tap a GIF to add it to your post or reply."
      : "Try dog, treat, or funny.");
    return;
  }

  gifSearchController?.abort();
  gifSearchController = new AbortController();
  gifResults.setAttribute("aria-busy", "true");
  gifResults.innerHTML = '<div class="gif-results-loading">Loading GIFs…</div>';
  if (gifResultsTitle) gifResultsTitle.textContent = queryTextTrimmed ? "Search results" : "Trending";
  setMessage(gifMessage, "");

  const endpoint = queryTextTrimmed
    ? "https://api.giphy.com/v1/gifs/search"
    : "https://api.giphy.com/v1/gifs/trending";
  const params = new URLSearchParams({
    api_key: giphyApiKey,
    limit: "24",
    rating: "pg-13"
  });
  if (queryTextTrimmed) {
    params.set("q", queryTextTrimmed);
    params.set("lang", "en");
  }

  try {
    const response = await fetch(`${endpoint}?${params.toString()}`, {
      signal: gifSearchController.signal,
      headers: { "Accept": "application/json" }
    });
    if (!response.ok) throw new Error(`GIPHY request failed: ${response.status}`);
    const payload = await response.json();
    renderGifResults(Array.isArray(payload.data) ? payload.data : []);
  } catch (error) {
    if (error?.name === "AbortError") return;
    gifResults.innerHTML = '<div class="gif-results-empty">GIFs could not load right now.</div>';
    setMessage(gifMessage, "Try the search again in a moment.", "error");
  } finally {
    gifResults.setAttribute("aria-busy", "false");
  }
};

const selectGif = (url) => {
  const safe = safeGifUrl(url);
  if (!safe || !activeGifTarget) return;
  activeGifTarget.input.value = safe;
  renderGifPreview(activeGifTarget.preview, safe);
  gifDialog?.close();
};

const openGifPicker = (input, preview) => {
  if (!gifDialog?.showModal) return;
  activeGifTarget = { input, preview };
  gifUrlInput.value = input?.value || "";
  if (gifSearchInput) gifSearchInput.value = "";
  setMessage(gifMessage, "");
  renderGifPreview(gifDialogPreview, gifUrlInput.value, false);
  gifDialog.showModal();
  loadGiphyGifs("");
  requestAnimationFrame(() => gifSearchInput?.focus());
};

const clearGifTarget = () => {
  if (!activeGifTarget) return;
  activeGifTarget.input.value = "";
  renderGifPreview(activeGifTarget.preview, "");
};

const timestampToDate = (value) => {
  if (!value) return new Date();
  if (typeof value.toDate === "function") return value.toDate();
  return new Date(value);
};

const relativeTime = (value) => {
  const seconds = Math.max(1, Math.floor((Date.now() - timestampToDate(value).getTime()) / 1000));
  const units = [[31536000,"year"],[2592000,"month"],[604800,"week"],[86400,"day"],[3600,"hour"],[60,"minute"]];
  for (const [size, label] of units) {
    if (seconds >= size) {
      const n = Math.floor(seconds / size);
      return n + " " + label + (n === 1 ? "" : "s") + " ago";
    }
  }
  return "just now";
};

const setMessage = (element, message, type = "") => {
  if (!element) return;
  element.textContent = message;
  element.dataset.type = type;
};

const memberLevel = (points = 0) => {
  if (points >= 100) return { level: 5, name: "Day One Energy" };
  if (points >= 50) return { level: 4, name: "Village Builder" };
  if (points >= 25) return { level: 3, name: "Community Friend" };
  if (points >= 10) return { level: 2, name: "Regular" };
  return { level: 1, name: "New Here" };
};

const openAuth = () => {
  if (!configured) {
    setMessage(systemNote, "The Community is ready for its free Firebase project connection.", "error");
    systemNote?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  authDialog?.showModal?.();
};

[authGateButton, railAuthButton].forEach((button) => button?.addEventListener("click", openAuth));

const AVATAR_LIMIT = 20000;
const safeAvatarData = (value) => typeof value === "string"
  && value.length <= AVATAR_LIMIT
  && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]{200,19976}$/.test(value) ? value : "";
const localAvatarKey = (uid) => "sheema.community.localAvatar.v1." + uid;
const readLocalAvatar = (uid) => {
  if (!uid) return "";
  try { return safeAvatarData(localStorage.getItem(localAvatarKey(uid)) || ""); }
  catch { return ""; }
};
const rememberLocalAvatar = (uid, value) => {
  if (!uid) return;
  try {
    if (value) localStorage.setItem(localAvatarKey(uid), value);
    else localStorage.removeItem(localAvatarKey(uid));
  } catch { setMessage($("profile-avatar-message"), "Browser storage is unavailable; this picture won't stay on this device.", "error"); }
};
const avatarForProfile = (profile, uid) => safeAvatarData(profile?.avatarData)
  || (uid && uid === currentUser?.uid ? readLocalAvatar(uid) : "");
const avatarHtml = (profile, fallbackName = "M", uid = "") => {
  const image = avatarForProfile(profile, uid);
  return image ? `<img src="${image}" alt="" width="48" height="48" decoding="async">`
    : escapeHtml(initials(fallbackName));
};
const applyAvatarTo = (element, profile, name, uid) => {
  if (element) element.innerHTML = avatarHtml(profile, name, uid);
};
let avatarDraft = null;
const resizePhoto = (file) => new Promise((resolve, reject) => {
  if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
    reject(new Error("Choose a JPEG, PNG, or WebP image under 5 MB."));
    return;
  }
  const blobUrl = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(blobUrl);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 112; canvas.height = 112;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser can't resize a picture.");
      const crop = Math.min(img.naturalWidth, img.naturalHeight);
      const x = Math.floor((img.naturalWidth - crop) / 2);
      const y = Math.floor((img.naturalHeight - crop) / 2);
      context.fillStyle = "#fff";
      context.fillRect(0, 0, 112, 112);
      context.drawImage(img, x, y, crop, crop, 0, 0, 112, 112);
      const compressed = canvas.toDataURL("image/jpeg", 0.62);
      if (!safeAvatarData(compressed)) throw new Error("This photo couldn't fit the small profile-picture size. Try another picture.");
      resolve(compressed);
    } catch (e) { reject(e); }
  };
  img.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error("This picture couldn't be opened.")); };
  img.src = blobUrl;
});
const avatarInput = $("profile-avatar-input");
const avatarPreview = $("profile-avatar-preview");
avatarInput?.addEventListener("change", async () => {
  if (!avatarInput.files?.length) return;
  setMessage($("profile-avatar-message"), "Preparing your picture…");
  try {
    avatarDraft = await resizePhoto(avatarInput.files[0]);
    applyAvatarTo(avatarPreview, { avatarData: avatarDraft }, currentProfile?.displayName || "M");
    setMessage($("profile-avatar-message"), "Photo ready. Tap Save profile to keep it.", "success");
  } catch (error) {
    avatarDraft = null;
    setMessage($("profile-avatar-message"), error.message, "error");
  }
});
$("profile-avatar-remove")?.addEventListener("click", () => {
  avatarDraft = "";
  if (avatarInput) avatarInput.value = "";
  applyAvatarTo(avatarPreview, {}, currentProfile?.displayName || "M");
  setMessage($("profile-avatar-message"), "Picture will be removed when you save.");
});
const populateProfileEditor = (profile = currentProfile) => {
  $("profile-display-name").value = profile?.displayName || currentUser?.displayName || "";
  $("profile-bio").value = profile?.bio || "";
  avatarDraft = null;
  if (avatarInput) avatarInput.value = "";
  applyAvatarTo(avatarPreview, profile, profile?.displayName || currentUser?.displayName || "M", currentUser?.uid);
  setMessage($("profile-avatar-message"), "");
  $("profile-category").value = allowedCategories.has(profile?.category) ? profile.category : "";
  $("profile-neurotype").value = allowedNeurotypes.has(profile?.neurotype) ? profile.neurotype : "";

  const selected = new Set(Array.isArray(profile?.interests) ? profile.interests : []);
  document.querySelectorAll('input[name="profile-interest"]').forEach((input) => {
    input.checked = selected.has(input.value);
  });
};

async function openProfileEditor() {
  if (!currentUser) {
    openAuth();
    return;
  }

  if (!profileDialog?.showModal) {
    setMessage(systemNote, "Your profile editor could not open in this browser.", "error");
    return;
  }

  populateProfileEditor(currentProfile);
  setMessage($("profile-message"), currentProfile ? "" : "Loading your profile…");
  if (!profileDialog.open) profileDialog.showModal();

  if (currentProfile) return;

  try {
    await loadProfile();
    if (!currentProfile) {
      await ensureProfile(currentUser);
      await loadProfile();
    }
    if (!currentProfile) throw new Error("Profile unavailable");

    populateProfileEditor(currentProfile);
    setMessage($("profile-message"), "");
  } catch (error) {
    setMessage($("profile-message"), "Your saved profile could not load. You can still try again after refreshing.", "error");
  }
}

// The social-app My Profile button opens a public-facing profile screen.
authButton?.addEventListener("click", () => {
  document.dispatchEvent(new CustomEvent("community:open-my-profile"));
});

const updateAgeGateVisibility = () => {
  const signup = authMode === "signup";
  const passwordStarted = Boolean($("auth-password")?.value);
  const ageField = $("auth-age-field");
  const ageConfirm = $("auth-age-confirm");
  const reveal = signup && passwordStarted;

  if (ageField) ageField.hidden = !reveal;
  if (ageConfirm) {
    ageConfirm.required = reveal;
    ageConfirm.disabled = !reveal;
    if (!reveal) ageConfirm.checked = false;
  }
};

const renderAuthMode = () => {
  const signup = authMode === "signup";
  $("auth-dialog-title").textContent = signup ? "Join the community" : "Welcome back";
  $("auth-name-field").hidden = !signup;
  $("auth-submit").textContent = signup ? "Create free account" : "Sign in";
  $("auth-switch").textContent = signup ? "Already a member? Sign in" : "New here? Create a free account";
  $("auth-password").autocomplete = signup ? "new-password" : "current-password";
  updateAgeGateVisibility();
  setMessage($("auth-message"), "");
};

$("auth-switch")?.addEventListener("click", () => {
  authMode = authMode === "signup" ? "signin" : "signup";
  renderAuthMode();
});
$("auth-password")?.addEventListener("input", updateAgeGateVisibility);
$("auth-password")?.addEventListener("change", updateAgeGateVisibility);
renderAuthMode();

const updateSignedOutUi = () => {
  delete document.documentElement.dataset.communityUid;
  currentUser = null;
  currentProfile = null;
  likedPostIds = new Set();
  reactionCheckedPostIds = new Set();
  stopFeed?.();
  stopLeaderboard?.();
  stopFollowing?.();
  commentStops.forEach((stop) => stop?.());
  commentStops.clear();
  openCommentsPostId = null;
  stopFeed = null;
  stopLeaderboard = null;
  stopFollowing = null;
  followingIds = new Set();
  feedMode = "all";
  profileCache.clear();
  authGate.hidden = false;
  composer.hidden = true;
  memberSection.hidden = true;
  if (previewSection) previewSection.hidden = false;
  signedOutRail.hidden = false;
  signedInRail.hidden = true;
  if (authButton) {
    authButton.hidden = true;
    authButton.textContent = "My profile";
  }
  if (leaderboard) leaderboard.innerHTML = '<p class="muted-copy">Join the community to see member levels.</p>';
  document.dispatchEvent(new CustomEvent("community:session", { detail: { uid: "" } }));
};

const ensureProfile = async (user, displayName = "") => {
  const ref = doc(db, "profiles", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const name = (displayName || user.displayName || user.email?.split("@")[0] || "Member").trim().slice(0, 40);
    await setDoc(ref, {
      displayName: name || "Member",
      bio: "",
      postCount: 0,
      commentCount: 0,
      points: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }
};

const loadProfile = async () => {
  if (!db || !currentUser) return null;
  const snap = await getDoc(doc(db, "profiles", currentUser.uid));
  if (!snap.exists()) return null;
  currentProfile = { id: snap.id, ...snap.data() };
  return currentProfile;
};

const showAuthenticatedShell = (user) => {
  document.documentElement.dataset.communityUid = user.uid;
  authGate.hidden = true;
  composer.hidden = false;
  memberSection.hidden = false;
  if (previewSection) previewSection.hidden = true;
  signedOutRail.hidden = true;
  signedInRail.hidden = false;
  if (authButton) {
    authButton.hidden = false;
    authButton.textContent = "My profile";
  }
  const fallbackName = user?.displayName || user?.email?.split("@")[0] || "Member";
  $("composer-avatar").textContent = initials(fallbackName);
  $("rail-avatar").textContent = initials(fallbackName);
  $("rail-display-name").textContent = fallbackName;
  $("rail-level").textContent = "Loading your profile…";
  document.dispatchEvent(new CustomEvent("community:session", {
    detail: { uid: user.uid, displayName: fallbackName, bio: "", followingCount: 0 }
  }));
};

const updateSignedInUi = async () => {
  const profile = await loadProfile();
  if (currentUser?.uid) document.documentElement.dataset.communityUid = currentUser.uid;
  authGate.hidden = true;
  composer.hidden = false;
  memberSection.hidden = false;
  if (previewSection) previewSection.hidden = true;
  signedOutRail.hidden = true;
  signedInRail.hidden = false;
  if (authButton) {
    authButton.hidden = false;
    authButton.textContent = "My profile";
  }
  $("composer-avatar").textContent = initials(profile?.displayName);
  $("rail-avatar").textContent = initials(profile?.displayName);
  $("rail-display-name").textContent = profile?.displayName || "Member";
  $("rail-level").textContent = "Community member";
  followingIds = new Set([
    ...(Array.isArray(profile?.followingIds) ? profile.followingIds.filter(Boolean) : []),
    ...locallyFollowed(currentUser.uid)
  ]);
  const railTags = $("rail-profile-tags");
  if (railTags) {
    const category = allowedCategories.has(profile?.category) ? categoryLabels[profile.category] : "";
    const neurotype = allowedNeurotypes.has(profile?.neurotype) && profile.neurotype !== "prefer-not-to-say"
      ? neurotypeLabels[profile.neurotype]
      : "";
    const interests = Array.isArray(profile?.interests)
      ? profile.interests.filter((item) => allowedInterests.has(item)).slice(0, 2)
      : [];
    railTags.innerHTML = [
      category ? `<span>${escapeHtml(category)}</span>` : "",
      neurotype ? `<span>${escapeHtml(neurotype)}</span>` : "",
      ...interests.map((item) => `<span>${escapeHtml(interestLabels[item])}</span>`)
    ].join("");
  }
  document.dispatchEvent(new CustomEvent("community:session", {
    detail: {
      uid: currentUser?.uid || "",
      displayName: profile?.displayName || "Community member",
      bio: profile?.bio || "",
      postCount: Math.max(0, Number(profile?.postCount) || 0),
      followingCount: followingIds.size
    }
  }));
};

const hydrateProfilesForPosts = async (posts) => {
  if (!db || !currentUser) return;
  const ids = [...new Set(posts.map((post) => post.authorId).filter(Boolean))]
    .filter((id) => !profileCache.has(id));
  if (!ids.length) return;
  await Promise.all(ids.map(async (id) => {
    try {
      const snap = await getDoc(doc(db, "profiles", id));
      profileCache.set(id, snap.exists() ? { id: snap.id, ...snap.data() } : null);
    } catch {
      profileCache.set(id, null);
    }
  }));
};

const hydrateLikesForPosts = async (posts) => {
  if (!db || !currentUser) return;
  const unchecked = posts.filter((post) => !reactionCheckedPostIds.has(post.id));
  if (!unchecked.length) return;
  await Promise.all(unchecked.map(async (post) => {
    const reactionSnap = await getDoc(doc(db, "posts", post.id, "reactions", currentUser.uid));
    reactionCheckedPostIds.add(post.id);
    if (reactionSnap.exists()) likedPostIds.add(post.id);
  }));
};

const postCardHtml = (post) => {
  const space = validVibes.has(post.vibe)
    ? vibes[post.vibe]
    : spaces[post.spaceId] || { name: "Community", emoji: "♡" };
  const liked = likedPostIds.has(post.id);
  const mine = post.authorId === currentUser?.uid;
  const authorProfile = profileCache.get(post.authorId);
  const category = allowedCategories.has(authorProfile?.category) ? categoryLabels[authorProfile.category] : "";
  const neurotype = allowedNeurotypes.has(authorProfile?.neurotype) && authorProfile.neurotype !== "prefer-not-to-say"
    ? neurotypeLabels[authorProfile.neurotype]
    : "";
  const interests = Array.isArray(authorProfile?.interests)
    ? authorProfile.interests.filter((item) => allowedInterests.has(item)).slice(0, 2)
    : [];
  const connected = followingIds.has(post.authorId);
  return `
    <article class="community-card member-post-card" id="edit-${escapeHtml(post.id)}" data-post-id="${escapeHtml(post.id)}" data-author-id="${escapeHtml(post.authorId || "")}">
      <div class="post-avatar small" aria-hidden="true">${escapeHtml(initials(authorProfile?.displayName || post.displayName))}</div>
      <div class="community-post-body">
        <div class="post-heading">
          <div class="post-author-block">
            <div class="post-author-line">
              <button type="button" class="community-author-name" data-action="profile" data-author-id="${escapeHtml(post.authorId || "")}"><strong>${escapeHtml(authorProfile?.displayName || post.displayName || "Member")}</strong></button>
              <span> · ${escapeHtml(relativeTime(post.createdAt))}</span>
              ${!mine ? `<button class="connect-button${connected ? " is-connected" : ""}" type="button" data-action="connect" data-author-id="${escapeHtml(post.authorId || "")}" aria-pressed="${connected}">${connected ? "Connected" : "Connect"}</button>` : ""}
            </div>
            ${category || neurotype || interests.length ? `<div class="member-meta-chips">${category ? `<span class="member-category-chip">${escapeHtml(category)}</span>` : ""}${neurotype ? `<span class="member-neurotype-chip">${escapeHtml(neurotype)}</span>` : ""}${interests.map((item) => `<span>${escapeHtml(interestLabels[item])}</span>`).join("")}</div>` : ""}
          </div>
          <span class="room-chip room-${escapeHtml(post.spaceId)}">${space.emoji} ${escapeHtml(space.name)}</span>
        </div>
        ${post.isPinned ? '<span class="pin inline-pin">PINNED</span>' : ""}
        ${post.body ? `<p class="member-post-copy">${escapeHtml(post.body).replaceAll("\n", "<br>")}</p>` : ""}
        ${post.gifUrl ? `<div class="community-gif-wrap">${gifImageHtml(post.gifUrl, "GIF shared by " + (post.displayName || "Member"))}</div>` : ""}
        ${post.videoId ? videoCardHtml(post.videoId) : ""}
        <div class="member-post-actions">
          <button type="button" data-action="heart" aria-pressed="${liked}">${liked ? "♥" : "♡"} <span>${Math.max(0, post.reactionCount || 0)}</span></button>
          <button type="button" data-action="comments">💬 <span>${Math.max(0, post.commentCount || 0)}</span></button>
          <button type="button" data-action="share">↗ Share</button>
          <button type="button" data-action="report">Report</button>
          ${mine ? '<button class="danger-link" type="button" data-action="delete">Delete</button>' : ""}
        </div>
        <div class="comments-drawer" data-comments-for="${escapeHtml(post.id)}" hidden></div>
      </div>
    </article>`;
};

const renderFeed = () => {
  if (!memberFeed) return;
  const reopenPostId = openCommentsPostId;
  commentStops.forEach((stop) => stop?.());
  commentStops.clear();
  const visiblePosts = lastPosts.filter((post) => {
    const modeMatch = feedMode !== "following" || post.authorId === currentUser?.uid || followingIds.has(post.authorId);
    return modeMatch && (activeVibe === "all" || post.vibe === activeVibe);
  });
  const interests = new Set(Array.isArray(currentProfile?.interests) ? currentProfile.interests : []);
  const favorites = new Set([
    ...(interests.has("mental-wellness") ? ["adhd"] : []),
    ...(interests.has("self-growth") ? ["motivation"] : []),
    ...(interests.has("relatable-chaos") ? ["comedy"] : []),
    ...(interests.has("family") ? ["animals"] : [])
  ]);
  const sorted = [...visiblePosts].sort((a, b) => {
    if (Boolean(a.isPinned) !== Boolean(b.isPinned)) return a.isPinned ? -1 : 1;
    if (feedMode === "personal" && favorites.size) {
      const score = Number(favorites.has(b.vibe)) - Number(favorites.has(a.vibe));
      if (score) return score;
    }
    return timestampToDate(b.createdAt) - timestampToDate(a.createdAt);
  });
  memberFeed.innerHTML = sorted.map(postCardHtml).join("");
  memberFeedEmpty.hidden = sorted.length > 0;
  if (memberFeedEmpty) {
    const title = memberFeedEmpty.querySelector("h3");
    const copy = memberFeedEmpty.querySelector("p");
    if (activeVibe !== "all") {
      if (title) title.textContent = "A quiet corner for now.";
      if (copy) copy.textContent = "Be the first to post in this topic.";
    } else if (feedMode === "following") {
      if (title) title.textContent = "Your Following feed is quiet.";
      if (copy) copy.textContent = "Follow people from Explore to build your feed.";
    } else {
      if (title) title.textContent = "No posts here yet.";
      if (copy) copy.textContent = "Share something and start the conversation.";
    }
  }
  if (reopenPostId) {
    const card = [...memberFeed.querySelectorAll("[data-post-id]")].find((item) => item.dataset.postId === reopenPostId);
    const drawer = card?.querySelector("[data-comments-for]");
    if (drawer) loadComments(reopenPostId, drawer);
    else openCommentsPostId = null;
  }
};

const startFeed = () => {
  stopFeed?.();
  const feedQuery = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(25));
  stopFeed = onSnapshot(feedQuery, async (snapshot) => {
    lastPosts = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    await Promise.all([
      hydrateLikesForPosts(lastPosts),
      hydrateProfilesForPosts(lastPosts)
    ]);
    renderFeed();
    memberFeed?.removeAttribute("aria-busy");
    const sharedId = location.hash.startsWith("#edit-") ? location.hash.slice(1) : "";
    if (sharedId) {
      requestAnimationFrame(() => document.getElementById(sharedId)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    }
  }, () => {
    memberFeed?.removeAttribute("aria-busy");
    setMessage(systemNote, "The member feed could not load. Please try again.", "error");
  });
};

const startLeaderboard = () => {
  if (!leaderboard) return;
  stopLeaderboard?.();
  const boardQuery = query(collection(db, "profiles"), orderBy("points", "desc"), limit(20));
  stopLeaderboard = onSnapshot(boardQuery, (snapshot) => {
    const members = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    leaderboard.innerHTML = members.map((member, index) => {
      const level = memberLevel(member.points || 0);
      return `
        <div class="leader-row${member.id === currentUser?.uid ? " is-you" : ""}">
          <span class="leader-rank">${index + 1}</span>
          <span class="mini-avatar">${escapeHtml(initials(member.displayName))}</span>
          <div><strong>${escapeHtml(member.displayName || "Member")}</strong><small>Level ${level.level} · ${level.name}</small></div>
          <b>${member.points || 0} pts</b>
        </div>`;
    }).join("") || '<p class="muted-copy">No points yet. The first conversation starts the board.</p>';
  });
};

const setFeedMode = (mode) => {
  feedMode = ["all", "personal", "following"].includes(mode) ? mode : "all";
  for (const [button, value] of [
    [feedForYouButton, "all"], [feedPersonalButton, "personal"], [feedFollowingButton, "following"]
  ]) {
    button?.classList.toggle("is-active", feedMode === value);
    button?.setAttribute("aria-selected", String(feedMode === value));
  }
  renderFeed();
  document.dispatchEvent(new CustomEvent("community:filter-change", { detail: { vibe: activeVibe, mode: feedMode } }));
};
feedForYouButton?.addEventListener("click", () => setFeedMode("all"));
feedPersonalButton?.addEventListener("click", () => setFeedMode("personal"));
feedFollowingButton?.addEventListener("click", () => setFeedMode("following"));
vibeFilterButtons.forEach((button) => button.addEventListener("click", () => {
  activeVibe = validVibes.has(button.dataset.communityVibe) ? button.dataset.communityVibe : "all";
  vibeFilterButtons.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
  renderFeed();
  document.dispatchEvent(new CustomEvent("community:filter-change", { detail: { vibe: activeVibe, mode: feedMode } }));
}));
const conversationStarters = [
  "What made you laugh harder than you should have today? 😭",
  "What is the most dramatic thing your pet has ever done? 🐾",
  "Tell us one tiny win. Yes, even if it seems small. ✨",
  "What is your brain's current side quest? 🧠",
  "What's something you learned about yourself lately? 💗",
  "What's the funniest thing that happened this week? 😂",
  "What are you giving yourself permission to enjoy? 🌷"
];
const promptText = $("community-prompt-text");
if (promptText) promptText.textContent = conversationStarters[Math.floor(Date.now() / 86400000) % conversationStarters.length];
$("community-use-prompt")?.addEventListener("click", () => {
  const field = $("community-post-body");
  if (!field) return;
  if (!field.value.trim()) field.value = promptText?.textContent || "";
  field.focus();
  field.scrollIntoView({ behavior: "smooth", block: "center" });
});

const toggleConnection = async (authorId) => {
  if (!currentUser || !authorId || authorId === currentUser.uid) return;
  const profileRef = doc(db, "profiles", currentUser.uid);
  const connected = followingIds.has(authorId);
  if (!connected && followingIds.size >= 250) {
    setMessage(systemNote, "You have reached the current connection limit.", "error");
    return;
  }
  let deviceOnly = false;
  try {
    await updateDoc(profileRef, {
      followingIds: connected ? arrayRemove(authorId) : arrayUnion(authorId),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    if (!String(error?.code || "").includes("permission-denied")) throw error;
    deviceOnly = true;
  }
  if (connected) followingIds.delete(authorId);
  else followingIds.add(authorId);
  saveLocalFollowing(currentUser.uid);
  if (!deviceOnly && currentProfile) currentProfile.followingIds = [...followingIds];
  setMessage(systemNote, deviceOnly
    ? "Following saved in this browser. Syncing across devices will work after the Community permissions update."
    : "", deviceOnly ? "" : "success");
  renderFeed();
};

const shareEdit = async (postId) => {
  const url = `${location.origin}${location.pathname}#edit-${encodeURIComponent(postId)}`;
  const shareData = { title: "Community post", text: "Check out this Community post.", url };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      setMessage(systemNote, "Post link copied.", "success");
      return;
    }
  } catch (error) {
    if (error?.name === "AbortError") return;
  }
  prompt("Copy this post link:", url);
};

const refreshCommunity = async () => {
  if (!currentUser) return;
  await hydrateLikesForPosts(lastPosts);
  await updateSignedInUi();
  renderFeed();
};

$("refresh-community")?.addEventListener("click", refreshCommunity);

gifSearchForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  loadGiphyGifs(gifSearchInput?.value || "");
});

gifSearchInput?.addEventListener("input", () => {
  clearTimeout(gifSearchTimer);
  gifSearchTimer = setTimeout(() => {
    const value = gifSearchInput.value.trim();
    if (!value) loadGiphyGifs("");
    else if (value.length >= 2) loadGiphyGifs(value);
  }, 320);
});

gifResults?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-gif-url]");
  if (!button) return;
  selectGif(button.dataset.gifUrl);
});

gifDialog?.addEventListener("close", () => {
  gifSearchController?.abort();
  clearTimeout(gifSearchTimer);
});

postGifButton?.addEventListener("click", () => openGifPicker(postGifInput, postGifPreview));
postGifPreview?.addEventListener("click", (event) => {
  if (!event.target.closest("[data-remove-gif]")) return;
  postGifInput.value = "";
  renderGifPreview(postGifPreview, "");
});

gifUrlInput?.addEventListener("input", () => {
  renderGifPreview(gifDialogPreview, gifUrlInput.value, false);
  setMessage(gifMessage, "");
});

gifForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const safe = safeGifUrl(gifUrlInput.value);
  if (!safe) return setMessage(gifMessage, "Paste a direct GIPHY or Tenor GIF image link.", "error");
  if (!activeGifTarget) return;
  activeGifTarget.input.value = safe;
  renderGifPreview(activeGifTarget.preview, safe);
  gifDialog.close();
});

gifRemoveButton?.addEventListener("click", () => {
  clearGifTarget();
  gifDialog.close();
});

$("community-post-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!db || !currentUser) return openAuth();
  const gifUrl = safeGifUrl(postGifInput?.value);
  const videoRaw = postVideoInput?.value.trim() || "";
  const videoId = videoRaw ? safeVideoId(videoRaw) : "";
  if (videoRaw && !videoId) return setMessage($("community-post-message"), "Use a valid YouTube or YouTube Shorts link.", "error");
  const body = $("community-post-body").value.trim() || (gifUrl ? "🎞️" : videoId ? "🎬" : "");
  const vibe = validVibes.has($("community-post-space").value) ? $("community-post-space").value : "comedy";
  const spaceId = vibes[vibe].legacySpace;
  if (!body) return setMessage($("community-post-message"), "Write something, add a GIF, or share a video ♡", "error");

  const submit = event.submitter;
  if (submit) submit.disabled = true;
  setMessage($("community-post-message"), "Posting…");

  try {
    const postRef = doc(collection(db, "posts"));
    const profileRef = doc(db, "profiles", currentUser.uid);
    const batch = writeBatch(db);
    batch.set(postRef, {
      authorId: currentUser.uid,
      displayName: (currentProfile?.displayName || currentUser.displayName || "Member").slice(0, 40),
      spaceId,
      vibe,
      body,
      ...(gifUrl ? { gifUrl } : {}),
      ...(videoId ? { videoId } : {}),
      isPinned: false,
      commentCount: 0,
      reactionCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    batch.update(profileRef, {
      postCount: increment(1),
      points: increment(5),
      updatedAt: serverTimestamp()
    });
    await batch.commit();
    $("community-post-body").value = "";
    if (postGifInput) postGifInput.value = "";
    if (postVideoInput) postVideoInput.value = "";
    renderGifPreview(postGifPreview, "");
    setMessage($("community-post-message"), "Posted ♡", "success");
    await updateSignedInUi();
  } catch (error) {
    setMessage($("community-post-message"), error.message || "That post could not be published.", "error");
  } finally {
    if (submit) submit.disabled = false;
  }
});

const stopComments = (postId) => {
  commentStops.get(postId)?.();
  commentStops.delete(postId);
};

const loadComments = (postId, drawer) => {
  openCommentsPostId = postId;
  stopComments(postId);
  drawer.hidden = false;
  drawer.innerHTML = '<p class="muted-copy">Loading replies…</p>';

  const commentsQuery = query(collection(db, "posts", postId, "comments"), orderBy("createdAt", "asc"), limit(200));
  const stop = onSnapshot(commentsQuery, (snapshot) => {
    const comments = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    drawer.innerHTML = `
      <div class="comments-sheet-header"><strong>Replies</strong><button class="comments-close" type="button" data-close-comments aria-label="Close replies">×</button></div>
      <div class="comments-list">${comments.map((comment) => `
        <div class="member-comment">
          <span class="mini-avatar">${escapeHtml(initials(comment.displayName))}</span>
          <div>
            <p><strong>${escapeHtml(comment.displayName || "Member")}</strong> <small>· ${escapeHtml(relativeTime(comment.createdAt))}</small></p>
            ${comment.body ? `<div>${escapeHtml(comment.body).replaceAll("\n", "<br>")}</div>` : ""}
            ${comment.gifUrl ? `<div class="comment-gif-wrap">${gifImageHtml(comment.gifUrl, "GIF reply from " + (comment.displayName || "Member"))}</div>` : ""}
          </div>
          ${comment.authorId === currentUser?.uid ? `<button type="button" data-delete-comment="${escapeHtml(comment.id)}" aria-label="Delete comment">×</button>` : ""}
        </div>`).join("") || '<p class="muted-copy">No replies yet.</p>'}</div>
      <form class="comment-form">
        <label class="sr-only">Add a reply</label>
        <input class="comment-text-input" maxlength="2000" placeholder="Write a reply…">
        <input class="comment-gif-input" type="hidden" value="">
        <button class="gif-trigger comment-gif-trigger" type="button" aria-haspopup="dialog">GIF</button>
        <button type="submit">Reply</button>
        <div class="gif-preview comment-gif-preview" hidden></div>
      </form>`;

    drawer.querySelector("[data-close-comments]")?.addEventListener("click", () => {
      stopComments(postId);
      openCommentsPostId = null;
      drawer.hidden = true;
    });

    const commentForm = drawer.querySelector(".comment-form");
    const commentTextInput = commentForm?.querySelector(".comment-text-input");
    const commentGifInput = commentForm?.querySelector(".comment-gif-input");
    const commentGifPreview = commentForm?.querySelector(".comment-gif-preview");
    commentForm?.querySelector(".comment-gif-trigger")?.addEventListener("click", () => {
      openGifPicker(commentGifInput, commentGifPreview);
    });
    commentGifPreview?.addEventListener("click", (event) => {
      if (!event.target.closest("[data-remove-gif]")) return;
      commentGifInput.value = "";
      renderGifPreview(commentGifPreview, "");
    });

    commentForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = commentTextInput;
      const button = event.submitter;
      const gifUrl = safeGifUrl(commentGifInput?.value);
      const body = input.value.trim() || (gifUrl ? "🎞️" : "");
      if (!body && !gifUrl) return;
      button.disabled = true;
      try {
        const commentRef = doc(collection(db, "posts", postId, "comments"));
        const batch = writeBatch(db);
        batch.set(commentRef, {
          authorId: currentUser.uid,
          displayName: (currentProfile?.displayName || currentUser.displayName || "Member").slice(0, 40),
          body,
          ...(gifUrl ? { gifUrl } : {}),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        batch.update(doc(db, "posts", postId), { commentCount: increment(1) });
        batch.update(doc(db, "profiles", currentUser.uid), {
          commentCount: increment(1),
          points: increment(2),
          updatedAt: serverTimestamp()
        });
        await batch.commit();
        input.value = "";
        if (commentGifInput) commentGifInput.value = "";
        renderGifPreview(commentGifPreview, "");
        await updateSignedInUi();
      } finally {
        button.disabled = false;
      }
    });

    drawer.querySelectorAll("[data-delete-comment]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (!confirm("Delete this reply?")) return;
        const batch = writeBatch(db);
        batch.delete(doc(db, "posts", postId, "comments", button.dataset.deleteComment));
        batch.update(doc(db, "posts", postId), { commentCount: increment(-1) });
        await batch.commit();
      });
    });
  }, () => {
    drawer.innerHTML = '<p class="muted-copy">Replies could not load.</p>';
  });

  commentStops.set(postId, stop);
};
const toggleHeart = async (postId) => {
  const reactionRef = doc(db, "posts", postId, "reactions", currentUser.uid);
  const postRef = doc(db, "posts", postId);
  await runTransaction(db, async (transaction) => {
    const reactionSnap = await transaction.get(reactionRef);
    const postSnap = await transaction.get(postRef);
    if (!postSnap.exists()) return;
    if (reactionSnap.exists()) {
      transaction.delete(reactionRef);
      transaction.update(postRef, { reactionCount: increment(-1) });
      likedPostIds.delete(postId);
    } else {
      transaction.set(reactionRef, {
        userId: currentUser.uid,
        reaction: "heart",
        createdAt: serverTimestamp()
      });
      transaction.update(postRef, { reactionCount: increment(1) });
      likedPostIds.add(postId);
    }
  });
  renderFeed();
};

const deletePostAndChildren = async (postId) => {
  const comments = await getDocs(collection(db, "posts", postId, "comments"));
  const reactions = await getDocs(collection(db, "posts", postId, "reactions"));
  const batch = writeBatch(db);
  comments.forEach((item) => batch.delete(item.ref));
  reactions.forEach((item) => batch.delete(item.ref));
  batch.delete(doc(db, "posts", postId));
  await batch.commit();
};

const openMemberProfile = (authorId) => {
  if (!authorId) return;
  if (authorId === currentUser?.uid) {
    openProfileEditor();
    return;
  }
  const dialog = $("community-member-dialog");
  const detail = $("community-member-detail");
  if (!dialog?.showModal || !detail) return;
  const profile = profileCache.get(authorId);
  const fromPost = lastPosts.find((post) => post.authorId === authorId);
  const name = profile?.displayName || fromPost?.displayName || "Community member";
  const intro = typeof profile?.bio === "string" && profile.bio.trim()
    ? profile.bio.trim() : "Here to connect and share a little everyday life.";
  const interests = Array.isArray(profile?.interests)
    ? profile.interests.filter((item) => allowedInterests.has(item)).slice(0, 5) : [];
  const category = allowedCategories.has(profile?.category) ? categoryLabels[profile.category] : "";
  const neurotype = allowedNeurotypes.has(profile?.neurotype) && profile.neurotype !== "prefer-not-to-say"
    ? neurotypeLabels[profile.neurotype] : "";
  detail.innerHTML = `
    <div class="community-member-hero"><span class="mini-avatar">${escapeHtml(initials(name))}</span>
    <div><p class="community-kicker">Community member</p><h2>${escapeHtml(name)}</h2></div></div>
    <p class="community-member-bio">${escapeHtml(intro)}</p>
    <div class="member-meta-chips">${category ? `<span>${escapeHtml(category)}</span>` : ""}
    ${neurotype ? `<span>${escapeHtml(neurotype)}</span>` : ""}
    ${interests.map((item) => `<span>${escapeHtml(interestLabels[item])}</span>`).join("")}</div>
    <p class="community-member-footnote">People first. Be respectful, and never share anyone's private information.</p>`;
  if (!dialog.open) dialog.showModal();
};

memberFeed?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button || !db || !currentUser) return;
  const card = button.closest("[data-post-id]");
  const postId = card?.dataset.postId;
  if (!postId) return;

  try {
    if (button.dataset.action === "profile") {
      openMemberProfile(button.dataset.authorId || card.dataset.authorId);
      return;
    }
    if (button.dataset.action === "heart") {
      button.disabled = true;
      await toggleHeart(postId);
      button.disabled = false;
    }

    if (button.dataset.action === "connect") {
      button.disabled = true;
      await toggleConnection(button.dataset.authorId || card.dataset.authorId);
      button.disabled = false;
    }

    if (button.dataset.action === "share") {
      await shareEdit(postId);
    }

    if (button.dataset.action === "comments") {
      const drawer = card.querySelector("[data-comments-for]");
      if (drawer.hidden) loadComments(postId, drawer);
      else {
        stopComments(postId);
        openCommentsPostId = null;
        drawer.hidden = true;
      }
    }

    if (button.dataset.action === "delete") {
      if (!confirm("Delete this post?")) return;
      await deletePostAndChildren(postId);
    }

    if (button.dataset.action === "report") {
      const reason = prompt("What should Sheema know about this post?");
      if (reason === null) return;
      await setDoc(doc(collection(db, "reports")), {
        reporterId: currentUser.uid,
        postId,
        reason: reason.trim().slice(0, 500),
        createdAt: serverTimestamp()
      });
      alert("Thanks. Your report was sent.");
    }
  } catch (error) {
    setMessage(systemNote, error.message || "That action could not be completed.", "error");
  }
});

$("community-auth-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!auth || !db) return;
  const email = $("auth-email").value.trim();
  const password = $("auth-password").value;
  const displayName = $("auth-display-name").value.trim();
  const submit = $("auth-submit");
  submit.disabled = true;
  setMessage($("auth-message"), authMode === "signup" ? "Creating your account…" : "Signing you in…");

  try {
    if (authMode === "signup") {
      if (!displayName) throw new Error("Add a display name first.");
      if (!$("auth-age-confirm")?.checked) {
        const ageField = $("auth-age-field");
        const ageConfirm = $("auth-age-confirm");
        if (ageField) ageField.hidden = false;
        if (ageConfirm) {
          ageConfirm.disabled = false;
          ageConfirm.required = true;
          ageConfirm.focus();
        }
        throw new Error("You must confirm you are 18 or older to join the Community.");
      }
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName: displayName.slice(0, 40) });
      try {
        await sendEmailVerification(credential.user);
      } finally {
        await signOut(auth);
      }
      setMessage($("auth-message"), "Check your email to verify your account. Then come back and sign in. ♡", "success");
      return;
    }

    const credential = await signInWithEmailAndPassword(auth, email, password);
    if (!credential.user.emailVerified) {
      await sendEmailVerification(credential.user);
      await signOut(auth);
      setMessage($("auth-message"), "Your email still needs verification. I sent you a fresh link. ♡", "error");
      return;
    }

    authDialog.close();
    event.currentTarget.reset();
  } catch (error) {
    const friendly = String(error?.code || "").includes("email-already-in-use")
      ? "That email already has an account. Try signing in."
      : String(error?.code || "").includes("invalid-credential")
        ? "That email or password does not match."
        : String(error?.code || "").includes("weak-password")
          ? "Use a stronger password with at least 8 characters."
          : error.message || "That did not work. Try again.";
    setMessage($("auth-message"), friendly, "error");
  } finally {
    submit.disabled = false;
  }
});

$("sign-out-button")?.addEventListener("click", async () => {
  if (auth) await signOut(auth);
});

$("edit-profile-button")?.addEventListener("click", openProfileEditor);

$("profile-interest-grid")?.addEventListener("change", (event) => {
  const input = event.target.closest('input[name="profile-interest"]');
  if (!input || !input.checked) return;
  const selected = [...document.querySelectorAll('input[name="profile-interest"]:checked')];
  if (selected.length > 5) {
    input.checked = false;
    setMessage($("profile-message"), "Pick up to 5 interests.", "error");
  } else {
    setMessage($("profile-message"), "");
  }
});

$("community-profile-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!db || !currentUser) return;
  const displayName = $("profile-display-name").value.trim();
  const bio = $("profile-bio").value.trim();
  const rawCategory = $("profile-category").value;
  const category = allowedCategories.has(rawCategory) ? rawCategory : "";
  const rawNeurotype = $("profile-neurotype").value;
  const neurotype = allowedNeurotypes.has(rawNeurotype) ? rawNeurotype : "";
  const interests = [...document.querySelectorAll('input[name="profile-interest"]:checked')]
    .map((input) => input.value)
    .filter((value) => allowedInterests.has(value))
    .slice(0, 5);
  if (!displayName) return setMessage($("profile-message"), "Your display name cannot be blank.", "error");
  try {
    await updateDoc(doc(db, "profiles", currentUser.uid), {
      displayName: displayName.slice(0, 40),
      bio: bio.slice(0, 280),
      category,
      neurotype,
      interests,
      updatedAt: serverTimestamp()
    });
    await updateProfile(currentUser, { displayName: displayName.slice(0, 40) });
    profileCache.delete(currentUser.uid);
    setMessage($("profile-message"), "Saved ♡", "success");
    await updateSignedInUi();
    profileCache.set(currentUser.uid, currentProfile);
    renderFeed();
    setTimeout(() => profileDialog.close(), 350);
  } catch (error) {
    const permission = String(error?.code || "").includes("permission-denied");
    if (permission) {
      // Older live Firestore rules permit display name and bio but not newer
      // public identity fields. Preserve basic editing until rules are published.
      try {
        await updateDoc(doc(db, "profiles", currentUser.uid), {
          displayName: displayName.slice(0, 40),
          bio: bio.slice(0, 280),
          updatedAt: serverTimestamp()
        });
        await updateProfile(currentUser, { displayName: displayName.slice(0, 40) });
        profileCache.delete(currentUser.uid);
        await updateSignedInUi();
        profileCache.set(currentUser.uid, currentProfile);
        renderFeed();
        setMessage($("profile-message"), "Name and bio saved. Interests and identity choices still need the Community permissions update.");
        return;
      } catch {
        // Use the original error so no restricted profile changes are misrepresented as saved.
      }
    }
    setMessage($("profile-message"), permission
      ? "Profile settings are waiting on the Community database permissions update."
      : (error.message || "Your profile could not be saved."), "error");
  }
});

const init = async () => {
  if (!configured) {
    updateSignedOutUi();
    if (systemNote) {
      systemNote.innerHTML = '<strong>Firebase Community engine ready.</strong> Member accounts turn on as soon as the free Spark project config is added.';
    }
    return;
  }

  try {
    const app = initializeApp(config);
    auth = getAuth(app);
    db = getFirestore(app);

    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        updateSignedOutUi();
        return;
      }

      if (!user.emailVerified) {
        updateSignedOutUi();
        return;
      }

      currentUser = user;
      showAuthenticatedShell(user);
      memberFeed?.setAttribute("aria-busy", "true");
      try {
        await ensureProfile(user);
        await updateSignedInUi();
        startFeed();
        startLeaderboard();
        setMessage(systemNote, "");
      } catch (error) {
        memberFeed?.removeAttribute("aria-busy");
        const code = String(error?.code || "");
        const message = code.includes("permission-denied")
          ? "You’re signed in, but Community profile access is blocked by the database permissions."
          : "You’re signed in, but your Community profile could not finish loading.";
        setMessage(systemNote, message, "error");
        $("rail-level").textContent = "Signed in";
      }
    });
  } catch {
    updateSignedOutUi();
    setMessage(systemNote, "The Community connection is temporarily unavailable. The public Edit is still here.", "error");
  }
};

init();
