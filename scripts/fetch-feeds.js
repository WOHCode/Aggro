// fetch-feeds.js
// Reads feeds.json, pulls the latest posts from each feed, merges + sorts
// them by date, and writes the result to data/feed.json.
//
// Run manually with:  node scripts/fetch-feeds.js
// This is also what the GitHub Actions workflow runs on a schedule.

const fs = require("fs");
const path = require("path");
const Parser = require("rss-parser");

const parser = new Parser({
  timeout: 15000,
  headers: { "User-Agent": "blogscroll-feed-reader/1.0" },
});

const ROOT = path.join(__dirname, "..");
const FEEDS_CONFIG = path.join(ROOT, "feeds.json");
const OUTPUT_FILE = path.join(ROOT, "data", "feed.json");

// Only keep the N most recent posts per feed, so one very prolific blog
// doesn't drown out the others.
const MAX_ITEMS_PER_FEED = 8;
// Total items kept in the final merged file.
const MAX_TOTAL_ITEMS = 150;

function firstImageFromHtml(html) {
  if (!html) return null;
  const match = html.match(/<img[^>]+src=["']([^"'>]+)["']/i);
  return match ? match[1] : null;
}

function extractImage(item) {
  // Try common places an image might live in an RSS/Atom item.
  if (item.enclosure && item.enclosure.url && /^image\//.test(item.enclosure.type || "")) {
    return item.enclosure.url;
  }
  if (item["media:content"] && item["media:content"]["$"] && item["media:content"]["$"].url) {
    return item["media:content"]["$"].url;
  }
  if (item.itunes && item.itunes.image) {
    return item.itunes.image;
  }
  const fromContent = firstImageFromHtml(item["content:encoded"] || item.content);
  if (fromContent) return fromContent;
  return null;
}

function excerptFromItem(item) {
  const raw = item.contentSnippet || item.summary || item.content || "";
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length <= 280) return text;
  return text.slice(0, 277).trim() + "...";
}

// Belt-and-braces timeout: rss-parser's built-in `timeout` option doesn't
// always fire reliably (e.g. a server that accepts the connection but never
// sends data). This wraps each feed fetch in a hard deadline so one bad
// feed can never hang the whole script.
function withHardTimeout(promise, ms, label) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.error(`✗ ${label}: timed out after ${ms / 1000}s, skipping`);
      resolve([]);
    }, ms);
    promise.then(
      (result) => { clearTimeout(timer); resolve(result); },
      (err) => { clearTimeout(timer); console.error(`✗ ${label}: ${err.message}`); resolve([]); }
    );
  });
}

async function fetchOneFeed(feedConfig) {
  const label = feedConfig.name || feedConfig.url;
  console.log(`… fetching ${label}`);
  try {
    const parsed = await parser.parseURL(feedConfig.url);
    const siteName = feedConfig.name || parsed.title || feedConfig.url;

    const items = (parsed.items || [])
      .slice(0, MAX_ITEMS_PER_FEED)
      .map((item) => {
        const date = item.isoDate || item.pubDate || null;
        return {
          source: siteName,
          sourceUrl: parsed.link || feedConfig.url,
          title: (item.title || "Untitled").trim(),
          link: item.link,
          date,
          timestamp: date ? new Date(date).getTime() : 0,
          excerpt: excerptFromItem(item),
          image: extractImage(item),
        };
      });

    console.log(`✓ ${siteName}: ${items.length} items`);
    return items;
  } catch (err) {
    console.error(`✗ Failed to fetch ${feedConfig.name || feedConfig.url}: ${err.message}`);
    return [];
  }
}

async function main() {
  const config = JSON.parse(fs.readFileSync(FEEDS_CONFIG, "utf8"));
  const feeds = config.feeds || [];

  if (feeds.length === 0) {
    console.error("No feeds configured in feeds.json");
    process.exit(1);
  }

  const results = await Promise.all(
    feeds.map((f) => withHardTimeout(fetchOneFeed(f), 20000, f.name || f.url))
  );
  let allItems = results.flat();

  // Sort newest first, drop items with no date to the bottom.
  allItems.sort((a, b) => b.timestamp - a.timestamp);
  allItems = allItems.slice(0, MAX_TOTAL_ITEMS);

  const output = {
    generatedAt: new Date().toISOString(),
    count: allItems.length,
    items: allItems,
  };

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\nWrote ${allItems.length} items to ${path.relative(ROOT, OUTPUT_FILE)}`);
}

// Absolute safety net: if for any reason the process is still alive
// well past when every feed should have timed out, force it to exit
// rather than hang a CI run forever.
const SAFETY_NET_MS = 90000;
const safetyTimer = setTimeout(() => {
  console.error(`\nSafety net: forcing exit after ${SAFETY_NET_MS / 1000}s`);
  process.exit(1);
}, SAFETY_NET_MS);
safetyTimer.unref?.();

main()
  .then(() => {
    clearTimeout(safetyTimer);
    // Explicitly exit: some HTTP clients leave keep-alive sockets open,
    // which can otherwise keep the Node process (and a CI job) running
    // indefinitely even after all work is done.
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
