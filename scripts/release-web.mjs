// Stages built installers into the website's publish folder so they can be
// deployed to Netlify. The binaries are NOT committed to git (they're gitignored
// and only copied here at release time), which keeps the repo slim.
//
// Usage:
//   npm run dist          # build installers for the version in package.json
//   npm run release:web   # copy them into website/downloads/ + write latest.json
//   npm run deploy:web    # upload page + installers to Netlify
//
// Platform note: electron-builder can only produce the macOS .dmg on macOS and
// the Windows .exe on Windows (or via a cross-build toolchain). So on any given
// machine you will usually have one artifact, not both. This script therefore
// stages whatever it finds and only fails when it finds nothing at all — an
// earlier version hard-required the .exe, which meant it could never succeed on
// a Mac.
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
const version = pkg.version
const distDir = join(root, 'dist')
const outDir = join(root, 'website', 'downloads')

// Source names come from electron-builder. Windows is renamed by the `nsis.
// artifactName` template in electron-builder.yml; macOS has no artifactName
// override, so it uses the default `${productName}-${version}-${arch}.${ext}`.
// Each target is copied to a STABLE filename so the download link in index.html
// never has to change between releases.
const TARGETS = [
  {
    label: 'Windows',
    source: `DigiTutor-Setup-${version}.exe`,
    stable: 'DigiTutor-Setup.exe',
    key: 'win',
  },
  {
    label: 'macOS (Apple Silicon)',
    source: `DigiTutor-${version}-arm64.dmg`,
    stable: 'DigiTutor.dmg',
    key: 'mac',
  },
]

mkdirSync(outDir, { recursive: true })

const staged = {}
const missing = []

for (const target of TARGETS) {
  const src = join(distDir, target.source)
  const dest = join(outDir, target.stable)

  if (existsSync(src)) {
    copyFileSync(src, dest)
    staged[target.key] = `downloads/${target.stable}`
    console.log(`✓ ${target.label.padEnd(22)} → website/downloads/${target.stable}`)
    continue
  }

  missing.push(target)

  // No fresh build for this platform, but a previously staged installer may
  // still be sitting in website/downloads/ (and may already be live). Keep
  // referencing it, otherwise this run would silently drop a working download
  // from the manifest and the page would hide that platform's button.
  if (existsSync(dest)) {
    staged[target.key] = `downloads/${target.stable}`
  }
}

if (Object.keys(staged).length === 0) {
  console.error('\n✗ No installers found in dist/. Run "npm run dist" first.')
  console.error('  Looked for:')
  for (const t of TARGETS) console.error(`    ${t.source}`)
  process.exit(1)
}

for (const t of missing) {
  if (staged[t.key]) {
    console.warn(`⚠ ${t.label.padEnd(22)} not rebuilt — reusing existing website/downloads/${t.stable}`)
    continue
  }
  // Nothing in dist/ AND nothing already staged. This is the dangerous case:
  // `netlify deploy --dir=website` publishes the folder as the COMPLETE site,
  // so any installer that is live but absent from this folder is deleted by the
  // next deploy. Warn loudly rather than quietly shipping a broken page.
  console.warn(
    `\n⚠️  ${t.label}: no installer in dist/ and none staged in website/downloads/.\n` +
      `   If a ${t.label} build is currently live, DEPLOYING NOW WILL REMOVE IT,\n` +
      `   because Netlify replaces the whole site with the contents of website/.\n` +
      `   Either run "npm run dist" on ${t.label} first, or download the live\n` +
      `   installer into website/downloads/${t.stable} before deploying.`
  )
}

// `file` is retained for backward compatibility: older copies of index.html read
// it directly to set the Windows button's href. New fields are additive so the
// page can point each platform button at its own artifact.
writeFileSync(
  join(outDir, 'latest.json'),
  JSON.stringify(
    {
      version,
      released: new Date().toISOString().slice(0, 10),
      file: staged.win ?? null,
      win: staged.win ?? null,
      mac: staged.mac ?? null,
    },
    null,
    2
  ) + '\n'
)

console.log(`\n✓ Staged DigiTutor v${version} (${Object.keys(staged).join(' + ')})`)
console.log(`  Next: npm run deploy:web`)
