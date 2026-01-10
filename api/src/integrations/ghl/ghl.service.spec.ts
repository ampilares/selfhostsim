import { GhlService } from './ghl.service'

describe('GhlService', () => {
  const mockSubaccountsService: any = {
    recordRoutingFailure: jest.fn(),
    resolveLinkedDeviceByLocationId: jest.fn(),
  }
  const mockGatewayService: any = {
    sendSMS: jest.fn(),
  }
  const mockConversationPointerService: any = {
    updateConversationIdForKnownContact: jest.fn(),
    upsertByPhone: jest.fn(),
  }

  let service: GhlService

  beforeEach(() => {
    jest.resetAllMocks()
    service = new GhlService(
      mockSubaccountsService,
      mockGatewayService,
      mockConversationPointerService,
    )
  })

  it('rejects missing locationId', async () => {
    const res = await service.processProviderOutboundMessage({ type: 'SMS' })
    expect(res.status).toBe('rejected')
    expect(mockSubaccountsService.recordRoutingFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'invalid_payload_missing_locationId',
        locationId: undefined,
      }),
    )
    expect(
      mockSubaccountsService.resolveLinkedDeviceByLocationId,
    ).not.toHaveBeenCalled()
    expect(mockGatewayService.sendSMS).not.toHaveBeenCalled()
  })

  it('rejects unsupported type', async () => {
    const res = await service.processProviderOutboundMessage({
      locationId: 'loc1',
      type: 'EMAIL',
    })
    expect(res.status).toBe('rejected')
    expect(mockSubaccountsService.recordRoutingFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'unsupported_type',
        locationId: 'loc1',
      }),
    )
  })

  it('rejects missing message/phone', async () => {
    const res1 = await service.processProviderOutboundMessage({
      locationId: 'loc1',
      type: 'SMS',
      phone: '+15555555555',
    })
    expect(res1.status).toBe('rejected')
    expect(mockSubaccountsService.recordRoutingFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'invalid_payload_missing_message',
        locationId: 'loc1',
      }),
    )

    const res2 = await service.processProviderOutboundMessage({
      locationId: 'loc1',
      type: 'SMS',
      message: 'hi',
    })
    expect(res2.status).toBe('rejected')
    expect(mockSubaccountsService.recordRoutingFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'invalid_payload_missing_phone',
        locationId: 'loc1',
      }),
    )
  })

  it('rejects unknown location', async () => {
    mockSubaccountsService.resolveLinkedDeviceByLocationId.mockResolvedValue(
      null,
    )
    const res = await service.processProviderOutboundMessage({
      locationId: 'loc1',
      type: 'SMS',
      phone: '+15555555555',
      message: 'hello',
    })
    expect(res.status).toBe('rejected')
    expect(mockSubaccountsService.recordRoutingFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'unknown_location',
        locationId: 'loc1',
      }),
    )
  })

  it('rejects when no device link / device disabled', async () => {
    mockSubaccountsService.resolveLinkedDeviceByLocationId.mockResolvedValueOnce(
      {
        subAccount: { _id: 'sa1' },
        device: null,
      },
    )
    const res1 = await service.processProviderOutboundMessage({
      locationId: 'loc1',
      type: 'SMS',
      phone: '+15555555555',
      message: 'hello',
    })
    expect(res1.status).toBe('rejected')
    expect(mockSubaccountsService.recordRoutingFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'no_device_link',
        locationId: 'loc1',
      }),
    )

    mockSubaccountsService.resolveLinkedDeviceByLocationId.mockResolvedValueOnce(
      {
        subAccount: { _id: 'sa1' },
        device: { _id: 'dev1', enabled: false },
      },
    )
    const res2 = await service.processProviderOutboundMessage({
      locationId: 'loc1',
      type: 'SMS',
      phone: '+15555555555',
      message: 'hello',
    })
    expect(res2.status).toBe('rejected')
    expect(mockSubaccountsService.recordRoutingFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'device_disabled',
        locationId: 'loc1',
      }),
    )
  })

  it('accepts and sends when routable', async () => {
    mockSubaccountsService.resolveLinkedDeviceByLocationId.mockResolvedValue({
      subAccount: { _id: 'sa1' },
      device: { _id: 'dev1', enabled: true },
    })
    mockGatewayService.sendSMS.mockResolvedValue(undefined)

    const res = await service.processProviderOutboundMessage({
      locationId: 'loc1',
      type: 'SMS',
      phone: '+15555555555',
      message: 'hello',
      contactId: 'c1',
    })
    expect(res).toEqual({ status: 'accepted' })
    expect(mockGatewayService.sendSMS).toHaveBeenCalledWith(
      'dev1',
      expect.objectContaining({
        message: 'hello',
      }),
    )
    expect(mockConversationPointerService.upsertByPhone).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: 'loc1',
        contactId: 'c1',
      }),
    )
  })

  it('records send failure', async () => {
    mockSubaccountsService.resolveLinkedDeviceByLocationId.mockResolvedValue({
      subAccount: { _id: 'sa1' },
      device: { _id: 'dev1', enabled: true },
    })
    mockGatewayService.sendSMS.mockRejectedValue(new Error('boom'))

    const res = await service.processProviderOutboundMessage({
      locationId: 'loc1',
      type: 'SMS',
      phone: '+15555555555',
      message: 'hello',
      contactId: 'c1',
    })
    expect(res.status).toBe('rejected')
    expect(mockSubaccountsService.recordRoutingFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'send_failed',
        locationId: 'loc1',
      }),
    )
  })

  describe('processOutboundMessage', () => {
    it('rejects missing fields', async () => {
      const res = await service.processOutboundMessage({})
      expect(res.status).toBe('rejected')
    })

    it('updates pointer when valid', async () => {
      mockConversationPointerService.updateConversationIdForKnownContact.mockResolvedValueOnce(
        2,
      )
      const res = await service.processOutboundMessage({
        locationId: 'loc1',
        contactId: 'c1',
        conversationId: 'conv1',
      })
      expect(res).toEqual({ status: 'accepted', updatedCount: 2 })
      expect(
        mockConversationPointerService.updateConversationIdForKnownContact,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          locationId: 'loc1',
          contactId: 'c1',
          conversationId: 'conv1',
        }),
      )
    })
  })
})
