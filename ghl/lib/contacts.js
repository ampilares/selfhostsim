function normalizePhoneForLookup(input) {
  const raw = String(input || '').trim()
  if (!raw) return ''

  const hasLeadingPlus = raw.startsWith('+')
  const digits = raw.replace(/[^\d]/g, '')
  if (!digits) return ''

  if (hasLeadingPlus) return `+${digits}`
  if (raw.startsWith('00')) {
    const withoutPrefix = digits.replace(/^00/, '')
    return withoutPrefix ? `+${withoutPrefix}` : ''
  }
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return `+${digits}`
}

async function ensureContactId({ ghl, locationId, phone }) {
  const normalizedLocationId = String(locationId || '').trim()
  if (!normalizedLocationId) throw new Error('Invalid locationId')

  const normalizedPhone = normalizePhoneForLookup(phone)
  if (!normalizedPhone) throw new Error('Invalid phone')

  const queries = new Set()
  queries.add(normalizedPhone)
  queries.add(normalizedPhone.replace(/^\+/, ''))
  const last10 = normalizedPhone.replace(/[^\d]/g, '').slice(-10)
  if (last10) queries.add(last10)

  for (const query of queries) {
    if (!query) continue
    const contacts = await ghl.contacts.getContacts(
      {
        locationId: normalizedLocationId,
        query,
        limit: 1,
      },
      {
        headers: {
          locationId: normalizedLocationId,
        },
      },
    )

    const existingId = contacts?.contacts?.[0]?.id
    if (existingId) return { contactId: existingId, normalizedPhone }
  }

  const created = await ghl.contacts.createContact(
    {
      locationId: normalizedLocationId,
      phone: normalizedPhone,
    },
    {
      headers: {
        locationId: normalizedLocationId,
      },
    },
  )

  const createdId = created?.contact?.id
  if (!createdId) throw new Error('Failed to create contact')

  return { contactId: createdId, normalizedPhone }
}

module.exports = {
  normalizePhoneForLookup,
  ensureContactId,
}
