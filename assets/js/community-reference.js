/* Social Community reference UI. Visual actions reuse existing Firebase workflows. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const feed = $("member-feed-list");
  const preview = $("community-preview-list");
  const authGateButton = $("community-auth-gate-button");
  const selfDialog = $("community-self-profile-dialog");
  const menuDialog = $("community-account-menu-dialog");
  const searchDialog = $("community-search-dialog");
  const searchInput = $("reference-search-input");
  const searchCount = $("reference-search-count");
  const profileList = $("reference-profile-posts");
  let uid = "";
  let username = "Community member";
  let bio = "";
  let followingCount = 0;
  let totalPosts = 0;
  let ownAvatar = "";
  let confirmedFollowers = null;
  let currentProfileTab = "posts";
  const validFeedNames = new Set(["all", "personal", "following"]);
  const savedKey = () => "sheema.community.saved.v2." + uid;
  const getSaved = () => {
    if (!uid) return [];
    try {
      const val = JSON.parse(localStorage.getItem(savedKey()) || "[]");
      return Array.isArray(val) ? val.filter(x => x && typeof x.id === "string").slice(0, 200) : [];
    } catch { return []; }
  };
  const putSaved = (list) => {
    if (!uid) return;
    try { localStorage.setItem(savedKey(), JSON.stringify(list.slice(0, 200))); } catch {}
  };
  const signedIn = () => Boolean(uid) && !$("member-feed-section")?.hidden;
  const join = () => authGateButton?.click();
  const scrollFeed = () => {
    $("member-feed-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const switchFeed = (mode) => {
    if (!signedIn()) return join();
    if (!validFeedNames.has(mode)) mode = "all";
    const key = mode === "all" ? "feed-for-you" : mode === "personal" ? "feed-personal" : "feed-following";
    $(key)?.click();
    document.querySelectorAll("[data-visual-feed]").forEach((tab) => {
      const active = tab.dataset.visualFeed === mode;
      tab.classList.toggle("is-active", active);
      if (active) tab.setAttribute("aria-current", "page");
      else tab.removeAttribute("aria-current");
    });
    scrollFeed();
  };
  const createPost = () => {
    if (!signedIn()) return join();
    if (selfDialog?.open) selfDialog.close();
    if (menuDialog?.open) menuDialog.close();
    const composer = $("community-composer");
    if (composer) composer.scrollIntoView({ behavior: "smooth", block: "center" });
    $("community-post-body")?.focus();
  };
  const searchPosts = () => {
    const term = (searchInput?.value || "").trim().toLowerCase();
    const cards = [...feed.querySelectorAll(".member-post-card")];
    let found = 0;
    for (const card of cards) {
      const match = !term || (card.querySelector(".community-post-body")?.textContent || "").toLowerCase().includes(term);
      card.hidden = !match;
      if (match) found++;
    }
    if (searchCount) searchCount.textContent = term
      ? found + (found === 1 ? " matching post in this feed" : " matching posts in this feed")
      : "Search posts currently available in your feed.";
  };
  const openSearch = () => {
    if (!signedIn()) return join();
    if (menuDialog?.open) menuDialog.close();
    if (!searchDialog?.showModal) return;
    searchInput.value = "";
    searchPosts();
    if (!searchDialog.open) searchDialog.showModal();
    searchInput.focus();
  };
  const closeSearch = () => {
    if (searchDialog?.open) searchDialog.close();
    if (searchInput) searchInput.value = "";
    searchPosts();
  };
  const ownPosts = () => [...feed.querySelectorAll(".member-post-card[data-author-id]")]
    .filter((card) => card.dataset.authorId === uid);
  const makePostLink = (data) => {
    const a = document.createElement("a");
    a.className = "reference-profile-item";
    const id = typeof data.id === "string" ? data.id : "";
    a.href = /^((?:edit|sparkle-seed)-[\w-]+)$/.test(id) ? "#" + id : "#community";
    const title = document.createElement("strong");
    title.textContent = data.text || "Community post";
    const detail = document.createElement("span");
    detail.textContent = data.label || "See this post in your feed";
    a.append(title, detail);
    a.addEventListener("click", () => {
      if (selfDialog?.open) selfDialog.close();
      if (location.hash !== a.getAttribute("href")) location.hash = a.getAttribute("href");
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return a;
  };
  const snap = (card) => ({
    id: card.id,
    text: (card.querySelector(".member-post-copy")?.textContent || "Shared media").trim().slice(0, 180),
    label: (card.querySelector(".post-author-line strong")?.textContent || "Community member").trim()
  });
  const drawProfileContent = () => {
    if (!profileList) return;
    profileList.replaceChildren();
    const saved = getSaved();
    const owned = ownPosts();
    const media = owned.filter(card => card.querySelector("img.community-gif, .community-video-wrap"));
    let entries = currentProfileTab === "saved" ? saved
      : (currentProfileTab === "media" ? media : owned).map(snap);
    if (!entries.length) {
      const p = document.createElement("p");
      p.textContent = currentProfileTab === "posts" ? "Your posts will appear here after you share one."
        : currentProfileTab === "media" ? "Your posts with media will appear here."
        : "Tap the bookmark on a post to save it privately on this device.";
      profileList.append(p);
      return;
    }
    entries.forEach((item) => profileList.append(makePostLink(item)));
  };
  const drawProfile = () => {
    $("reference-self-name").textContent = username || "Community member";
    const selfAvatar = $("reference-self-avatar");
    if (selfAvatar) {
      selfAvatar.replaceChildren();
      if (/^data:image\/jpeg;base64,[A-Za-z0-9+/=]{200,19976}$/.test(ownAvatar) && ownAvatar.length <= 20000) {
        const img = document.createElement("img");
        img.src = ownAvatar;
        img.alt = "";
        img.width = 98;
        img.height = 98;
        selfAvatar.append(img);
      } else selfAvatar.textContent = (username || "♡").trim().slice(0, 1).toUpperCase();
    }
    $("reference-self-bio").textContent = bio || "Here for the laughs, the little wins, and the real conversations. ♡";
    $("reference-post-count").textContent = String(Math.max(totalPosts, ownPosts().length));
    $("reference-follow-count").textContent = String(followingCount);
    $("reference-follower-count").textContent = confirmedFollowers === null ? "—" : String(confirmedFollowers);
    $("reference-follower-note").textContent = confirmedFollowers === null
      ? "Follower count is unavailable. Only confirmed connections are counted when available."
      : "Only confirmed connections are counted. Follows saved just on a device are not included.";
    $("reference-save-count").textContent = String(getSaved().length);
    document.querySelectorAll("[data-ui-profile-tab]").forEach((button) => button.classList.toggle(
      "is-active", button.dataset.uiProfileTab === currentProfileTab));
    drawProfileContent();
  };
  const openProfile = (tab = "posts") => {
    if (!signedIn()) return join();
    if (menuDialog?.open) menuDialog.close();
    currentProfileTab = ["posts", "saved", "media"].includes(tab) ? tab : "posts";
    confirmedFollowers = null;
    drawProfile();
    if (!selfDialog.open) selfDialog.showModal();
    document.dispatchEvent(new CustomEvent("community:request-follower-count", { detail: { uid } }));
  };
  const openMenu = () => {
    if (!signedIn()) return join();
    if (!menuDialog.open) menuDialog.showModal();
  };
  const clickTopic = (topic) => {
    if (!signedIn()) return join();
    switchFeed("all");
    const button = document.querySelector('[data-community-vibe="' + topic + '"]');
    if (button) button.click();
    scrollFeed();
  };
  const updateSavedButtons = (scope) => {
    if (!scope) return;
    const saved = new Set(getSaved().map(x => x.id));
    for (const card of scope.querySelectorAll(".member-post-card")) {
      const actions = card.querySelector(".member-post-actions");
      if (!actions || !card.id) continue;
      let button = actions.querySelector("[data-ui-save]");
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.dataset.uiSave = "true";
        button.className = "reference-bookmark-button";
        actions.append(button);
      }
      const isSaved = saved.has(card.id);
      if (button.dataset.savedState === String(isSaved)) continue;
      button.dataset.savedState = String(isSaved);
      button.setAttribute("aria-label", isSaved ? "Remove saved post" : "Save post");
      button.setAttribute("aria-pressed", String(isSaved));
      button.title = isSaved ? "Remove saved post" : "Save post";
      button.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="' + (isSaved ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>';
    }
  };
  const saveClick = (event) => {
    const btn = event.target.closest("[data-ui-save]");
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    if (!signedIn()) return join();
    const card = btn.closest(".member-post-card");
    if (!card?.id) return;
    let saved = getSaved();
    saved = saved.some(x => x.id === card.id) ? saved.filter(x => x.id !== card.id) : [snap(card), ...saved];
    putSaved(saved);
    updateSavedButtons(feed);
    if (selfDialog.open) drawProfile();
  };
  for (const scope of [feed, preview]) {
    if (!scope) continue;
    scope.addEventListener("click", saveClick, true);
    const observer = new MutationObserver(() => updateSavedButtons(scope));
    observer.observe(scope, { childList: true, subtree: true });
    updateSavedButtons(scope);
  }
  document.addEventListener("community:session", (event) => {
    uid = event.detail?.uid || "";
    username = event.detail?.displayName || "Community member";
    bio = event.detail?.bio || "";
    followingCount = event.detail?.followingCount || 0;
    totalPosts = event.detail?.postCount || 0;
    ownAvatar = event.detail?.avatarData || "";
    updateSavedButtons(feed);
    updateSavedButtons(preview);
    if (!uid) {
      if (selfDialog?.open) selfDialog.close();
      if (menuDialog?.open) menuDialog.close();
      if (searchDialog?.open) closeSearch();
    } else if (selfDialog?.open) drawProfile();
  });
  document.addEventListener("community:follower-count", (event) => {
    if (event.detail?.uid !== uid || !uid) return;
    confirmedFollowers = event.detail.confirmed ? event.detail.count : null;
    if (selfDialog?.open) drawProfile();
  });
  document.addEventListener("community:open-my-profile", () => openProfile());
  $("community-search-trigger")?.addEventListener("click", openSearch);
  $("community-create-trigger")?.addEventListener("click", createPost);
  $("community-menu-trigger")?.addEventListener("click", openMenu);
  document.querySelectorAll("[data-visual-feed]").forEach((btn) =>
    btn.addEventListener("click", () => switchFeed(btn.dataset.visualFeed)));
  document.querySelectorAll("[data-ui-topic]").forEach((btn) =>
    btn.addEventListener("click", () => clickTopic(btn.dataset.uiTopic)));
  document.querySelectorAll("[data-ui-nav]").forEach((btn) => btn.addEventListener("click", () => {
    switch (btn.dataset.uiNav) {
      case "home": switchFeed("personal"); break;
      case "discover": openSearch(); break;
      case "create": createPost(); break;
      case "profile": openProfile(); break;
    }
  }));
  document.querySelectorAll("[data-ui-profile-tab]").forEach(btn => btn.addEventListener("click", () => {
    currentProfileTab = btn.dataset.uiProfileTab;
    drawProfile();
  }));
  $("reference-edit-profile")?.addEventListener("click", () => {
    if (selfDialog.open) selfDialog.close();
    $("edit-profile-button")?.click();
  });
  $("reference-profile-create")?.addEventListener("click", createPost);
  $("reference-search-input")?.addEventListener("input", searchPosts);
  searchDialog?.addEventListener("close", closeSearch);
  document.querySelectorAll("[data-ui-menu]").forEach(btn => btn.addEventListener("click", () => {
    switch (btn.dataset.uiMenu) {
      case "profile": openProfile(); break;
      case "saved": openProfile("saved"); break;
      case "edit": menuDialog.close(); $("edit-profile-button")?.click(); break;
      case "discover": openSearch(); break;
      case "help": menuDialog.close(); alert("Be kind, protect privacy, and report concerning posts using the Report action. Community membership is free and for adults 18+."); break;
      case "logout": menuDialog.close(); $("sign-out-button")?.click(); break;
    }
  }));
  // Auth can initialize before this deferred script in a cached browser.
  // Rehydrate the already verified session instead of requiring a refresh.
  const alreadyVerifiedUid = document.documentElement.dataset.communityUid;
  if (alreadyVerifiedUid) {
    document.dispatchEvent(new CustomEvent("community:session", {
      detail: { uid: alreadyVerifiedUid, displayName: $("rail-display-name")?.textContent || "Community member",
        bio: "", postCount: 0, followingCount: 0 }
    }));
  }
})();
