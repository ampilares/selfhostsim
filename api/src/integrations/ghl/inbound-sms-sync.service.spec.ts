import { InboundSmsSyncService } from './inbound-sms-sync.service'

describe('InboundSmsSyncService', () => {
  const mockSyncModel: any = {
    findOneAndUpdate: jest.fn(),
  }

  let service: InboundSmsSyncService

  beforeEach(() => {
    jest.resetAllMocks()
    service = new InboundSmsSyncService(mockSyncModel)
  })

  it('upsertOnEnqueue does not update normalizedPhone in both $set and $setOnInsert', async () => {
    mockSyncModel.findOneAndUpdate.mockResolvedValueOnce({ _id: 's1' })

    await service.upsertOnEnqueue({
      smsId: '656565656565656565656565',
      locationId: 'loc1',
      normalizedPhone: '+15551234567',
      dedupeKey: 'd1',
    })

    const [, update] = mockSyncModel.findOneAndUpdate.mock.calls[0]
    expect(update.$set.normalizedPhone).toBe('+15551234567')
    expect(update.$setOnInsert.normalizedPhone).toBeUndefined()
  })
})

