import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import {
  InboundSmsSync,
  InboundSmsSyncDocument,
} from './schemas/inbound-sms-sync.schema'

@Injectable()
export class InboundSmsSyncService {
  constructor(
    @InjectModel(InboundSmsSync.name)
    private readonly syncModel: Model<InboundSmsSyncDocument>,
  ) {}

  async findByDedupeKey(locationId: string, dedupeKey: string) {
    return this.syncModel.findOne({ locationId, dedupeKey }).exec()
  }

  async upsertOnEnqueue(params: {
    smsId: string
    locationId: string
    normalizedPhone: string
    dedupeKey: string
  }) {
    return this.syncModel.findOneAndUpdate(
      { locationId: params.locationId, dedupeKey: params.dedupeKey },
      {
        $setOnInsert: {
          sms: new Types.ObjectId(params.smsId),
          locationId: params.locationId,
          dedupeKey: params.dedupeKey,
          status: 'pending',
          attemptCount: 0,
        },
        $set: {
          normalizedPhone: params.normalizedPhone,
        },
      },
      { upsert: true, new: true },
    )
  }

  async recordAttempt(params: { syncId: string; error?: string }) {
    return this.syncModel.findByIdAndUpdate(
      params.syncId,
      {
        $inc: { attemptCount: 1 },
        $set: {
          lastAttemptAt: new Date(),
        },
      },
      { new: true },
    )
  }

  async setLastError(params: { syncId: string; error: string }) {
    return this.syncModel.findByIdAndUpdate(
      params.syncId,
      { $set: { lastError: params.error } },
      { new: true },
    )
  }

  async markSucceeded(params: {
    syncId: string
    contactId: string
    conversationId: string
    ghlMessageId?: string
  }) {
    return this.syncModel.findByIdAndUpdate(
      params.syncId,
      {
        $set: {
          status: 'succeeded',
          contactId: params.contactId,
          conversationId: params.conversationId,
          ...(params.ghlMessageId ? { ghlMessageId: params.ghlMessageId } : {}),
        },
      },
      { new: true },
    )
  }

  async markFailed(params: { syncId: string; error: string }) {
    return this.syncModel.findByIdAndUpdate(
      params.syncId,
      { $set: { status: 'failed', lastError: params.error } },
      { new: true },
    )
  }
}
