# DigiTutor download site

A static landing page (`index.html` + `styles.css`) that hosts Windows and macOS
installers. **The installers are not committed to git** - they're copied
into `downloads/` at release time and uploaded straight to Netlify, which keeps
large generated binaries out of the source repository.

## Why Netlify hosts the downloads

It keeps the landing page and stable download URLs in one deployment. GitHub
Releases would also work now that the repository is public, but changing hosts is
not necessary for this release workflow.

## First-time setup (once)

1. Install the CLI and sign in:
   ```
   npm i -g netlify-cli
   netlify login
   ```
2. From the repo root, create/link a site:
   ```
   netlify init      # or: netlify sites:create --name digitutor
   ```
   (Do **not** enable Git-based auto-deploy - a git deploy wouldn't include the
   installer, which lives outside the repo. Always deploy with the CLI below.)

## Releasing a new version

```
# 1. bump "version" in package.json, then build on each target platform
npm run dist:win   # Windows x64 installer
npm run dist:mac   # universal Apple Silicon + Intel DMG

# 2. stage the installer + manifest into website/downloads/
npm run release:web

# 3. publish page + installer to Netlify
npx netlify deploy --prod --dir=website
```

The page reads `downloads/latest.json` to show the current version and point each
download button at a stable filename, so links do not change between versions.

## Custom domain

In the Netlify dashboard → **Domain settings**, add your domain and follow the DNS
steps. HTTPS is automatic.

## Notes

- The installer is **unsigned**, so SmartScreen warns on first run. The page already
  tells users to click *More info → Run anyway*. The real fix is a code-signing
  certificate (Azure Trusted Signing is the cheapest path) - a later spend.
- If Netlify ever balks at the ~88 MB upload, host the binary on Cloudflare R2 (or a
  separate **public** GitHub repo used only for releases) and point
  `downloads/latest.json`'s `file` at that URL instead.
