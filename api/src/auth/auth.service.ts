import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { UsersService } from '../users/users.service'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { InjectModel } from '@nestjs/mongoose'
import { ApiKey, ApiKeyDocument } from './schemas/api-key.schema'
import { Model } from 'mongoose'
import { User, UserDocument } from '../users/schemas/user.schema'
import { AdminResetPasswordInputDTO } from './auth.dto'
import { AccessLog } from './schemas/access-log.schema'
import { isValidUsername, normalizeUsername } from '../users/usernames'

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    @InjectModel(ApiKey.name) private apiKeyModel: Model<ApiKeyDocument>,
    @InjectModel(AccessLog.name) private accessLogModel: Model<AccessLog>,
  ) {}

  async login(userData: any) {
    const username = normalizeUsername(userData.username || '')
    const user = await this.usersService.findOne({ username })
    if (!user) {
      throw new HttpException(
        { error: 'Invalid credentials' },
        HttpStatus.UNAUTHORIZED,
      )
    }

    if (!(await bcrypt.compare(userData.password, user.password))) {
      throw new HttpException(
        { error: 'Invalid credentials' },
        HttpStatus.UNAUTHORIZED,
      )
    }

    user.lastLoginAt = new Date()
    await user.save()

    const payload = { username: user.username, sub: user._id }
    return {
      accessToken: this.jwtService.sign(payload),
      user,
    }
  }

  async register(userData: any) {
    const username = normalizeUsername(userData.username || '')
    if (!isValidUsername(username)) {
      throw new HttpException({ error: 'Invalid username' }, HttpStatus.BAD_REQUEST)
    }

    const existingUser = await this.usersService.findOne({ username })
    if (existingUser) {
      throw new HttpException(
        { error: 'User already exists, please login instead' },
        HttpStatus.BAD_REQUEST,
      )
    }

    this.validatePassword(userData.password)

    const hashedPassword = await bcrypt.hash(userData.password, 10)
    const {
      phone: _phone,
      role: _role,
      canAddDevices: _canAddDevices,
      canAddDevicesUpdatedAt: _canAddDevicesUpdatedAt,
      canAddDevicesUpdatedBy: _canAddDevicesUpdatedBy,
      ...sanitizedUserData
    } = userData
    const user = await this.usersService.create({
      ...sanitizedUserData,
      username,
      password: hashedPassword,
    })

    user.lastLoginAt = new Date()
    await user.save()

    const payload = { username: user.username, sub: user._id }

    return {
      accessToken: this.jwtService.sign(payload),
      user,
    }
  }

  async updateProfile(
    input: { name: string; email: string },
    user: UserDocument,
  ) {
    return this.usersService.updateProfile(input, user)
  }

  async changePassword(
    input: { oldPassword: string; newPassword: string },
    user: UserDocument,
  ) {
    const userToUpdate = await this.usersService.findOne({ _id: user._id })
    if (!userToUpdate) {
      throw new HttpException({ error: 'User not found' }, HttpStatus.NOT_FOUND)
    }
    if (!(await bcrypt.compare(input.oldPassword, userToUpdate.password))) {
      throw new HttpException(
        { error: 'Invalid old password' },
        HttpStatus.BAD_REQUEST,
      )
    }

    this.validatePassword(input.newPassword)

    const hashedPassword = await bcrypt.hash(input.newPassword, 10)
    userToUpdate.password = hashedPassword
    await userToUpdate.save()
  }

  async adminResetPassword(
    userId: string,
    input: AdminResetPasswordInputDTO,
  ) {
    const userToUpdate = await this.usersService.findOne({ _id: userId })
    if (!userToUpdate) {
      throw new HttpException({ error: 'User not found' }, HttpStatus.NOT_FOUND)
    }

    this.validatePassword(input.newPassword)

    const hashedPassword = await bcrypt.hash(input.newPassword, 10)
    userToUpdate.password = hashedPassword
    await userToUpdate.save()

    return { message: 'Password reset successfully' }
  }

  async generateApiKey(currentUser: User) {
    const apiKey = uuidv4()
    const hashedApiKey = await bcrypt.hash(apiKey, 10)

    const newApiKey = new this.apiKeyModel({
      apiKey: apiKey.substr(0, 17) + '*'.repeat(18),
      hashedApiKey,
      user: currentUser._id,
    })

    await newApiKey.save()

    return { apiKey, message: 'Save this key, it wont be shown again ;)' }
  }

  async getUserApiKeys(currentUser: User) {
    return this.apiKeyModel.find({ user: currentUser._id }, null, {
      sort: { createdAt: -1 },
    })
  }

  async findApiKey(params) {
    return this.apiKeyModel.findOne(params)
  }

  async findApiKeyById(apiKeyId: string) {
    return this.apiKeyModel.findById(apiKeyId)
  }

  async deleteApiKey(apiKeyId: string) {
    const apiKey = await this.apiKeyModel.findOne({ _id: apiKeyId })
    if (!apiKey) {
      throw new HttpException(
        {
          error: 'Api key not found',
        },
        HttpStatus.NOT_FOUND,
      )
    }
    if (apiKey.usageCount > 0 && !apiKey.revokedAt) {
      throw new HttpException(
        { error: 'Api key cannot be deleted' },
        HttpStatus.BAD_REQUEST,
      )
    }

    await this.apiKeyModel.deleteOne({ _id: apiKeyId })
  }

  async revokeApiKey(apiKeyId: string) {
    const apiKey = await this.apiKeyModel.findById(apiKeyId)
    if (!apiKey) {
      throw new HttpException(
        { error: 'Api key not found' },
        HttpStatus.NOT_FOUND,
      )
    }
    apiKey.revokedAt = new Date()
    await apiKey.save()
  }

  async renameApiKey(apiKeyId: string, name: string) {
    const apiKey = await this.apiKeyModel.findById(apiKeyId)
    if (!apiKey) {
      throw new HttpException(
        { error: 'Api key not found' },
        HttpStatus.NOT_FOUND,
      )
    }
    apiKey.name = name
    await apiKey.save()
  }

  async trackAccessLog({ request }) {
    const { apiKey, user, method, url, ip, headers } = request
    const userAgent = headers['user-agent']

    if (request.apiKey) {
      this.apiKeyModel
        .findByIdAndUpdate(
          apiKey._id,
          { $inc: { usageCount: 1 }, lastUsedAt: new Date() },
          { new: true },
        )
        .exec()
        .catch((e) => {
          console.log('Failed to update api key usage count')
          console.log(e)
        })
    }

    this.accessLogModel
      .create({
        apiKey,
        user,
        method,
        url: url.split('?')[0],
        ip:
          request.headers['x-forwarded-for'] ||
          request.connection.remoteAddress ||
          ip,
        userAgent,
      })
      .catch((e) => {
        console.log('Failed to track access log')
        console.log(e)
      })
  }

  async validatePassword(password: string) {
    if (password.length < 6 || password.length > 128) {
      throw new HttpException(
        { error: 'Password must be between 6 and 128 characters' },
        HttpStatus.BAD_REQUEST,
      )
    }
  }
}
