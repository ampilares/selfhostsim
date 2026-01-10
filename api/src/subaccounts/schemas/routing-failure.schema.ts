import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type RoutingFailureDocument = RoutingFailure & Document

@Schema({ timestamps: true })
export class RoutingFailure {
  _id?: Types.ObjectId

  @Prop({ type: String, required: true })
  source: string

  @Prop({ type: String })
  locationId?: string

  @Prop({ type: String, required: true })
  reason: string

  @Prop({ type: Date, required: true })
  receivedAt: Date

  @Prop({ type: Object })
  rawPayload?: Record<string, any>
}

export const RoutingFailureSchema = SchemaFactory.createForClass(RoutingFailure)
