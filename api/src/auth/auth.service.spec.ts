import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { JwtService } from '@nestjs/jwt'
import { HttpException } from '@nestjs/common'
import { AuthService } from './auth.service'
import { UsersService } from '../users/users.service'
import { ApiKey } from './schemas/api-key.schema'
import { AccessLog } from './schemas/access-log.schema'

describe('AuthService', () => {
  let service: AuthService

  const mockApiKeyModel = {
    findOne: jest.fn(),
    deleteOne: jest.fn(),
  }

  const mockAccessLogModel = {
    create: jest.fn(),
  }

  const mockUsersService = {}

  const mockJwtService = {
    sign: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: getModelToken(ApiKey.name), useValue: mockApiKeyModel },
        { provide: getModelToken(AccessLog.name), useValue: mockAccessLogModel },
      ],
    }).compile()

    service = module.get<AuthService>(AuthService)

    jest.clearAllMocks()
  })

  describe('deleteApiKey', () => {
    const apiKeyId = 'api-key-id'

    it('throws when api key does not exist', async () => {
      mockApiKeyModel.findOne.mockResolvedValue(null)

      await expect(service.deleteApiKey(apiKeyId)).rejects.toThrow(HttpException)
      expect(mockApiKeyModel.deleteOne).not.toHaveBeenCalled()
    })

    it('throws when api key was used and not revoked', async () => {
      mockApiKeyModel.findOne.mockResolvedValue({
        _id: apiKeyId,
        usageCount: 1,
        revokedAt: null,
      })

      await expect(service.deleteApiKey(apiKeyId)).rejects.toThrow(HttpException)
      expect(mockApiKeyModel.deleteOne).not.toHaveBeenCalled()
    })

    it('deletes when api key was used but revoked', async () => {
      mockApiKeyModel.findOne.mockResolvedValue({
        _id: apiKeyId,
        usageCount: 2,
        revokedAt: new Date(),
      })
      mockApiKeyModel.deleteOne.mockResolvedValue({ deletedCount: 1 })

      await service.deleteApiKey(apiKeyId)

      expect(mockApiKeyModel.deleteOne).toHaveBeenCalledWith({ _id: apiKeyId })
    })

    it('deletes when api key is unused', async () => {
      mockApiKeyModel.findOne.mockResolvedValue({
        _id: apiKeyId,
        usageCount: 0,
      })
      mockApiKeyModel.deleteOne.mockResolvedValue({ deletedCount: 1 })

      await service.deleteApiKey(apiKeyId)

      expect(mockApiKeyModel.deleteOne).toHaveBeenCalledWith({ _id: apiKeyId })
    })
  })
})
