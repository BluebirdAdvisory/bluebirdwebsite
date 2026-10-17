# Bluebird Advisory website

Static rebuild of bluebirdadvisory.com.au, migrated from WordPress/Elementor on
1 October 2026. Content is Markdown and JSON; the site builds to plain HTML with
[Eleventy](https://www.11ty.dev/) and is hosted on Vercel.

## Run it locally

Requires Node.js 20 or later.

```bash
npm install
npm run fetch-media   # once only, while the old WordPress site is still live
npm start             # http://localhost:8080
```

`npm run build` writes the finished site to `_site/`.

## Updating the site with Claude

Open this folder in Claude Code (desktop app, terminal or VS Code) and ask in plain
English: "Add a case study about…", "Update Ly's bio", "Change the office address".
`CLAUDE.md` tells Claude where everything lives and how to check its work. Claude
builds, previews and commits; pushing to `main` publishes.

## Hosting

The site is hosted on [Vercel](https://vercel.com/) (project `bluebirdwebsite`). Vercel is
connected to this GitHub repository and builds the site itself (`npm run build`, publishing
`_site/`):

- Merging to `main` publishes the live site, usually within a minute or two.
- Every pull request gets its own preview deployment; Vercel posts the link as a comment on
  the pull request.
- Build logs, deployments, domains and rollbacks are in the Vercel dashboard.

Redirects from old URLs are listed under `redirects` in `vercel.json` and take effect on
the next deployment. Run `npm run build` then `npm run test:redirects` after changing them.
Unknown URLs get the site's `404.html` page automatically. (`amplify.yml` is left over from
earlier hosting and isn't used by Vercel.)

## Daily rebuild

The home page news ticker and Latest news page are filled from the news API when the site is built, so
the site is rebuilt every morning by `.github/workflows/daily-rebuild.yml` (about 6 am
Canberra time). It calls a Vercel deploy hook. To set it up, or to replace the hook:

1. In Vercel, open the bluebirdwebsite project → **Settings → Git → Deploy Hooks**. Create
   a hook named `Daily rebuild` for the `main` branch and copy its URL.
2. In GitHub, open the repository → **Settings → Secrets and variables → Actions** → **New
   repository secret**. Name it `VERCEL_DEPLOY_HOOK_URL` and paste the URL.
3. To test it, open the **Actions** tab → **Daily rebuild** → **Run workflow**. A new
   production deployment should appear in Vercel within a minute.

Treat the hook URL like a password: anyone with it can trigger a deployment.

## AI news summaries

The summaries on the Latest news page (`/news/`) are written by Claude when the site builds
(`scripts/summarise-news.mjs`): each article is read from its headline link and summarised in
one or two sentences. To turn it on, add an Anthropic API key in Vercel → the bluebirdwebsite
project → **Settings → Environment Variables**, named `ANTHROPIC_API_KEY`, for Production and
Preview, then redeploy. Without the key the page uses the summaries the news API
provides.

Each article is only summarised once; the results are cached between builds. The build log
shows a `[news] AI summaries: …` line with how many were new, cached or failed. Articles that
can't be read (paywalls, broken links) keep the news API's summary.

## Job ads from Recruit Wizard

Jobs published in Recruit Wizard appear at `/jobs/` through Recruit Wizard's jobs widget,
which loads them live in the visitor's browser. Widget settings (colours, filters, button
text) are in `src/pages/jobs.njk`; the jobs themselves are managed in Recruit Wizard.

## Contact form

The WordPress site used WPForms. This version uses `mailto:` links to
contact@bluebirdadvisory.com.au, which costs nothing and has nothing to maintain. If you
want an on-page form later, ask Claude to add one backed by a small AWS Lambda +
Amazon SES function (cents per month) or a hosted form service.
