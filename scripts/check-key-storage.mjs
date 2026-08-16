import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const policyPath = join(root, 'src', 'main', 'api-key-policy.ts')
const policySource = readFileSync(policyPath, 'utf8')
const compiled = ts.transpileModule(policySource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText
const policy = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

let decryptCalls = 0
const decrypt = (value) => {
  decryptCalls += 1
  if (value === 'encrypted') return 'secret'
  if (value === 'empty') return ''
  throw new Error('cannot decrypt')
}

assert.deepEqual(policy.classifyStoredApiKey(undefined, true, decrypt), {
  state: 'not-set',
  canStoreSecurely: true
})
assert.equal(policy.classifyStoredApiKey('plain:c2VjcmV0', true, decrypt).state, 'legacy-insecure')
assert.equal(policy.readUsableApiKey('plain:c2VjcmV0', true, decrypt), null)
assert.equal(decryptCalls, 0, 'legacy plaintext must never be decoded')
assert.equal(policy.classifyStoredApiKey('encrypted', false, decrypt).state, 'locked')
assert.equal(policy.readUsableApiKey('encrypted', false, decrypt), null)
assert.equal(decryptCalls, 0, 'secure values must not be decrypted while storage is unavailable')
assert.equal(policy.classifyStoredApiKey('encrypted', true, decrypt).state, 'ready')
assert.equal(policy.readUsableApiKey('encrypted', true, decrypt), 'secret')
assert.equal(policy.classifyStoredApiKey('bad', true, decrypt).state, 'unreadable')
assert.equal(policy.readUsableApiKey('bad', true, decrypt), null)
assert.equal(policy.classifyStoredApiKey('empty', true, decrypt).state, 'unreadable')

const storeSource = readFileSync(join(root, 'src', 'main', 'store.ts'), 'utf8')
assert.doesNotMatch(
  storeSource,
  /apiKeyEnc\s*=\s*['"`]plain:/,
  'store.ts must never create a legacy plaintext value'
)
assert.match(storeSource, /backend === 'basic_text'/, 'Linux basic_text must be rejected')

console.log('API-key storage policy is fail closed, and legacy plaintext is disabled.')
