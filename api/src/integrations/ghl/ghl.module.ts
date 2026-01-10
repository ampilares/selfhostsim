import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { BullModule } from '@nestjs/bull'
import { SubaccountsModule } from '../../subaccounts/subaccounts.module'
import { GatewayModule } from '../../gateway/gateway.module'
import { GhlController } from './ghl.controller'
import { GhlService } from './ghl.service'
import {
  ConversationPointer,
  ConversationPointerSchema,
} from './schemas/conversation-pointer.schema'
import {
  InboundSmsSync,
  InboundSmsSyncSchema,
} from './schemas/inbound-sms-sync.schema'
import { ConversationPointerService } from './conversation-pointer.service'
import { InboundSmsSyncService } from './inbound-sms-sync.service'
import { GhlInboundClientService } from './ghl-inbound-client.service'
import { GhlInboundQueue } from './queue/ghl-inbound.queue'
import { GhlInboundProcessor } from './queue/ghl-inbound.processor'
import { ReceivedSmsListener } from './listeners/received-sms.listener'
import { GhlInboundRetentionTask } from './tasks/ghl-inbound-retention.task'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ConversationPointer.name, schema: ConversationPointerSchema },
      { name: InboundSmsSync.name, schema: InboundSmsSyncSchema },
    ]),
    BullModule.registerQueue({
      name: 'ghl-inbound',
      defaultJobOptions: {
        // Use a single Bull attempt; retries are implemented in GhlInboundProcessor.
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: false,
      },
    }),
    SubaccountsModule,
    GatewayModule,
  ],
  controllers: [GhlController],
  providers: [
    GhlService,
    ConversationPointerService,
    InboundSmsSyncService,
    GhlInboundClientService,
    GhlInboundQueue,
    GhlInboundProcessor,
    ReceivedSmsListener,
    GhlInboundRetentionTask,
  ],
  exports: [
    GhlService,
    ConversationPointerService,
    InboundSmsSyncService,
    GhlInboundQueue,
    MongooseModule,
  ],
})
export class GhlModule {}
