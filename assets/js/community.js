(() => {
  const tabButtons = [...document.querySelectorAll("[data-community-tab]")];
  const panels = [...document.querySelectorAll("[data-community-panel]")];
  if (!tabButtons.length || !panels.length) return;

  const validTabs = new Set(panels.map((panel) => panel.dataset.communityPanel));

  const activate = (name, updateHash = true) => {
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
    window.scrollTo({ top: document.querySelector(".community-layout").offsetTop - 86, behavior: "smooth" });
  };

  tabButtons.forEach((button) => button.addEventListener("click", () => activate(button.dataset.communityTab)));

  document.querySelectorAll("[data-jump-tab]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      activate(link.dataset.jumpTab);
    });
  });

  const initial = location.hash.replace("#", "");
  if (initial && initial !== "community") activate(initial, false);
})();