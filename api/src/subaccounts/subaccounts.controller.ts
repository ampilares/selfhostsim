import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/guards/auth.guard'
import { AdminGuard } from '../auth/guards/admin.guard'
import {
  CreateSubAccountDTO,
  LinkDeviceDTO,
  UpdateSubAccountDTO,
} from './subaccounts.dto'
import { SubaccountsService } from './subaccounts.service'

@ApiTags('subaccounts')
@ApiBearerAuth()
@UseGuards(AuthGuard, AdminGuard)
@Controller('subaccounts')
export class SubaccountsController {
  constructor(private readonly subaccountsService: SubaccountsService) {}

  @ApiOperation({ summary: 'List Sub-Accounts (admin)' })
  @Get()
  async list() {
    const data = await this.subaccountsService.listSubAccounts()
    return { data }
  }

  @ApiOperation({ summary: 'Create Sub-Account (admin)' })
  @Post()
  async create(@Body() dto: CreateSubAccountDTO) {
    const data = await this.subaccountsService.createSubAccount(dto)
    return { data }
  }

  @ApiOperation({ summary: 'Link Sub-Account to device (admin)' })
  @Put('/:subAccountId/device')
  async linkDevice(
    @Param('subAccountId') subAccountId: string,
    @Body() dto: LinkDeviceDTO,
  ) {
    const data = await this.subaccountsService.linkDevice(subAccountId, dto)
    return { data }
  }

  @ApiOperation({ summary: 'Unlink Sub-Account from device (admin)' })
  @Delete('/:subAccountId/device')
  async unlinkDevice(@Param('subAccountId') subAccountId: string) {
    const data = await this.subaccountsService.unlinkDevice(subAccountId)
    return { data }
  }

  @ApiOperation({ summary: 'Update Sub-Account (admin)' })
  @Patch('/:subAccountId')
  async update(
    @Param('subAccountId') subAccountId: string,
    @Body() dto: UpdateSubAccountDTO,
  ) {
    const data = await this.subaccountsService.updateSubAccount(
      subAccountId,
      dto,
    )
    return { data }
  }

  @ApiOperation({ summary: 'Delete Sub-Account (admin)' })
  @Delete('/:subAccountId')
  async delete(@Param('subAccountId') subAccountId: string) {
    const data = await this.subaccountsService.deleteSubAccount(subAccountId)
    return { data }
  }
}
