(async function () {
  const feedEl = document.getElementById("feed");
  const spineEl = document.getElementById("spine");
  const emptyStateEl = document.getElementById("empty-state");
  const positionEl = document.getElementById("position-indicator");

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  function formatDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function buildCard(item, index) {
    const card = document.createElement("article");
    card.className = "card" + (item.image ? "" : " no-image");
    card.id = "card-" + index;
    card.setAttribute("data-index", index);

    if (item.image) {
      const bg = document.createElement("div");
      bg.className = "card-bg";
      bg.style.backgroundImage = `url("${item.image}")`;
      card.appendChild(bg);
    }

    const content = document.createElement("div");
    content.className = "card-content";
    content.innerHTML = `
      <div class="eyebrow"><span class="dot"></span>${escapeHtml(item.source)}</div>
      <h2 class="card-title">${escapeHtml(item.title)}</h2>
      <p class="card-excerpt">${escapeHtml(item.excerpt)}</p>
      <div class="card-footer">
        <span class="card-date">${formatDate(item.date)}</span>
        <a class="read-link" href="${item.link}" target="_blank" rel="noopener noreferrer">
          Read on ${escapeHtml(item.source)} →
        </a>
      </div>
    `;
    card.appendChild(content);
    return card;
  }

  function buildSpine(count) {
    spineEl.innerHTML = "";
    const usableHeight = window.innerHeight;
    const gap = usableHeight / count;
    for (let i = 0; i < count; i++) {
      const tick = document.createElement("div");
      tick.className = "tick";
      tick.id = "tick-" + i;
      tick.style.top = `${gap * i + gap / 2}px`;
      spineEl.appendChild(tick);
    }
  }

  function setActive(index, total) {
    document.querySelectorAll("#spine .tick.active").forEach((t) => t.classList.remove("active"));
    const tick = document.getElementById("tick-" + index);
    if (tick) tick.classList.add("active");
    positionEl.textContent = `${index + 1} / ${total}`;
  }

  function wireScrollTracking(total) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
            const idx = parseInt(entry.target.getAttribute("data-index"), 10);
            setActive(idx, total);
          }
        });
      },
      { root: feedEl, threshold: [0.6] }
    );
    document.querySelectorAll(".card").forEach((c) => observer.observe(c));
  }

  try {
    const res = await fetch("data/feed.json", { cache: "no-store" });
    if (!res.ok) throw new Error("feed.json not found");
    const data = await res.json();
    const items = data.items || [];

    if (items.length === 0) {
      emptyStateEl.hidden = false;
      spineEl.hidden = true;
      document.getElementById("topbar").hidden = true;
      return;
    }

    items.forEach((item, i) => feedEl.appendChild(buildCard(item, i)));
    buildSpine(items.length);
    setActive(0, items.length);
    wireScrollTracking(items.length);
    window.addEventListener("resize", () => buildSpine(items.length));
    feedEl.focus();
  } catch (err) {
    console.error(err);
    emptyStateEl.hidden = false;
    spineEl.hidden = true;
    document.getElementById("topbar").hidden = true;
  }
})();
