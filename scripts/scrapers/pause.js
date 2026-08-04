// pause.js
// PAUSE (pausemag.co.uk) doesn't have a working RSS feed, so we scrape
// their "Latest News" archive page instead, using the generic WordPress
// archive heuristic.
const { scrapeWordPressArchive } = require("./generic-wp");

async function scrape() {
  return scrapeWordPressArchive({
    name: "PAUSE",
    url: "https://pausemag.co.uk/all-posts-blogs/",
  });
}

module.exports = { scrape };
