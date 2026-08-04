// generic-wp.js
// A fallback for blogs that don't have a working RSS/Atom feed.
//
// Rather than hardcoding CSS classes (which break the moment a theme
// changes), this works off a structural heuristic: on most WordPress
// sites, post permalinks look like /YYYY/MM/some-slug/. We scan the page
// for every link matching that pattern, treat each unique URL as one
// post, and pull the title (longest link text pointing at that URL) and
// a thumbnail (first <img> inside any link pointing at that URL).
//
// This is intentionally a blunt instrument. It won't get you excerpts
// reliably, and if a site's permalinks don't follow /YYYY/MM/slug/, it
// won't find anything. If it doesn't work for a particular site, you'll
// need a small site-specific scraper instead — this file is a reasonable
// starting point to copy and adapt.

const cheerio = require("cheerio");

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-GB,en;q=0.9",
};

function absolutize(href, base) {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

async function scrapeWordPressArchive(feedConfig) {
  const { url, name } = feedConfig;

  const res = await fetch(url, { headers: BROWSER_HEADERS });
  if (!res.ok) {
    throw new Error(`Status code ${res.status}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);
  const base = new URL(url).origin;

  // /YYYY/MM/slug/ — WordPress' default permalink structure.
  const postUrlPattern = /^\/\d{4}\/\d{2}\/[^/]+\/?$/;

  // Group every matching <a> by its resolved URL, since a post usually
  // has two links pointing at it: one wrapping the thumbnail, one
  // wrapping the title text.
  const postsByHref = new Map();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const abs = absolutize(href, base);
    if (!abs) return;
    let pathname;
    try {
      pathname = new URL(abs).pathname;
    } catch {
      return;
    }
    if (!postUrlPattern.test(pathname)) return;
    if (!postsByHref.has(abs)) postsByHref.set(abs, []);
    postsByHref.get(abs).push(el);
  });

  const items = [];
  for (const [href, anchors] of postsByHref) {
    let title = "";
    let image = null;

    for (const el of anchors) {
      const $el = $(el);
      const text = $el.text().replace(/\s+/g, " ").trim();
      if (text.length > title.length) title = text;

      if (!image) {
        const img = $el.find("img").first();
        if (img.length) {
          const src = img.attr("src") || img.attr("data-src") || img.attr("data-lazy-src");
          if (src) image = absolutize(src, base);
        }
      }
    }

    // Skip pure-thumbnail links with no title text anywhere.
    if (!title || title.length < 4) continue;

    // Best-effort date: look for a "Month DD, YYYY" string in the
    // nearest block-level ancestor of any matching link.
    let date = null;
    for (const el of anchors) {
      const container = $(el).closest("article, li, div");
      const text = container.text();
      const match = text.match(/([A-Z][a-z]+ \d{1,2},\s*\d{4})/);
      if (match) {
        date = match[1];
        break;
      }
    }

    items.push({
      source: name || new URL(url).hostname,
      sourceUrl: base,
      title,
      link: href,
      date: date ? new Date(date).toISOString() : null,
      timestamp: date ? new Date(date).getTime() : 0,
      // Excerpts aren't reliably extractable from generic markup —
      // left blank. The card UI handles a missing excerpt gracefully.
      excerpt: "",
      image,
    });
  }

  // Preserve page order (usually newest-first on an archive page) and
  // cap it — the caller trims further to MAX_ITEMS_PER_FEED anyway.
  return items.slice(0, 30);
}

module.exports = { scrapeWordPressArchive };
