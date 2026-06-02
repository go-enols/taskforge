import { Router, Response } from 'express'
import bcrypt from 'bcrypt'
import { v4 as uuidv4 } from 'uuid'
import { randomBytes } from 'crypto'
import { db, stmts } from '../db'
import { AuthenticatedRequest, UserRecord } from '../types'
import { requireRole } from '../middleware/auth'

const router = Router()

function sanitizeUser(row: UserRecord) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    apiKey: row.api_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function logError(tag: string, err: unknown): void {
  console.error(`[users] ${tag}:`, err instanceof Error ? err.message : String(err))
}

// GET /api/users/me — current user info
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
router.patch('/me', async (req: AuthenticatedRequest, res: Response) => {
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
      if (newPassword.length < 4) {
        res.status(400).json({
          error: { message: '新密码至少需要 4 个字符', code: 'VALIDATION_ERROR' }
        })
        return
      }
      const newHash = await bcrypt.hash(newPassword, 10)
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
    logError('self-update failed', err)
    res.status(500).json({
      error: {
        message: `更新失败: ${err instanceof Error ? err.message : '内部错误'}`,
        code: 'INTERNAL_ERROR'
      }
    })
  }
})

// POST /api/users/me/regenerate-key — regenerate own API key
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
    const newKey = randomBytes(32).toString('hex')
    const now = new Date().toISOString()
    stmts.userUpdateApiKey.run(newKey, now, req.user.id)
    const updated = stmts.userGetById.get(req.user.id) as UserRecord
    res.json({ data: sanitizeUser(updated) })
  } catch (err) {
    logError('self-regenerate-key failed', err)
    res.status(500).json({
      error: {
        message: `重生成 API Key 失败: ${err instanceof Error ? err.message : '内部错误'}`,
        code: 'INTERNAL_ERROR'
      }
    })
  }
})

// GET /api/users — list all users (admin only)
router.get('/', requireRole('admin'), (_req: AuthenticatedRequest, res: Response) => {
  try {
    const rows = stmts.userGetAll.all() as UserRecord[]
    res.json({ data: { items: rows.map(sanitizeUser), total: rows.length } })
  } catch (err) {
    logError('list users failed', err)
    res.status(500).json({
      error: { message: '获取用户列表失败', code: 'INTERNAL_ERROR' }
    })
  }
})

// POST /api/users — create user (admin only)
router.post('/', requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
  const { username, password, displayName, role } = req.body

  if (!username || !password) {
    res.status(400).json({
      error: { message: '请输入用户名和密码', code: 'VALIDATION_ERROR' }
    })
    return
  }

  if (password.length < 4) {
    res.status(400).json({
      error: { message: '密码至少需要 4 个字符', code: 'VALIDATION_ERROR' }
    })
    return
  }

  const existing = stmts.userGetByUsername.get(username) as UserRecord | undefined
  if (existing) {
    res.status(409).json({ error: { message: '用户名已存在', code: 'CONFLICT' } })
    return
  }

  try {
    const id = uuidv4()
    const passwordHash = await bcrypt.hash(password, 10)
    const apiKey = randomBytes(32).toString('hex')
    const now = new Date().toISOString()

    stmts.userInsert.run(
      id, username, passwordHash, displayName || username, role || 'user', apiKey, now, now
    )

    const created = stmts.userGetById.get(id) as UserRecord
    res.status(201).json({ data: sanitizeUser(created) })
  } catch (err) {
    logError('create user failed', err)
    res.status(500).json({
      error: {
        message: `创建用户失败: ${err instanceof Error ? err.message : '内部错误'}`,
        code: 'INTERNAL_ERROR'
      }
    })
  }
})

// PATCH /api/users/:id — update user (admin only)
router.patch('/:id', requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
  const existing = stmts.userGetById.get(req.params.id) as UserRecord | undefined
  if (!existing) {
    res.status(404).json({ error: { message: '用户不存在', code: 'NOT_FOUND' } })
    return
  }

  const { displayName, role, password } = req.body
  const now = new Date().toISOString()

  try {
    if (password) {
      const newHash = await bcrypt.hash(password, 10)
      stmts.userUpdate.run(displayName ?? existing.display_name, role ?? existing.role, now, req.params.id)
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.params.id)
    } else {
      stmts.userUpdate.run(displayName ?? existing.display_name, role ?? existing.role, now, req.params.id)
    }

    const updated = stmts.userGetById.get(req.params.id) as UserRecord
    res.json({ data: sanitizeUser(updated) })
  } catch (err) {
    logError('update user failed', err)
    res.status(500).json({
      error: { message: `更新用户失败: ${err instanceof Error ? err.message : '内部错误'}`, code: 'INTERNAL_ERROR' }
    })
  }
})

// DELETE /api/users/:id — delete user (admin only)
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
    logError('delete user failed', err)
    res.status(500).json({
      error: { message: `删除用户失败: ${err instanceof Error ? err.message : '内部错误'}`, code: 'INTERNAL_ERROR' }
    })
  }
})

// POST /api/users/:id/regenerate-key — regenerate API key (admin only)
router.post('/:id/regenerate-key', requireRole('admin'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const existing = stmts.userGetById.get(req.params.id) as UserRecord | undefined
    if (!existing) {
      res.status(404).json({ error: { message: '用户不存在', code: 'NOT_FOUND' } })
      return
    }

    const newKey = randomBytes(32).toString('hex')
    const now = new Date().toISOString()
    stmts.userUpdateApiKey.run(newKey, now, req.params.id)

    const updated = stmts.userGetById.get(req.params.id) as UserRecord
    res.json({ data: sanitizeUser(updated) })
  } catch (err) {
    logError('regenerate key failed', err)
    res.status(500).json({
      error: { message: `重新生成 API Key 失败: ${err instanceof Error ? err.message : '内部错误'}`, code: 'INTERNAL_ERROR' }
    })
  }
})

export default router
