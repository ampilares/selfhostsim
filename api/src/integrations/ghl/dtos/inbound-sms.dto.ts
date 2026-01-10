export type InboundSmsDeliveryRequestDTO = {
  locationId: string
  deviceId: string
  smsId: string
  sender: string
  message: string
  receivedAtInMillis: number
  conversationId?: string
  correlationId: string
}

export type InboundSmsDeliveryResultDTO = {
  contactId: string
  conversationId: string
  messageId?: string
}
