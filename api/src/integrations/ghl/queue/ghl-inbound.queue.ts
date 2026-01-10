import { Injectable } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bull'
import { Queue } from 'bull'
import { InboundSmsDeliveryRequestDTO } from '../dtos/inbound-sms.dto'

@Injectable()
export class GhlInboundQueue {
  constructor(@InjectQueue('ghl-inbound') private readonly queue: Queue) {}

  async enqueueInboundSms(payload: InboundSmsDeliveryRequestDTO, delayMs = 0) {
    await this.queue.add('deliver-inbound-sms', payload, {
      delay: delayMs,
      removeOnComplete: true,
      removeOnFail: false,
    })
  }
}
