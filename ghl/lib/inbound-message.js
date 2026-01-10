async function addInboundSmsMessage({
  ghl,
  locationId,
  conversationId,
  conversationProviderId,
  message,
  date,
  altId,
}) {
  const res = await ghl.conversations.addAnInboundMessage(
    {
      type: 'SMS',
      direction: 'inbound',
      date,
      message,
      conversationId,
      conversationProviderId,
      altId,
    },
    {
      headers: {
        locationId,
      },
    },
  )

  if (!res?.success) {
    const errorDetails = res?.error || res?.message || 'No error details available'
    throw new Error(
      `GHL add inbound message failed: conversationId=${conversationId}, locationId=${locationId}, error=${errorDetails}`
    )
  }
  return res
}

module.exports = { addInboundSmsMessage }

