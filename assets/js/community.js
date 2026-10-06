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
const configured = /^https:\/\/.+\.supabase\.co$/i.test(config.supabaseUrl || "") &&
  typeof config.supabaseAnonKey === "string" &&
  config.supabaseAnonKey.length > 40;

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

let supabase = null;
let currentUser = null;
let currentProfile = null;
let authMode = "signup";
let lastPosts = [];

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const relativeTime = (dateString) => {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(dateString).getTime()) / 1000));
  const units = [
    [31536000, "year"],
    [2592000, "month"],
    [604800, "week"],
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
  ];
  for (const [size, label] of units) {
    if (seconds >= size) {
      const n = Math.floor(seconds / size);
      return n + " " + label + (n === 1 ? "" : "s") + " ago";
    }
  }
  return "just now";
};

const initials = (name = "Member") => name.trim().slice(0, 1).toUpperCase() || "♡";
const setMessage = (element, message, type = "") => {
  if (!element) return;
  element.textContent = message;
  element.dataset.type = type;
};

const openAuth = () => {
  if (!configured) {
    if (systemNote) {
      systemNote.textContent = "Member accounts are built and ready for the free database connection.";
      systemNote.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    return;
  }
  if (authDialog?.showModal) authDialog.showModal();
};

[authButton, authGateButton, railAuthButton].forEach((button) => button?.addEventListener("click", openAuth));

const renderAuthMode = () => {
  const signup = authMode === "signup";
  $("auth-dialog-title").textContent = signup ? "Join the community" : "Welcome back";
  $("auth-name-field").hidden = !signup;
  $("auth-submit").textContent = signup ? "Create free account" : "Sign in";
  $("auth-switch").textContent = signup ? "Already a member? Sign in" : "New here? Create a free account";
  $("auth-password").autocomplete = signup ? "new-password" : "current-password";
  setMessage($("auth-message"), "");
};

$("auth-switch")?.addEventListener("click", () => {
  authMode = authMode === "signup" ? "signin" : "signup";
  renderAuthMode();
});
renderAuthMode();

const updateSignedOutUi = () => {
  currentUser = null;
  currentProfile = null;
  authGate.hidden = false;
  composer.hidden = true;
  memberSection.hidden = true;
  signedOutRail.hidden = false;
  signedInRail.hidden = true;
  if (authButton) authButton.textContent = "Join / sign in";
  if (leaderboard) leaderboard.innerHTML = '<p class="muted-copy">Join the community to see member levels.</p>';
};

const loadProfile = async () => {
  if (!supabase || !currentUser) return null;
  const { data, error } = await supabase
    .from("community_profiles")
    .select("id,display_name,bio,avatar_url,created_at")
    .eq("id", currentUser.id)
    .single();
  if (error) throw error;
  currentProfile = data;
  return data;
};

const loadMyLevel = async () => {
  if (!supabase || !currentUser) return null;
  const { data } = await supabase
    .from("community_leaderboard")
    .select("points,level,level_name")
    .eq("id", currentUser.id)
    .maybeSingle();
  return data;
};

const updateSignedInUi = async () => {
  const profile = await loadProfile();
  const level = await loadMyLevel();
  authGate.hidden = true;
  composer.hidden = false;
  memberSection.hidden = false;
  signedOutRail.hidden = true;
  signedInRail.hidden = false;
  if (authButton) authButton.textContent = profile?.display_name || "My community";
  $("composer-avatar").textContent = initials(profile?.display_name);
  $("rail-avatar").textContent = initials(profile?.display_name);
  $("rail-display-name").textContent = profile?.display_name || "Member";
  $("rail-level").textContent = level ? `Level ${level.level} · ${level.level_name}` : "Level 1 · New Here";
};

const normalizeRelation = (value) => Array.isArray(value) ? value[0] : value;

const postCardHtml = (post) => {
  const profile = normalizeRelation(post.community_profiles) || {};
  const space = normalizeRelation(post.community_spaces) || {};
  const comments = Array.isArray(post.community_comments) ? post.community_comments.length : 0;
  const reactions = Array.isArray(post.community_reactions) ? post.community_reactions : [];
  const liked = reactions.some((reaction) => reaction.user_id === currentUser?.id);
  const mine = post.author_id === currentUser?.id;

  return `
    <article class="community-card member-post-card" data-post-id="${escapeHtml(post.id)}">
      <div class="post-avatar small" aria-hidden="true">${escapeHtml(initials(profile.display_name))}</div>
      <div class="community-post-body">
        <div class="post-heading">
          <div><strong>${escapeHtml(profile.display_name || "Member")}</strong><span> · ${escapeHtml(relativeTime(post.created_at))}</span></div>
          <span class="room-chip room-${escapeHtml(post.space_id)}">${escapeHtml(space.emoji || "♡")} ${escapeHtml(space.name || "Community")}</span>
        </div>
        ${post.is_pinned ? '<span class="pin inline-pin">PINNED</span>' : ""}
        <p class="member-post-copy">${escapeHtml(post.body).replaceAll("\n", "<br>")}</p>
        <div class="member-post-actions">
          <button type="button" data-action="heart" aria-pressed="${liked}">${liked ? "♥" : "♡"} <span>${reactions.length}</span></button>
          <button type="button" data-action="comments">💬 <span>${comments}</span></button>
          <button type="button" data-action="report">Report</button>
          ${mine ? '<button class="danger-link" type="button" data-action="delete">Delete</button>' : ""}
        </div>
        <div class="comments-drawer" data-comments-for="${escapeHtml(post.id)}" hidden></div>
      </div>
    </article>`;
};

const loadPosts = async () => {
  if (!supabase || !currentUser) return;
  memberFeed.setAttribute("aria-busy", "true");
  const { data, error } = await supabase
    .from("community_posts")
    .select("id,author_id,space_id,body,is_pinned,created_at,community_profiles(display_name,avatar_url),community_spaces(name,emoji),community_comments(id),community_reactions(user_id,reaction)")
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);

  memberFeed.removeAttribute("aria-busy");
  if (error) {
    setMessage(systemNote, "The member feed could not load. Please try again.", "error");
    return;
  }
  lastPosts = data || [];
  memberFeed.innerHTML = lastPosts.map(postCardHtml).join("");
  memberFeedEmpty.hidden = lastPosts.length > 0;
};

const loadLeaderboard = async () => {
  if (!supabase || !currentUser || !leaderboard) return;
  const { data, error } = await supabase
    .from("community_leaderboard")
    .select("id,display_name,points,level,level_name")
    .order("points", { ascending: false })
    .order("display_name", { ascending: true })
    .limit(20);

  if (error) return;
  leaderboard.innerHTML = (data || []).map((member, index) => `
    <div class="leader-row${member.id === currentUser.id ? " is-you" : ""}">
      <span class="leader-rank">${index + 1}</span>
      <span class="mini-avatar">${escapeHtml(initials(member.display_name))}</span>
      <div><strong>${escapeHtml(member.display_name)}</strong><small>Level ${member.level} · ${escapeHtml(member.level_name)}</small></div>
      <b>${member.points} pts</b>
    </div>
  `).join("") || '<p class="muted-copy">No points yet. The first conversation starts the board.</p>';
};

const refreshCommunity = async () => {
  if (!currentUser) return;
  await Promise.all([loadPosts(), loadLeaderboard(), updateSignedInUi()]);
};

$("refresh-community")?.addEventListener("click", refreshCommunity);

$("community-post-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase || !currentUser) return openAuth();
  const body = $("community-post-body").value.trim();
  const space_id = $("community-post-space").value;
  if (!body) return setMessage($("community-post-message"), "Write something first ♡", "error");

  const submit = event.submitter;
  if (submit) submit.disabled = true;
  setMessage($("community-post-message"), "Posting...");
  const { error } = await supabase.from("community_posts").insert({
    author_id: currentUser.id,
    space_id,
    body,
  });
  if (submit) submit.disabled = false;

  if (error) return setMessage($("community-post-message"), error.message, "error");
  $("community-post-body").value = "";
  setMessage($("community-post-message"), "Posted ♡", "success");
  await refreshCommunity();
});

const loadComments = async (postId, drawer) => {
  drawer.hidden = false;
  drawer.innerHTML = '<p class="muted-copy">Loading replies…</p>';
  const { data, error } = await supabase
    .from("community_comments")
    .select("id,body,created_at,author_id,community_profiles(display_name)")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (error) {
    drawer.innerHTML = '<p class="muted-copy">Replies could not load.</p>';
    return;
  }

  const comments = (data || []).map((comment) => {
    const profile = normalizeRelation(comment.community_profiles) || {};
    const mine = comment.author_id === currentUser?.id;
    return `
      <div class="member-comment">
        <span class="mini-avatar">${escapeHtml(initials(profile.display_name))}</span>
        <div><p><strong>${escapeHtml(profile.display_name || "Member")}</strong> <small>· ${escapeHtml(relativeTime(comment.created_at))}</small></p><div>${escapeHtml(comment.body).replaceAll("\n", "<br>")}</div></div>
        ${mine ? `<button type="button" data-delete-comment="${escapeHtml(comment.id)}" aria-label="Delete comment">×</button>` : ""}
      </div>`;
  }).join("");

  drawer.innerHTML = `
    <div class="comments-list">${comments || '<p class="muted-copy">No replies yet.</p>'}</div>
    <form class="comment-form">
      <label class="sr-only">Add a reply</label>
      <input maxlength="2000" placeholder="Write a reply…" required>
      <button type="submit">Reply</button>
    </form>`;

  drawer.querySelector(".comment-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = event.currentTarget.querySelector("input");
    const body = input.value.trim();
    if (!body) return;
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;
    const { error: insertError } = await supabase.from("community_comments").insert({
      post_id: postId,
      author_id: currentUser.id,
      body,
    });
    button.disabled = false;
    if (insertError) return;
    input.value = "";
    await loadComments(postId, drawer);
    await loadPosts();
    await loadLeaderboard();
  });

  drawer.querySelectorAll("[data-delete-comment]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Delete this reply?")) return;
      await supabase.from("community_comments").delete().eq("id", button.dataset.deleteComment);
      await loadComments(postId, drawer);
      await loadPosts();
      await loadLeaderboard();
    });
  });
};

memberFeed?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button || !supabase || !currentUser) return;
  const card = button.closest("[data-post-id]");
  const postId = card?.dataset.postId;
  if (!postId) return;
  const post = lastPosts.find((item) => item.id === postId);

  if (button.dataset.action === "heart") {
    const reactions = Array.isArray(post?.community_reactions) ? post.community_reactions : [];
    const liked = reactions.some((reaction) => reaction.user_id === currentUser.id);
    if (liked) {
      await supabase.from("community_reactions").delete().eq("post_id", postId).eq("user_id", currentUser.id);
    } else {
      await supabase.from("community_reactions").insert({ post_id: postId, user_id: currentUser.id, reaction: "heart" });
    }
    await Promise.all([loadPosts(), loadLeaderboard()]);
  }

  if (button.dataset.action === "comments") {
    const drawer = card.querySelector("[data-comments-for]");
    if (drawer.hidden) await loadComments(postId, drawer);
    else drawer.hidden = true;
  }

  if (button.dataset.action === "delete") {
    if (!confirm("Delete this post?")) return;
    await supabase.from("community_posts").delete().eq("id", postId);
    await refreshCommunity();
  }

  if (button.dataset.action === "report") {
    const reason = prompt("What should Sheema know about this post?");
    if (reason === null) return;
    const { error } = await supabase.from("community_reports").insert({
      reporter_id: currentUser.id,
      post_id: postId,
      reason: reason.trim().slice(0, 500),
    });
    if (!error) alert("Thanks. Your report was sent.");
  }
});

$("community-auth-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase) return;
  const email = $("auth-email").value.trim();
  const password = $("auth-password").value;
  const displayName = $("auth-display-name").value.trim();
  const submit = $("auth-submit");
  submit.disabled = true;
  setMessage($("auth-message"), authMode === "signup" ? "Creating your account…" : "Signing you in…");

  let result;
  if (authMode === "signup") {
    if (!displayName) {
      submit.disabled = false;
      return setMessage($("auth-message"), "Add a display name first.", "error");
    }
    result = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
  } else {
    result = await supabase.auth.signInWithPassword({ email, password });
  }

  submit.disabled = false;
  if (result.error) return setMessage($("auth-message"), result.error.message, "error");

  if (authMode === "signup" && !result.data.session) {
    setMessage($("auth-message"), "Check your email to confirm your account, then come back and sign in. ♡", "success");
    return;
  }

  authDialog.close();
  event.currentTarget.reset();
});

$("sign-out-button")?.addEventListener("click", async () => {
  if (!supabase) return;
  await supabase.auth.signOut();
});

$("edit-profile-button")?.addEventListener("click", () => {
  if (!currentProfile || !profileDialog?.showModal) return;
  $("profile-display-name").value = currentProfile.display_name || "";
  $("profile-bio").value = currentProfile.bio || "";
  setMessage($("profile-message"), "");
  profileDialog.showModal();
});

$("community-profile-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase || !currentUser) return;
  const display_name = $("profile-display-name").value.trim();
  const bio = $("profile-bio").value.trim();
  if (!display_name) return setMessage($("profile-message"), "Your display name cannot be blank.", "error");
  const { error } = await supabase
    .from("community_profiles")
    .update({ display_name, bio })
    .eq("id", currentUser.id);
  if (error) return setMessage($("profile-message"), error.message, "error");
  setMessage($("profile-message"), "Saved ♡", "success");
  await refreshCommunity();
  setTimeout(() => profileDialog.close(), 350);
});

const init = async () => {
  if (!configured) {
    updateSignedOutUi();
    if (systemNote) {
      systemNote.innerHTML = '<strong>Community engine ready.</strong> Member accounts turn on as soon as the free database connection is added.';
    }
    return;
  }

  try {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });

    const { data: { session } } = await supabase.auth.getSession();
    currentUser = session?.user || null;

    if (currentUser) {
      await updateSignedInUi();
      await Promise.all([loadPosts(), loadLeaderboard()]);
    } else {
      updateSignedOutUi();
    }

    supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      currentUser = nextSession?.user || null;
      if (!currentUser) return updateSignedOutUi();
      try {
        await updateSignedInUi();
        await Promise.all([loadPosts(), loadLeaderboard()]);
      } catch (error) {
        setMessage(systemNote, "Your account connected, but the community data could not load.", "error");
      }
    });

    let refreshTimer;
    supabase
      .channel("community-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "community_posts" }, () => {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(loadPosts, 250);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "community_comments" }, () => {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(loadPosts, 250);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "community_reactions" }, () => {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => Promise.all([loadPosts(), loadLeaderboard()]), 250);
      })
      .subscribe();

    setMessage(systemNote, "");
  } catch (error) {
    updateSignedOutUi();
    setMessage(systemNote, "The community connection is temporarily unavailable. The public Edit is still here.", "error");
  }
};

init();
