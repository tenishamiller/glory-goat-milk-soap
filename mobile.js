(function () {
  if (!window.matchMedia("(max-width: 768px)").matches) return;

  const nav = document.querySelector(".mobile-bottom-nav");
  if (!nav) return;

  const links = nav.querySelectorAll("a[data-m-nav]");
  const path = window.location.pathname;
  const hash = window.location.hash;

  function setActive(key) {
    links.forEach((link) => {
      link.classList.toggle("is-active", link.dataset.mNav === key);
    });
  }

  if (path.includes("/products/")) {
    setActive("shop");
    return;
  }

  if (path.includes("ops.html")) {
    setActive("admin");
    return;
  }

  const sectionMap = {
    "#about": "about",
    "#shop": "shop",
    "#why": "why",
    "#contact": "contact",
  };

  function updateFromHash() {
    if (sectionMap[hash]) {
      setActive(sectionMap[hash]);
      return;
    }
    setActive("home");
  }

  updateFromHash();
  window.addEventListener("hashchange", updateFromHash);

  if ("IntersectionObserver" in window && (path === "/" || path.endsWith("index.html"))) {
    const sections = [
      { id: "why", key: "why" },
      { id: "shop", key: "shop" },
      { id: "about", key: "about" },
      { id: "contact", key: "contact" },
    ];

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.dataset.mSection);
      },
      { rootMargin: "-30% 0px -45% 0px", threshold: [0.15, 0.4] },
    );

    sections.forEach(({ id, key }) => {
      const el = document.getElementById(id);
      if (el) {
        el.dataset.mSection = key;
        observer.observe(el);
      }
    });
  }
})();
