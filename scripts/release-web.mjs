// Stages the current installer into the website's publish folder so it can be
// deployed to Netlify. The binary is NOT committed to git (it's gitignored and
// only copied here at release time), which keeps the repo private and slim.
//
// Usage:
//   npm run dist          # build the installer for the version in package.json
//   npm run release:web   # copy it into website/downloads/ + write latest.json
//   npx netlify deploy --prod --dir=website   # upload page + installer
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
const version = pkg.version

const installer = join(root, 'dist', `DigiTutor-Setup-${version}.exe`)
if (!existsSync(installer)) {
  console.error(`✗ Installer not found:\n    ${installer}\n  Run "npm run dist" first.`)
  process.exit(1)
}

const outDir = join(root, 'website', 'downloads')
mkdirSync(outDir, { recursive: true })

// Copy to a stable filename so the download link never changes between versions.
const stableName = 'DigiTutor-Setup.exe'
copyFileSync(installer, join(outDir, stableName))
writeFileSync(
  join(outDir, 'latest.json'),
  JSON.stringify(
    { version, file: `downloads/${stableName}`, released: new Date().toISOString().slice(0, 10) },
    null,
    2
  )
)

console.log(`✓ Staged DigiTutor v${version} → website/downloads/${stableName}`)
console.log(`  Next: npx netlify deploy --prod --dir=website`)
