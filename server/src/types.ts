import { Request } from 'express'

export interface UserRecord {
  id: string
  username: string
  password_hash: string
  display_name: string
  role: 'admin' | 'developer' | 'user'
  api_key: string
  created_at: string
  updated_at: string
}

export interface AuthenticatedUser {
  id: string
  username: string
  displayName: string
  role: 'admin' | 'developer' | 'user'
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser
}
