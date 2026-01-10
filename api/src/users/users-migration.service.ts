import { InjectModel } from '@nestjs/mongoose'
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { Model } from 'mongoose'
import { User, UserDocument } from './schemas/user.schema'
import { UserRole } from './user-roles.enum'
import {
  USERNAME_MAX_LENGTH,
  isReservedUsername,
  normalizeUsername,
} from './usernames'
import {
  extractEmailLocalPart,
  normalizeDerivedUsername,
} from './username-derivation'

@Injectable()
export class UsersMigrationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(UsersMigrationService.name)

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async onApplicationBootstrap() {
    await this.ensureUsernameIndex()
    await this.dropLegacyEmailIndex()
    await this.migrateLegacyUsers()
    await this.backfillDeviceAccess()
  }

  async migrateLegacyUsers() {
    const cursor = this.userModel
      .find({
        $or: [
          { username: { $exists: false } },
          { username: null },
          { username: '' },
        ],
      })
      .cursor()

    let migrated = 0
    for await (const user of cursor) {
      const legacyEmail = (user as any).email as string | undefined
      const derived = legacyEmail
        ? normalizeDerivedUsername(extractEmailLocalPart(legacyEmail))
        : ''

      const base = this.applyReservedFallback(
        derived || this.buildFallbackFromId(user._id.toString()),
      )
      const username = await this.ensureUniqueUsername(base, user._id.toString())

      await this.userModel.updateOne(
        { _id: user._id },
        {
          $set: { username },
          $unset: { email: '', emailVerifiedAt: '' },
        },
      )

      migrated += 1
    }

    if (migrated > 0) {
      this.logger.log(`Migrated ${migrated} users to username login`)
    }
  }

  async backfillDeviceAccess() {
    const result = await this.userModel.updateMany(
      {
        role: { $ne: UserRole.ADMIN },
        $or: [
          { canAddDevices: { $exists: false } },
          { canAddDevices: null },
        ],
      },
      {
        $set: {
          canAddDevices: true,
          canAddDevicesUpdatedAt: new Date(),
        },
      },
    )

    if (result.modifiedCount > 0) {
      this.logger.log(
        `Backfilled canAddDevices for ${result.modifiedCount} users`,
      )
    }
  }

  private applyReservedFallback(username: string): string {
    const normalized = normalizeUsername(username)
    if (isReservedUsername(normalized)) {
      return `${normalized}-user`
    }
    return normalized
  }

  private buildFallbackFromId(id: string): string {
    const suffix = id.slice(-6)
    return `user-${suffix}`
  }

  private async ensureUniqueUsername(
    base: string,
    userId: string,
  ): Promise<string> {
    let candidate = base
    let suffixLength = 6

    while (
      await this.userModel.exists({
        username: candidate,
        _id: { $ne: userId },
      })
    ) {
      const suffix = userId.slice(-suffixLength)
      const baseTrimmed = candidate.slice(
        0,
        USERNAME_MAX_LENGTH - (suffix.length + 1),
      )
      candidate = `${baseTrimmed}-${suffix}`
      suffixLength = Math.min(userId.length, suffixLength + 2)
    }

    return candidate
  }

  private async ensureUsernameIndex() {
    try {
      await this.userModel.collection.createIndex(
        { username: 1 },
        { unique: true },
      )
    } catch (error) {
      this.logger.warn(
        `Failed to ensure username index: ${error?.message || error}`,
      )
    }
  }

  private async dropLegacyEmailIndex() {
    try {
      const indexes = await this.userModel.collection.indexes()
      const emailIndex = indexes.find((index) => index.key?.email === 1)
      if (emailIndex?.name) {
        await this.userModel.collection.dropIndex(emailIndex.name)
      }
    } catch (error) {
      this.logger.warn(
        `Failed to drop legacy email index: ${error?.message || error}`,
      )
    }
  }
}
