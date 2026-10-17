# Bluebird Advisory website — instructions for Claude

This is the Bluebird Advisory marketing site. It is a static site built with Eleventy:
plain Markdown and JSON content, a few Nunjucks templates, one CSS file. There is no
database, CMS or plugin. It is hosted on Vercel, which builds it from this repository:
pushing to `main` publishes the live site, and each pull request gets a preview deployment
(see "Hosting" in `README.md`).

## Where things live

| To change… | Edit |
| --- | --- |
| Contact email, office address, LinkedIn, main menu, footer commitment links | `src/_data/site.json` (extra links at the top of the What we do menu: `extra` on that menu item) |
| Team members (photo, role, bio, LinkedIn, order on page) | `src/_data/team.json` (order in the file = order on the page) |
| Client feedback quotes | `src/_data/testimonials.json` |
| Client logos | `src/_data/clients.json` |
| Procurement panels | `src/_data/panels.json` (the `details` field is Markdown) |
| A service page (Data and Artificial Intelligence, Cyber Security, …) | `src/services/<slug>.md` — `summary`, `offerings` list, optional body. Optional `menu_label` shortens its name in the What we do menu only; don't rename `title`, case studies link to services by it |
| A case study | `src/case-studies/<slug>.md` |
| Home page copy | front matter at the top of `src/index.njk` |
| Other pages (About, Join our team, AI Leaderboard, commitments, shared services) | `src/pages/*.md` or `src/pages/*.njk` |
| Hosting and deploys | Vercel dashboard (project `bluebirdwebsite`); notes under "Hosting" in `README.md` |
| Daily rebuild (refreshes the home page news ticker) | `.github/workflows/daily-rebuild.yml`; setup under "Daily rebuild" in `README.md` |
| Look and feel | `src/assets/css/site.css` (brand tokens are at the top) |
| Images and PDFs | `src/uploads/YYYY/MM/filename` and reference as `/uploads/YYYY/MM/filename` |
| Job ads | Managed in Recruit Wizard and shown on `/jobs/` by its jobs widget. Widget settings: `src/pages/jobs.njk` |

## Common tasks

**Add a case study.** Copy an existing file in `src/case-studies/`, rename it to a
lowercase-hyphenated slug (this becomes the URL `/case-studies/<slug>/`), and set:
- `title`
- `summary` — one sentence, shown on cards
- `services` — one or more of the exact service titles. This is what makes it appear on
  that service page.
Keep the body to three sections: `## The problem`, `## What we did`, `## The outcome`.
Never name a client unless the user confirms the client has approved it.

**Add or update a team member.** Add an object to `src/_data/team.json` with `name`,
`role`, `photo`, `bio` (Markdown allowed) and `linkedin`. Save the photo, square crop,
at least 600×600, into `src/uploads/team/`.

**Add a page.** Create `src/pages/<slug>.md` with `title` and `summary` front matter.
It is published at `/<slug>/`. Add it to `nav` in `site.json` only if the user asks.

## House rules

- Australian English (organisation, prioritise, centre, licence as a noun).
- Sentence case for headings and buttons ("Meet our team", not "MEET OUR TEAM").
- Bluebird is security cleared and works with government: never publish client names,
  dollar values or staff clearance levels unless the user explicitly confirms.
- Do not edit anything in `_site/` (build output) or `node_modules/`.
- Keep URLs stable. If you rename or delete a page, add a 301 to `redirects.json` and run
  `npm run test:redirects`; only exact paths and `/folder/<*>` rules with 301/302 are
  supported. Vercel does not apply `redirects.json` yet (it needs a `vercel.json`), so also
  tell the user the redirect won't work on the live site until that is set up.
- Images: always write meaningful `alt` text; use `alt=""` only for decorative images.

## Before you finish any change

1. Run `npm run build` and confirm it completes with no errors.
2. Run `npm start`, open the changed page(s) at http://localhost:8080, and check them at
   desktop and phone widths.
3. Commit with a plain-English message ("Add NLA case study"). For anything beyond a
   typo, work on a branch and open a pull request. Vercel posts a preview link on the pull
   request; also share screenshots if the user wants to see it before then.
   Only merge to `main` when the user approves — `main` is the live site.
