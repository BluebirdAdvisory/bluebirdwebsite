# Hosting on AWS Lightsail (Sydney)

The website runs on a small Ubuntu server (a VPS) in AWS Lightsail's Sydney region.

```
merge to main ──▶ GitHub Actions ──▶ builds the site ──▶ uploads it to the Lightsail server ──▶ live
                 (.github/workflows/deploy.yml)          (nginx, HTTPS by Let's Encrypt)
```

- **Publishing** is unchanged: anything merged or pushed to `main` goes live in about two
  minutes. You can watch each deploy under the repo's
  **Actions** tab.
- **Redirects** stay in `redirects.json`. They are converted to server rules on every deploy,
  so there is nothing to paste anywhere.
- **Safety**: each deploy is uploaded to its own folder and only switched live once complete.
  If the server rejects the new redirects, the live site stays as it was and the deploy shows
  as failed in **Actions**. The last five versions are kept on the server.
- **Security**: firewall (SSH, HTTP, HTTPS only), automatic security updates, key-only SSH
  logins, HTTPS certificates that renew themselves. GitHub can only upload files and reload
  the web server; it cannot run anything else as an administrator.

What you lose compared with Amplify: pull requests no longer get their own preview link.
Preview changes locally with `npm start` instead.

## One-time setup (about 45 minutes)

You need: the AWS console, GitHub, access to the domain's DNS, and the Terminal on your Mac.

### 1. Create the server

[Lightsail console](https://lightsail.aws.amazon.com/) → **Create instance**.

1. Region: **Sydney (ap-southeast-2)**.
2. Platform **Linux/Unix**, blueprint **OS Only → Ubuntu 24.04 LTS**.
3. Plan: **US$5/month (1 GB memory)** is plenty for this site. Choose a dual-stack
   (IPv4 and IPv6) plan.
4. Name it `bluebird-website` and **Create instance**.
5. **Networking** tab → **Attach static IP** → create and attach one. (Free while attached.)
   Note the IP address.
6. Still on **Networking**, under **IPv4 Firewall** and again under **IPv6 Firewall**, add a
   rule for **HTTPS**. SSH and HTTP are there already.
7. **Snapshots** tab → turn on **Automatic snapshots** (about US$0.05/GB a month) so the
   whole server can be restored if needed.

### 2. Point a test address at it

In your DNS provider, add an **A record** `new.bluebirdadvisory.com.au` → the static IP.
(Test here first; the real domain moves over in step 6.) Wait a few minutes, then check:

```bash
dig +short new.bluebirdadvisory.com.au
```

### 3. Make the deploy key

On your Mac, in Terminal:

```bash
ssh-keygen -t ed25519 -N "" -C github-actions -f ~/bluebird-deploy
```

This makes `~/bluebird-deploy` (private, goes into GitHub in step 5) and
`~/bluebird-deploy.pub` (public, goes onto the server in step 4).

### 4. Set up the server

In Lightsail, open the instance and click **Connect using SSH**. In the browser terminal:

```bash
curl -fsSLO https://raw.githubusercontent.com/alexia2727/bluebird-website/main/deploy/setup-server.sh
```

The repo is private, so if that fails, open `deploy/setup-server.sh` in GitHub, click **Raw**,
copy everything, and in the server terminal run `nano setup-server.sh`, paste, then
**Ctrl+O, Enter, Ctrl+X**.

Then run it, pasting the contents of `~/bluebird-deploy.pub` from your Mac
(`cat ~/bluebird-deploy.pub`) as `DEPLOY_KEY`:

```bash
sudo DOMAIN=new.bluebirdadvisory.com.au WITH_WWW=0 \
  EMAIL=contact@bluebirdadvisory.com.au \
  DEPLOY_KEY="ssh-ed25519 AAAA...paste... github-actions" \
  bash setup-server.sh
```

It takes about five minutes. By running it you accept the
[Let's Encrypt terms](https://letsencrypt.org/repository/) for the free certificate. At the
end it prints two lines starting with your domain and IP; copy both.

### 5. Add the GitHub secrets

GitHub → the `bluebird-website` repo → **Settings → Secrets and variables → Actions →
New repository secret**. Add three:

| Name | Value |
| --- | --- |
| `VPS_HOST` | the static IP from step 1 |
| `VPS_KNOWN_HOSTS` | the two lines the setup script printed at the end |
| `VPS_SSH_KEY` | everything in `~/bluebird-deploy` on your Mac (`cat ~/bluebird-deploy`), including the `-----BEGIN` and `-----END` lines |

Then delete the private key from your Mac: it now lives only in GitHub.

```bash
rm ~/bluebird-deploy
```

Go to **Actions → Deploy to VPS → Run workflow**. When it goes green, open
`https://new.bluebirdadvisory.com.au` and check the site, a few pages, and an old link such
as `/careers` (should land on Join our team).

### 6. Move the real domain over

1. In DNS, set the **A records** for `bluebirdadvisory.com.au` and `www.bluebirdadvisory.com.au`
   to the static IP. Remove any old A, AAAA or CNAME records for those two names that point
   elsewhere (the old WordPress host, or Amplify). Keep the MX and TXT records: they are your
   email.
2. Once `dig +short bluebirdadvisory.com.au` shows the static IP, run the setup again for the
   real domain:

   ```bash
   sudo DOMAIN=bluebirdadvisory.com.au EMAIL=contact@bluebirdadvisory.com.au \
     DEPLOY_KEY="ssh-ed25519 AAAA...same key... github-actions" \
     bash setup-server.sh
   ```

3. Run the **Deploy to VPS** workflow again and check `https://bluebirdadvisory.com.au` and
   `https://www.bluebirdadvisory.com.au` (should redirect to the first).
4. Remove the `new.` DNS record, cancel the WordPress hosting, and delete the Amplify app if
   you created one.

## Everyday tasks

**Roll back a bad change.** Revert the pull request in GitHub (its page has a **Revert**
button) and merge the revert. The site redeploys without the change.

**See why a deploy failed.** GitHub → **Actions** → the red run → the step with the red cross.

**Server updates.** Security updates install automatically. Every few months, log in
(**Connect using SSH**) and run `sudo apt update && sudo apt upgrade -y`, then
`sudo reboot` if it says a restart is required. Ubuntu 24.04 is supported until 2029.

**Certificates** renew automatically about a month before they expire. Let's Encrypt emails
the address you gave if renewal ever fails.

## Costs

About **US$5 a month** for the server (roughly A$8), plus about US$1 a month for automatic
snapshots. The static IP is free while attached, and GitHub Actions minutes for a private repo
are free up to 2,000 a month (each deploy uses about two).
