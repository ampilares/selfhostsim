import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import {
  ConversationPointer,
  ConversationPointerDocument,
} from './schemas/conversation-pointer.schema'

@Injectable()
export class ConversationPointerService {
  constructor(
    @InjectModel(ConversationPointer.name)
    private readonly pointerModel: Model<ConversationPointerDocument>,
  ) {}

  async findByPhone(locationId: string, normalizedPhone: string) {
    return this.pointerModel
      .findOne({ locationId, normalizedPhone })
      .lean()
      .exec()
  }

  async upsertByPhone(params: {
    locationId: string
    normalizedPhone: string
    rawPhone?: string
    contactId?: string
    conversationId?: string
    source?: string
    observedAt?: Date
  }) {
    const observedAt = params.observedAt || new Date()
    const update: Record<string, any> = {
      $set: {
        lastObservedAt: observedAt,
      },
    }

    const setFields: Record<string, any> = {}
    if (params.rawPhone) setFields.rawPhone = params.rawPhone
    if (params.contactId) setFields.contactId = params.contactId
    if (params.conversationId) setFields.conversationId = params.conversationId
    if (params.source) setFields.source = params.source
    if (Object.keys(setFields).length) {
      update.$set = { ...update.$set, ...setFields }
    }

    return this.pointerModel.findOneAndUpdate(
      {
        locationId: params.locationId,
        normalizedPhone: params.normalizedPhone,
      },
      {
        ...update,
        $setOnInsert: {
          locationId: params.locationId,
          normalizedPhone: params.normalizedPhone,
        },
      },
      { upsert: true, new: true },
    )
  }

  async updateConversationIdForKnownContact(params: {
    locationId: string
    contactId: string
    conversationId: string
    source?: string
    observedAt?: Date
  }): Promise<number> {
    const observedAt = params.observedAt || new Date()

    const res = await this.pointerModel.updateMany(
      { locationId: params.locationId, contactId: params.contactId },
      {
        $set: {
          conversationId: params.conversationId,
          lastObservedAt: observedAt,
          ...(params.source ? { source: params.source } : {}),
        },
      },
    )
    return res.modifiedCount || 0
  }
}
