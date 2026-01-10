import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common'
import { createHash } from 'crypto'

@Injectable()
export class InternalSecretGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()

    const secret =
      process.env.INTERNAL_SECRET || process.env.SELFHOSTSIM_INTERNAL_SECRET
    if (!secret) {
      throw new HttpException(
        { error: 'Internal secret not configured' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      )
    }

    const headerName = (process.env.INTERNAL_API_KEY_HEADER_NAME ||
      'x-internal-secret') as string

    const providedRaw =
      request.headers?.[headerName] ||
      request.headers?.[headerName.toLowerCase()]

    const provided = Array.isArray(providedRaw) ? providedRaw[0] : providedRaw

    if (process.env.INTERNAL_SECRET_DEBUG === 'true') {
      const expectedHash = createHash('sha256').update(secret).digest('hex')
      const providedHash = provided
        ? createHash('sha256').update(String(provided)).digest('hex')
        : undefined

      console.log('[InternalSecretGuard]', {
        headerName,
        hasProvided: Boolean(provided),
        expectedHash8: expectedHash.slice(0, 8),
        providedHash8: providedHash?.slice(0, 8),
      })
    }

    if (!provided || String(provided) !== secret) {
      throw new HttpException(
        { error: 'Unauthorized' },
        HttpStatus.UNAUTHORIZED,
      )
    }

    return true
  }
}
