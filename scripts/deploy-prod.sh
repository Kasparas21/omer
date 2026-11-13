#!/usr/bin/env bash
# Production deploy for app.tryomer.com — MAIN TIP ONLY.
# Refuses to ship private branches or anything behind origin/main (this is what wiped UI before).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VPS_HOST="${OMER_VPS_HOST:-2.24.173.75}"
VPS_USER="${OMER_VPS_USER:-root}"
SSH_KEY="${OMER_SSH_KEY:-$HOME/.ssh/unfairweekend_vps}"
REMOTE_REL="${OMER_RELEASE_NAME:-main-$(date -u +%Y%m%d-%H%M%S)}"

die() { echo "deploy-prod: $*" >&2; exit 1; }

command -v git >/dev/null || die "git required"
command -v scp >/dev/null || die "scp required"
command -v ssh >/dev/null || die "ssh required"
[[ -f "$SSH_KEY" ]] || die "SSH key not found at $SSH_KEY (set OMER_SSH_KEY)"

git fetch origin --prune
branch="$(git rev-parse --abbrev-ref HEAD)"
[[ "$branch" == "main" ]] || die "must be on main (currently on '$branch'). Checkout main, pull, merge PRs, then retry."

git pull --ff-only origin main || die "could not fast-forward main — resolve divergence before deploying"

head="$(git rev-parse HEAD)"
remote="$(git rev-parse origin/main)"
[[ "$head" == "$remote" ]] || die "HEAD ($head) != origin/main ($remote). Pull/merge first."

if [[ -n "$(git status --porcelain)" ]]; then
  die "working tree dirty — commit or stash before deploying (uncommitted UI/backend would not ship cleanly anyway)"
fi

echo "deploy-prod: shipping origin/main @ ${head:0:12}"
archive="/tmp/omer-${head:0:12}.tgz"
git archive --format=tar.gz --prefix=omer/ HEAD -o "$archive"

scp -i "$SSH_KEY" -o StrictHostKeyChecking=no "$archive" "${VPS_USER}@${VPS_HOST}:/tmp/omer-deploy.tgz"

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_HOST}" "set -e
REL='$REMOTE_REL'
rm -rf /opt/omer/releases/\$REL
mkdir -p /opt/omer/releases/\$REL
tar -xzf /tmp/omer-deploy.tgz -C /opt/omer/releases/\$REL --strip-components=1
cd /opt/omer/releases/\$REL
docker build -t omer:next .
docker run --rm --network host --env-file /opt/omer/migration.env omer:next npx tsx server/migrate.ts
docker stop omer-app && docker rm omer-app
docker run -d --name omer-app --network host --restart unless-stopped \
  --env-file /opt/omer/runtime.env --cap-drop ALL --security-opt no-new-privileges omer:next
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do sleep 1; curl -sf http://127.0.0.1:3000/health && break; done
echo
curl -sS http://127.0.0.1:3000/api/config
echo
echo DEPLOY_OK \$REL commit=${head:0:12}
"

rm -f "$archive"
echo "deploy-prod: done"
