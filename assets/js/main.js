// Google Analytics 4 fallback for pages without an inline Google tag
const googleAnalyticsId = "G-C7XV3YJCZE";
const hasInlineGoogleTag = Boolean(
  document.querySelector(`script[src*="googletagmanager.com/gtag/js?id=${googleAnalyticsId}"]`)
);

window.dataLayer = window.dataLayer || [];
window.gtag = window.gtag || function gtag() {
  window.dataLayer.push(arguments);
};

if (!hasInlineGoogleTag) {
  window.gtag("js", new Date());
  window.gtag("config", googleAnalyticsId);

  const googleAnalyticsScript = document.createElement("script");
  googleAnalyticsScript.async = true;
  googleAnalyticsScript.src = `https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}`;
  document.head.appendChild(googleAnalyticsScript);
}

const trackEvent = (eventName, params = {}) => {
  window.gtag("event", eventName, {
    page_path: window.location.pathname,
    page_title: document.title,
    ...params,
  });
};

const menuButton = document.querySelector(".menu-toggle");
const siteNav = document.querySelector(".site-nav");

if (menuButton && siteNav) {
  menuButton.addEventListener("click", () => {
    const isOpen = menuButton.getAttribute("aria-expanded") === "true";
    menuButton.setAttribute("aria-expanded", String(!isOpen));
    siteNav.dataset.open = String(!isOpen);
  });

  siteNav.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      menuButton.setAttribute("aria-expanded", "false");
      siteNav.dataset.open = "false";
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      menuButton.setAttribute("aria-expanded", "false");
      siteNav.dataset.open = "false";
    }
  });
}

const filterButtons = document.querySelectorAll("[data-filter]");
const postCards = document.querySelectorAll("[data-category]");

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const selected = button.dataset.filter;
    filterButtons.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    postCards.forEach((card) => {
      card.hidden = selected !== "all" && card.dataset.category !== selected;
    });
  });
});

// Community room links can open the home feed already filtered to that topic.
const requestedTopic = new URLSearchParams(window.location.search).get("topic");
if (requestedTopic) {
  const requestedButton = [...filterButtons].find((button) => button.dataset.filter === requestedTopic);
  if (requestedButton) requestedButton.click();
}

const progressBar = document.querySelector(".reading-progress");
if (progressBar) {
  const updateProgress = () => {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const progress = scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0;
    progressBar.style.width = `${Math.min(progress, 100)}%`;
  };
  updateProgress();
  document.addEventListener("scroll", updateProgress, { passive: true });
}

document.querySelectorAll("[data-current-year]").forEach((element) => {
  element.textContent = new Date().getFullYear();
});

// Keep older Base44 shop links working while the site moves to its own shop page.
const legacyShopUrl = "https://sheema-edit-space.base44.app";
document.querySelectorAll(`a[href="${legacyShopUrl}"]`).forEach((link) => {
  link.setAttribute("href", "/shop/");
});

// Track entry points into the shop from the main site.
document.querySelectorAll('a[href="/shop/"], a[href="/shop"]').forEach((link) => {
  link.addEventListener("click", () => {
    trackEvent("shop_entry_click", {
      link_text: (link.textContent || "").trim(),
      shop_destination: "/shop/",
    });
  });
});

// Track clicks on the floating Support The Edit Stripe link on blog posts.
document.querySelectorAll("[data-support-edit-link]").forEach((link) => {
  link.addEventListener("click", () => {
    trackEvent("support_edit_click", {
      support_destination: link.href,
      support_source: "floating_blog_button",
    });
  });
});

// The launch popup replaces the previous general shop popup during the What Do I Say? launch.
if (!window.location.pathname.startsWith("/what-do-i-say")) {
  const launchPopupScript = document.createElement("script");
  launchPopupScript.src = "/assets/js/wdis-launch-popup.js?v=2";
  launchPopupScript.async = true;
  document.head.appendChild(launchPopupScript);
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  });
}