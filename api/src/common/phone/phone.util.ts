import { createHash } from 'crypto'

// Validate and read default country code once at module load time for consistent behavior
function getDefaultCountryCode(): string {
  const code = process.env.DEFAULT_PHONE_COUNTRY_CODE || '+1'
  if (!/^\+\d+$/.test(code)) {
    throw new Error(
      `Invalid DEFAULT_PHONE_COUNTRY_CODE environment variable: "${code}". ` +
      `Must be in format '+[digits]' (e.g., '+1', '+44', '+61')`
    )
  }
  return code
}

const DEFAULT_COUNTRY_CODE = getDefaultCountryCode()

/**
 * Normalizes a phone number for lookup purposes.
 * 
 * @param input - The phone number to normalize
 * @param defaultCountryCode - The default country code to use for numbers without a country prefix (default: '+1')
 *                             Must be in format '+[digits]' (e.g., '+1', '+44', '+61')
 * @returns A normalized phone number in E.164-ish format (+[country code][number])
 * 
 * @remarks
 * This function applies the following normalization rules:
 * - Preserves numbers that already have a leading '+' 
 * - Converts '00' international prefix to '+'
 * - For 10-digit numbers, prepends the defaultCountryCode
 * - For 11-digit numbers starting with '1', treats as North America number with '+1' prefix (regardless of defaultCountryCode)
 * - Otherwise, assumes the number includes a country code and adds '+'
 * 
 * The default country code can be configured via the DEFAULT_PHONE_COUNTRY_CODE environment variable.
 * By default, it assumes North America conventions (+1). For international deployments, 
 * set DEFAULT_PHONE_COUNTRY_CODE to your region's code (e.g., '+44' for UK, '+61' for Australia).
 * 
 * Note: The 11-digit number starting with '1' rule is a special case for North American phone numbers
 * and applies regardless of the configured default country code to maintain compatibility with 
 * NANP (North American Numbering Plan) conventions.
 */
export function normalizePhoneForLookup(
  input: string,
  defaultCountryCode: string = DEFAULT_COUNTRY_CODE
): string {
  const raw = (input || '').trim()
  if (!raw) return ''

  // Validate defaultCountryCode format: must be '+' followed by digits
  if (!/^\+\d+$/.test(defaultCountryCode)) {
    throw new Error(`Invalid defaultCountryCode format: "${defaultCountryCode}". Must be in format '+[digits]' (e.g., '+1', '+44', '+61')`)
  }

  const hasLeadingPlus = raw.startsWith('+')
  const digits = raw.replace(/[^\d]/g, '')

  if (!digits) return ''

  // If already explicitly E.164-ish (+ + digits), preserve the + and digits.
  if (hasLeadingPlus) return `+${digits}`

  // Convert international prefix 00... -> +...
  if (raw.startsWith('00')) {
    const withoutPrefix = digits.replace(/^00/, '')
    return withoutPrefix ? `+${withoutPrefix}` : ''
  }

  // Extract the country code digits (without the '+')
  const countryCodeDigits = defaultCountryCode.replace(/^\+/, '')

  // Apply country-specific logic: 10 digits -> +[country code]XXXXXXXXXX
  // Special case: 11 digits starting with 1 -> +1... (North America NANP convention - always uses +1)
  if (digits.length === 10) return `+${countryCodeDigits}${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`

  // Fallback: assume caller provided country code without '+'
  return `+${digits}`
}

export function buildInboundSmsDedupeKey(params: {
  deviceId: string
  normalizedSender: string
  receivedAtInMillis: number
  message: string
}): string {
  const material = [
    params.deviceId,
    params.normalizedSender,
    String(params.receivedAtInMillis),
    params.message,
  ].join('|')

  return createHash('sha256').update(material).digest('hex')
}
