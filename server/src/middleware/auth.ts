import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { stmts } from "../db";
import { AuthenticatedRequest, AuthenticatedUser, UserRecord } from "../types";
import { hashApiKey } from "../utils/keys";

function getJwtSecret(): string {
  return process.env.JWT_SECRET || "";
}

function getApiKey(): string | undefined {
  return process.env.MARKETPLACE_API_KEY;
}

/**
 * 按 id 查询当前有效用户。
 *
 * 每个请求都查库（SQLite 同步查询，成本可忽略）：
 * - 用户被删除后，旧 JWT 立即失效（等效吊销）
 * - 角色变更后立即生效，不再依赖 JWT 中签发时的旧 role
 * @param id - JWT 中的 userId
 * @returns 当前用户视图；不存在则 null
 */
function userFromDb(id: string | undefined): AuthenticatedUser | null {
  if (!id) return null;
  const user = stmts.userGetById.get(id) as UserRecord | undefined;
  return user ? toAuthenticatedUser(user) : null;
}

/** 从 UserRecord 提取已认证用户视图（不含敏感字段） */
function toAuthenticatedUser(user: UserRecord): AuthenticatedUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    role: user.role,
  };
}

export function extractUser(
  req: AuthenticatedRequest,
): AuthenticatedUser | null {
  const auth = req.headers.authorization;
  if (!auth) return null;

  if (auth.startsWith("Bearer ")) {
    const token = auth.slice(7);

    // 1) JWT：验签后以数据库中的最新用户/角色为准
    const jwtSecret = getJwtSecret();
    if (jwtSecret) {
      try {
        const decoded = jwt.verify(token, jwtSecret) as { userId?: string };
        if (decoded?.userId) {
          return userFromDb(decoded.userId);
        }
      } catch {
        // 不是有效 JWT，继续尝试 API key
      }
    }

    // 2) API Key 哈希路径（新数据）：SHA-256(token) 查 api_key_hash
    const hashed = hashApiKey(token);
    const byHash = stmts.userGetByApiKeyHash.get(hashed) as UserRecord | undefined;
    if (byHash) {
      return toAuthenticatedUser(byHash);
    }

    // 3) API Key 明文路径（旧数据兼容）：命中后自动迁移到 hash，清空明文
    const byPlaintext = stmts.userGetByApiKey.get(token) as UserRecord | undefined;
    if (byPlaintext) {
      try {
        stmts.userSetApiKeyHash.run(hashed, new Date().toISOString(), byPlaintext.id);
      } catch {
        // 迁移失败不阻断认证；下次仍可命中明文路径重试
      }
      return toAuthenticatedUser(byPlaintext);
    }

    // 4) Legacy 全局 MARKETPLACE_API_KEY：默认关闭，仅显式 ALLOW_LEGACY_ADMIN_KEY=1 时兼容旧部署
    if (process.env.ALLOW_LEGACY_ADMIN_KEY === "1") {
      const apiKey = getApiKey();
      if (apiKey && token === apiKey) {
        return {
          id: "legacy-admin",
          username: "admin",
          displayName: "Legacy Admin",
          role: "admin",
        };
      }
    }
  }

  return null;
}

// Auth middleware — attaches user to request for write operations
export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  // GET requests are always public
  if (req.method === "GET") {
    // Still extract user if available (for ?all=true admin queries)
    req.user = extractUser(req) || undefined;
    next();
    return;
  }

  const user = extractUser(req);
  if (!user) {
    res
      .status(401)
      .json({
        error: {
          message: "Missing or invalid Authorization header",
          code: "UNAUTHORIZED",
        },
      });
    return;
  }

  req.user = user;
  next();
}

// Role check middleware factory
export function requireRole(...roles: string[]) {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): void => {
    if (!req.user) {
      res.status(401).json({
        error: { message: "Authentication required", code: "UNAUTHORIZED" },
      });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: {
          message: `Role ${roles.join(" or ")} required`,
          code: "FORBIDDEN",
        },
      });
      return;
    }
    next();
  };
}
