import { ApiProperty } from '@nestjs/swagger'

export class RegisterInputDTO {
  @ApiProperty({ type: String, required: true })
  name: string

  @ApiProperty({ type: String, required: true })
  username: string

  @ApiProperty({ type: String })
  email?: string

  @ApiProperty({ type: String, required: true })
  password: string
}

export class LoginInputDTO {
  @ApiProperty({ type: String, required: true })
  username: string

  @ApiProperty({ type: String, required: true })
  password: string
}

export class AdminResetPasswordInputDTO {
  @ApiProperty({ type: String, required: true })
  newPassword: string
}
