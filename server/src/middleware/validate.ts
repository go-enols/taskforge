/**
 * @file zod 请求体校验中间件
 * @description 用 zod schema 校验 req.body，失败返回 400 + 字段级错误信息。
 *              替代路由内手写的 `if (!x)` 校验，统一错误格式与类型推导。
 * @module server/middleware
 */
import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import { AuthenticatedRequest } from "../types";

/** zod 校验失败的统一错误响应格式 */
export interface ValidationErrorResponse {
  error: {
    message: string;
    code: "VALIDATION_ERROR";
    issues: Array<{ path: string; message: string }>;
  };
}

/**
 * 创建请求体校验中间件。校验通过后将 parsed 结果写回 req.body（剥离多余字段）。
 * @param schema zod schema，描述期望的请求体结构
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (result.success) {
      req.body = result.data;
      next();
      return;
    }
    const issues = result.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
    const first = issues[0];
    const message = first.path
    _res.status(400).json({
      error: {
        message,
        code: "VALIDATION_ERROR",
        issues,
      },
    });
  };
}
