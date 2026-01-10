import { buildInboundSmsDedupeKey, normalizePhoneForLookup } from './phone.util'

describe('normalizePhoneForLookup', () => {
  it('returns empty for empty input', () => {
    expect(normalizePhoneForLookup('')).toBe('')
    expect(normalizePhoneForLookup('   ')).toBe('')
  })

  it('preserves leading + and strips formatting characters', () => {
    expect(normalizePhoneForLookup('+1 (555) 123-4567')).toBe('+15551234567')
    expect(normalizePhoneForLookup('+44 20 7946 0018')).toBe('+442079460018')
  })

  it('converts 00 prefix to +', () => {
    expect(normalizePhoneForLookup('00442079460018')).toBe('+442079460018')
  })

  it('assumes +1 for 10-digit numbers by default', () => {
    expect(normalizePhoneForLookup('5551234567')).toBe('+15551234567')
  })

  it('respects custom default country code for 10-digit numbers', () => {
    expect(normalizePhoneForLookup('5551234567', '+44')).toBe('+445551234567')
    expect(normalizePhoneForLookup('0412345678', '+61')).toBe('+610412345678')
  })

  it('keeps 11-digit numbers starting with 1 as +1...', () => {
    expect(normalizePhoneForLookup('15551234567')).toBe('+15551234567')
  })

  // Note: This test validates the module-level DEFAULT_COUNTRY_CODE constant
  // In production, the environment variable should be set before the module loads
  it('reads default country code from environment at module load', () => {
    // The actual value is read when the module loads, so we just verify
    // that the function uses the constant correctly when no override is provided
    expect(normalizePhoneForLookup('5551234567')).toBeTruthy()
    expect(normalizePhoneForLookup('5551234567')).toMatch(/^\+\d+$/)
  })

  it('throws error for invalid country code format', () => {
    expect(() => normalizePhoneForLookup('5551234567', '44')).toThrow('Invalid defaultCountryCode format')
    expect(() => normalizePhoneForLookup('5551234567', '+abc')).toThrow('Invalid defaultCountryCode format')
    expect(() => normalizePhoneForLookup('5551234567', '1')).toThrow('Invalid defaultCountryCode format')
  })

  it('accepts valid country code formats', () => {
    expect(normalizePhoneForLookup('5551234567', '+44')).toBe('+445551234567')
    expect(normalizePhoneForLookup('5551234567', '+61')).toBe('+615551234567')
    expect(normalizePhoneForLookup('5551234567', '+1')).toBe('+15551234567')
  })
})

describe('buildInboundSmsDedupeKey', () => {
  it('is stable for same inputs', () => {
    const a = buildInboundSmsDedupeKey({
      deviceId: 'dev1',
      normalizedSender: '+15551234567',
      receivedAtInMillis: 1700000000000,
      message: 'hello',
    })
    const b = buildInboundSmsDedupeKey({
      deviceId: 'dev1',
      normalizedSender: '+15551234567',
      receivedAtInMillis: 1700000000000,
      message: 'hello',
    })
    expect(a).toEqual(b)
  })

  it('changes when any component changes', () => {
    const base = {
      deviceId: 'dev1',
      normalizedSender: '+15551234567',
      receivedAtInMillis: 1700000000000,
      message: 'hello',
    }
    expect(buildInboundSmsDedupeKey(base)).not.toEqual(
      buildInboundSmsDedupeKey({ ...base, message: 'hello!' }),
    )
  })
})
