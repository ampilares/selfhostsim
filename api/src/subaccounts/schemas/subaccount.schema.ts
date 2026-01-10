import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type SubAccountDocument = SubAccount & Document

@Schema({ timestamps: true })
export class SubAccount {
  _id?: Types.ObjectId

  @Prop({ type: String, required: true, trim: true })
  name: string

  @Prop({ type: String, required: true, trim: true, unique: true, index: true })
  locationId: string
}

export const SubAccountSchema = SchemaFactory.createForClass(SubAccount)
