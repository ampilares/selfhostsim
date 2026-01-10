import { ConversationPointerService } from './conversation-pointer.service'

describe('ConversationPointerService', () => {
  const mockPointerModel: any = {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateMany: jest.fn(),
  }

  let service: ConversationPointerService

  beforeEach(() => {
    jest.resetAllMocks()
    service = new ConversationPointerService(mockPointerModel)
  })

  it('findByPhone queries by locationId + normalizedPhone', async () => {
    mockPointerModel.findOne.mockReturnValue({
      lean: () => ({ exec: () => ({}) }),
    })
    await service.findByPhone('loc1', '+15551234567')
    expect(mockPointerModel.findOne).toHaveBeenCalledWith({
      locationId: 'loc1',
      normalizedPhone: '+15551234567',
    })
  })

  it('upsertByPhone upserts and sets on insert', async () => {
    mockPointerModel.findOneAndUpdate.mockResolvedValue({ _id: 'p1' })
    const res = await service.upsertByPhone({
      locationId: 'loc1',
      normalizedPhone: '+15551234567',
      rawPhone: '555-123-4567',
      contactId: 'c1',
      conversationId: 'conv1',
      source: 'test',
      observedAt: new Date('2025-01-01T00:00:00.000Z'),
    })
    expect(res).toEqual({ _id: 'p1' })
    expect(mockPointerModel.findOneAndUpdate).toHaveBeenCalledWith(
      { locationId: 'loc1', normalizedPhone: '+15551234567' },
      expect.objectContaining({
        $setOnInsert: { locationId: 'loc1', normalizedPhone: '+15551234567' },
      }),
      expect.objectContaining({ upsert: true, new: true }),
    )
  })

  it('updateConversationIdForKnownContact updates matching records', async () => {
    mockPointerModel.updateMany.mockResolvedValue({ modifiedCount: 2 })
    const modified = await service.updateConversationIdForKnownContact({
      locationId: 'loc1',
      contactId: 'c1',
      conversationId: 'conv1',
      source: 'webhook',
      observedAt: new Date('2025-01-01T00:00:00.000Z'),
    })
    expect(modified).toBe(2)
    expect(mockPointerModel.updateMany).toHaveBeenCalledWith(
      { locationId: 'loc1', contactId: 'c1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          conversationId: 'conv1',
          source: 'webhook',
        }),
      }),
    )
  })
})
