// Google Analytics 4 fallback for pages without an inline Google tag
const googleAnalyticsId = "G-C7XV3YJCZE";
const hasInlineGoogleTag = Boolean(
  document.querySelector(`script[src*="googletagmanager.com/gtag/js?id=${googleAnalyticsId}"]`)
);

if (!hasInlineGoogleTag) {
  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  gtag("js", new Date());
  gtag("config", googleAnalyticsId);

  const googleAnalyticsScript = document.createElement("script");
  googleAnalyticsScript.async = true;
  googleAnalyticsScript.src = `https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}`;
  document.head.appendChild(googleAnalyticsScript);
}

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
      menuButton.focus();
    }
  });
}

const filterButtons = document.querySelectorAll("[data-filter]");
const postCards = document.querySelectorAll("[data-category]");

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const selected = button.dataset.filter;

    filterButtons.forEach((item) => {
      item.setAttribute("aria-pressed", String(item === button));
    });

    postCards.forEach((card) => {
      card.hidden = selected !== "all" && card.dataset.category !== selected;
    });
  });
});

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

const isHomePage = window.location.pathname === "/" || window.location.pathname === "/index.html";

if (isHomePage) {
  document.title = "I Wanted to Be Able To | The Sheema Edit";

  const description = "It hurts to need help when what I wanted was to help.";
  const metaDescription = document.querySelector('meta[name="description"]');
  const ogTitle = document.querySelector('meta[property="og:title"]');
  const ogDescription = document.querySelector('meta[property="og:description"]');

  if (metaDescription) metaDescription.setAttribute("content", description);
  if (ogTitle) ogTitle.setAttribute("content", "I Wanted to Be Able To | The Sheema Edit");
  if (ogDescription) ogDescription.setAttribute("content", description);

  document.querySelectorAll(".marquee-track span").forEach((item) => {
    item.textContent = "I wanted to be able to ✦ Asking for help is hard ✦ Trying in ways nobody can see ✦ Leave the apology out of it ✦";
  });

  const heroCopy = document.querySelector(".hero-copy");
  if (heroCopy) {
    heroCopy.innerHTML = `
      <p class="eyebrow">✦ A spontaneous edit · September 17, 2026</p>
      <h1 class="hero-title" id="hero-title">I wanted<br><span class="chrome">to be able to.</span></h1>
      <p class="hero-text">It hurts to need help when what I wanted was to help.</p>
      <p class="hero-text hero-text-secondary">Some days, the guilt of being sick hurts in a place I don’t know how to explain.</p>
      <div class="button-row"><a class="button" href="/posts/i-wanted-to-be-able-to.html">Read the spontaneous edit <span aria-hidden="true">→</span></a></div>
      <p class="tiny-note">when I tell you I can’t, please know how much I wanted to. ♡</p>
    `;
  }

  const featuredSection = document.querySelector('[aria-labelledby="featured-heading"]');
  if (featuredSection) {
    const featuredHeadingCopy = featuredSection.querySelector(".section-heading > p");
    if (featuredHeadingCopy) {
      featuredHeadingCopy.textContent = "For anyone carrying guilt over what their body won’t let them do.";
    }

    const featuredCard = featuredSection.querySelector(".featured-card");
    if (featuredCard) {
      featuredCard.innerHTML = `
        <div aria-label="Moon on a blue and lavender background" class="featured-art art-chronic" role="img"></div>
        <div class="featured-copy">
          <span class="category-tag">Chronic illness and real life</span>
          <h3>I Wanted to Be Able To</h3>
          <p>It hurts to need help when what I wanted was to help.</p>
          <div class="post-meta">September 17, 2026 · 5 min read</div>
          <a class="button lime" href="/posts/i-wanted-to-be-able-to.html">Read the story <span aria-hidden="true">→</span></a>
        </div>
      `;
    }
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {
      // The site still works normally if offline support cannot start.
    });
  });
}
