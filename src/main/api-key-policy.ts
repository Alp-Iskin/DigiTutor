export const LEGACY_PLAIN_PREFIX = 'plain:'

export type ApiKeyStorageState =
  | 'not-set'
  | 'ready'
  | 'legacy-insecure'
  | 'locked'
  | 'unreadable'

export interface ApiKeyStatus {
  state: ApiKeyStorageState
  canStoreSecurely: boolean
}

export type ApiKeySaveError =
  | 'secure-storage-unavailable'
  | 'encryption-failed'
  | 'write-failed'

export type ApiKeySaveResult =
  | { ok: true; status: ApiKeyStatus }
  | { ok: false; error: ApiKeySaveError; status: ApiKeyStatus }

type Decrypt = (encoded: string) => string

// Classify a stored value without ever decoding the legacy base64 format.
// Legacy plaintext remains untouched on disk, but it is never considered usable.
export function classifyStoredApiKey(
  stored: string | undefined,
  canStoreSecurely: boolean,
  decrypt: Decrypt
): ApiKeyStatus {
  if (!stored) return { state: 'not-set', canStoreSecurely }
  if (stored.startsWith(LEGACY_PLAIN_PREFIX)) {
    return { state: 'legacy-insecure', canStoreSecurely }
  }
  if (!canStoreSecurely) return { state: 'locked', canStoreSecurely }

  try {
    return {
      state: decrypt(stored) ? 'ready' : 'unreadable',
      canStoreSecurely
    }
  } catch {
    return { state: 'unreadable', canStoreSecurely }
  }
}

// Return only a key protected by usable secure storage. In particular, legacy
// `plain:` values are deliberately neither decoded nor sent to an AI provider.
export function readUsableApiKey(
  stored: string | undefined,
  canStoreSecurely: boolean,
  decrypt: Decrypt
): string | null {
  if (!stored || stored.startsWith(LEGACY_PLAIN_PREFIX) || !canStoreSecurely) return null
  try {
    return decrypt(stored) || null
  } catch {
    return null
  }
}
