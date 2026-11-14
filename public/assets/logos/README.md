# Brand logos

Every brand logo in the kit comes from [thesvg.org](https://thesvg.org) (MIT licensed) whenever the
brand is there. Download the `default` variant into this folder under the brand's slug:

```
curl -sL https://thesvg.org/icons/<slug>/default.svg -o <slug>.svg
```

Then show it with `brandLogo('<slug>')` in `ui/screens.js`, which renders an `<img>` so each logo's
own gradients and ids stay self-contained. Only if a brand isn't on thesvg.org do we draw our own.

Use `default` unless it's made for dark backgrounds; then take the `light` variant
(`/icons/<slug>/light.svg`) for our light UI. Resend and TikTok defaults are white —
use their `light` variants so they read on our UI.

In here now: google, instagram, meta, tiktok (light), shopify, stripe, resend (light), postmark, revenuecat, dodo (`dodo-payments` on thesvg.org).
