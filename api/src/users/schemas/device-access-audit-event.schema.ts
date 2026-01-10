import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type DeviceAccessAuditEventDocument = DeviceAccessAuditEvent & Document

@Schema({ timestamps: true })
export class DeviceAccessAuditEvent {
  _id?: Types.ObjectId

  @Prop({ type: Types.ObjectId, required: true })
  actorUserId: Types.ObjectId

  @Prop({ type: Types.ObjectId, required: true })
  targetUserId: Types.ObjectId

  @Prop({ type: Boolean, required: true })
  enabled: boolean
}

export const DeviceAccessAuditEventSchema = SchemaFactory.createForClass(
  DeviceAccessAuditEvent,
)

DeviceAccessAuditEventSchema.index({ targetUserId: 1, createdAt: -1 })
DeviceAccessAuditEventSchema.index({ actorUserId: 1, createdAt: -1 })
