import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common'
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger'
import { InternalSecretGuard } from '../../auth/guards/internal-secret.guard'
import { GhlService } from './ghl.service'

@ApiTags('internal-ghl')
@ApiHeader({
  name: 'x-internal-secret',
  required: true,
  description:
    'Internal secret header (name configurable via env). Required for all endpoints under /internal/ghl.',
})
@UseGuards(InternalSecretGuard)
@Controller('internal/ghl')
export class GhlController {
  constructor(private readonly ghlService: GhlService) {}

  @ApiOperation({ summary: 'Process provider outbound message (internal)' })
  @HttpCode(HttpStatus.ACCEPTED)
  @Post('/provider-outbound-message')
  async processProviderOutboundMessage(@Body() payload: Record<string, any>) {
    const data = await this.ghlService.processProviderOutboundMessage(payload)
    return { data }
  }

  @ApiOperation({ summary: 'Process outbound message webhook (internal)' })
  @HttpCode(HttpStatus.ACCEPTED)
  @Post('/outbound-message')
  async processOutboundMessage(@Body() payload: Record<string, any>) {
    const data = await this.ghlService.processOutboundMessage(payload)
    return { data }
  }
}
