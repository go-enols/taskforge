/**
 * @file CaptchaKeyRepository — 验证码 API 密钥数据仓库
 * @description 封装 captcha_keys 表的全部 CRUD 操作，支持分页查询和按提供商模糊搜索。
 * @module main/services/repositories
 */
import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import type { CaptchaKey, ListResponse } from '../../../shared/types'
import { BaseRepository } from './base'

/**
 * 验证码 API 密钥数据仓库
 *
 * 管理验证码服务（如 2captcha, capmonster 等）的 API 密钥和余额信息。
 *
 * @example
 * ```ts
 * const repo = new CaptchaKeyRepository(db)
 * const key = repo.create({ provider: '2captcha', apiKey: 'abc123', balance: 10.5 })
 * const list = repo.list(1, 20, '2captcha')
 * ```
 */
export class CaptchaKeyRepository extends BaseRepository<CaptchaKey> {
  /**
   * @param db - better-sqlite3 数据库连接
   */
  constructor(db: Database.Database) {
    super(db)
    this.prepareStatements()
  }

  /** 注册所有验证码密钥相关的预编译 SQL 语句 */
  prepareStatements(): void {
    this.setStmt(
      'captchaKey.insert',
      this.db.prepare(
        'INSERT INTO captcha_keys (id, provider, api_key, balance, created_at) VALUES (?, ?, ?, ?, ?)'
      )
    )
    this.setStmt(
      'captchaKey.getById',
      this.db.prepare('SELECT * FROM captcha_keys WHERE id = ?')
    )
    this.setStmt(
      'captchaKey.update',
      this.db.prepare('UPDATE captcha_keys SET provider=?, api_key=?, balance=? WHERE id=?')
    )
    this.setStmt(
      'captchaKey.delete',
      this.db.prepare('DELETE FROM captcha_keys WHERE id = ?')
    )
  }

  /**
   * 将数据库行记录映射为 CaptchaKey 对象
   * @param row - 数据库查询返回的原始行数据
   * @returns 组装好的 CaptchaKey 实体
   */
  private rowToCaptchaKey(row: Record<string, unknown>): CaptchaKey {
    return {
      id: row.id as string,
      provider: row.provider as string,
      apiKey: row.api_key as string,
      balance: row.balance as number,
      createdAt: row.created_at as string
    }
  }

  /**
   * 创建验证码 API 密钥记录
   * @param data - 验证码密钥数据
   * @returns 创建的 CaptchaKey 对象
   */
  create(data: Omit<CaptchaKey, 'id' | 'createdAt'>): CaptchaKey {
    const id = uuidv4()
    const createdAt = this.nowISO()
    this.stmt('captchaKey.insert').run(id, data.provider, data.apiKey, data.balance, createdAt)
    return this.get(id)!
  }

  /**
   * 根据 ID 获取验证码密钥
   * @param id - 验证码密钥 UUID
   * @returns CaptchaKey 对象，不存在时返回 null
   */
  get(id: string): CaptchaKey | null {
    const row = this.stmt('captchaKey.getById').get(id) as Record<string, unknown> | undefined
    return row ? this.rowToCaptchaKey(row) : null
  }

  /**
   * 分页查询验证码密钥列表（支持按提供商名称模糊搜索）
   * @param page     - 页码（默认 1）
   * @param pageSize - 每页条数（默认 20）
   * @param search   - 可选搜索关键词
   * @returns 分页结果
   */
  list(page = 1, pageSize = 20, search?: string): ListResponse<CaptchaKey> {
    if (search) {
      const countStmt = this.db.prepare(
        'SELECT COUNT(*) as cnt FROM captcha_keys WHERE provider LIKE ?'
      )
      const listStmt = this.db.prepare(
        'SELECT * FROM captcha_keys WHERE provider LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
      )
      return this.paginate(countStmt, listStmt, page, pageSize, (r) => this.rowToCaptchaKey(r), [
        `%${search}%`
      ])
    }
    const countStmt = this.db.prepare('SELECT COUNT(*) as cnt FROM captcha_keys')
    const listStmt = this.db.prepare(
      'SELECT * FROM captcha_keys ORDER BY created_at DESC LIMIT ? OFFSET ?'
    )
    return this.paginate(countStmt, listStmt, page, pageSize, (r) => this.rowToCaptchaKey(r))
  }

  /**
   * 更新验证码密钥信息
   * @param id   - 验证码密钥 UUID
   * @param data - 要更新的字段
   * @returns 更新后的 CaptchaKey 对象，不存在时返回 null
   */
  update(id: string, data: Partial<Omit<CaptchaKey, 'id' | 'createdAt'>>): CaptchaKey | null {
    const existing = this.get(id)
    if (!existing) return null
    const updated = { ...existing, ...data }
    this.stmt('captchaKey.update').run(updated.provider, updated.apiKey, updated.balance, id)
    return this.get(id)
  }

  /**
   * 删除验证码密钥
   * @param id - 验证码密钥 UUID
   * @returns 是否成功删除
   */
  delete(id: string): boolean {
    const result = this.stmt('captchaKey.delete').run(id)
    return result.changes > 0
  }
}
