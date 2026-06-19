/**
 * @file 认证与用户路由的 zod schema
 * @description 集中定义请求体校验规则，供 validateBody 中间件使用。
 *              密码策略与 routes 中的常量保持一致（最少 8 位）。
 * @module server/schemas
 */
import { z } from "zod";

/** 用户名规则：1-64 位，字母数字下划线连字符 */
const usernameField = z
  .string()
  .min(1, "用户名不能为空")
  .max(64, "用户名最长 64 个字符")
  .regex(/^[A-Za-z0-9_-]+$/, "用户名只能包含字母、数字、下划线和连字符");

/** 密码规则：最少 8 位，最长 128 位 */
const passwordField = z
  .string()
  .min(8, "密码至少需要 8 个字符")
  .max(128, "密码最长 128 个字符");

/** 显示名称：可选，最长 64 位 */
const displayNameField = z.string().max(64, "显示名称最长 64 个字符").optional();

/** POST /api/auth/login */
export const loginSchema = z.object({
  username: usernameField,
  password: z.string().min(1, "请输入密码"),
});

/** POST /api/auth/register */
export const registerSchema = z.object({
  username: usernameField,
  password: passwordField,
  displayName: displayNameField,
});

/** POST /api/auth/setup（首个管理员） */
export const setupSchema = z.object({
  username: usernameField,
  password: passwordField,
  displayName: displayNameField,
});

/** PATCH /api/users/me */
export const updateMeSchema = z
  .object({
    displayName: displayNameField,
    currentPassword: z.string().optional(),
    newPassword: passwordField,
  })
  .partial()
  .refine((data) => data.newPassword === undefined || data.currentPassword !== undefined, {
    message: "修改密码需要提供当前密码",
    path: ["currentPassword"],
  });

/** POST /api/users（admin 创建用户） */
export const createUserSchema = z.object({
  username: usernameField,
  password: passwordField,
  displayName: displayNameField,
  role: z.enum(["admin", "developer", "user"]).optional(),
});

/** PATCH /api/users/:id（admin 更新用户） */
export const updateUserSchema = z
  .object({
    displayName: displayNameField,
    role: z.enum(["admin", "developer", "user"]),
    password: passwordField,
  })
  .partial();
