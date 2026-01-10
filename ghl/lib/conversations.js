async function ensureConversationId({ ghl, locationId, contactId }) {
  const normalizedLocationId = String(locationId || '').trim()
  if (!normalizedLocationId) throw new Error('Invalid locationId')

  const search = await ghl.conversations.searchConversation(
    {
      locationId: normalizedLocationId,
      contactId,
      limit: 1,
    },
    {
      headers: {
        locationId: normalizedLocationId,
      },
    },
  )

  const existing = search?.conversations?.[0]?.id
  if (existing) return existing

  const created = await ghl.conversations.createConversation(
    {
      locationId: normalizedLocationId,
      contactId,
    },
    {
      headers: {
        locationId: normalizedLocationId,
      },
    },
  )

  // The GHL API response structure for createConversation is inconsistent across versions.
  // Expected primary path: created.conversation.id
  // Fallback paths observed in production:
  //   - created.conversation._id (legacy MongoDB-style ID)
  //   - created.conversation.conversation.id (nested structure)
  let convId = created?.conversation?.id

  if (!convId && created?.conversation?._id) {
    console.warn(
      'Conversation ID extracted from fallback path: created.conversation._id',
      { locationId: normalizedLocationId, contactId }
    )
    convId = created.conversation._id
  }

  if (!convId && created?.conversation?.conversation?.id) {
    console.warn(
      'Conversation ID extracted from fallback path: created.conversation.conversation.id',
      { locationId: normalizedLocationId, contactId }
    )
    convId = created.conversation.conversation.id
  }

  if (!convId) throw new Error('Failed to create conversation')
  return convId
}

module.exports = { ensureConversationId }

