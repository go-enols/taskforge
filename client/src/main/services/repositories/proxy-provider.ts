/**
 * @file ProxyProviderRepository — 代理提供商数据仓库
 * @description 封装 proxy_providers 表的全部 CRUD 操作，支持分页查询和按名称/URL 模糊搜索。
 *              代理提供商配置用于从外部 API 自动拉取代理列表。
 * @module main/services/repositories
 */
import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import type { ProxyProvider, ListResponse } from '../../../shared/types'
import { BaseRepository } from './base'

/**
 * 代理提供商数据仓库
 *
 * 管理代理提供商配置（从 API 自动拉取代理），每个提供商包含
 * API 地址、密钥、协议类型和刷新间隔等信息。
 *
 * @example
 * ```ts
 * const repo = new ProxyProviderRepository(db)
 * const provider = repo.create({ name: 'My Provider', apiUrl: '...', ... })
 * const list = repo.list(1, 20, 'provider')
 * ```
 */
export class ProxyProviderRepository extends BaseRepository<ProxyProvider> {
  /**
   * @param db - better-sqlite3 数据库连接
   */
  constructor(db: Database.Database) {
    super(db)
    this.prepareStatements()
  }

  /** 注册所有代理提供商相关的预编译 SQL 语句 */
  prepareStatements(): void {
    this.setStmt(
      'proxyProvider.insert',
      this.db.prepare(
        'INSERT INTO proxy_providers (id, name, api_url, api_key, protocol, refresh_interval, last_sync, labels, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
    )
    this.setStmt(
      'proxyProvider.getById',
      this.db.prepare('SELECT * FROM proxy_providers WHERE id = ?')
    )
    this.setStmt(
      'proxyProvider.update',
      this.db.prepare(
        'UPDATE proxy_providers SET name=?, api_url=?, api_key=?, protocol=?, refresh_interval=?, last_sync=?, labels=? WHERE id=?'
      )
    )
    this.setStmt(
      'proxyProvider.delete',
      this.db.prepare('DELETE FROM proxy_providers WHERE id = ?')
    )
  }

  /**
   * 将数据库行记录映射为 ProxyProvider 对象
   * 自动反序列化 labels JSON 字段。
   * @param row - 数据库查询返回的原始行数据
   * @returns 组装好的 ProxyProvider 实体
   */
  private rowToProxyProvider(row: Record<string, unknown>): ProxyProvider {
    return {
      id: row.id as string,
      name: row.name as string,
      apiUrl: row.api_url as string,
      apiKey: row.api_key as string,
      protocol: row.protocol as ProxyProvider['protocol'],
      refreshInterval: row.refresh_interval as number,
      lastSync: row.last_sync as string | null,
      labels: this.fromJsonArray<string>(row.labels as string | null),
      createdAt: row.created_at as string
    }
  }

  /**
   * 创建代理提供商配置
   * @param data - 代理提供商数据
   * @returns 创建的 ProxyProvider 对象
   */
  create(data: Omit<ProxyProvider, 'id' | 'createdAt'>): ProxyProvider {
    const id = uuidv4()
    const createdAt = this.nowISO()
    this.stmt('proxyProvider.insert').run(
      id,
      data.name,
      data.apiUrl,
      data.apiKey,
      data.protocol,
      data.refreshInterval,
      data.lastSync ?? null,
      this.toJson(data.labels),
      createdAt
    )
    return this.get(id)!
  }

  /**
   * 根据 ID 获取代理提供商
   * @param id - 代理提供商 UUID
   * @returns ProxyProvider 对象，不存在时返回 null
   */
  get(id: string): ProxyProvider | null {
    const row = this.stmt('proxyProvider.getById').get(id) as Record<string, unknown> | undefined
    return row ? this.rowToProxyProvider(row) : null
  }

  /**
   * 分页查询代理提供商列表（支持按名称或 API URL 模糊搜索）
   * @param page     - 页码（默认 1）
   * @param pageSize - 每页条数（默认 20）
   * @param search   - 可选搜索关键词
   * @returns 分页结果
   */
  list(page = 1, pageSize = 20, search?: string): ListResponse<ProxyProvider> {
    if (search) {
      const countStmt = this.db.prepare(
        'SELECT COUNT(*) as cnt FROM proxy_providers WHERE name LIKE ? OR api_url LIKE ?'
      )
      const listStmt = this.db.prepare(
        'SELECT * FROM proxy_providers WHERE name LIKE ? OR api_url LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
      )
      return this.paginate(
        countStmt,
        listStmt,
        page,
        pageSize,
        (r) => this.rowToProxyProvider(r),
        [`%${search}%`, `%${search}%`]
      )
    }
    const countStmt = this.db.prepare('SELECT COUNT(*) as cnt FROM proxy_providers')
    const listStmt = this.db.prepare(
      'SELECT * FROM proxy_providers ORDER BY created_at DESC LIMIT ? OFFSET ?'
    )
    return this.paginate(countStmt, listStmt, page, pageSize, (r) => this.rowToProxyProvider(r))
  }

  /**
   * 更新代理提供商配置
   * @param id   - 代理提供商 UUID
   * @param data - 要更新的字段
   * @returns 更新后的 ProxyProvider 对象，不存在时返回 null
   */
  update(
    id: string,
    data: Partial<Omit<ProxyProvider, 'id' | 'createdAt'>>
  ): ProxyProvider | null {
    const existing = this.get(id)
    if (!existing) return null
    const updated = { ...existing, ...data }
    this.stmt('proxyProvider.update').run(
      updated.name,
      updated.apiUrl,
      updated.apiKey,
      updated.protocol,
      updated.refreshInterval,
      updated.lastSync ?? null,
      this.toJson(updated.labels),
      id
    )
    return this.get(id)
  }

  /**
   * 删除代理提供商
   * @param id - 代理提供商 UUID
   * @returns 是否成功删除
   */
  delete(id: string): boolean {
    const result = this.stmt('proxyProvider.delete').run(id)
    return result.changes > 0
  }
}
