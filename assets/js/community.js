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
const $ = (id) => document.getElementById(id);

const authDialog = $("community-auth-dialog");
const profileDialog = $("community-profile-dialog");
const authButton = $("community-auth-button");
const authGateButton = $("community-auth-gate-button");
const railAuthButton = $("rail-auth-button");
const authGate = $("community-auth-gate");
const composer = $("community-composer");
const memberSection = $("member-feed-section");
const systemNote = $("community-system-note");
const signedOutRail = $("community-account-signed-out");
const signedInRail = $("community-account-signed-in");
const memberFeed = $("member-feed-list");
const memberFeedEmpty = $("member-feed-empty");
const leaderboard = $("community-leaderboard");
const gifDialog = $("community-gif-dialog");
const gifForm = $("community-gif-form");
const gifUrlInput = $("community-gif-url");
const gifDialogPreview = $("community-gif-dialog-preview");
const gifMessage = $("community-gif-message");
const gifRemoveButton = $("community-gif-remove");
const postGifInput = $("community-post-gif-url");
const postGifPreview = $("community-post-gif-preview");
const postGifButton = $("community-post-gif-button");
const feedForYouButton = $("feed-for-you");
const feedFollowingButton = $("feed-following");

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

const allowedCategories = new Set(Object.keys(categoryLabels));
const allowedInterests = new Set(Object.keys(interestLabels));

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
let followingIds = new Set();
let feedMode = "all";
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
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const trusted = host === "giphy.com" || host.endsWith(".giphy.com") || host === "tenor.com" || host.endsWith(".tenor.com");
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

const openGifPicker = (input, preview) => {
  if (!gifDialog?.showModal) return;
  activeGifTarget = { input, preview };
  gifUrlInput.value = input?.value || "";
  setMessage(gifMessage, "");
  renderGifPreview(gifDialogPreview, gifUrlInput.value, false);
  gifDialog.showModal();
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
authButton?.addEventListener("click", () => {
  if (currentUser) $("edit-profile-button")?.click();
  else openAuth();
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
  authGate.hidden = false;
  composer.hidden = true;
  memberSection.hidden = true;
  signedOutRail.hidden = false;
  signedInRail.hidden = true;
  if (authButton) {
    authButton.hidden = true;
    authButton.textContent = "My profile";
  }
  if (leaderboard) leaderboard.innerHTML = '<p class="muted-copy">Join the community to see member levels.</p>';
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

const updateSignedInUi = async () => {
  const profile = await loadProfile();
  const level = memberLevel(profile?.points || 0);
  authGate.hidden = true;
  composer.hidden = false;
  memberSection.hidden = false;
  signedOutRail.hidden = true;
  signedInRail.hidden = false;
  if (authButton) {
    authButton.hidden = false;
    authButton.textContent = "My profile";
  }
  $("composer-avatar").textContent = initials(profile?.displayName);
  $("rail-avatar").textContent = initials(profile?.displayName);
  $("rail-display-name").textContent = profile?.displayName || "Member";
  $("rail-level").textContent = `Level ${level.level} · ${level.name}`;
  const railTags = $("rail-profile-tags");
  if (railTags) {
    const category = allowedCategories.has(profile?.category) ? categoryLabels[profile.category] : "";
    const interests = Array.isArray(profile?.interests)
      ? profile.interests.filter((item) => allowedInterests.has(item)).slice(0, 2)
      : [];
    railTags.innerHTML = [
      category ? `<span>${escapeHtml(category)}</span>` : "",
      ...interests.map((item) => `<span>${escapeHtml(interestLabels[item])}</span>`)
    ].join("");
  }
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
  const space = spaces[post.spaceId] || { name: "Community", emoji: "♡" };
  const liked = likedPostIds.has(post.id);
  const mine = post.authorId === currentUser?.uid;
  const authorProfile = profileCache.get(post.authorId);
  const category = allowedCategories.has(authorProfile?.category) ? categoryLabels[authorProfile.category] : "";
  const interests = Array.isArray(authorProfile?.interests)
    ? authorProfile.interests.filter((item) => allowedInterests.has(item)).slice(0, 2)
    : [];
  return `
    <article class="community-card member-post-card" data-post-id="${escapeHtml(post.id)}">
      <div class="post-avatar small" aria-hidden="true">${escapeHtml(initials(post.displayName))}</div>
      <div class="community-post-body">
        <div class="post-heading">
          <div>
            <strong>${escapeHtml(authorProfile?.displayName || post.displayName || "Member")}</strong>
            <span> · ${escapeHtml(relativeTime(post.createdAt))}</span>
            ${category ? `<div class="member-meta-chips"><span class="member-category-chip">${escapeHtml(category)}</span>${interests.map((item) => `<span>${escapeHtml(interestLabels[item])}</span>`).join("")}</div>` : interests.length ? `<div class="member-meta-chips">${interests.map((item) => `<span>${escapeHtml(interestLabels[item])}</span>`).join("")}</div>` : ""}
          </div>
          <span class="room-chip room-${escapeHtml(post.spaceId)}">${space.emoji} ${escapeHtml(space.name)}</span>
        </div>
        ${post.isPinned ? '<span class="pin inline-pin">PINNED</span>' : ""}
        ${post.body ? `<p class="member-post-copy">${escapeHtml(post.body).replaceAll("\n", "<br>")}</p>` : ""}
        ${post.gifUrl ? `<div class="community-gif-wrap">${gifImageHtml(post.gifUrl, "GIF shared by " + (post.displayName || "Member"))}</div>` : ""}
        <div class="member-post-actions">
          <button type="button" data-action="heart" aria-pressed="${liked}">${liked ? "♥" : "♡"} <span>${Math.max(0, post.reactionCount || 0)}</span></button>
          <button type="button" data-action="comments">💬 <span>${Math.max(0, post.commentCount || 0)}</span></button>
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
  const sorted = [...lastPosts].sort((a, b) => {
    if (Boolean(a.isPinned) !== Boolean(b.isPinned)) return a.isPinned ? -1 : 1;
    return timestampToDate(b.createdAt) - timestampToDate(a.createdAt);
  });
  memberFeed.innerHTML = sorted.map(postCardHtml).join("");
  memberFeedEmpty.hidden = sorted.length > 0;
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

const refreshCommunity = async () => {
  if (!currentUser) return;
  await hydrateLikesForPosts(lastPosts);
  await updateSignedInUi();
  renderFeed();
};

$("refresh-community")?.addEventListener("click", refreshCommunity);

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
  const body = $("community-post-body").value.trim();
  const gifUrl = safeGifUrl(postGifInput?.value);
  const spaceId = $("community-post-space").value;
  if (!body && !gifUrl) return setMessage($("community-post-message"), "Write something or add a GIF ♡", "error");

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
      body,
      ...(gifUrl ? { gifUrl } : {}),
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
      const body = input.value.trim();
      const gifUrl = safeGifUrl(commentGifInput?.value);
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

memberFeed?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button || !db || !currentUser) return;
  const card = button.closest("[data-post-id]");
  const postId = card?.dataset.postId;
  if (!postId) return;

  try {
    if (button.dataset.action === "heart") {
      button.disabled = true;
      await toggleHeart(postId);
      button.disabled = false;
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

$("edit-profile-button")?.addEventListener("click", () => {
  if (!currentProfile || !profileDialog?.showModal) return;
  $("profile-display-name").value = currentProfile.displayName || "";
  $("profile-bio").value = currentProfile.bio || "";
  $("profile-category").value = allowedCategories.has(currentProfile.category) ? currentProfile.category : "";
  const selected = new Set(Array.isArray(currentProfile.interests) ? currentProfile.interests : []);
  document.querySelectorAll('input[name="profile-interest"]').forEach((input) => {
    input.checked = selected.has(input.value);
  });
  setMessage($("profile-message"), "");
  profileDialog.showModal();
});

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
    setMessage($("profile-message"), error.message || "Your profile could not be saved.", "error");
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
      try {
        await ensureProfile(user);
        await updateSignedInUi();
        memberFeed?.setAttribute("aria-busy", "true");
        startFeed();
        startLeaderboard();
        setMessage(systemNote, "");
      } catch (error) {
        setMessage(systemNote, "Your account connected, but the Community data could not load.", "error");
      }
    });
  } catch {
    updateSignedOutUi();
    setMessage(systemNote, "The Community connection is temporarily unavailable. The public Edit is still here.", "error");
  }
};

init();
