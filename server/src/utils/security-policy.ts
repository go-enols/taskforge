/**
 * @file 安全策略常量
 * @description 密码长度与 bcrypt cost 的统一配置，供 auth/users 路由共用。
 *              统一策略避免出现“注册 4 位密码、管理员创建用户 10 rounds、注册 8 rounds”这类不一致。
 * @module server/utils
 */

/** 密码最小长度（注册 / 初始化 / 管理员创建 / 修改密码统一） */
export const MIN_PASSWORD_LENGTH = 8

/** bcrypt cost（统一成本，10 为 Node 生态常用值） */
export const BCRYPT_ROUNDS = 10

/** 校验密码长度，返回错误信息或 null */
export function validatePasswordLength(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `密码至少需要 ${MIN_PASSWORD_LENGTH} 个字符`
  }
  return null
}
