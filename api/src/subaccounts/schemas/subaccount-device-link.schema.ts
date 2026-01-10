import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'
import { SubAccount } from './subaccount.schema'
import { Device } from '../../gateway/schemas/device.schema'
import { User } from '../../users/schemas/user.schema'

export type SubAccountDeviceLinkDocument = SubAccountDeviceLink & Document

@Schema({ timestamps: true })
export class SubAccountDeviceLink {
  _id?: Types.ObjectId

  @Prop({
    type: Types.ObjectId,
    ref: SubAccount.name,
    required: true,
    unique: true,
    index: true,
  })
  subAccount: SubAccount

  @Prop({
    type: Types.ObjectId,
    ref: Device.name,
    required: true,
    unique: true,
    index: true,
  })
  device: Device

  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  deviceUser: User
}

export const SubAccountDeviceLinkSchema =
  SchemaFactory.createForClass(SubAccountDeviceLink)
