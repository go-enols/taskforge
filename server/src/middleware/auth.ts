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

    // 1) JWT 优先
    const jwtSecret = getJwtSecret();
    if (jwtSecret) {
      try {
        const decoded = jwt.verify(token, jwtSecret) as {
          userId: string;
          username: string;
          role: string;
        };
        return {
          id: decoded.userId,
          username: decoded.username,
          displayName: decoded.username,
          role: decoded.role as "admin" | "developer" | "user",
        };
      } catch {
        // Not a valid JWT, continue to API key check
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

    // 4) Legacy 全局 MARKETPLACE_API_KEY（环境变量配置的管理员 key）
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
      res
        .status(401)
        .json({
          error: { message: "Authentication required", code: "UNAUTHORIZED" },
        });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res
        .status(403)
        .json({
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
