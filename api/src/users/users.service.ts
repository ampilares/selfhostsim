import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { User, UserDocument } from './schemas/user.schema'
import { Model } from 'mongoose'
import mongoose from 'mongoose'
import * as bcrypt from 'bcryptjs'
import { DefaultUserBootstrapConfig } from './default-user.types'
import {
  DeviceAccessAuditEvent,
  DeviceAccessAuditEventDocument,
} from './schemas/device-access-audit-event.schema'
import { UserRole } from './user-roles.enum'

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(DeviceAccessAuditEvent.name)
    private deviceAccessAuditModel: Model<DeviceAccessAuditEventDocument>,
  ) {}

  async findOne(params) {
    return await this.userModel.findOne(params)
  }

  async findAll() {
    return await this.userModel.find()
  }

  async getUserCount() {
    return await this.userModel.countDocuments()
  }

  async create({
    name,
    username,
    password,
    email,
  }: {
    name: string
    username: string
    password?: string
    email?: string
  }) {
    if (await this.findOne({ username })) {
      throw new HttpException(
        {
          error: 'user exists with the same username',
        },
        HttpStatus.BAD_REQUEST,
      )
    }

    const newUser = new this.userModel({
      name,
      username,
      password,
      email,
    })
    return await newUser.save()
  }

  async createDefaultUser(config: DefaultUserBootstrapConfig) {
    const existing = await this.findOne({ username: config.username })
    if (existing) {
      return existing
    }

    const hashedPassword = await bcrypt.hash(config.password, 10)
    const newUser = new this.userModel({
      name: config.name,
      username: config.username,
      password: hashedPassword,
      role: config.role,
    })

    return await newUser.save()
  }

  async updateProfile(
    input: { name: string; email: string },
    user: UserDocument,
  ) {
    const userToUpdate = await this.findOne({ _id: user._id })
    if (!userToUpdate) {
      throw new HttpException({ error: 'User not found' }, HttpStatus.NOT_FOUND)
    }

    if (input.name) {
      userToUpdate.name = input.name
    }
    if (input.email) {
      userToUpdate.email = input.email
    }

    return await userToUpdate.save()
  }

  async listUsers(page = 1, limit = 25) {
    const safePage = Math.max(1, page || 1)
    const safeLimit = Math.min(Math.max(limit || 25, 1), 100)
    const skip = (safePage - 1) * safeLimit

    const [items, total] = await Promise.all([
      this.userModel
        .find({}, '_id username name role canAddDevices createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
      this.userModel.countDocuments(),
    ])

    return {
      items,
      page: safePage,
      limit: safeLimit,
      total,
    }
  }

  async updateDeviceAccess(
    userId: string,
    enabled: boolean,
    adminUser: UserDocument,
  ) {
    if (typeof enabled !== 'boolean') {
      throw new HttpException(
        { error: 'Invalid enabled value' },
        HttpStatus.BAD_REQUEST,
      )
    }

    const isValidId = mongoose.Types.ObjectId.isValid(userId)
    if (!isValidId) {
      throw new HttpException({ error: 'Invalid id' }, HttpStatus.BAD_REQUEST)
    }

    const targetUser = await this.userModel.findById(userId)
    if (!targetUser) {
      throw new HttpException({ error: 'User not found' }, HttpStatus.NOT_FOUND)
    }

    if (targetUser.role === UserRole.ADMIN) {
      throw new HttpException(
        { error: 'Cannot modify admin user' },
        HttpStatus.FORBIDDEN,
      )
    }

    targetUser.canAddDevices = enabled
    targetUser.canAddDevicesUpdatedAt = new Date()
    targetUser.canAddDevicesUpdatedBy = adminUser._id
    await targetUser.save()

    await this.deviceAccessAuditModel.create({
      actorUserId: adminUser._id,
      targetUserId: targetUser._id,
      enabled,
    })

    return {
      _id: targetUser._id,
      username: targetUser.username,
      name: targetUser.name,
      role: targetUser.role,
      canAddDevices: targetUser.canAddDevices,
      createdAt: targetUser.createdAt,
    }
  }

}
