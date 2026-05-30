import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import type { Wallet, ListResponse } from '../../../shared/types'
import { BaseRepository } from './base'
import { EncryptionService } from '../encryption'

export class WalletRepository extends BaseRepository<Wallet> {
  private encryption: EncryptionService

  constructor(db: Database.Database, encryption?: EncryptionService) {
    super(db)
    this.encryption = encryption || new EncryptionService()
    this.prepareStatements()
  }

  prepareStatements(): void {
    this.setStmt(
      'wallet.insert',
      this.db.prepare(
        'INSERT INTO wallets (id, address, private_key, mnemonic, wallet_type, labels, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
    )
    this.setStmt('wallet.getById', this.db.prepare('SELECT * FROM wallets WHERE id = ?'))
    this.setStmt('wallet.delete', this.db.prepare('DELETE FROM wallets WHERE id = ?'))
    this.setStmt('wallet.count', this.db.prepare('SELECT COUNT(*) as cnt FROM wallets'))
    this.setStmt(
      'wallet.countByType',
      this.db.prepare('SELECT wallet_type, COUNT(*) as cnt FROM wallets GROUP BY wallet_type')
    )
  }

  private rowToWallet(row: Record<string, unknown>): Wallet {
    return {
      id: row.id as string,
      address: row.address as string,
      privateKey: this.encryption.decrypt(row.private_key as string) || null,
      mnemonic: this.encryption.decrypt(row.mnemonic as string) || null,
      walletType: row.wallet_type as Wallet['walletType'],
      labels: this.fromJsonArray<string>(row.labels as string | null),
      createdAt: row.created_at as string
    }
  }

  count(): number {
    return (this.stmt('wallet.count').get() as Record<string, number>).cnt
  }

  countByType(): Record<string, number> {
    const rows = this.stmt('wallet.countByType').all() as Record<string, unknown>[]
    const result: Record<string, number> = {}
    for (const row of rows) {
      result[row.wallet_type as string] = row.cnt as number
    }
    return result
  }

  createWallet(data: Omit<Wallet, 'id' | 'createdAt'>): Wallet {
    const id = uuidv4()
    const createdAt = this.nowISO()
    this.stmt('wallet.insert').run(
      id,
      data.address,
      data.privateKey ? this.encryption.encrypt(data.privateKey) : null,
      data.mnemonic ? this.encryption.encrypt(data.mnemonic) : null,
      data.walletType,
      this.toJson(data.labels),
      createdAt
    )
    return this.getWallet(id)!
  }

  getWallet(id: string): Wallet | null {
    const row = this.stmt('wallet.getById').get(id) as Record<string, unknown> | undefined
    return row ? this.rowToWallet(row) : null
  }

  listWallets(page = 1, pageSize = 20, search?: string): ListResponse<Wallet> {
    if (search) {
      const countStmt = this.db.prepare(
        'SELECT COUNT(*) as cnt FROM wallets WHERE address LIKE ? OR wallet_type LIKE ?'
      )
      const listStmt = this.db.prepare(
        'SELECT * FROM wallets WHERE address LIKE ? OR wallet_type LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
      )
      return this.paginate(countStmt, listStmt, page, pageSize, (r) => this.rowToWallet(r), [
        `%${search}%`,
        `%${search}%`
      ])
    }
    const countStmt = this.stmt('wallet.count')
    const listStmt = this.db.prepare(
      'SELECT * FROM wallets ORDER BY created_at DESC LIMIT ? OFFSET ?'
    )
    return this.paginate(countStmt, listStmt, page, pageSize, (r) => this.rowToWallet(r))
  }

  updateWallet(id: string, data: Partial<Omit<Wallet, 'id' | 'createdAt'>>): Wallet | null {
    const existing = this.getWallet(id)
    if (!existing) return null
    const updated = { ...existing, ...data }
    this.db
      .prepare(
        'UPDATE wallets SET address=?, private_key=?, mnemonic=?, wallet_type=?, labels=? WHERE id=?'
      )
      .run(
        updated.address,
        updated.privateKey ? this.encryption.encrypt(updated.privateKey) : null,
        updated.mnemonic ? this.encryption.encrypt(updated.mnemonic) : null,
        updated.walletType,
        this.toJson(updated.labels),
        id
      )
    return this.getWallet(id)
  }

  deleteWallet(id: string): boolean {
    const result = this.stmt('wallet.delete').run(id)
    return result.changes > 0
  }

  batchCreateWallets(items: Omit<Wallet, 'id' | 'createdAt'>[]): number {
    const insert = this.stmt('wallet.insert')
    const transaction = this.db.transaction((data: Omit<Wallet, 'id' | 'createdAt'>[]) => {
      let count = 0
      for (const item of data) {
        const id = uuidv4()
        const createdAt = this.nowISO()
        insert.run(
          id,
          item.address,
          item.privateKey ? this.encryption.encrypt(item.privateKey) : null,
          item.mnemonic ? this.encryption.encrypt(item.mnemonic) : null,
          item.walletType,
          this.toJson(item.labels),
          createdAt
        )
        count++
      }
      return count
    })
    return transaction(items)
  }

  batchDeleteWallets(ids: string[]): number {
    const del = this.stmt('wallet.delete')
    const transaction = this.db.transaction((idList: string[]) => {
      let count = 0
      for (const id of idList) {
        const result = del.run(id)
        count += result.changes
      }
      return count
    })
    return transaction(ids)
  }
}
