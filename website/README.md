# DigiTutor download site

A static landing page (`index.html` + `styles.css`) that hosts the Windows
installer for download. **The installer is not committed to git** - it's copied
into `downloads/` at release time and uploaded straight to Netlify, so the source
repo can stay private with nothing sensitive exposed.

## Why not GitHub Releases?

GitHub Release assets on a **private** repo require authentication to download, so
they can't be a public download link. Hosting the `.exe` on Netlify keeps the repo
private while the download stays public.

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
# 1. bump "version" in package.json, then build the installer
npm run dist

# 2. stage the installer + manifest into website/downloads/
npm run release:web

# 3. publish page + installer to Netlify
npx netlify deploy --prod --dir=website
```

The page reads `downloads/latest.json` to show the current version and point the
download button at `downloads/DigiTutor-Setup.exe` (a stable filename, so the link
never changes between versions).

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
