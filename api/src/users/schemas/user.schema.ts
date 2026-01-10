import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'
import { UserRole } from '../user-roles.enum'

export type UserDocument = User & Document

@Schema({ timestamps: true })
export class User {
  _id?: Types.ObjectId

  @Prop({ type: String })
  name: string

  @Prop({ type: String, required: true, unique: true, lowercase: true, trim: true })
  username: string

  @Prop({ type: String })
  avatar?: string

  @Prop({ type: String, trim: true })
  email?: string

  @Prop({ type: String })
  password: string

  @Prop({ type: String, default: UserRole.REGULAR })
  role: string

  @Prop({ type: Boolean, default: false })
  canAddDevices?: boolean

  @Prop({ type: Date })
  canAddDevicesUpdatedAt?: Date

  @Prop({ type: Types.ObjectId })
  canAddDevicesUpdatedBy?: Types.ObjectId

  @Prop({ type: Date })
  lastLoginAt: Date

  createdAt?: Date
  updatedAt?: Date
}

export const UserSchema = SchemaFactory.createForClass(User)
