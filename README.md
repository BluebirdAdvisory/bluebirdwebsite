# Bluebird Advisory website

Static rebuild of bluebirdadvisory.com.au, migrated from WordPress/Elementor on
1 October 2026. Content is Markdown and JSON; the site builds to plain HTML with
[Eleventy](https://www.11ty.dev/) and is hosted on an AWS Lightsail server in Sydney.

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

The site is hosted on an AWS Lightsail server in Sydney. Merging to `main` publishes it:
GitHub Actions builds the site and uploads it, usually within two minutes. Redirects in
`redirects.json` are applied automatically. Setup, everyday tasks and costs (about
US$5 a month): [`deploy/README.md`](deploy/README.md).

## Job ads from Recruit Wizard

Jobs published in Recruit Wizard appear at `/jobs/` through Recruit Wizard's jobs widget,
which loads them live in the visitor's browser. Widget settings (colours, filters, button
text) are in `src/pages/jobs.njk`; the jobs themselves are managed in Recruit Wizard.

## Contact form

The WordPress site used WPForms. This version uses `mailto:` links to
contact@bluebirdadvisory.com.au, which costs nothing and has nothing to maintain. If you
want an on-page form later, ask Claude to add one backed by a small AWS Lambda +
Amazon SES function (cents per month) or a hosted form service.
