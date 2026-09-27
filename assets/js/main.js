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

// Shop The Edit welcome popup. Shows once per browser session across the main site.
(() => {
  const shopUrl = "https://sheema-edit-space.base44.app";
  const sessionKey = "sheemaEditShopPopupSeen";
  let alreadySeen = false;

  try {
    alreadySeen = window.sessionStorage.getItem(sessionKey) === "1";
  } catch (error) {
    // If browser storage is unavailable, the popup can still work normally.
  }

  if (alreadySeen) return;

  const popupStyles = document.createElement("style");
  popupStyles.textContent = `
    .shop-popup-backdrop {
      position: fixed;
      inset: 0;
      z-index: 99999;
      display: grid;
      place-items: center;
      padding: 18px;
      background: rgba(31, 20, 34, .72);
      backdrop-filter: blur(7px);
      -webkit-backdrop-filter: blur(7px);
      opacity: 0;
      visibility: hidden;
      transition: opacity .22s ease, visibility .22s ease;
    }
    .shop-popup-backdrop[data-open="true"] {
      opacity: 1;
      visibility: visible;
    }
    .shop-popup {
      position: relative;
      width: min(92vw, 760px);
      max-height: min(88vh, 760px);
      overflow: auto;
      color: #30262f;
      background:
        linear-gradient(rgba(115, 86, 120, .08) 1px, transparent 1px),
        #fffaf5;
      background-size: 100% 28px;
      border: 2px solid #36233f;
      border-radius: 26px;
      box-shadow: 12px 12px 0 #d9c4f0, 0 28px 80px rgba(0,0,0,.3);
      transform: translateY(16px) scale(.98);
      transition: transform .22s ease;
    }
    .shop-popup-backdrop[data-open="true"] .shop-popup {
      transform: translateY(0) scale(1);
    }
    .shop-popup-close {
      position: absolute;
      top: 12px;
      right: 12px;
      z-index: 2;
      width: 44px;
      height: 44px;
      display: grid;
      place-items: center;
      border: 2px solid #36233f;
      border-radius: 50%;
      background: #fff;
      color: #36233f;
      font: 900 24px/1 Arial, sans-serif;
      cursor: pointer;
      box-shadow: 4px 4px 0 #36233f;
    }
    .shop-popup-close:hover,
    .shop-popup-close:focus-visible {
      transform: translate(2px, 2px);
      box-shadow: 2px 2px 0 #36233f;
      outline: none;
    }
    .shop-popup-art {
      display: block;
      width: 100%;
      aspect-ratio: 1512 / 710;
      object-fit: cover;
      border-radius: 24px 24px 0 0;
      border-bottom: 2px solid #36233f;
      background: #eaddea;
    }
    .shop-popup-copy {
      padding: clamp(24px, 5vw, 44px);
      text-align: center;
    }
    .shop-popup-kicker {
      margin: 0 0 10px;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: .14em;
      text-transform: uppercase;
      color: #76566f;
    }
    .shop-popup h2 {
      margin: 0;
      font-family: Georgia, 'Times New Roman', serif;
      font-size: clamp(34px, 7vw, 62px);
      line-height: .98;
      letter-spacing: -.035em;
    }
    .shop-popup-copy > p:not(.shop-popup-kicker):not(.shop-popup-note) {
      max-width: 580px;
      margin: 18px auto;
      font-size: clamp(15px, 2.6vw, 18px);
      line-height: 1.65;
    }
    .shop-popup-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 54px;
      padding: 14px 22px;
      border: 2px solid #36233f;
      border-radius: 14px;
      background: #ff4fa3;
      color: #fff;
      font-weight: 900;
      text-decoration: none;
      box-shadow: 6px 6px 0 #36233f;
    }
    .shop-popup-button:hover,
    .shop-popup-button:focus-visible {
      transform: translate(2px, 2px);
      box-shadow: 4px 4px 0 #36233f;
      outline: none;
    }
    .shop-popup-note {
      margin: 16px 0 0;
      font-size: 12px;
      color: #77697a;
    }
    body.shop-popup-lock {
      overflow: hidden;
    }
    @media (max-width: 560px) {
      .shop-popup-backdrop { padding: 12px; }
      .shop-popup { width: 100%; border-radius: 20px; }
      .shop-popup-art { border-radius: 18px 18px 0 0; }
      .shop-popup-copy { padding: 24px 18px 28px; }
      .shop-popup h2 { font-size: clamp(34px, 11vw, 50px); }
      .shop-popup-button { width: 100%; }
    }
    @media (prefers-reduced-motion: reduce) {
      .shop-popup-backdrop,
      .shop-popup { transition: none; }
    }
  `;
  document.head.appendChild(popupStyles);

  const backdrop = document.createElement("div");
  backdrop.className = "shop-popup-backdrop";
  backdrop.dataset.open = "false";
  backdrop.innerHTML = `
    <section class="shop-popup" role="dialog" aria-modal="true" aria-labelledby="shop-popup-title" aria-describedby="shop-popup-description">
      <button class="shop-popup-close" type="button" aria-label="Close shop announcement">×</button>
      <img class="shop-popup-art" src="/assets/images/soft-reset-collection.png" alt="The Sheema Edit Soft Reset Collection with reflection journal and gentle planner previews">
      <div class="shop-popup-copy">
        <p class="shop-popup-kicker">💿 A little shop tucked inside the diary</p>
        <h2 id="shop-popup-title">The Edit has a shop now ♡</h2>
        <p id="shop-popup-description">Gentle digital tools for reflecting, resetting, planning, and being a real person without turning your life into a productivity contest.</p>
        <a class="shop-popup-button" href="${shopUrl}">Shop The Edit ✨</a>
        <p class="shop-popup-note">The blog is still free. The shop is just here if you want a little more.</p>
      </div>
    </section>
  `;
  document.body.appendChild(backdrop);

  const closeButton = backdrop.querySelector(".shop-popup-close");
  const shopButton = backdrop.querySelector(".shop-popup-button");
  const popup = backdrop.querySelector(".shop-popup");
  const previouslyFocused = document.activeElement;

  const markSeen = () => {
    try {
      window.sessionStorage.setItem(sessionKey, "1");
    } catch (error) {
      // No-op when storage is unavailable.
    }
  };

  const trackPopupEvent = (eventName) => {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: eventName, shop_destination: shopUrl });
  };

  const closePopup = (reason = "close_button") => {
    markSeen();
    trackPopupEvent("shop_popup_close");
    backdrop.dataset.open = "false";
    document.body.classList.remove("shop-popup-lock");
    window.setTimeout(() => {
      backdrop.remove();
      popupStyles.remove();
    }, 230);
    if (previouslyFocused && typeof previouslyFocused.focus === "function") {
      previouslyFocused.focus();
    }
  };

  closeButton.addEventListener("click", () => closePopup("close_button"));

  shopButton.addEventListener("click", () => {
    markSeen();
    trackPopupEvent("shop_popup_click");
  });

  document.addEventListener("keydown", (event) => {
    if (backdrop.dataset.open !== "true") return;

    if (event.key === "Escape") {
      event.preventDefault();
      closePopup("escape_key");
      return;
    }

    if (event.key === "Tab") {
      const focusable = Array.from(
        popup.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  window.setTimeout(() => {
    backdrop.dataset.open = "true";
    document.body.classList.add("shop-popup-lock");
    closeButton.focus();
    trackPopupEvent("shop_popup_view");
  }, 450);
})();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {
      // The site still works normally if offline support cannot start.
    });
  });
}
