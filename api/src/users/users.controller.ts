import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/guards/auth.guard'
import { AdminGuard } from '../auth/guards/admin.guard'
import { UsersService } from './users.service'
import { ListUsersQueryDTO, UpdateDeviceAccessInputDTO } from './users.dto'

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(AuthGuard, AdminGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({ summary: 'List users (admin-only)' })
  @Get()
  async listUsers(@Query() query: ListUsersQueryDTO) {
    const data = await this.usersService.listUsers(
      Number(query.page),
      Number(query.limit),
    )
    return { data }
  }

  @ApiOperation({ summary: 'Update device access for user (admin-only)' })
  @HttpCode(HttpStatus.OK)
  @Patch('/:userId/device-access')
  async updateDeviceAccess(
    @Param('userId') userId: string,
    @Body() input: UpdateDeviceAccessInputDTO,
    @Request() req,
  ) {
    const data = await this.usersService.updateDeviceAccess(
      userId,
      input.enabled,
      req.user,
    )
    return { data }
  }
}
