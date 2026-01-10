import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger'
import {
  LoginInputDTO,
  RegisterInputDTO,
  AdminResetPasswordInputDTO,
} from './auth.dto'
import { AuthGuard } from './guards/auth.guard'
import { AuthService } from './auth.service'
import { CanModifyApiKey } from './guards/can-modify-api-key.guard'
import { AdminGuard } from './guards/admin.guard'
import { CanAddDevicesGuard } from './guards/can-add-devices.guard'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @ApiOperation({ summary: 'Login' })
  @HttpCode(HttpStatus.OK)
  @Post('/login')
  async login(@Body() input: LoginInputDTO) {
    const data = await this.authService.login(input)
    return { data }
  }

  @ApiOperation({ summary: 'Register' })
  @Post('/register')
  async register(@Body() input: RegisterInputDTO) {
    const data = await this.authService.register(input)
    return { data }
  }

  @ApiOperation({ summary: 'Get current logged in user' })
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @Get('/who-am-i')
  async whoAmI(@Request() req) {
    return { data: req.user }
  }

  @ApiOperation({ summary: 'Update Profile' })
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @Patch('/update-profile')
  async updateProfile(
    @Body() input: { name: string; email: string },
    @Request() req,
  ) {
    return await this.authService.updateProfile(input, req.user)
  }

  @ApiOperation({ summary: 'Change Password' })
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @Post('/change-password')
  async changePassword(
    @Body() input: { oldPassword: string; newPassword: string },
    @Request() req,
  ) {
    return await this.authService.changePassword(input, req.user)
  }

  @ApiOperation({ summary: 'Admin Reset User Password' })
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(AuthGuard, AdminGuard)
  @Post('/admin/users/:userId/reset-password')
  async adminResetPassword(
    @Param('userId') userId: string,
    @Body() input: AdminResetPasswordInputDTO,
  ) {
    return await this.authService.adminResetPassword(userId, input)
  }

  @UseGuards(AuthGuard, CanAddDevicesGuard)
  @ApiOperation({ summary: 'Generate Api Key' })
  @ApiBearerAuth()
  @Post('/api-keys')
  async generateApiKey(@Request() req) {
    const { apiKey, message } = await this.authService.generateApiKey(req.user)
    return { data: apiKey, message }
  }

  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get Api Key List (masked***)' })
  @ApiBearerAuth()
  @Get('/api-keys')
  async getApiKey(@Request() req) {
    const data = await this.authService.getUserApiKeys(req.user)
    return { data }
  }

  @UseGuards(AuthGuard, CanModifyApiKey)
  @ApiOperation({ summary: 'Delete Api Key' })
  @ApiParam({ name: 'id', type: String })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Delete('/api-keys/:id')
  async deleteApiKey(@Param('id') id: string) {
    await this.authService.deleteApiKey(id)
    return { message: 'API Key Deleted' }
  }

  @UseGuards(AuthGuard, CanModifyApiKey)
  @ApiOperation({ summary: 'Revoke Api Key' })
  @ApiParam({ name: 'id', type: String })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Post('/api-keys/:id/revoke')
  async revokeApiKey(@Param('id') id: string) {
    await this.authService.revokeApiKey(id)
    return { message: 'API Key Revoked' }
  }

  @UseGuards(AuthGuard, CanModifyApiKey)
  @ApiOperation({ summary: 'Rename Api Key' })
  @ApiParam({ name: 'id', type: String })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Patch('/api-keys/:id/rename')
  async renameApiKey(@Param('id') id: string, @Body() input: { name: string }) {
    await this.authService.renameApiKey(id, input.name)
    return { message: 'API Key Renamed' }
  }

}
