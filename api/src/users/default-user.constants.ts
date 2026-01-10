import { UserRole } from './user-roles.enum'

export const DEFAULT_ADMIN_USERNAME = process.env.DEFAULT_ADMIN_USERNAME
export const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD
export const DEFAULT_ADMIN_NAME = 'admin'
export const DEFAULT_ADMIN_ROLE = UserRole.ADMIN
