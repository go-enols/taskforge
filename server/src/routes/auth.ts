/**
 * @file 认证路由（登录/注册/初始化）
 * @description 提供用户登录（JWT 签发）、注册（默认 user 角色）和首次初始化（创建管理员）接口。
 * @module server/routes
 */
import { Router, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { randomBytes } from "crypto";
import { stmts } from "../db";
import { AuthenticatedRequest, UserRecord } from "../types";
import { authMiddleware, requireRole } from "../middleware/auth";

/** 认证路由实例 */
const router = Router();

/** 获取 JWT 签名密钥（从环境变量读取） */
function getJwtSecret(): string {
  return process.env.JWT_SECRET || "";
}

// POST /api/auth/login
/** 用户登录：验证用户名密码，返回 JWT Token（24h 有效期） */
router.post("/login", async (req: AuthenticatedRequest, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({
      error: {
        message: "请输入用户名和密码",
        code: "VALIDATION_ERROR",
      },
    });
    return;
  }

  const user = stmts.userGetByUsername.get(username) as UserRecord | undefined;
  if (!user) {
    res
      .status(401)
      .json({
        error: { message: "用户名或密码错误", code: "UNAUTHORIZED" },
      });
    return;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    res
      .status(401)
      .json({
        error: { message: "用户名或密码错误", code: "UNAUTHORIZED" },
      });
    return;
  }

  const token = jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    getJwtSecret(),
    { expiresIn: "24h" },
  );

  res.json({
    data: {
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
      },
    },
  });
});

// POST /api/auth/register (public — anyone can register as a regular user)
/** 用户注册：创建新用户（默认 role=user），返回 JWT Token */
router.post("/register", async (req: AuthenticatedRequest, res: Response) => {
  const { username, password, displayName } = req.body

  if (!username || !password) {
    res.status(400).json({
      error: {
        message: "请输入用户名和密码",
        code: "VALIDATION_ERROR",
      },
    })
    return
  }

  if (password.length < 4) {
    res.status(400).json({
      error: {
        message: "密码至少需要 4 个字符",
        code: "VALIDATION_ERROR",
      },
    })
    return
  }

  const existing = stmts.userGetByUsername.get(username) as
    | UserRecord
    | undefined
  if (existing) {
    res.status(409).json({
      error: { message: "用户名已存在", code: "CONFLICT" },
    })
    return
  }

  const id = uuidv4()
  const passwordHash = await bcrypt.hash(password, 8)
  const apiKey = randomBytes(32).toString("hex")
  const now = new Date().toISOString()

  stmts.userInsert.run(
    id,
    username,
    passwordHash,
    displayName || username,
    "user",
    apiKey,
    now,
    now,
  )

  const created = stmts.userGetById.get(id) as UserRecord
  const token = jwt.sign(
    { userId: created.id, username: created.username, role: created.role },
    getJwtSecret(),
    { expiresIn: "24h" },
  )

  res.status(201).json({
    data: {
      token,
      user: {
        id: created.id,
        username: created.username,
        displayName: created.display_name,
        role: created.role,
      },
    },
  })
})

// POST /api/auth/setup (first-run — only works when 0 users exist)
/** 首次初始化：当系统中无用户时创建第一个管理员账号（仅可调用一次） */
router.post("/setup", async (req: AuthenticatedRequest, res: Response) => {
  const count = stmts.userCount.get() as { count: number }
  if (count.count > 0) {
    res.status(403).json({
      error: {
        message: "已初始化完成，请使用登录功能",
        code: "FORBIDDEN",
      },
    })
    return
  }

  const { username, password, displayName } = req.body

  if (!username || !password) {
    res.status(400).json({
      error: {
        message: "请输入用户名和密码",
        code: "VALIDATION_ERROR",
      },
    })
    return
  }

  if (password.length < 6) {
    res.status(400).json({
      error: {
        message: "密码至少需要 6 个字符",
        code: "VALIDATION_ERROR",
      },
    })
    return
  }

  const id = uuidv4()
  const passwordHash = await bcrypt.hash(password, 8)
  const apiKey = randomBytes(32).toString("hex")
  const now = new Date().toISOString()

  stmts.userInsert.run(
    id,
    username,
    passwordHash,
    displayName || username,
    "admin",
    apiKey,
    now,
    now,
  )

  const created = stmts.userGetById.get(id) as UserRecord
  const token = jwt.sign(
    { userId: created.id, username: created.username, role: created.role },
    getJwtSecret(),
    { expiresIn: "24h" },
  )

  res.status(201).json({
    data: {
      token,
      user: {
        id: created.id,
        username: created.username,
        displayName: created.display_name,
        role: created.role,
      },
    },
  })
})

export default router;
