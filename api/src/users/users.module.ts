import { forwardRef, Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { AuthModule } from '../auth/auth.module'
import { User, UserSchema } from './schemas/user.schema'
import {
  DeviceAccessAuditEvent,
  DeviceAccessAuditEventSchema,
} from './schemas/device-access-audit-event.schema'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'
import { UsersBootstrapService } from './users-bootstrap.service'
import { UsersMigrationService } from './users-migration.service'

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: User.name,
        schema: UserSchema,
      },
      {
        name: DeviceAccessAuditEvent.name,
        schema: DeviceAccessAuditEventSchema,
      },
    ]),
    forwardRef(() => AuthModule),
  ],
  controllers: [UsersController],
  providers: [UsersService, UsersBootstrapService, UsersMigrationService],
  exports: [MongooseModule, UsersService],
})
export class UsersModule {}
