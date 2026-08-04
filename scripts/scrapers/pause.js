// pause.js
// PAUSE (pausemag.co.uk) doesn't have a working RSS feed, so we scrape
// instead, using the generic WordPress archive heuristic.
//
// Note: their /all-posts-blogs/ archive page appears to be broken on
// PAUSE's end — it serves stale content from 2022 and intermittently
// 500s, likely a buggy page template. The homepage is reliable and
// lists ~20 current posts across categories, so we use that instead.
const { scrapeWordPressArchive } = require("./generic-wp");

async function scrape() {
  return scrapeWordPressArchive({
    name: "PAUSE",
    url: "https://pausemag.co.uk/",
  });
}

module.exports = { scrape };
