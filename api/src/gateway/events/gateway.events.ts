export const GATEWAY_SMS_RECEIVED_EVENT = 'gateway.sms.received'

export type GatewaySmsReceivedEvent = {
  smsId: string
  deviceId: string
  sender: string
  message: string
  receivedAtInMillis: number
}
