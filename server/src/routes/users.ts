/**
 * @file 用户管理路由
 * @description 提供用户信息查询、修改密码、API Key 管理、以及管理员对用户的 CRUD 操作。
 * @module server/routes
 */
import { Router, Response } from 'express'
import bcrypt from 'bcrypt'
import { v4 as uuidv4 } from 'uuid'
import { db, stmts } from '../db'
import { AuthenticatedRequest, UserRecord } from '../types'
import { requireRole } from '../middleware/auth'
import { generateApiKey, hashApiKey } from '../utils/keys'
import { validateBody } from '../middleware/validate'
import { updateMeSchema, createUserSchema, updateUserSchema } from '../schemas/auth-user'
import { createLogger } from '../utils/logger'

const log = createLogger('users')

/** 用户路由实例 */
const router = Router()

/** BCRYPT 密码哈希成本（注册/重置统一使用） */
const BCRYPT_COST = 12

/**
 * 脱敏用户数据：移除 password_hash 与 api_key 明文，转换为驼峰命名的安全输出格式。
 * apiKey 字段仅返回布尔值，表示是否已设置（不回传明文）。
 */
function sanitizeUser(row: UserRecord) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    apiKeySet: Boolean(row.api_key_hash || row.api_key),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

// GET /api/users/me — current user info
/** 获取当前登录用户信息 */
router.get('/me', (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: { message: '未认证', code: 'UNAUTHORIZED' } })
    return
  }
  const row = stmts.userGetById.get(req.user.id) as UserRecord | undefined
  if (!row) {
    res.status(404).json({ error: { message: '用户不存在', code: 'NOT_FOUND' } })
    return
  }
  res.json({ data: sanitizeUser(row) })
})

// PATCH /api/users/me — self-update (displayName, password)
/** 更新当前用户信息：支持修改 displayName 和密码（需提供当前密码验证） */
router.patch('/me', validateBody(updateMeSchema), async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: { message: '未认证', code: 'UNAUTHORIZED' } })
    return
  }
  const { displayName, currentPassword, newPassword } = req.body as {
    displayName?: string
    currentPassword?: string
    newPassword?: string
  }

  const existing = stmts.userGetById.get(req.user.id) as UserRecord | undefined
  if (!existing) {
    res.status(404).json({ error: { message: '用户不存在', code: 'NOT_FOUND' } })
    return
  }

  try {
    const updates: string[] = []
    const now = new Date().toISOString()

    if (newPassword) {
      if (!currentPassword) {
        res.status(400).json({
          error: { message: '修改密码需要提供当前密码', code: 'CURRENT_PASSWORD_REQUIRED' }
        })
        return
      }
      const valid = await bcrypt.compare(currentPassword, existing.password_hash)
      if (!valid) {
        res.status(401).json({
          error: { message: '当前密码不正确', code: 'INVALID_CURRENT_PASSWORD' }
        })
        return
      }
      const newHash = await bcrypt.hash(newPassword, BCRYPT_COST)
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id)
      updates.push('password')
    }

    if (displayName !== undefined && displayName !== existing.display_name) {
      stmts.userUpdate.run(displayName, existing.role, now, req.user.id)
      updates.push('displayName')
    } else if (updates.length === 0) {
      // No-op: at least bump updated_at to keep clients in sync
      stmts.userUpdate.run(existing.display_name, existing.role, now, req.user.id)
    }

    const updated = stmts.userGetById.get(req.user.id) as UserRecord
    res.json({ data: sanitizeUser(updated), updated: updates })
  } catch (err) {
    log.error('self-update failed', { err: err instanceof Error ? err.message : String(err) })
    res.status(500).json({
      error: {
        message: `更新失败: ${err instanceof Error ? err.message : '内部错误'}`,
        code: 'INTERNAL_ERROR'
      }
    })
  }
})

// POST /api/users/me/regenerate-key — regenerate own API key
/** 重新生成当前用户的 API Key（明文仅本次返回，服务端只存哈希） */
router.post('/me/regenerate-key', (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: { message: '未认证', code: 'UNAUTHORIZED' } })
    return
  }
  try {
    const existing = stmts.userGetById.get(req.user.id) as UserRecord | undefined
    if (!existing) {
      res.status(404).json({ error: { message: '用户不存在', code: 'NOT_FOUND' } })
      return
    }
    const newKey = generateApiKey()
    const hashed = hashApiKey(newKey)
    const now = new Date().toISOString()
    // 明文列置空，仅存哈希
    stmts.userUpdateApiKey.run('', hashed, now, req.user.id)
    const updated = stmts.userGetById.get(req.user.id) as UserRecord
    // 明文仅本次返回，后续 sanitizeUser 不再回传
    res.json({ data: { ...sanitizeUser(updated), apiKey: newKey } })
  } catch (err) {
    log.error('self-regenerate-key failed', { err: err instanceof Error ? err.message : String(err) })
    res.status(500).json({
      error: {
        message: `重生成 API Key 失败: ${err instanceof Error ? err.message : '内部错误'}`,
        code: 'INTERNAL_ERROR'
      }
    })
  }
})

// GET /api/users — list all users (admin only)
/** 获取所有用户列表（管理员专用） */
router.get('/', requireRole('admin'), (_req: AuthenticatedRequest, res: Response) => {
  try {
    const rows = stmts.userGetAll.all() as UserRecord[]
    res.json({ data: { items: rows.map(sanitizeUser), total: rows.length } })
  } catch (err) {
    log.error('list users failed', { err: err instanceof Error ? err.message : String(err) })
    res.status(500).json({
      error: { message: '获取用户列表失败', code: 'INTERNAL_ERROR' }
    })
  }
})

// POST /api/users — create user (admin only)
/** 创建新用户（管理员专用） */
router.post('/', requireRole('admin'), validateBody(createUserSchema), async (req: AuthenticatedRequest, res: Response) => {
  const { username, password, displayName, role } = req.body as {
    username: string;
    password: string;
    displayName?: string;
    role?: 'admin' | 'developer' | 'user';
  };

  const existing = stmts.userGetByUsername.get(username) as UserRecord | undefined
  if (existing) {
    res.status(409).json({ error: { message: '用户名已存在', code: 'CONFLICT' } })
    return
  }

  try {
    const id = uuidv4()
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST)
    const apiKey = generateApiKey()
    const apiKeyHash = hashApiKey(apiKey)
    const now = new Date().toISOString()

    stmts.userInsert.run(
      id, username, passwordHash, displayName || username, role || 'user', '', apiKeyHash, now, now
    )

    const created = stmts.userGetById.get(id) as UserRecord
    res.status(201).json({ data: { ...sanitizeUser(created), apiKey } })
  } catch (err) {
    log.error('create user failed', { err: err instanceof Error ? err.message : String(err) })
    res.status(500).json({
      error: {
        message: `创建用户失败: ${err instanceof Error ? err.message : '内部错误'}`,
        code: 'INTERNAL_ERROR'
      }
    })
  }
})

// PATCH /api/users/:id — update user (admin only)
/** 更新指定用户信息（管理员专用）：支持修改 displayName、role 和密码 */
router.patch('/:id', requireRole('admin'), validateBody(updateUserSchema), async (req: AuthenticatedRequest, res: Response) => {
  const existing = stmts.userGetById.get(req.params.id) as UserRecord | undefined
  if (!existing) {
    res.status(404).json({ error: { message: '用户不存在', code: 'NOT_FOUND' } })
    return
  }

  const { displayName, role, password } = req.body as {
    displayName?: string;
    role?: 'admin' | 'developer' | 'user';
    password?: string;
  };
  const now = new Date().toISOString()
  try {
    if (password) {
      const newHash = await bcrypt.hash(password, BCRYPT_COST)
      stmts.userUpdate.run(displayName ?? existing.display_name, role ?? existing.role, now, req.params.id)
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.params.id)
    } else {
      stmts.userUpdate.run(displayName ?? existing.display_name, role ?? existing.role, now, req.params.id)
    }

    const updated = stmts.userGetById.get(req.params.id) as UserRecord
    res.json({ data: sanitizeUser(updated) })
  } catch (err) {
    log.error('update user failed', { err: err instanceof Error ? err.message : String(err) })
    res.status(500).json({
      error: { message: `更新用户失败: ${err instanceof Error ? err.message : '内部错误'}`, code: 'INTERNAL_ERROR' }
    })
  }
})

// DELETE /api/users/:id — delete user (admin only)
/** 删除用户（管理员专用） */
router.delete('/:id', requireRole('admin'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const existing = stmts.userGetById.get(req.params.id) as UserRecord | undefined
    if (!existing) {
      res.status(404).json({ error: { message: '用户不存在', code: 'NOT_FOUND' } })
      return
    }
    stmts.userDelete.run(req.params.id)
    res.json({ data: { deleted: true } })
  } catch (err) {
    log.error('delete user failed', { err: err instanceof Error ? err.message : String(err) })
    res.status(500).json({
      error: { message: `删除用户失败: ${err instanceof Error ? err.message : '内部错误'}`, code: 'INTERNAL_ERROR' }
    })
  }
})

// POST /api/users/:id/regenerate-key — regenerate API key (admin only)
/** 重新生成指定用户的 API Key（管理员专用） */
router.post('/:id/regenerate-key', requireRole('admin'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const existing = stmts.userGetById.get(req.params.id) as UserRecord | undefined
    if (!existing) {
      res.status(404).json({ error: { message: '用户不存在', code: 'NOT_FOUND' } })
      return
    }

    const newKey = generateApiKey()
    const hashed = hashApiKey(newKey)
    const now = new Date().toISOString()
    stmts.userUpdateApiKey.run('', hashed, now, req.params.id)

    const updated = stmts.userGetById.get(req.params.id) as UserRecord
    res.json({ data: { ...sanitizeUser(updated), apiKey: newKey } })
  } catch (err) {
    log.error('regenerate key failed', { err: err instanceof Error ? err.message : String(err) })
    res.status(500).json({
      error: { message: `重新生成 API Key 失败: ${err instanceof Error ? err.message : '内部错误'}`, code: 'INTERNAL_ERROR' }
    })
  }
})

export default router
