/**
 * @file EncryptionService — 加密服务
 * @description 封装 Electron safeStorage API，提供字符串加密/解密/检测能力。
 *              当 safeStorage 不可用时自动降级为明文存储（记录警告日志）。
 * @module main/services
 */

import { safeStorage } from 'electron'
import { createLogger } from '../utils/logger'

const logger = createLogger('encryption')

/**
 * 加密服务
 *
 * 使用 Electron 的 safeStorage 对敏感数据（私钥、助记词等）进行加密存储。
 * 加密结果以 base64 编码字符串返回。当操作系统不支持 safeStorage 时，
 * 透明降级为明文存储（不抛错），仅记录警告日志。
 *
 * @example
 * ```ts
 * const enc = new EncryptionService()
 * const encrypted = enc.encrypt('my-secret')
 * const decrypted = enc.decrypt(encrypted)
 * console.log(enc.isEncrypted(encrypted)) // true
 * ```
 */
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

  /** 检查操作系统是否支持 safeStorage 加密 */
  isAvailable(): boolean {
    return this.available
  }

  /**
   * 加密字符串
   *
   * 使用 safeStorage.encryptString 加密明文，结果以 base64 格式返回。
   * 如果加密不可用或输入为空，直接返回原字符串。
   *
   * @param plaintext - 待加密的明文字符串
   * @returns base64 编码的密文，或不可用时返回原文
   */
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

  /**
   * 解密密文
   *
   * 将 base64 编码的密文解码后通过 safeStorage.decryptString 解密。
   * 如果解密不可用、输入为空或解密失败，返回原字符串。
   *
   * @param ciphertext - base64 编码的密文字符串
   * @returns 解密后的明文字符串
   */
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

  /**
   * 检测字符串是否为加密格式
   *
   * 尝试以 base64 解码后调用 safeStorage.decryptString，成功则判定为已加密。
   *
   * @param value - 待检测的字符串
   * @returns 是否已加密
   */
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
