import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { SubaccountsService } from '../../../subaccounts/subaccounts.service'
import {
  GATEWAY_SMS_RECEIVED_EVENT,
  GatewaySmsReceivedEvent,
} from '../../../gateway/events/gateway.events'
import { GhlInboundQueue } from '../queue/ghl-inbound.queue'
import { InboundSmsSyncService } from '../inbound-sms-sync.service'
import {
  buildInboundSmsDedupeKey,
  normalizePhoneForLookup,
} from '../../../common/phone/phone.util'

@Injectable()
export class ReceivedSmsListener {
  private readonly logger = new Logger(ReceivedSmsListener.name)

  constructor(
    private readonly subaccountsService: SubaccountsService,
    private readonly inboundSmsSyncService: InboundSmsSyncService,
    private readonly ghlInboundQueue: GhlInboundQueue,
  ) {}

  @OnEvent(GATEWAY_SMS_RECEIVED_EVENT)
  async handleReceivedSms(event: GatewaySmsReceivedEvent) {
    const locationId =
      await this.subaccountsService.resolveLocationIdByDeviceId(event.deviceId)
    if (!locationId) {
      await this.subaccountsService.recordRoutingFailure({
        source: 'inbound-sms-received',
        reason: 'no_subaccount_device_link',
        receivedAt: new Date(),
        rawPayload: event as any,
      })
      return
    }

    const normalizedSender = normalizePhoneForLookup(event.sender)
    if (!normalizedSender) {
      await this.subaccountsService.recordRoutingFailure({
        source: 'inbound-sms-received',
        locationId,
        reason: 'invalid_sender_phone',
        receivedAt: new Date(),
        rawPayload: event as any,
      })
      return
    }

    const dedupeKey = buildInboundSmsDedupeKey({
      deviceId: event.deviceId,
      normalizedSender,
      receivedAtInMillis: event.receivedAtInMillis,
      message: event.message,
    })

    const sync = await this.inboundSmsSyncService.upsertOnEnqueue({
      smsId: event.smsId,
      locationId,
      normalizedPhone: normalizedSender,
      dedupeKey,
    })

    if (sync.status === 'succeeded') {
      this.logger.debug(
        `Skipping enqueue: already succeeded locationId=${locationId} dedupeKey=${dedupeKey}`,
      )
      return
    }

    await this.ghlInboundQueue.enqueueInboundSms(
      {
        locationId,
        deviceId: event.deviceId,
        smsId: event.smsId,
        sender: normalizedSender,
        message: event.message,
        receivedAtInMillis: event.receivedAtInMillis,
        correlationId: dedupeKey,
      },
      0,
    )

    this.logger.debug(
      `Enqueued inbound SMS for GHL sync locationId=${locationId} smsId=${event.smsId}`,
    )
  }
}
