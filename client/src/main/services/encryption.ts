import { safeStorage } from 'electron'
import { createLogger } from '../utils/logger'

const logger = createLogger('encryption')

export class EncryptionService {
  private available: boolean
  private safeStorage: typeof safeStorage | null = null

  constructor() {
    try {
      this.safeStorage = safeStorage
      this.available = this.safeStorage?.isEncryptionAvailable() ?? false
    } catch {
      this.available = false
    }
    if (!this.available) {
      logger.warn('safeStorage not available, falling back to plaintext storage')
    }
  }

  isAvailable(): boolean {
    return this.available
  }

  encrypt(plaintext: string): string {
    if (!plaintext) return plaintext
    if (!this.available || !this.safeStorage) return plaintext
    try {
      const buffer = this.safeStorage.encryptString(plaintext)
      return buffer.toString('base64')
    } catch (err) {
      logger.error('Encryption failed', { error: String(err) })
      return plaintext
    }
  }

  decrypt(ciphertext: string): string {
    if (!ciphertext) return ciphertext
    if (!this.available || !this.safeStorage) return ciphertext
    try {
      const buffer = Buffer.from(ciphertext, 'base64')
      return this.safeStorage.decryptString(buffer)
    } catch (err) {
      console.error('[encryption] Decryption failed:', err)
      return ciphertext
    }
  }

  isEncrypted(value: string): boolean {
    if (!value) return false
    if (!this.available || !this.safeStorage) return false
    try {
      const buffer = Buffer.from(value, 'base64')
      if (buffer.length === 0) return false
      this.safeStorage.decryptString(buffer)
      return true
    } catch {
      return false
    }
  }
}
