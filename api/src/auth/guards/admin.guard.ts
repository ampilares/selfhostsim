import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common'
import { UserRole } from '../../users/user-roles.enum'

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const role = request.user?.role

    if (role === UserRole.ADMIN) {
      return true
    }

    throw new HttpException({ error: 'Forbidden' }, HttpStatus.FORBIDDEN)
  }
}
