import { ApiProperty } from '@nestjs/swagger'

export class CreateSubAccountDTO {
  @ApiProperty({ type: String, required: true })
  name: string

  @ApiProperty({ type: String, required: true })
  locationId: string
}

export class UpdateSubAccountDTO {
  @ApiProperty({ type: String, required: false })
  name?: string

  @ApiProperty({ type: String, required: false })
  locationId?: string
}

export class LinkDeviceDTO {
  @ApiProperty({ type: String, required: true })
  deviceId: string
}
