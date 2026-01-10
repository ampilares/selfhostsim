import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { UsersService } from './users.service'
import {
  DEFAULT_ADMIN_NAME,
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_ROLE,
  DEFAULT_ADMIN_USERNAME,
} from './default-user.constants'
import { DefaultUserBootstrapConfig } from './default-user.types'

@Injectable()
export class UsersBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(UsersBootstrapService.name)

  constructor(private readonly usersService: UsersService) {}

  async onApplicationBootstrap() {
    try {
      const userCount = await this.usersService.getUserCount()
      if (userCount > 0) {
        return
      }

      const config: DefaultUserBootstrapConfig = {
        name: DEFAULT_ADMIN_NAME,
        username: DEFAULT_ADMIN_USERNAME,
        password: DEFAULT_ADMIN_PASSWORD,
        role: DEFAULT_ADMIN_ROLE,
      }

      const user = await this.usersService.createDefaultUser(config)
      if (user) {
        this.logger.log(
          `Default admin user created. Username: ${config.username}`,
        )
      }
    } catch (error) {
      this.logger.error(
        'Failed to bootstrap default admin user',
        error?.stack || error?.message || error,
      )
    }
  }
}
