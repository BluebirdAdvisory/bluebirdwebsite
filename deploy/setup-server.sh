#!/usr/bin/env bash
# One-time setup for the Bluebird website on a fresh Ubuntu 24.04 VPS. Safe to run again
# (for example to add the real domain after testing on a subdomain). See deploy/README.md.
#
# Run as root on the server:
#   DOMAIN=bluebirdadvisory.com.au \
#   EMAIL=contact@bluebirdadvisory.com.au \
#   DEPLOY_KEY="ssh-ed25519 AAAA... github-actions" \
#   bash setup-server.sh
#
# DOMAIN      the site's domain; its DNS must already point at this server
# EMAIL       where Let's Encrypt sends certificate expiry warnings
# DEPLOY_KEY  public half of the SSH key GitHub Actions uses to upload the site
# WITH_WWW    1 (default) also serves www.DOMAIN, redirecting to DOMAIN; use 0 for a test subdomain
set -euo pipefail

: "${DOMAIN:?Set DOMAIN}" "${EMAIL:?Set EMAIL}" "${DEPLOY_KEY:?Set DEPLOY_KEY}"
WITH_WWW="${WITH_WWW:-1}"
[[ $EUID -eq 0 ]] || { echo "Run this as root (sudo -i)"; exit 1; }
[[ $DOMAIN =~ ^[a-z0-9.-]+$ ]] || { echo "DOMAIN looks wrong: $DOMAIN"; exit 1; }
[[ $DEPLOY_KEY =~ ^ssh-(ed25519|rsa)\  ]] || { echo "DEPLOY_KEY should start with ssh-ed25519"; exit 1; }

BASE=/var/www/bluebird
NAMES="$DOMAIN"; [[ $WITH_WWW == 1 ]] && NAMES="$DOMAIN www.$DOMAIN"

echo "==> Updating the system and installing nginx, certbot, firewall"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get -y -q upgrade
apt-get -y -q install nginx certbot ufw unattended-upgrades fail2ban rsync

echo "==> Automatic security updates"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

echo "==> Firewall: SSH, HTTP and HTTPS only"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null

echo "==> Deploy account (used only by GitHub Actions)"
id deploy &>/dev/null || adduser --disabled-password --gecos "" deploy >/dev/null
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
printf '%s\n' "$DEPLOY_KEY" > /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
# The deploy account may check and reload nginx, and nothing else as root.
cat > /etc/sudoers.d/bluebird-deploy <<'EOF'
deploy ALL=(root) NOPASSWD: /usr/sbin/nginx -t, /usr/bin/systemctl reload nginx
EOF
chmod 440 /etc/sudoers.d/bluebird-deploy
visudo -cf /etc/sudoers.d/bluebird-deploy >/dev/null

echo "==> Site folders"
install -d -o deploy -g deploy "$BASE" "$BASE/releases"
if [[ ! -e $BASE/current ]]; then
  # A placeholder until the first deploy from GitHub.
  install -d -o deploy -g deploy "$BASE/releases/initial/site"
  echo '<!doctype html><title>Bluebird Advisory</title><p>Coming soon.</p>' > "$BASE/releases/initial/site/index.html"
  cp "$BASE/releases/initial/site/index.html" "$BASE/releases/initial/site/404.html"
  echo "# no redirects yet" > "$BASE/releases/initial/redirects.conf"
  chown -R deploy:deploy "$BASE/releases/initial"
  ln -sfn releases/initial "$BASE/current"
  chown -h deploy:deploy "$BASE/current"
fi
install -d /var/www/letsencrypt

echo "==> HTTPS certificate"
SITE=/etc/nginx/sites-available/bluebird
need_cert() {
  local pem=/etc/letsencrypt/live/$DOMAIN/fullchain.pem
  [[ ! -e $pem ]] && return 0
  [[ $WITH_WWW == 1 ]] && ! openssl x509 -in "$pem" -noout -text | grep -q "DNS:www.$DOMAIN" && return 0
  return 1
}
if need_cert; then
  # Plain HTTP first, so Let's Encrypt can check we control the domain.
  cat > "$SITE" <<EOF
server {
  listen 80; listen [::]:80;
  server_name $NAMES;
  location ^~ /.well-known/acme-challenge/ { root /var/www/letsencrypt; }
  location / { return 404; }
}
EOF
  ln -sfn "$SITE" /etc/nginx/sites-enabled/bluebird
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx
  DOMAIN_ARGS=(-d "$DOMAIN"); [[ $WITH_WWW == 1 ]] && DOMAIN_ARGS+=(-d "www.$DOMAIN")
  certbot certonly --webroot -w /var/www/letsencrypt "${DOMAIN_ARGS[@]}" --cert-name "$DOMAIN" \
    --non-interactive --agree-tos -m "$EMAIL" --expand \
    --deploy-hook "systemctl reload nginx"
fi

echo "==> nginx site"
CERT="ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_session_cache shared:bluebird:10m;"
{
  cat <<EOF
# Managed by deploy/setup-server.sh. Re-run that script rather than editing here.
server {
  listen 80; listen [::]:80;
  server_name $NAMES;
  location ^~ /.well-known/acme-challenge/ { root /var/www/letsencrypt; }
  location / { return 301 https://$DOMAIN\$request_uri; }
}
EOF
  if [[ $WITH_WWW == 1 ]]; then
    cat <<EOF
server {
  listen 443 ssl http2; listen [::]:443 ssl http2;
  server_name www.$DOMAIN;
  $CERT
  return 301 https://$DOMAIN\$request_uri;
}
EOF
  fi
  cat <<EOF
server {
  listen 443 ssl http2; listen [::]:443 ssl http2;
  server_name $DOMAIN;
  $CERT

  root $BASE/current/site;
  index index.html;
  absolute_redirect off;
  server_tokens off;
  charset utf-8;

  add_header Strict-Transport-Security "max-age=31536000" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;

  gzip on;
  gzip_types text/css application/javascript application/json application/xml image/svg+xml;

  # Generated from redirects.json on every deploy.
  include $BASE/current/redirects.conf;

  location / { try_files \$uri \$uri/ =404; }
  location /assets/ { expires 7d; }
  location /uploads/ { expires 30d; }

  error_page 404 /404.html;
}
EOF
} > "$SITE"
ln -sfn "$SITE" /etc/nginx/sites-enabled/bluebird
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "==> SSH: key-only logins"
admin_has_key() {
  [[ -s /root/.ssh/authorized_keys ]] && return 0
  local f
  for f in /home/*/.ssh/authorized_keys; do
    [[ -s $f && $f != /home/deploy/* ]] && return 0
  done
  return 1
}
if admin_has_key; then
  printf 'PasswordAuthentication no\nPermitRootLogin prohibit-password\n' > /etc/ssh/sshd_config.d/10-bluebird.conf
  systemctl reload ssh
else
  echo "   Skipped: no SSH key found for root or an admin user, so password login stays on."
  echo "   Add your SSH key, then run this script again to turn password login off."
fi

echo
echo "Done. Next: add the GitHub secrets in deploy/README.md and run the Deploy workflow."
echo "Paste these two lines into the VPS_KNOWN_HOSTS secret:"
HOSTKEY=$(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)
echo "$DOMAIN $HOSTKEY"
echo "$(hostname -I | awk '{print $1}') $HOSTKEY"
