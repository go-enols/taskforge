/**
 * @file 服务端共享类型定义
 * @description 定义用户记录、已认证用户以及认证请求的类型。
 * @module server
 */
import { Request } from 'express'

/** 用户记录 — 对应 users 表的数据库行记录 */
/** 用户数据库记录 — 对应 users 表的完整行数据 */
export interface UserRecord {
  /** 用户 UUID */
  id: string
  /** 登录用户名（唯一） */
  username: string
  /** bcrypt 加密的密码哈希 */
  password_hash: string
  /** 显示名称 */
  display_name: string
  /** 角色：admin（管理员）/ developer（开发者）/ user（普通用户） */
  role: 'admin' | 'developer' | 'user'
  /** API 密钥（用于 Bearer Token 认证） */
  api_key: string
  /** ISO 8601 创建时间 */
  created_at: string
  /** ISO 8601 更新时间 */
  updated_at: string
}

/** 已认证用户（从 token/API key 解析后的用户信息，不含密码） */
export interface AuthenticatedUser {
  /** 用户 UUID */
  id: string
  /** 用户名 */
  username: string
  /** 显示名称 */
  displayName: string
  /** 角色 */
  role: 'admin' | 'developer' | 'user'
}

/** 脚本评分/评论记录 */
export interface ScriptReview {
  /** 评分 UUID */
  id: string
  /** 关联的脚本 ID */
  scriptId: string
  /** 评分用户 ID */
  userId: string
  /** 用户名（展示用） */
  username?: string
  /** 评分（1-5星） */
  rating: number
  /** 评论内容（可选） */
  comment?: string
  /** ISO 8601 创建时间 */
  createdAt: string
  /** ISO 8601 更新时间 */
  updatedAt: string
}

/** 扩展 Express Request，添加 user 属性用于认证后的请求 */
export interface AuthenticatedRequest extends Request {
  /** 当前认证用户信息（未认证时为 undefined） */
  user?: AuthenticatedUser
}
