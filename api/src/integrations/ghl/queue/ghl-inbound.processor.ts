import { Process, Processor } from '@nestjs/bull'
import { Job } from 'bull'
import { Logger } from '@nestjs/common'
import { InboundSmsDeliveryRequestDTO } from '../dtos/inbound-sms.dto'
import { GhlInboundClientService } from '../ghl-inbound-client.service'
import { ConversationPointerService } from '../conversation-pointer.service'
import { InboundSmsSyncService } from '../inbound-sms-sync.service'
import {
  buildInboundSmsDedupeKey,
  normalizePhoneForLookup,
} from '../../../common/phone/phone.util'
import { GhlInboundQueue } from './ghl-inbound.queue'

@Processor('ghl-inbound')
export class GhlInboundProcessor {
  private readonly logger = new Logger(GhlInboundProcessor.name)

  constructor(
    private readonly ghlInboundClient: GhlInboundClientService,
    private readonly conversationPointerService: ConversationPointerService,
    private readonly inboundSmsSyncService: InboundSmsSyncService,
    private readonly ghlInboundQueue: GhlInboundQueue,
  ) {}

  @Process({ name: 'deliver-inbound-sms', concurrency: 5 })
  async handleDeliverInboundSms(job: Job<InboundSmsDeliveryRequestDTO>) {
    const payload = job.data
    const normalizedSender = normalizePhoneForLookup(payload.sender)
    const dedupeKey =
      payload.correlationId ||
      buildInboundSmsDedupeKey({
        deviceId: payload.deviceId,
        normalizedSender,
        receivedAtInMillis: payload.receivedAtInMillis,
        message: payload.message,
      })

    let sync = await this.inboundSmsSyncService.findByDedupeKey(
      payload.locationId,
      dedupeKey,
    )

    if (sync?.status === 'succeeded') {
      this.logger.debug(
        `Skipping inbound SMS delivery (already succeeded) jobId=${job.id} locationId=${payload.locationId} smsId=${payload.smsId} dedupeKey=${dedupeKey}`,
      )
      return
    }

    const maxAttempts = Number(process.env.GHL_INBOUND_MAX_ATTEMPTS || 5)
    const baseDelayMs = Number(
      process.env.GHL_INBOUND_RETRY_BASE_DELAY_MS || 10000,
    )
    const maxDelayMs = Number(
      process.env.GHL_INBOUND_RETRY_MAX_DELAY_MS || 300000,
    )

    if (!sync) {
      this.logger.warn(
        `Missing sync record for inbound SMS; creating on the fly jobId=${job.id} locationId=${payload.locationId} smsId=${payload.smsId} dedupeKey=${dedupeKey}`,
      )
      sync = await this.inboundSmsSyncService.upsertOnEnqueue({
        smsId: payload.smsId,
        locationId: payload.locationId,
        normalizedPhone: normalizedSender,
        dedupeKey,
      })
    }

    const updated = await this.inboundSmsSyncService.recordAttempt({
      syncId: sync._id.toString(),
    })
    const attempt = updated?.attemptCount ?? sync.attemptCount + 1

    try {
      const pointer = await this.conversationPointerService.findByPhone(
        payload.locationId,
        normalizedSender,
      )
      const preferredConversationId =
        payload.conversationId || pointer?.conversationId

      const res = await this.ghlInboundClient.postInboundSms({
        ...payload,
        sender: normalizedSender,
        conversationId: preferredConversationId,
        correlationId: dedupeKey,
      })

      await this.inboundSmsSyncService.markSucceeded({
        syncId: sync._id.toString(),
        contactId: res.contactId,
        conversationId: res.conversationId,
        ghlMessageId: res.messageId,
      })

      await this.conversationPointerService.upsertByPhone({
        locationId: payload.locationId,
        normalizedPhone: normalizedSender,
        rawPhone: payload.sender,
        contactId: res.contactId,
        conversationId: res.conversationId,
        source: 'inbound-sms-sync',
      })

      this.logger.log(
        `Delivered inbound SMS to GHL jobId=${job.id} locationId=${payload.locationId} smsId=${payload.smsId} dedupeKey=${dedupeKey} contactId=${res.contactId} conversationId=${res.conversationId}`,
      )
      return
    } catch (e: any) {
      const errorMsg =
        e?.response?.data?.message || e?.message || 'unknown error'
      const statusCode = e?.response?.status
      this.logger.warn(
        `Failed delivering inbound SMS to GHL attempt=${attempt}/${maxAttempts} jobId=${job.id} locationId=${payload.locationId} smsId=${payload.smsId} dedupeKey=${dedupeKey} error=${errorMsg}`,
      )

      if (statusCode === 424) {
        await this.inboundSmsSyncService.markFailed({
          syncId: sync._id.toString(),
          error: errorMsg,
        })
        this.logger.error(
          `Inbound SMS delivery permanently failed (configuration) jobId=${job.id} locationId=${payload.locationId} smsId=${payload.smsId} dedupeKey=${dedupeKey} statusCode=${statusCode} error=${errorMsg}`,
        )
        return
      }

      if (attempt >= maxAttempts) {
        await this.inboundSmsSyncService.markFailed({
          syncId: sync._id.toString(),
          error: errorMsg,
        })
        this.logger.error(
          `Inbound SMS delivery permanently failed jobId=${job.id} locationId=${payload.locationId} smsId=${payload.smsId} dedupeKey=${dedupeKey} attempts=${attempt}`,
        )
        return
      }

      await this.inboundSmsSyncService.setLastError({
        syncId: sync._id.toString(),
        error: errorMsg,
      })

      const backoff = Math.min(
        maxDelayMs,
        baseDelayMs * 2 ** Math.max(0, attempt - 1),
      )
      const jitter = Math.floor(Math.random() * 1000)
      const delayMs = backoff + jitter

      this.logger.warn(
        `Re-enqueueing inbound SMS delivery jobId=${job.id} locationId=${payload.locationId} smsId=${payload.smsId} dedupeKey=${dedupeKey} delayMs=${delayMs}`,
      )

      await this.ghlInboundQueue.enqueueInboundSms(
        {
          ...payload,
          sender: normalizedSender,
          correlationId: dedupeKey,
        },
        delayMs,
      )
    }
  }
}
