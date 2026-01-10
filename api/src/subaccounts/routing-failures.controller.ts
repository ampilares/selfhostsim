import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { Model } from 'mongoose'
import { AuthGuard } from '../auth/guards/auth.guard'
import { AdminGuard } from '../auth/guards/admin.guard'
import {
  RoutingFailure,
  RoutingFailureDocument,
} from './schemas/routing-failure.schema'

@ApiTags('routing-failures')
@ApiBearerAuth()
@UseGuards(AuthGuard, AdminGuard)
@Controller('routing-failures')
export class RoutingFailuresController {
  constructor(
    @InjectModel(RoutingFailure.name)
    private routingFailureModel: Model<RoutingFailureDocument>,
  ) {}

  @ApiOperation({ summary: 'List routing failures (admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @Get()
  async list(@Query('page') page?: string, @Query('limit') limit?: string) {
    const pageNum = Math.max(1, Number.parseInt(page || '1', 10) || 1)
    const limitNum = Math.max(
      1,
      Math.min(Number.parseInt(limit || '25', 10) || 25, 100),
    )
    const skip = (pageNum - 1) * limitNum

    const [total, data] = await Promise.all([
      this.routingFailureModel.countDocuments({}),
      this.routingFailureModel
        .find({})
        .sort({ receivedAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
    ])

    return {
      data,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    }
  }
}
