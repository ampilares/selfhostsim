import { Injectable } from '@nestjs/common'
import { GatewayService } from '../../gateway/gateway.service'
import { SubaccountsService } from '../../subaccounts/subaccounts.service'
import { ConversationPointerService } from './conversation-pointer.service'
import { normalizePhoneForLookup } from '../../common/phone/phone.util'

@Injectable()
export class GhlService {
  constructor(
    private readonly subaccountsService: SubaccountsService,
    private readonly gatewayService: GatewayService,
    private readonly conversationPointerService: ConversationPointerService,
  ) {}

  async processProviderOutboundMessage(payload: Record<string, any>) {
    const receivedAt = new Date()

    const locationId = payload?.locationId
    const type = payload?.type

    if (!locationId || typeof locationId !== 'string') {
      await this.subaccountsService.recordRoutingFailure({
        source: 'ghl-provider-outbound-message',
        locationId: undefined,
        reason: 'invalid_payload_missing_locationId',
        receivedAt,
        rawPayload: payload,
      })
      return { status: 'rejected', reason: 'locationId is required' }
    }

    if (type !== 'SMS') {
      await this.subaccountsService.recordRoutingFailure({
        source: 'ghl-provider-outbound-message',
        locationId,
        reason: 'unsupported_type',
        receivedAt,
        rawPayload: payload,
      })
      return { status: 'rejected', reason: 'Only SMS is supported' }
    }

    const message = payload?.message
    const phone = payload?.phone
    const contactId = payload?.contactId
    if (!message || typeof message !== 'string' || !message.trim()) {
      await this.subaccountsService.recordRoutingFailure({
        source: 'ghl-provider-outbound-message',
        locationId,
        reason: 'invalid_payload_missing_message',
        receivedAt,
        rawPayload: payload,
      })
      return { status: 'rejected', reason: 'message is required' }
    }
    if (!phone || typeof phone !== 'string' || !phone.trim()) {
      await this.subaccountsService.recordRoutingFailure({
        source: 'ghl-provider-outbound-message',
        locationId,
        reason: 'invalid_payload_missing_phone',
        receivedAt,
        rawPayload: payload,
      })
      return { status: 'rejected', reason: 'phone is required' }
    }

    if (contactId && typeof contactId === 'string' && contactId.trim()) {
      const normalizedPhone = normalizePhoneForLookup(phone)
      if (normalizedPhone) {
        await this.conversationPointerService.upsertByPhone({
          locationId,
          normalizedPhone,
          rawPhone: phone,
          contactId,
          source: 'ghl-provider-outbound-message',
          observedAt: receivedAt,
        })
      }
    }

    const resolved =
      await this.subaccountsService.resolveLinkedDeviceByLocationId(locationId)

    if (!resolved) {
      await this.subaccountsService.recordRoutingFailure({
        source: 'ghl-provider-outbound-message',
        locationId,
        reason: 'unknown_location',
        receivedAt,
        rawPayload: payload,
      })
      return { status: 'rejected', reason: 'No Sub-Account for locationId' }
    }

    if (!resolved.device) {
      await this.subaccountsService.recordRoutingFailure({
        source: 'ghl-provider-outbound-message',
        locationId,
        reason: 'no_device_link',
        receivedAt,
        rawPayload: payload,
      })
      return {
        status: 'rejected',
        reason: 'Sub-Account is not linked to a device',
      }
    }

    if (!resolved.device.enabled) {
      await this.subaccountsService.recordRoutingFailure({
        source: 'ghl-provider-outbound-message',
        locationId,
        reason: 'device_disabled',
        receivedAt,
        rawPayload: payload,
      })
      return { status: 'rejected', reason: 'Linked device is disabled' }
    }

    try {
      await this.gatewayService.sendSMS(resolved.device._id.toString(), {
        message,
        recipients: [phone],
        smsBody: message,
        receivers: [phone],
      } as any)
      return { status: 'accepted' }
    } catch (e: any) {
      await this.subaccountsService.recordRoutingFailure({
        source: 'ghl-provider-outbound-message',
        locationId,
        reason: 'send_failed',
        receivedAt,
        rawPayload: payload,
      })
      return {
        status: 'rejected',
        reason: e?.response?.error || e?.message || 'send failed',
      }
    }
  }

  async processOutboundMessage(payload: Record<string, any>) {
    const receivedAt = new Date()

    const locationId = payload?.locationId
    const contactId = payload?.contactId
    const conversationId = payload?.conversationId

    if (!locationId || typeof locationId !== 'string') {
      await this.subaccountsService.recordRoutingFailure({
        source: 'ghl-outbound-message',
        locationId: undefined,
        reason: 'invalid_payload_missing_locationId',
        receivedAt,
        rawPayload: payload,
      })
      return { status: 'rejected', reason: 'locationId is required' }
    }

    if (!contactId || typeof contactId !== 'string') {
      await this.subaccountsService.recordRoutingFailure({
        source: 'ghl-outbound-message',
        locationId,
        reason: 'invalid_payload_missing_contactId',
        receivedAt,
        rawPayload: payload,
      })
      return { status: 'rejected', reason: 'contactId is required' }
    }

    if (!conversationId || typeof conversationId !== 'string') {
      await this.subaccountsService.recordRoutingFailure({
        source: 'ghl-outbound-message',
        locationId,
        reason: 'invalid_payload_missing_conversationId',
        receivedAt,
        rawPayload: payload,
      })
      return { status: 'rejected', reason: 'conversationId is required' }
    }

    const updatedCount =
      await this.conversationPointerService.updateConversationIdForKnownContact(
        {
          locationId,
          contactId,
          conversationId,
          source: 'ghl-outbound-message',
          observedAt: receivedAt,
        },
      )

    return { status: 'accepted', updatedCount }
  }
}
