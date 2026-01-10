import axios from 'axios'
import { GhlInboundClientService } from './ghl-inbound-client.service'

jest.mock('axios')

describe('GhlInboundClientService', () => {
  const post = jest.fn()

  beforeEach(() => {
    jest.resetAllMocks()
    ;(axios.create as any).mockReturnValue({ post })
    process.env.GHL_SERVICE_BASE_URL = 'http://localhost:3002'
    process.env.GHL_INTERNAL_SECRET = 'secret'
    process.env.GHL_INTERNAL_HEADER_NAME = 'x-internal-secret'
  })

  it('throws if base url missing', async () => {
    delete process.env.GHL_SERVICE_BASE_URL
    const service = new GhlInboundClientService()
    await expect(
      service.postInboundSms({
        locationId: 'loc',
        deviceId: 'dev',
        smsId: 'sms',
        sender: '+15551234567',
        message: 'hi',
        receivedAtInMillis: Date.now(),
        correlationId: 'corr',
      }),
    ).rejects.toThrow('Missing GHL_SERVICE_BASE_URL')
  })

  it('posts to internal endpoint with secret header', async () => {
    post.mockResolvedValueOnce({
      data: {
        data: { contactId: 'c1', conversationId: 'conv1', messageId: 'm1' },
      },
    })
    const service = new GhlInboundClientService()
    const res = await service.postInboundSms({
      locationId: 'loc',
      deviceId: 'dev',
      smsId: 'sms',
      sender: '+15551234567',
      message: 'hi',
      receivedAtInMillis: 1700000000000,
      correlationId: 'corr',
    })
    expect(res).toEqual({
      contactId: 'c1',
      conversationId: 'conv1',
      messageId: 'm1',
    })
    expect(post).toHaveBeenCalledWith(
      'http://localhost:3002/api/ghl/v1/internal/inbound-sms',
      expect.objectContaining({
        locationId: 'loc',
        smsId: 'sms',
        correlationId: 'corr',
      }),
      expect.objectContaining({
        headers: { 'x-internal-secret': 'secret' },
      }),
    )
  })
})
