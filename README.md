# Bluebird Advisory website

Static rebuild of bluebirdadvisory.com.au, migrated from WordPress/Elementor on
1 October 2026. Content is Markdown and JSON; the site builds to plain HTML with
[Eleventy](https://www.11ty.dev/) and is hosted on AWS Amplify in Sydney.

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

## One-time setup on AWS (about 30 minutes)

1. **GitHub.** Create a private repository (e.g. `bluebird-advisory/website`) and push
   this folder to it. Run `npm run fetch-media` first and commit `src/uploads/`.
2. **Amplify.** In the AWS console, switch region to **Asia Pacific (Sydney)
   ap-southeast-2**, open **AWS Amplify → Create new app → GitHub**, choose the repo
   and the `main` branch. Amplify reads `amplify.yml` automatically. Turn on
   **Branch previews** so pull requests get their own preview URL.
3. **Redirects.** In the app, go to **Hosting → Rewrites and redirects → Manage
   redirects → Open text editor** and paste the contents of `redirects.json`. This keeps
   old WordPress links (including `/wp-content/uploads/...` image links) working.
4. **Domain.** **Hosting → Custom domains → Add domain** → `bluebirdadvisory.com.au`.
   If DNS is in Route 53 Amplify configures it; otherwise add the CNAME records it
   shows at your registrar. HTTPS certificates are issued and renewed automatically.
5. **Switch over.** Once the Amplify URL looks right, point the domain at it, then
   cancel the WordPress hosting, theme and Elementor Pro subscriptions.

### What it costs

Amplify Hosting charges for build minutes (about US$0.01 per minute; a build takes
under a minute), storage (US$0.023/GB/month) and data served (US$0.15/GB). For a site
this size with typical B2B traffic that is usually **a few dollars a month**, plus
US$0.50/month if the DNS zone is in Route 53. There are no licences, plugins or
servers to patch.

### If you would rather run it on a VPS

The output is just files, so any web server works. On a Lightsail/EC2 Ubuntu instance:
`npm ci && npm run build`, then serve `_site/` with nginx (`root /var/www/bluebird/_site;`,
`error_page 404 /404.html;`). You lose automatic deploys, previews and certificates,
and take on server patching, which is why Amplify is recommended.

## Contact form

The WordPress site used WPForms. This version uses `mailto:` links to
contact@bluebirdadvisory.com.au, which costs nothing and has nothing to maintain. If you
want an on-page form later, ask Claude to add one backed by a small AWS Lambda +
Amazon SES function (cents per month) or a hosted form service.
