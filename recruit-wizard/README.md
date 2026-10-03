# Recruit Wizard job ads

Job ads posted in Recruit Wizard appear on the website at `/jobs/` (listing) and
`/jobs/<title>-<id>/` (one page per job), with an **Apply now** button that opens
Recruit Wizard's own application form. Applications and candidate details never pass
through the website.

## How it works

```
Recruit Wizard ──(publish / update / expire job)──▶ AWS Lambda (this folder)
      ▲                                                 │ saves jobs/<id>.json to GitHub
      │ Apply now                                       ▼
 candidate ◀── bluebirdadvisory.com.au/jobs/ ◀── Amplify rebuilds the site (about 1 minute)
```

Recruit Wizard publishes to websites through the same web addresses as its WordPress add-on
(`/wp-json/RecruitWizard/create-job`, `/categories`, `/job-types`, `/regions`). The Lambda
answers those, so Recruit Wizard treats it like a WordPress site. Closed or expired jobs
stay online with a "This role has closed" notice, hidden from search engines, so old links
still work.

Each open job page includes Google for Jobs data, so roles can show up in Google's job search.

## One-time setup (about 20 minutes)

### 1. GitHub token

GitHub → your profile picture → **Settings → Developer settings → Personal access tokens →
Fine-grained tokens → Generate new token**.

- Repository access: **Only select repositories** → `bluebird-website`
- Permissions → Repository permissions → **Contents: Read and write** (nothing else)
- Expiration: up to one year. Put a reminder in the calendar to renew it and paste the new
  token into the Lambda (step 2).

Copy the token; you will only see it once.

### 2. Lambda function

AWS console, region **Asia Pacific (Sydney)** → **Lambda → Create function**.

1. Name `bluebird-recruit-wizard`, runtime **Node.js 22.x**, architecture **arm64**. Create.
2. **Code**: delete `index.mjs`'s contents and paste in [`index.mjs`](index.mjs) from this
   folder. Click **Deploy**.
3. **Configuration → General configuration → Edit**: timeout **15 seconds**.
4. **Configuration → Environment variables → Edit**, add:

   | Key | Value |
   | --- | --- |
   | `RW_USERNAME` | `recruitwizard` |
   | `RW_PASSWORD` | a long random password (e.g. from your password manager) |
   | `GITHUB_TOKEN` | the token from step 1 |
   | `GITHUB_REPO` | `alexia2727/bluebird-website` |
   | `GITHUB_BRANCH` | `main` |

5. **Configuration → Function URL → Create function URL**, auth type **NONE** (the function
   checks the username and password itself). Copy the URL, e.g.
   `https://abc123.lambda-url.ap-southeast-2.on.aws/`.

Check it works (should list job types; a wrong password returns `Not Authorized`):

```bash
curl -u 'recruitwizard:YOUR_PASSWORD' https://abc123.lambda-url.ap-southeast-2.on.aws/wp-json/RecruitWizard/job-types
```

### 3. Recruit Wizard

Ask Recruit Wizard support to set up your **website job board using the WordPress
(WP Job Manager) integration** with:

- Website URL: the function URL from step 2, without the trailing `/`
- Username: the `RW_USERNAME` value
- Application password: the `RW_PASSWORD` value

Then post a test job to the website from Recruit Wizard. Within a couple of minutes you
should see a "Publish job ad: …" commit in GitHub, an Amplify build, and the job at
`/jobs/`. Expire it in Recruit Wizard to check it closes.

## Changing the options

The categories, job types and regions Recruit Wizard can choose from are listed at the top
of [`index.mjs`](index.mjs) (`TERMS`). After editing, paste the file into the Lambda again
and click **Deploy**.

## Costs

The Lambda runs for a fraction of a second per job, well inside AWS's free tier. Each job
change triggers one Amplify build (under a minute, about US$0.01).

## Testing changes to the function

```bash
npm run test:recruit-wizard
```

To preview the jobs pages locally with sample jobs, put job JSON files in any folder and run
`JOBS_DIR=/path/to/folder npm start`.
