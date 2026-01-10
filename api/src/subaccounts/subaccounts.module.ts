import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { AuthModule } from '../auth/auth.module'
import { GatewayModule } from '../gateway/gateway.module'
import { UsersModule } from '../users/users.module'
import { SubAccount, SubAccountSchema } from './schemas/subaccount.schema'
import {
  SubAccountDeviceLink,
  SubAccountDeviceLinkSchema,
} from './schemas/subaccount-device-link.schema'
import {
  RoutingFailure,
  RoutingFailureSchema,
} from './schemas/routing-failure.schema'
import { SubaccountsService } from './subaccounts.service'
import { SubaccountsController } from './subaccounts.controller'
import { AdminDevicesController } from './admin-devices.controller'
import { RoutingFailuresController } from './routing-failures.controller'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SubAccount.name, schema: SubAccountSchema },
      { name: SubAccountDeviceLink.name, schema: SubAccountDeviceLinkSchema },
      { name: RoutingFailure.name, schema: RoutingFailureSchema },
    ]),
    AuthModule,
    UsersModule,
    GatewayModule,
  ],
  controllers: [
    SubaccountsController,
    AdminDevicesController,
    RoutingFailuresController,
  ],
  providers: [SubaccountsService],
  exports: [MongooseModule, SubaccountsService],
})
export class SubaccountsModule {}
