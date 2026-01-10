import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from './usernames'

export function extractEmailLocalPart(email: string): string {
  const atIndex = email.indexOf('@')
  if (atIndex === -1) return email
  return email.slice(0, atIndex)
}

export function normalizeDerivedUsername(value: string): string {
  const lower = value.trim().toLowerCase()
  if (!lower) return ''
  const replaced = lower.replace(/[^a-z0-9._-]+/g, '-')
  const collapsed = replaced.replace(/[-._]{2,}/g, '-')
  const trimmed = collapsed.replace(/^[-._]+|[-._]+$/g, '')
  if (trimmed.length < USERNAME_MIN_LENGTH) return ''
  if (trimmed.length > USERNAME_MAX_LENGTH) {
    return trimmed.slice(0, USERNAME_MAX_LENGTH)
  }
  return trimmed
}
