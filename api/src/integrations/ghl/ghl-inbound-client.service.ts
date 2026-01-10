import { Injectable } from '@nestjs/common'
import axios, { AxiosInstance } from 'axios'
import {
  InboundSmsDeliveryRequestDTO,
  InboundSmsDeliveryResultDTO,
} from './dtos/inbound-sms.dto'

@Injectable()
export class GhlInboundClientService {
  private readonly client: AxiosInstance

  constructor() {
    this.client = axios.create({
      timeout: Number(process.env.GHL_INBOUND_HTTP_TIMEOUT_MS || 8000),
      headers: { 'content-type': 'application/json' },
    })
  }

  async postInboundSms(
    payload: InboundSmsDeliveryRequestDTO,
  ): Promise<InboundSmsDeliveryResultDTO> {
    const baseUrl = process.env.GHL_SERVICE_BASE_URL
    const secret = process.env.GHL_INTERNAL_SECRET
    const headerName =
      process.env.GHL_INTERNAL_HEADER_NAME || 'x-internal-secret'

    if (!baseUrl) throw new Error('Missing GHL_SERVICE_BASE_URL')
    if (!secret) throw new Error('Missing GHL_INTERNAL_SECRET')

    const url = new URL(
      '/api/ghl/v1/internal/inbound-sms',
      baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`,
    ).toString()

    const res = await this.client.post(
      url,
      {
        locationId: payload.locationId,
        deviceId: payload.deviceId,
        smsId: payload.smsId,
        sender: payload.sender,
        message: payload.message,
        receivedAtInMillis: payload.receivedAtInMillis,
        conversationId: payload.conversationId,
        correlationId: payload.correlationId,
      },
      {
        headers: {
          [headerName]: secret,
        },
      },
    )

    const data = res?.data?.data || res?.data
    if (!data?.contactId || !data?.conversationId) {
      throw new Error(
        'Invalid response from GHL service: missing contactId/conversationId',
      )
    }
    return {
      contactId: data.contactId,
      conversationId: data.conversationId,
      messageId: data.messageId,
    }
  }
}
