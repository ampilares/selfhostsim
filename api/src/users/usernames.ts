export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 30

export const USERNAME_REGEX = /^[a-z0-9._-]+$/

export const RESERVED_USERNAMES = new Set([
  'administrator',
  'support',
  'root',
  'system',
])

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase()
}

export function isReservedUsername(value: string): boolean {
  return RESERVED_USERNAMES.has(normalizeUsername(value))
}

export function isValidUsername(value: string): boolean {
  const normalized = normalizeUsername(value)
  if (normalized.length < USERNAME_MIN_LENGTH) return false
  if (normalized.length > USERNAME_MAX_LENGTH) return false
  if (!USERNAME_REGEX.test(normalized)) return false
  if (isReservedUsername(normalized)) return false
  return true
}
