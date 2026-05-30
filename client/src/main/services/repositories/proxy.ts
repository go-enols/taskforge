import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import type { Proxy, ListResponse } from '../../../shared/types'
import { BaseRepository } from './base'

export class ProxyRepository extends BaseRepository<Proxy> {
  constructor(db: Database.Database) {
    super(db)
    this.prepareStatements()
  }

  prepareStatements(): void {
    this.setStmt(
      'proxy.insert',
      this.db.prepare(
        'INSERT INTO proxies (id, protocol, host, port, username, password, status, format, labels, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
    )
    this.setStmt('proxy.getById', this.db.prepare('SELECT * FROM proxies WHERE id = ?'))
    this.setStmt(
      'proxy.update',
      this.db.prepare(
        'UPDATE proxies SET protocol=?, host=?, port=?, username=?, password=?, status=?, format=?, labels=? WHERE id=?'
      )
    )
    this.setStmt('proxy.delete', this.db.prepare('DELETE FROM proxies WHERE id = ?'))
    this.setStmt('proxy.count', this.db.prepare('SELECT COUNT(*) as cnt FROM proxies'))
    this.setStmt(
      'proxy.countByProtocol',
      this.db.prepare('SELECT protocol, COUNT(*) as cnt FROM proxies GROUP BY protocol')
    )
    this.setStmt(
      'proxy.countByStatus',
      this.db.prepare('SELECT status, COUNT(*) as cnt FROM proxies GROUP BY status')
    )
  }

  private rowToProxy(row: Record<string, unknown>): Proxy {
    return {
      id: row.id as string,
      protocol: row.protocol as Proxy['protocol'],
      host: row.host as string,
      port: row.port as number,
      username: row.username as string | null,
      password: row.password as string | null,
      status: row.status as Proxy['status'],
      format: row.format as Proxy['format'],
      labels: this.fromJsonArray<string>(row.labels as string | null),
      createdAt: row.created_at as string
    }
  }

  count(): number {
    return (this.stmt('proxy.count').get() as Record<string, number>).cnt
  }

  countByProtocol(): Record<string, number> {
    const rows = this.stmt('proxy.countByProtocol').all() as Record<string, unknown>[]
    const result: Record<string, number> = {}
    for (const row of rows) {
      result[row.protocol as string] = row.cnt as number
    }
    return result
  }

  countByStatus(): Record<string, number> {
    const rows = this.stmt('proxy.countByStatus').all() as Record<string, unknown>[]
    const result: Record<string, number> = {}
    for (const row of rows) {
      result[row.status as string] = row.cnt as number
    }
    return result
  }

  createProxy(data: Omit<Proxy, 'id' | 'createdAt'>): Proxy {
    const id = uuidv4()
    const createdAt = this.nowISO()
    this.stmt('proxy.insert').run(
      id,
      data.protocol,
      data.host,
      data.port,
      data.username ?? null,
      data.password ?? null,
      data.status,
      data.format ?? 'manual',
      this.toJson(data.labels),
      createdAt
    )
    return this.getProxy(id)!
  }

  getProxy(id: string): Proxy | null {
    const row = this.stmt('proxy.getById').get(id) as Record<string, unknown> | undefined
    return row ? this.rowToProxy(row) : null
  }

  listProxies(page = 1, pageSize = 20, search?: string): ListResponse<Proxy> {
    if (search) {
      const countStmt = this.db.prepare(
        'SELECT COUNT(*) as cnt FROM proxies WHERE host LIKE ? OR protocol LIKE ?'
      )
      const listStmt = this.db.prepare(
        'SELECT * FROM proxies WHERE host LIKE ? OR protocol LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
      )
      return this.paginate(countStmt, listStmt, page, pageSize, (r) => this.rowToProxy(r), [
        `%${search}%`,
        `%${search}%`
      ])
    }
    const countStmt = this.stmt('proxy.count')
    const listStmt = this.db.prepare(
      'SELECT * FROM proxies ORDER BY created_at DESC LIMIT ? OFFSET ?'
    )
    return this.paginate(countStmt, listStmt, page, pageSize, (r) => this.rowToProxy(r))
  }

  updateProxy(id: string, data: Partial<Omit<Proxy, 'id' | 'createdAt'>>): Proxy | null {
    const existing = this.getProxy(id)
    if (!existing) return null
    const updated = { ...existing, ...data }
    this.stmt('proxy.update').run(
      updated.protocol,
      updated.host,
      updated.port,
      updated.username ?? null,
      updated.password ?? null,
      updated.status,
      updated.format ?? 'manual',
      this.toJson(updated.labels),
      id
    )
    return this.getProxy(id)
  }

  deleteProxy(id: string): boolean {
    const result = this.stmt('proxy.delete').run(id)
    return result.changes > 0
  }

  batchDeleteProxies(ids: string[]): number {
    const deleteStmt = this.db.prepare('DELETE FROM proxies WHERE id = ?')
    const transaction = this.db.transaction((items: string[]) => {
      let count = 0
      for (const id of items) {
        count += deleteStmt.run(id).changes
      }
      return count
    })
    return transaction(ids)
  }

  batchCreateProxies(items: Omit<Proxy, 'id' | 'createdAt'>[]): number {
    const insert = this.stmt('proxy.insert')
    const transaction = this.db.transaction((data: Omit<Proxy, 'id' | 'createdAt'>[]) => {
      let count = 0
      for (const item of data) {
        const id = uuidv4()
        const createdAt = this.nowISO()
        insert.run(
          id,
          item.protocol,
          item.host,
          item.port,
          item.username ?? null,
          item.password ?? null,
          item.status,
          item.format ?? 'manual',
          this.toJson(item.labels),
          createdAt
        )
        count++
      }
      return count
    })
    return transaction(items)
  }
}
