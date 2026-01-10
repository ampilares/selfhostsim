import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common'
import { UserRole } from '../../users/user-roles.enum'
import {
  DEVICE_ACCESS_REQUIRED_ERROR,
  DEVICE_ACCESS_REQUIRED_MESSAGE,
} from '../../users/device-access.constants'

@Injectable()
export class CanAddDevicesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const user = request.user

    if (!user) {
      throw new HttpException(
        { error: 'Unauthorized' },
        HttpStatus.UNAUTHORIZED,
      )
    }

    if (user.role === UserRole.ADMIN) {
      return true
    }

    if (user.canAddDevices === false) {
      throw new HttpException(
        {
          error: DEVICE_ACCESS_REQUIRED_ERROR,
          message: DEVICE_ACCESS_REQUIRED_MESSAGE,
        },
        HttpStatus.FORBIDDEN,
      )
    }

    return true
  }
}
