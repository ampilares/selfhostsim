import { HttpException } from '@nestjs/common'
import mongoose from 'mongoose'
import { SubaccountsService } from './subaccounts.service'

describe('SubaccountsService', () => {
  const mockSubAccountModel: any = {
    create: jest.fn(),
    find: jest.fn(),
    findById: jest.fn(),
    findByIdAndDelete: jest.fn(),
  }
  const mockLinkModel: any = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    findOneAndDelete: jest.fn(),
  }
  const mockDeviceModel: any = {
    find: jest.fn(),
    findById: jest.fn(),
  }
  const mockRoutingFailureModel: any = {
    create: jest.fn(),
  }

  let service: SubaccountsService

  beforeEach(() => {
    jest.resetAllMocks()
    service = new SubaccountsService(
      mockSubAccountModel,
      mockLinkModel,
      mockDeviceModel,
      mockRoutingFailureModel,
    )
  })

  describe('createSubAccount', () => {
    it('rejects empty name', async () => {
      await expect(
        service.createSubAccount({ name: '', locationId: 'loc' }),
      ).rejects.toBeInstanceOf(HttpException)
    })

    it('rejects empty locationId', async () => {
      await expect(
        service.createSubAccount({ name: 'A', locationId: '' }),
      ).rejects.toBeInstanceOf(HttpException)
    })

    it('handles duplicate locationId', async () => {
      mockSubAccountModel.create.mockRejectedValue({ code: 11000 })
      await expect(
        service.createSubAccount({ name: 'A', locationId: 'loc' }),
      ).rejects.toBeInstanceOf(HttpException)
    })
  })

  describe('linkDevice', () => {
    it('rejects invalid subAccountId', async () => {
      await expect(
        service.linkDevice('bad', {
          deviceId: new mongoose.Types.ObjectId().toString(),
        }),
      ).rejects.toBeInstanceOf(HttpException)
    })

    it('rejects invalid deviceId', async () => {
      await expect(
        service.linkDevice(new mongoose.Types.ObjectId().toString(), {
          deviceId: 'bad',
        }),
      ).rejects.toBeInstanceOf(HttpException)
    })

    it('rejects missing subaccount', async () => {
      mockSubAccountModel.findById.mockResolvedValue(null)
      await expect(
        service.linkDevice(new mongoose.Types.ObjectId().toString(), {
          deviceId: new mongoose.Types.ObjectId().toString(),
        }),
      ).rejects.toBeInstanceOf(HttpException)
    })

    it('rejects when subaccount already linked', async () => {
      mockSubAccountModel.findById.mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
      })
      mockLinkModel.findOne.mockResolvedValueOnce({ _id: 'link1' })

      await expect(
        service.linkDevice(new mongoose.Types.ObjectId().toString(), {
          deviceId: new mongoose.Types.ObjectId().toString(),
        }),
      ).rejects.toBeInstanceOf(HttpException)
    })

    it('rejects when device already linked', async () => {
      mockSubAccountModel.findById.mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
      })
      mockLinkModel.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ _id: 'link2' })

      await expect(
        service.linkDevice(new mongoose.Types.ObjectId().toString(), {
          deviceId: new mongoose.Types.ObjectId().toString(),
        }),
      ).rejects.toBeInstanceOf(HttpException)
    })

    it('creates link when valid', async () => {
      const subAccountId = new mongoose.Types.ObjectId().toString()
      const deviceId = new mongoose.Types.ObjectId().toString()

      mockSubAccountModel.findById.mockResolvedValue({ _id: subAccountId })
      mockLinkModel.findOne.mockResolvedValue(null)
      mockDeviceModel.findById.mockResolvedValue({
        _id: deviceId,
        user: 'user1',
      })
      mockLinkModel.create.mockResolvedValue({ _id: 'newlink' })

      const created = await service.linkDevice(subAccountId, { deviceId })
      expect(created).toEqual({ _id: 'newlink' })
      expect(mockLinkModel.create).toHaveBeenCalledWith({
        subAccount: subAccountId,
        device: deviceId,
        deviceUser: 'user1',
      })
    })
  })

  describe('updateSubAccount', () => {
    it('rejects invalid subAccountId', async () => {
      await expect(
        service.updateSubAccount('bad', { name: 'A' }),
      ).rejects.toBeInstanceOf(HttpException)
    })

    it('rejects when no fields provided', async () => {
      const doc: any = { save: jest.fn() }
      mockSubAccountModel.findById.mockResolvedValue(doc)
      await expect(
        service.updateSubAccount(new mongoose.Types.ObjectId().toString(), {}),
      ).rejects.toBeInstanceOf(HttpException)
    })

    it('handles duplicate locationId on save', async () => {
      const doc: any = { save: jest.fn().mockRejectedValue({ code: 11000 }) }
      mockSubAccountModel.findById.mockResolvedValue(doc)
      await expect(
        service.updateSubAccount(new mongoose.Types.ObjectId().toString(), {
          locationId: 'loc1',
        }),
      ).rejects.toBeInstanceOf(HttpException)
    })
  })

  describe('unlinkDevice', () => {
    it('returns unlinked false when no link', async () => {
      mockLinkModel.findOneAndDelete.mockResolvedValue(null)
      const res = await service.unlinkDevice(
        new mongoose.Types.ObjectId().toString(),
      )
      expect(res).toEqual({ unlinked: false })
    })
  })

  describe('deleteSubAccount', () => {
    it('deletes subaccount and unlinks device', async () => {
      const id = new mongoose.Types.ObjectId().toString()
      mockSubAccountModel.findById.mockResolvedValue({ _id: id })
      mockLinkModel.findOneAndDelete.mockResolvedValue({ _id: 'link1' })
      mockSubAccountModel.findByIdAndDelete.mockResolvedValue({ _id: id })

      const res = await service.deleteSubAccount(id)
      expect(res).toEqual({ deleted: true })
      expect(mockLinkModel.findOneAndDelete).toHaveBeenCalled()
      expect(mockSubAccountModel.findByIdAndDelete).toHaveBeenCalledWith(id)
    })
  })

  describe('resolveLocationIdByDeviceId', () => {
    it('rejects invalid deviceId', async () => {
      await expect(
        service.resolveLocationIdByDeviceId('bad'),
      ).rejects.toBeInstanceOf(HttpException)
    })

    it('returns null when no device link exists', async () => {
      mockLinkModel.findOne.mockReturnValueOnce({
        lean: jest.fn().mockResolvedValueOnce(null),
      })
      const res = await service.resolveLocationIdByDeviceId(
        new mongoose.Types.ObjectId().toString(),
      )
      expect(res).toBeNull()
    })

    it('returns locationId when linked', async () => {
      const deviceId = new mongoose.Types.ObjectId().toString()
      const subAccountId = new mongoose.Types.ObjectId().toString()

      mockLinkModel.findOne.mockReturnValueOnce({
        lean: jest.fn().mockResolvedValueOnce({ subAccount: subAccountId }),
      })
      mockSubAccountModel.findById.mockReturnValueOnce({
        lean: jest.fn().mockResolvedValueOnce({ locationId: 'loc1' }),
      })

      const res = await service.resolveLocationIdByDeviceId(deviceId)
      expect(res).toBe('loc1')
    })
  })
})
