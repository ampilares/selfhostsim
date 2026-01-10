import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Device, DeviceSchema } from './schemas/device.schema'
import { GatewayController } from './gateway.controller'
import { GatewayService } from './gateway.service'
import { AuthModule } from '../auth/auth.module'
import { UsersModule } from '../users/users.module'
import { SMS, SMSSchema } from './schemas/sms.schema'
import { SMSBatch, SMSBatchSchema } from './schemas/sms-batch.schema'
import { BullModule } from '@nestjs/bull'
import { ConfigModule } from '@nestjs/config'
import { SmsQueueService } from './queue/sms-queue.service'
import { SmsQueueProcessor } from './queue/sms-queue.processor'
import { SmsStatusUpdateTask } from './tasks/sms-status-update.task'
import { CanAddDevicesGuard } from '../auth/guards/can-add-devices.guard'

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Device.name,
        schema: DeviceSchema,
      },
      {
        name: SMS.name,
        schema: SMSSchema,
      },
      {
        name: SMSBatch.name,
        schema: SMSBatchSchema,
      },
    ]),
    BullModule.registerQueue({
      name: 'sms',
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: false,
        removeOnFail: false,
      },
    }),
    AuthModule,
    UsersModule,
    ConfigModule,
  ],
  controllers: [GatewayController],
  providers: [
    GatewayService,
    SmsQueueService,
    SmsQueueProcessor,
    SmsStatusUpdateTask,
    CanAddDevicesGuard,
  ],
  exports: [MongooseModule, GatewayService, SmsQueueService],
})
export class GatewayModule {}
