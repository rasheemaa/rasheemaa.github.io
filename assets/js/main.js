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
