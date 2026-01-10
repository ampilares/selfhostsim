import { forwardRef, Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { MongooseModule } from '@nestjs/mongoose'
import { PassportModule } from '@nestjs/passport'
import { UsersModule } from '../users/users.module'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { JwtStrategy } from './jwt.strategy'
import { ApiKey, ApiKeySchema } from './schemas/api-key.schema'
import { AccessLog, AccessLogSchema } from './schemas/access-log.schema'
import { AuthGuard } from './guards/auth.guard'
import { OptionalAuthGuard } from './guards/optional-auth.guard'
import { CanAddDevicesGuard } from './guards/can-add-devices.guard'
import { AdminGuard } from './guards/admin.guard'

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: ApiKey.name,
        schema: ApiKeySchema,
      },
      {
        name: AccessLog.name,
        schema: AccessLogSchema,
      },
    ]),
    forwardRef(() => UsersModule),
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: process.env.JWT_EXPIRATION || '60d' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    AuthGuard,
    AdminGuard,
    OptionalAuthGuard,
    CanAddDevicesGuard,
  ],
  exports: [
    AuthService,
    JwtModule,
    AuthGuard,
    AdminGuard,
    OptionalAuthGuard,
    CanAddDevicesGuard,
  ],
})
export class AuthModule {}
