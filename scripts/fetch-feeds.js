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

async function fetchOneFeed(feedConfig) {
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

  const results = await Promise.all(feeds.map(fetchOneFeed));
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
