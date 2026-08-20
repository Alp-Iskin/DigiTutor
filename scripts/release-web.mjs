// Stages built installers into the website's publish folder so they can be
// deployed to Netlify. The binaries are NOT committed to git (they're gitignored
// and only copied here at release time), which keeps the repo slim.
//
// Usage:
//   npm run dist          # build installers for the version in package.json
//   npm run release:web   # copy them into website/downloads/ + write latest.json
//   npm run deploy:web    # upload page + installers to Netlify
//
// Platform note: electron-builder produces the macOS .dmg on macOS and the
// Windows .exe on Windows (or with a cross-build toolchain). So on any given
// machine you will usually have one artifact, not both. This script therefore
// stages whatever it finds and only fails when it finds nothing at all — an
// earlier version hard-required the .exe, which meant it could never succeed on
// a Mac.
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync, statSync } from 'fs'
import { createHash } from 'crypto'
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
    label: 'macOS (universal)',
    source: `DigiTutor-${version}-universal.dmg`,
    stable: 'DigiTutor.dmg',
    key: 'mac',
  },
]

mkdirSync(outDir, { recursive: true })

const staged = {}
const details = {}
const missing = []

for (const target of TARGETS) {
  const src = join(distDir, target.source)
  const dest = join(outDir, target.stable)

  if (existsSync(src)) {
    copyFileSync(src, dest)
    staged[target.key] = `downloads/${target.stable}`
    const bytes = readFileSync(src)
    details[target.key] = {
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: statSync(src).size,
    }
    console.log(`✓ ${target.label.padEnd(22)} → website/downloads/${target.stable}`)
    continue
  }

  missing.push(target)
}

if (missing.length > 0) {
  console.error('\n✗ This release needs fresh installers for both platforms.')
  console.error('  Looked for:')
  for (const t of missing) console.error(`    dist/${t.source}`)
  console.error('  Build macOS locally and download the Windows Actions artifact into dist/.')
  process.exit(1)
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
      artifacts: details,
    },
    null,
    2
  ) + '\n'
)

console.log(`\n✓ Staged DigiTutor v${version} (${Object.keys(staged).join(' + ')})`)
console.log(`  Next: npm run deploy:web`)
