# Stacks — a personal blog feed

A tiny static site that pulls the latest posts from a list of blogs/RSS feeds
and shows them in a full-screen, vertical snap-scroll feed (Instagram-style).
No backend — GitHub Actions refreshes the data on a schedule, and the site
itself is just HTML/CSS/JS.

## How it works

```
feeds.json           ← you list your blogs here
scripts/fetch-feeds.js  ← fetches + merges them into data/feed.json
data/feed.json        ← the merged, sorted result (auto-generated)
index.html / style.css / app.js  ← the reader UI, reads data/feed.json
.github/workflows/update-feed.yml ← runs the fetch script on a schedule
```

## 1. Add your blogs

Edit `feeds.json`:

```json
{
  "feeds": [
    { "name": "Some Blog", "url": "https://example.com/feed/" },
    { "name": "Another One", "url": "https://example.org/atom.xml" }
  ]
}
```

Most blogs publish an RSS or Atom feed even if it's not linked anywhere
obvious — try `/feed`, `/rss`, `/atom.xml`, or `/feed.xml` after the site's
root URL, or search "[blog name] rss feed."

## 2. Try it locally (optional)

```bash
npm install
node scripts/fetch-feeds.js   # writes data/feed.json
```

Then open `index.html` in a browser. (If your browser blocks `fetch()` on
local files, run a quick local server instead: `npx serve .`)

## 3. Deploy

### Option A — GitHub Pages (recommended, fully automatic)

1. Push this folder to a new GitHub repo.
2. In the repo, go to **Settings → Pages** and set the source to
   **GitHub Actions**.
3. That's it. The included workflow (`update-feed.yml`) will:
   - run every 4 hours on a schedule (edit the `cron` line to change this),
   - re-fetch all your feeds,
   - commit the updated `data/feed.json`,
   - and deploy the whole site to GitHub Pages.
4. You can also trigger it manually any time from the **Actions** tab
   ("Run workflow").

### Option B — Neocities

Neocities doesn't run scheduled jobs itself, so the simplest setup is to
keep GitHub Actions as the "server" that refreshes the data, and have it
push the built files to Neocities instead of (or in addition to) GitHub
Pages:

1. Get a Neocities API key from your site's **Settings → API Key** page.
2. In your GitHub repo, add it as a secret named `NEOCITIES_API_KEY`
   (**Settings → Secrets and variables → Actions**).
3. In `.github/workflows/update-feed.yml`, uncomment the "Deploy to
   Neocities" step at the bottom of the file.
4. Push. From then on, every scheduled run also uploads `index.html`,
   `style.css`, `app.js`, and `data/feed.json` to your Neocities site.

You can use Neocities *instead of* GitHub Pages by deleting the "GitHub
Pages deploy" steps from the workflow, or use both at once.

## Customizing

- **How many posts per feed / total**: adjust `MAX_ITEMS_PER_FEED` and
  `MAX_TOTAL_ITEMS` in `scripts/fetch-feeds.js`.
- **How often it refreshes**: edit the `cron` schedule in
  `.github/workflows/update-feed.yml` (it's currently every 4 hours).
- **Look and feel**: all styling lives in `style.css` — colors, fonts, and
  spacing are set as CSS variables at the top of the file.
