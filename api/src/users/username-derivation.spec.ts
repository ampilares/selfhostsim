import {
  extractEmailLocalPart,
  normalizeDerivedUsername,
} from './username-derivation'

describe('username-derivation', () => {
  it('extracts local-part from email', () => {
    expect(extractEmailLocalPart('alex@example.com')).toBe('alex')
  })

  it('normalizes to lowercase and strips invalid characters', () => {
    expect(normalizeDerivedUsername('Al.Ex+One')).toBe('al.ex-one')
  })

  it('returns empty string when too short after normalization', () => {
    expect(normalizeDerivedUsername('..')).toBe('')
  })
})
