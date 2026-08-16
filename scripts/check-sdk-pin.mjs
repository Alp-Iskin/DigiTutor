import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))
const name = '@anthropic-ai/sdk'
const spec = pkg.dependencies?.[name]
const lockSpec = lock.packages?.['']?.dependencies?.[name]
const lockVersion = lock.packages?.[`node_modules/${name}`]?.version
const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

if (!exactVersion.test(spec) || lockSpec !== spec || lockVersion !== spec) {
  console.error(
    `${name} must use one exact version in package.json and package-lock.json ` +
      `(package=${spec ?? 'missing'}, lock spec=${lockSpec ?? 'missing'}, ` +
      `lock version=${lockVersion ?? 'missing'}).`
  )
  process.exit(1)
}

console.log(`${name} is pinned to ${spec}.`)
