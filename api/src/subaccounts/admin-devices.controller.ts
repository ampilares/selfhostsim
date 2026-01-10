import { Controller, Get, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/guards/auth.guard'
import { AdminGuard } from '../auth/guards/admin.guard'
import { SubaccountsService } from './subaccounts.service'

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AuthGuard, AdminGuard)
@Controller('admin')
export class AdminDevicesController {
  constructor(private readonly subaccountsService: SubaccountsService) {}

  @ApiOperation({ summary: 'List all devices (admin)' })
  @Get('/devices')
  async listDevices() {
    const data = await this.subaccountsService.listDevicesForLinking()
    return { data }
  }
}
