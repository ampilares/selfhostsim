import { GhlInboundProcessor } from './ghl-inbound.processor'

describe('GhlInboundProcessor', () => {
  const mockClient: any = { postInboundSms: jest.fn() }
  const mockPointerService: any = {
    findByPhone: jest.fn(),
    upsertByPhone: jest.fn(),
  }
  const mockSyncService: any = {
    findByDedupeKey: jest.fn(),
    upsertOnEnqueue: jest.fn(),
    recordAttempt: jest.fn(),
    setLastError: jest.fn(),
    markFailed: jest.fn(),
    markSucceeded: jest.fn(),
  }
  const mockQueue: any = { enqueueInboundSms: jest.fn() }

  let processor: GhlInboundProcessor

  beforeEach(() => {
    jest.resetAllMocks()
    processor = new GhlInboundProcessor(
      mockClient,
      mockPointerService,
      mockSyncService,
      mockQueue,
    )
    process.env.GHL_INBOUND_MAX_ATTEMPTS = '3'
    process.env.GHL_INBOUND_RETRY_BASE_DELAY_MS = '1000'
    process.env.GHL_INBOUND_RETRY_MAX_DELAY_MS = '5000'
  })

  it('skips when sync status is succeeded', async () => {
    mockSyncService.findByDedupeKey.mockResolvedValueOnce({
      _id: 's1',
      status: 'succeeded',
      attemptCount: 1,
    })

    await processor.handleDeliverInboundSms({
      data: {
        locationId: 'loc',
        deviceId: 'dev',
        smsId: 'sms',
        sender: '+15551234567',
        message: 'hi',
        receivedAtInMillis: 1700000000000,
        correlationId: 'corr',
      },
    } as any)

    expect(mockClient.postInboundSms).not.toHaveBeenCalled()
  })

  it('re-enqueues with backoff when delivery fails and attempts remain', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0)

    const syncDoc = { _id: 's1', status: 'pending', attemptCount: 0 }
    mockSyncService.findByDedupeKey.mockResolvedValueOnce(syncDoc)
    mockSyncService.recordAttempt.mockResolvedValueOnce({
      ...syncDoc,
      attemptCount: 1,
    })

    mockPointerService.findByPhone.mockResolvedValueOnce({
      conversationId: 'conv1',
    })
    mockClient.postInboundSms.mockRejectedValueOnce(new Error('boom'))

    await processor.handleDeliverInboundSms({
      data: {
        locationId: 'loc',
        deviceId: 'dev',
        smsId: 'sms',
        sender: '+15551234567',
        message: 'hi',
        receivedAtInMillis: 1700000000000,
        correlationId: 'corr',
      },
    } as any)

    expect(mockSyncService.setLastError).toHaveBeenCalledWith(
      expect.objectContaining({ syncId: 's1' }),
    )
    expect(mockQueue.enqueueInboundSms).toHaveBeenCalledWith(
      expect.objectContaining({ locationId: 'loc', smsId: 'sms' }),
      expect.any(Number),
    )
    expect(mockSyncService.markFailed).not.toHaveBeenCalled()
  })

  it('marks failed when max attempts reached', async () => {
    const syncDoc = { _id: 's1', status: 'pending', attemptCount: 2 }
    mockSyncService.findByDedupeKey.mockResolvedValueOnce(syncDoc)
    mockSyncService.recordAttempt.mockResolvedValueOnce({
      ...syncDoc,
      attemptCount: 3,
    })

    mockPointerService.findByPhone.mockResolvedValueOnce(null)
    mockClient.postInboundSms.mockRejectedValueOnce(new Error('boom'))

    await processor.handleDeliverInboundSms({
      data: {
        locationId: 'loc',
        deviceId: 'dev',
        smsId: 'sms',
        sender: '+15551234567',
        message: 'hi',
        receivedAtInMillis: 1700000000000,
        correlationId: 'corr',
      },
    } as any)

    expect(mockSyncService.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({ syncId: 's1' }),
    )
    expect(mockQueue.enqueueInboundSms).not.toHaveBeenCalled()
  })

  it('marks failed without retry when GHL service returns 424', async () => {
    const syncDoc = { _id: 's1', status: 'pending', attemptCount: 0 }
    mockSyncService.findByDedupeKey.mockResolvedValueOnce(syncDoc)
    mockSyncService.recordAttempt.mockResolvedValueOnce({
      ...syncDoc,
      attemptCount: 1,
    })

    mockPointerService.findByPhone.mockResolvedValueOnce(null)
    mockClient.postInboundSms.mockRejectedValueOnce({
      response: {
        status: 424,
        data: { message: 'OAuth token is missing required scopes' },
      },
    })

    await processor.handleDeliverInboundSms({
      data: {
        locationId: 'loc',
        deviceId: 'dev',
        smsId: 'sms',
        sender: '+15551234567',
        message: 'hi',
        receivedAtInMillis: 1700000000000,
        correlationId: 'corr',
      },
    } as any)

    expect(mockSyncService.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({ syncId: 's1' }),
    )
    expect(mockQueue.enqueueInboundSms).not.toHaveBeenCalled()
  })
})
