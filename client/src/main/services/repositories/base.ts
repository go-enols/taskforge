import Database from 'better-sqlite3'
import type { ListResponse } from '../../../shared/types'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export abstract class BaseRepository<_T = unknown> {
  protected db: Database.Database
  private _stmts: Map<string, Database.Statement>

  constructor(db: Database.Database) {
    this.db = db
    this._stmts = new Map()
  }

  protected stmt(name: string): Database.Statement {
    const s = this._stmts.get(name)
    if (!s) throw new Error(`Prepared statement not found: ${name}`)
    return s
  }

  protected setStmt(name: string, stmt: Database.Statement): void {
    this._stmts.set(name, stmt)
  }

  protected abstract prepareStatements(): void

  protected toJson(val: unknown): string | null {
    if (val === undefined || val === null) return null
    return JSON.stringify(val)
  }

  protected fromJson<V>(val: string | null): V | null {
    if (val === null) return null
    try {
      return JSON.parse(val) as V
    } catch {
      return null
    }
  }

  protected fromJsonArray<V>(val: string | null): V[] {
    if (val === null) return []
    try {
      return JSON.parse(val) as V[]
    } catch {
      return []
    }
  }

  protected nowISO(): string {
    return new Date().toISOString()
  }

  protected paginate<V>(
    countStmt: Database.Statement,
    listStmt: Database.Statement,
    page: number,
    pageSize: number,
    mapper: (row: Record<string, unknown>) => V,
    searchParams?: unknown[]
  ): ListResponse<V> {
    const total = (
      (searchParams ? countStmt.get(...searchParams) : countStmt.get()) as Record<string, number>
    ).cnt
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const offset = (page - 1) * pageSize
    const rows = searchParams
      ? (listStmt.all(...searchParams, pageSize, offset) as Record<string, unknown>[])
      : (listStmt.all(pageSize, offset) as Record<string, unknown>[])
    return { items: rows.map(mapper), total, page, pageSize, totalPages }
  }
}
