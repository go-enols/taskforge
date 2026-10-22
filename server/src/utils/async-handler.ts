/**
 * @file Express 异步路由包装器
 * @description Express 4 不会捕获 async handler 的 rejected Promise（只有同步 throw 才会
 *              进入错误中间件）。未被捕获的 rejection 在 Node >= 15 默认会终止进程，
 *              因此所有 async 路由都必须经此包装器转发到 next(err)。
 * @module server/utils
 */
import { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * 包装 async 路由处理器，把 rejected Promise 转交给 Express 错误中间件。
 *
 * @param fn - async 路由处理函数
 * @returns 符合 Express 签名的同步包装函数
 *
 * @example
 * router.post("/login", asyncHandler(async (req, res) => { ... }))
 */
export function asyncHandler<T extends Request = Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req as T, res, next)).catch(next);
  };
}

/**
 * 判断错误是否为 SQLite 唯一约束冲突（并发注册/初始化竞态）。
 *
 * @param err - 捕获到的异常
 * @returns 是否为 UNIQUE 约束错误
 */
export function isUniqueConstraintError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  return (
    e.code === "SQLITE_CONSTRAINT_UNIQUE" ||
    e.code === "SQLITE_CONSTRAINT_PRIMARYKEY" ||
    (typeof e.message === "string" && e.message.includes("UNIQUE constraint failed"))
  );
}
