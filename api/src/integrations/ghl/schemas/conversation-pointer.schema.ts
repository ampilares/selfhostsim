import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type ConversationPointerDocument = ConversationPointer & Document

@Schema({ timestamps: true })
export class ConversationPointer {
  @Prop({ type: String, required: true, trim: true, index: true })
  locationId: string

  @Prop({ type: String, required: true, trim: true, index: true })
  normalizedPhone: string

  @Prop({ type: String, trim: true })
  rawPhone?: string

  @Prop({ type: String, trim: true, index: true })
  contactId?: string

  @Prop({ type: String, trim: true })
  conversationId?: string

  @Prop({ type: Date, required: true })
  lastObservedAt: Date

  @Prop({ type: String, trim: true })
  source?: string
}

export const ConversationPointerSchema =
  SchemaFactory.createForClass(ConversationPointer)

ConversationPointerSchema.index(
  { locationId: 1, normalizedPhone: 1 },
  { unique: true },
)

ConversationPointerSchema.index({ locationId: 1, contactId: 1 })
