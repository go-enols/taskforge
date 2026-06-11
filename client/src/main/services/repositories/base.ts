/**
 * @file 数据仓库基类
 * @description 提供所有 Repository 的通用基类，封装预编译语句管理、JSON 序列化/反序列化、
 *              时间戳生成和通用分页查询逻辑。子类通过 prepareStatements() 注册各自的 SQL 预编译语句。
 * @module main/services/repositories
 */
import Database from 'better-sqlite3'
import type { ListResponse } from '../../../shared/types'

/**
 * 数据仓库抽象基类
 *
 * 封装了 better-sqlite3 的预编译语句生命周期管理，提供公用工具方法。
 * 子类需实现 prepareStatements() 注册所有需要使用的 SQL 语句。
 *
 * @template _T - 实体类型（仅用于类型约束，当前未参与运行时逻辑）
 *
 * @example
 * ```ts
 * class WalletRepository extends BaseRepository<Wallet> {
 *   prepareStatements(): void {
 *     this.setStmt('wallet.getById', this.db.prepare('SELECT * FROM wallets WHERE id = ?'))
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export abstract class BaseRepository<_T = unknown> {
  /** better-sqlite3 数据库连接实例 */
  protected db: Database.Database
  /** 预编译语句缓存映射表（名称 → Statement） */
  private _stmts: Map<string, Database.Statement>

  /**
   * @param db - better-sqlite3 数据库连接实例
   */
  constructor(db: Database.Database) {
    this.db = db
    this._stmts = new Map()
  }

  /**
   * 获取已注册的预编译语句
   * @param name - 语句名称（prepareStatements 中 setStmt 的名称）
   * @returns 预编译语句对象
   * @throws 当名称未注册时抛出异常
   */
  protected stmt(name: string): Database.Statement {
    const s = this._stmts.get(name)
    if (!s) throw new Error(`Prepared statement not found: ${name}`)
    return s
  }

  /**
   * 注册预编译语句
   * @param name - 语句名称（用于后续通过 stmt() 引用）
   * @param stmt - 预编译语句对象
   */
  protected setStmt(name: string, stmt: Database.Statement): void {
    this._stmts.set(name, stmt)
  }

  /**
   * 子类必须实现此方法，在构造函数中调用 prepareStatements() 注册所有 SQL 语句
   */
  protected abstract prepareStatements(): void

  /**
   * 将任意值序列化为 JSON 字符串
   * @param val - 要序列化的值
   * @returns JSON 字符串，null/undefined 输入返回 null
   */
  protected toJson(val: unknown): string | null {
    if (val === undefined || val === null) return null
    return JSON.stringify(val)
  }

  /**
   * 从 JSON 字符串解析为对象
   * @param val - JSON 字符串
   * @returns 解析后的对象，解析失败或输入为 null 时返回 null
   */
  protected fromJson<V>(val: string | null): V | null {
    if (val === null) return null
    try {
      return JSON.parse(val) as V
    } catch (err) {
      console.error('[BaseRepository.fromJson] JSON parse failed:', String(err).slice(0, 200))
      return null
    }
  }

  /**
   * 从 JSON 字符串解析为数组
   * @param val - JSON 字符串
   * @returns 解析后的数组，解析失败或输入为 null 时返回空数组
   */
  protected fromJsonArray<V>(val: string | null): V[] {
    if (val === null) return []
    try {
      return JSON.parse(val) as V[]
    } catch (err) {
      console.error('[BaseRepository.fromJsonArray] JSON parse failed:', String(err).slice(0, 200))
      return []
    }
  }

  /**
   * 获取当前时间的 ISO 8601 字符串
   * @returns 如 "2025-06-05T10:30:00.000Z"
   */
  protected nowISO(): string {
    return new Date().toISOString()
  }

  /**
   * 通用分页查询
   *
   * 执行两条 SQL：COUNT 查询获取总数，SELECT 查询获取分页数据。
   * 支持可选的搜索参数绑定。
   *
   * @param countStmt - COUNT 预编译语句
   * @param listStmt  - SELECT 预编译语句（需包含 LIMIT ? OFFSET ?）
   * @param page      - 当前页码（从 1 开始）
   * @param pageSize  - 每页条目数
   * @param mapper    - 行数据到实体对象的映射函数
   * @param searchParams - 可选的搜索参数数组（同时绑定到 countStmt 和 listStmt）
   * @returns 分页响应对象，包含 items 数组和分页元信息
   */
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
