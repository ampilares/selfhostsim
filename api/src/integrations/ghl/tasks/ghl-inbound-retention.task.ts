import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { InboundSmsSync } from '../schemas/inbound-sms-sync.schema'

@Injectable()
export class GhlInboundRetentionTask {
  private readonly logger = new Logger(GhlInboundRetentionTask.name)

  constructor(
    @InjectModel(InboundSmsSync.name)
    private readonly inboundSmsSyncModel: Model<InboundSmsSync>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupOldInboundSyncRecords() {
    const retentionDays = Number(process.env.GHL_INBOUND_RETENTION_DAYS || 30)
    if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
      this.logger.warn(
        `Skipping inbound SMS retention cleanup (invalid GHL_INBOUND_RETENTION_DAYS=${process.env.GHL_INBOUND_RETENTION_DAYS})`,
      )
      return
    }

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - retentionDays)

    try {
      const result = await this.inboundSmsSyncModel.deleteMany({
        createdAt: { $lt: cutoff },
      })

      this.logger.log(
        `Deleted ${result.deletedCount} inbound SMS sync records older than ${retentionDays} days`,
      )
    } catch (e) {
      this.logger.error('Failed inbound SMS retention cleanup', e)
    }
  }
}
