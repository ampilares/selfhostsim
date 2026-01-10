import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'
import { SMS } from '../../../gateway/schemas/sms.schema'

export type InboundSmsSyncDocument = InboundSmsSync & Document

export type InboundSmsSyncStatus = 'pending' | 'succeeded' | 'failed'

@Schema({ timestamps: true })
export class InboundSmsSync {
  @Prop({ type: Types.ObjectId, ref: SMS.name, required: true, index: true })
  sms: Types.ObjectId

  @Prop({ type: String, required: true, trim: true, index: true })
  locationId: string

  @Prop({ type: String, required: true, trim: true, index: true })
  normalizedPhone: string

  @Prop({ type: String, required: true, trim: true })
  dedupeKey: string

  @Prop({ type: String, required: true, default: 'pending' })
  status: InboundSmsSyncStatus

  @Prop({ type: Number, default: 0 })
  attemptCount: number

  @Prop({ type: Date })
  lastAttemptAt?: Date

  @Prop({ type: String })
  lastError?: string

  @Prop({ type: String })
  ghlMessageId?: string

  @Prop({ type: String })
  contactId?: string

  @Prop({ type: String })
  conversationId?: string
}

export const InboundSmsSyncSchema = SchemaFactory.createForClass(InboundSmsSync)

InboundSmsSyncSchema.index({ locationId: 1, dedupeKey: 1 }, { unique: true })
