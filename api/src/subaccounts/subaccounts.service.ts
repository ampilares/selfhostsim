import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import mongoose, { Model } from 'mongoose'
import { Device, DeviceDocument } from '../gateway/schemas/device.schema'
import { SubAccount, SubAccountDocument } from './schemas/subaccount.schema'
import {
  SubAccountDeviceLink,
  SubAccountDeviceLinkDocument,
} from './schemas/subaccount-device-link.schema'
import {
  CreateSubAccountDTO,
  LinkDeviceDTO,
  UpdateSubAccountDTO,
} from './subaccounts.dto'
import {
  RoutingFailure,
  RoutingFailureDocument,
} from './schemas/routing-failure.schema'

@Injectable()
export class SubaccountsService {
  private readonly logger = new Logger(SubaccountsService.name)

  constructor(
    @InjectModel(SubAccount.name)
    private subAccountModel: Model<SubAccountDocument>,
    @InjectModel(SubAccountDeviceLink.name)
    private subAccountDeviceLinkModel: Model<SubAccountDeviceLinkDocument>,
    @InjectModel(Device.name)
    private deviceModel: Model<DeviceDocument>,
    @InjectModel(RoutingFailure.name)
    private routingFailureModel: Model<RoutingFailureDocument>,
  ) {}

  async createSubAccount(dto: CreateSubAccountDTO) {
    const name = dto?.name?.trim()
    const locationId = dto?.locationId?.trim()

    if (!name) {
      throw new HttpException(
        { error: 'Sub-Account name is required' },
        HttpStatus.BAD_REQUEST,
      )
    }
    if (!locationId) {
      throw new HttpException(
        { error: 'locationId is required' },
        HttpStatus.BAD_REQUEST,
      )
    }

    try {
      const created = await this.subAccountModel.create({ name, locationId })
      this.logger.log(
        `Created Sub-Account subAccountId=${created?._id?.toString()} locationId=${locationId}`,
      )
      return created
    } catch (e: any) {
      if (e?.code === 11000) {
        this.logger.warn(
          `Duplicate locationId=${locationId} on createSubAccount`,
        )
        throw new HttpException(
          { error: 'A Sub-Account with this locationId already exists' },
          HttpStatus.BAD_REQUEST,
        )
      }
      throw e
    }
  }

  async listSubAccounts() {
    const subAccounts = await this.subAccountModel
      .find()
      .sort({ createdAt: -1 })
      .lean()
    const subAccountIds = subAccounts.map((s) => s._id)

    const links = await this.subAccountDeviceLinkModel
      .find({ subAccount: { $in: subAccountIds } })
      .populate('device')
      .populate('deviceUser')
      .lean()

    const linkBySubAccountId = new Map<string, any>()
    for (const link of links) {
      linkBySubAccountId.set(link.subAccount.toString(), link)
    }

    return subAccounts.map((sa: any) => {
      const link = linkBySubAccountId.get(sa._id.toString())
      return {
        ...sa,
        linkedDevice: link?.device
          ? {
              _id: link.device._id,
              enabled: link.device.enabled,
              brand: link.device.brand,
              model: link.device.model,
              manufacturer: link.device.manufacturer,
            }
          : null,
        linkedDeviceUser: link?.deviceUser
          ? {
              _id: link.deviceUser._id,
              name: link.deviceUser.name,
              username: link.deviceUser.username,
            }
          : null,
      }
    })
  }

  async listDevicesForLinking() {
    const devices = await this.deviceModel
      .find()
      .sort({ createdAt: -1 })
      .populate('user')
      .lean()

    const links = await this.subAccountDeviceLinkModel.find().lean()
    const linkedDeviceIds = new Set(links.map((l) => l.device.toString()))
    const linkByDeviceId = new Map<string, any>()
    for (const link of links) {
      linkByDeviceId.set(link.device.toString(), link)
    }

    return devices.map((device: any) => {
      const isLinked = linkedDeviceIds.has(device._id.toString())
      const link = linkByDeviceId.get(device._id.toString())
      const user = device.user
      return {
        _id: device._id,
        enabled: device.enabled,
        brand: device.brand,
        model: device.model,
        manufacturer: device.manufacturer,
        user: user
          ? { _id: user._id, name: user.name, username: user.username }
          : null,
        isLinked,
        linkedSubAccountId: link?.subAccount
          ? link.subAccount.toString()
          : null,
      }
    })
  }

  async linkDevice(subAccountId: string, dto: LinkDeviceDTO) {
    if (!mongoose.Types.ObjectId.isValid(subAccountId)) {
      throw new HttpException(
        { error: 'Invalid subAccountId' },
        HttpStatus.BAD_REQUEST,
      )
    }
    const deviceId = dto?.deviceId
    if (!mongoose.Types.ObjectId.isValid(deviceId)) {
      throw new HttpException(
        { error: 'Invalid deviceId' },
        HttpStatus.BAD_REQUEST,
      )
    }

    const subAccount = await this.subAccountModel.findById(subAccountId)
    if (!subAccount) {
      throw new HttpException(
        { error: 'Sub-Account not found' },
        HttpStatus.NOT_FOUND,
      )
    }

    const existingForSubAccount = await this.subAccountDeviceLinkModel.findOne({
      subAccount: new mongoose.Types.ObjectId(subAccountId),
    })
    if (existingForSubAccount) {
      throw new HttpException(
        {
          error:
            'This Sub-Account is already linked. Unlink it first to change devices.',
        },
        HttpStatus.BAD_REQUEST,
      )
    }

    const existingForDevice = await this.subAccountDeviceLinkModel.findOne({
      device: new mongoose.Types.ObjectId(deviceId),
    })
    if (existingForDevice) {
      throw new HttpException(
        { error: 'This device is already linked to another Sub-Account.' },
        HttpStatus.BAD_REQUEST,
      )
    }

    const device = await this.deviceModel.findById(deviceId)
    if (!device) {
      throw new HttpException(
        { error: 'Device not found' },
        HttpStatus.NOT_FOUND,
      )
    }

    const created = await this.subAccountDeviceLinkModel.create({
      subAccount: subAccount._id,
      device: device._id,
      deviceUser: (device as any).user,
    })

    this.logger.log(
      `Linked Sub-Account subAccountId=${subAccountId} deviceId=${deviceId}`,
    )
    return created
  }

  async unlinkDevice(subAccountId: string) {
    if (!mongoose.Types.ObjectId.isValid(subAccountId)) {
      throw new HttpException(
        { error: 'Invalid subAccountId' },
        HttpStatus.BAD_REQUEST,
      )
    }

    const deleted = await this.subAccountDeviceLinkModel.findOneAndDelete({
      subAccount: new mongoose.Types.ObjectId(subAccountId),
    })

    this.logger.log(
      `Unlink Sub-Account subAccountId=${subAccountId} unlinked=${Boolean(deleted)}`,
    )
    return { unlinked: Boolean(deleted) }
  }

  async updateSubAccount(subAccountId: string, dto: UpdateSubAccountDTO) {
    if (!mongoose.Types.ObjectId.isValid(subAccountId)) {
      throw new HttpException(
        { error: 'Invalid subAccountId' },
        HttpStatus.BAD_REQUEST,
      )
    }

    const subAccount = await this.subAccountModel.findById(subAccountId)
    if (!subAccount) {
      throw new HttpException(
        { error: 'Sub-Account not found' },
        HttpStatus.NOT_FOUND,
      )
    }

    const hasName = Object.prototype.hasOwnProperty.call(dto || {}, 'name')
    const hasLocationId = Object.prototype.hasOwnProperty.call(
      dto || {},
      'locationId',
    )
    if (!hasName && !hasLocationId) {
      throw new HttpException(
        { error: 'No fields to update' },
        HttpStatus.BAD_REQUEST,
      )
    }

    if (hasName) {
      const name = dto?.name?.trim()
      if (!name) {
        throw new HttpException(
          { error: 'Sub-Account name is required' },
          HttpStatus.BAD_REQUEST,
        )
      }
      ;(subAccount as any).name = name
    }

    if (hasLocationId) {
      const locationId = dto?.locationId?.trim()
      if (!locationId) {
        throw new HttpException(
          { error: 'locationId is required' },
          HttpStatus.BAD_REQUEST,
        )
      }
      ;(subAccount as any).locationId = locationId
    }

    try {
      await (subAccount as any).save()
      this.logger.log(`Updated Sub-Account subAccountId=${subAccountId}`)
      return subAccount
    } catch (e: any) {
      if (e?.code === 11000) {
        this.logger.warn(
          `Duplicate locationId on updateSubAccount subAccountId=${subAccountId}`,
        )
        throw new HttpException(
          { error: 'A Sub-Account with this locationId already exists' },
          HttpStatus.BAD_REQUEST,
        )
      }
      throw e
    }
  }

  async deleteSubAccount(subAccountId: string) {
    if (!mongoose.Types.ObjectId.isValid(subAccountId)) {
      throw new HttpException(
        { error: 'Invalid subAccountId' },
        HttpStatus.BAD_REQUEST,
      )
    }

    const subAccount = await this.subAccountModel.findById(subAccountId)
    if (!subAccount) {
      throw new HttpException(
        { error: 'Sub-Account not found' },
        HttpStatus.NOT_FOUND,
      )
    }

    await this.subAccountDeviceLinkModel.findOneAndDelete({
      subAccount: new mongoose.Types.ObjectId(subAccountId),
    })
    await this.subAccountModel.findByIdAndDelete(subAccountId)

    this.logger.log(`Deleted Sub-Account subAccountId=${subAccountId}`)
    return { deleted: true }
  }

  async relinkDevice(subAccountId: string, dto: LinkDeviceDTO) {
    await this.unlinkDevice(subAccountId)
    return this.linkDevice(subAccountId, dto)
  }

  async resolveLinkedDeviceByLocationId(locationId: string) {
    const normalized = locationId?.trim()
    if (!normalized) {
      throw new HttpException(
        { error: 'locationId is required' },
        HttpStatus.BAD_REQUEST,
      )
    }

    const subAccount = await this.subAccountModel
      .findOne({ locationId: normalized })
      .lean()
    if (!subAccount) {
      this.logger.warn(
        `Resolve failed: no Sub-Account for locationId=${normalized}`,
      )
      return null
    }

    const link = await this.subAccountDeviceLinkModel
      .findOne({ subAccount: subAccount._id })
      .lean()
    if (!link) {
      this.logger.warn(
        `Resolve failed: no device link for subAccountId=${subAccount._id?.toString()} locationId=${normalized}`,
      )
      return { subAccount, link: null, device: null }
    }

    const device = await this.deviceModel.findById(link.device).lean()
    this.logger.log(
      `Resolved device for locationId=${normalized} subAccountId=${subAccount._id?.toString()} deviceId=${device?._id?.toString()}`,
    )
    return { subAccount, link, device }
  }

  async resolveLocationIdByDeviceId(deviceId: string): Promise<string | null> {
    if (!mongoose.Types.ObjectId.isValid(deviceId)) {
      throw new HttpException(
        { error: 'Invalid deviceId' },
        HttpStatus.BAD_REQUEST,
      )
    }

    const link = await this.subAccountDeviceLinkModel
      .findOne({ device: new mongoose.Types.ObjectId(deviceId) })
      .lean()
    if (!link) return null

    const subAccount = await this.subAccountModel
      .findById(link.subAccount)
      .lean()
    return subAccount?.locationId || null
  }

  async recordRoutingFailure(params: {
    source: string
    locationId?: string
    reason: string
    receivedAt: Date
    rawPayload?: Record<string, any>
  }) {
    this.logger.warn(
      `Routing failure source=${params.source} reason=${params.reason} locationId=${params.locationId || '(missing)'}`,
    )
    return this.routingFailureModel.create(params)
  }
}
