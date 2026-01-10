import { ApiProperty } from '@nestjs/swagger'

export class UpdateDeviceAccessInputDTO {
  @ApiProperty({ type: Boolean, required: true })
  enabled: boolean
}

export class ListUsersQueryDTO {
  @ApiProperty({ type: Number, required: false, default: 1 })
  page?: number

  @ApiProperty({ type: Number, required: false, default: 25 })
  limit?: number
}
