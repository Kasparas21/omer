# Team workflow (Ben + Kasparas)

## One rule that stops UI wipeouts

**Everyone merges to `main`. Production deploys only from `main`.**

We used to deploy `codex/dashboard-onboarding` while UI polish landed on `main`. Redeploys then shipped the older UI. That must not happen again.

## Day to day

1. `git checkout main && git pull --ff-only`
2. `git checkout -b ben/…` or `kasparas/…`
3. Open a PR **into `main`**
4. Merge the PR
5. Deploy with the guarded script (below)

Never `git push --force` to `main`.

## Deploy (required)

```sh
npm run deploy:prod
```

This script **refuses** to run unless:

- you are on `main`
- `HEAD` equals `origin/main`
- the working tree is clean

Do not hand-deploy from a private branch or from `codex/dashboard-onboarding`.

## GitHub protection (repo owner)

Whoever has admin on `Kasparas21/omer` should enable on **`main`**:

- Require a pull request before merging
- Do not allow force pushes
- Do not allow deletions
- Optionally: require 1 approving review

Until that is on, the deploy script is the hard gate for production.
