// scrapers/ssense.js
//
// SSENSE doesn't publish an RSS feed for their editorial section, but the
// page itself is server-rendered HTML (not a client-only JS app), so we can
// scrape it directly. This is inherently more fragile than RSS — if SSENSE
// redesigns the page's markup, this will need updating — but it works as
// long as the structure below holds.

const cheerio = require("cheerio");

const EDITORIAL_URL = "https://www.ssense.com/en-gb/editorial";
const BASE_URL = "https://www.ssense.com";

const KNOWN_CATEGORIES = [
  "Art", "Culture", "Design", "Fashion", "Food",
  "Market", "Music", "Product Curation", "Technology", "Travel",
];

const MONTHS = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec";
// Matches: "<title> <category> <Mon D> <excerpt>"
const CARD_TEXT_RE = new RegExp(
  `^(.*?)\\s+(${KNOWN_CATEGORIES.join("|")})\\s+((?:${MONTHS})\\s+\\d{1,2})\\s+(.*)$`
);

function resolveDate(monthDayStr, yearHint) {
  // The listing page groups stories under year headers (e.g. "2026") but
  // individual cards only show "Mon D". We use the nearest preceding year
  // header as the year, falling back to the current year and correcting
  // for entries that would otherwise land in the future.
  const year = yearHint || new Date().getFullYear();
  let d = new Date(`${monthDayStr} ${year}`);
  if (isNaN(d)) return null;
  if (d.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    d = new Date(`${monthDayStr} ${year - 1}`);
  }
  return d;
}

function bestImageFromEl($, el) {
  const img = $(el).find("img").first();
  if (img.length) {
    const srcset = img.attr("srcset");
    if (srcset) {
      // Take the last (usually highest-res) candidate in the srcset list.
      const candidates = srcset.split(",").map((s) => s.trim().split(" ")[0]);
      if (candidates.length) return candidates[candidates.length - 1];
    }
    const src = img.attr("src") || img.attr("data-src");
    if (src) return src;
  }
  const source = $(el).find("source[srcset]").first();
  if (source.length) {
    const srcset = source.attr("srcset");
    if (srcset) return srcset.split(",")[0].trim().split(" ")[0];
  }
  return null;
}

async function scrape() {
  const res = await fetch(EDITORIAL_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!res.ok) {
    throw new Error(`SSENSE editorial page returned status ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const items = [];
  const seenLinks = new Set();
  let currentYear = null;

  // Walk the page in document order so we can track which "year" heading
  // (e.g. a heading whose text is just "2026") each card falls under.
  $("h1, h2, h3, h4, a[href*='/editorial/']").each((_, el) => {
    const tag = el.tagName.toLowerCase();

    if (tag !== "a") {
      const headingText = $(el).text().trim();
      if (/^\d{4}$/.test(headingText)) {
        currentYear = parseInt(headingText, 10);
      }
      return;
    }

    const href = $(el).attr("href");
    if (!href) return;

    const absoluteUrl = new URL(href, BASE_URL).toString();

    // Only keep links to individual stories: /editorial/{category}/{slug}
    // — this excludes links to category index pages like /editorial/culture
    const path = new URL(absoluteUrl).pathname;
    const segments = path.split("/").filter(Boolean);
    const editorialIndex = segments.indexOf("editorial");
    if (editorialIndex === -1 || segments.length < editorialIndex + 3) return;

    if (seenLinks.has(absoluteUrl)) return;

    const text = $(el).text().replace(/\s+/g, " ").trim();
    const match = text.match(CARD_TEXT_RE);
    if (!match) return; // doesn't look like a story card, skip it

    const [, title, category, monthDay, excerpt] = match;
    const date = resolveDate(monthDay, currentYear);

    seenLinks.add(absoluteUrl);
    items.push({
      source: "SSENSE",
      sourceUrl: EDITORIAL_URL,
      title: title.trim(),
      link: absoluteUrl,
      date: date ? date.toISOString() : null,
      timestamp: date ? date.getTime() : 0,
      excerpt: excerpt.trim(),
      image: bestImageFromEl($, el),
      category,
    });
  });

  return items;
}

module.exports = { scrape };
