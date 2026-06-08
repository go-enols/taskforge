/**
 * @file 项目模板 CRUD 路由
 * @description 提供项目模板 (ProjectTemplate) 的列表、详情、创建、更新、
 *              部分更新 (切换可见性)、删除和审核功能。供客户端 /admin/templates
 *              页面与社区分享使用。
 *
 * 与 templates (账户模板) 的区别:
 * - 账户模板: 脚本/账户数据结构定义 (含 schema/checksum/zip 文件)
 * - 项目模板: 项目元数据表单字段定义 (含 fields 数组, 无文件)
 *
 * @module server/routes
 */
import { Router, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { stmts } from "../db";
import { AuthenticatedRequest } from "../types";
import { requireRole } from "../middleware/auth";

/** 项目模板路由实例 */
const router = Router();

/**
 * 行映射：数据库行 → 响应对象
 * 解析 fields JSON, 关联创建者用户名
 */
function rowToProjectTemplate(row: Record<string, unknown>) {
  const createdBy = (row.created_by as string) || undefined;
  let createdByName: string | undefined;
  if (createdBy) {
    const user = stmts.userGetById.get(createdBy) as { display_name?: string } | undefined;
    createdByName = user?.display_name;
  }
  let fields: Array<Record<string, unknown>> = [];
  try {
    const raw = row.fields as string;
    const parsed = JSON.parse(raw || "[]");
    if (Array.isArray(parsed)) fields = parsed;
  } catch {
    fields = [];
  }
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    icon: row.icon as string,
    fields,
    visible: (row.visible as number) === 1,
    createdBy,
    createdByName: createdByName || createdBy,
    reviewStatus: (row.review_status as string) || "pending",
    reviewComment: (row.review_comment as string) || "",
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/**
 * 校验项目模板 fields 数组结构
 * 必须是数组, 每项是 { name: string, title: string, type: enum, required?: boolean, default?: any, options?: [{label,value}], placeholder?: string, description?: string }
 */
function validateFields(fields: unknown): { valid: true; sanitized: Array<Record<string, unknown>> } | { valid: false; error: string } {
  if (!Array.isArray(fields)) {
    return { valid: false, error: "fields must be an array" };
  }
  const validTypes = ["string", "number", "boolean", "select"];
  const sanitized: Array<Record<string, unknown>> = [];
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i] as Record<string, unknown>;
    if (!f || typeof f !== "object") {
      return { valid: false, error: `fields[${i}] must be an object` };
    }
    if (typeof f.name !== "string" || !/^[a-zA-Z0-9_]+$/.test(f.name)) {
      return { valid: false, error: `fields[${i}].name must match /^[a-zA-Z0-9_]+$/` };
    }
    if (typeof f.title !== "string" || f.title.length === 0) {
      return { valid: false, error: `fields[${i}].title must be a non-empty string` };
    }
    if (typeof f.type !== "string" || !validTypes.includes(f.type)) {
      return { valid: false, error: `fields[${i}].type must be one of: ${validTypes.join(", ")}` };
    }
    const field: Record<string, unknown> = { name: f.name, title: f.title, type: f.type };
    if (typeof f.required === "boolean") field.required = f.required;
    if (f.default !== undefined) field.default = f.default;
    if (f.type === "select") {
      if (!Array.isArray(f.options)) {
        return { valid: false, error: `fields[${i}].options must be an array (type=select)` };
      }
      const opts: Array<Record<string, string>> = [];
      for (const o of f.options) {
        if (!o || typeof o !== "object" || typeof o.value !== "string" || typeof o.label !== "string") {
          return { valid: false, error: `fields[${i}].options[] must be {label:string, value:string}` };
        }
        opts.push({ label: o.label, value: o.value });
      }
      field.options = opts;
    }
    if (typeof f.placeholder === "string") field.placeholder = f.placeholder;
    if (typeof f.description === "string") field.description = f.description;
    sanitized.push(field);
  }
  return { valid: true, sanitized };
}

/** 列出项目模板 (普通用户仅看到 visible=1, 管理员 ?all=true 看全部) */
router.get("/", (req: AuthenticatedRequest, res: Response) => {
  const showAll = req.query.all === "true" && req.user?.role === "admin";
  const rows = showAll
    ? (stmts.projectTemplateGetAllAdmin.all() as Record<string, unknown>[])
    : (stmts.projectTemplateGetAll.all() as Record<string, unknown>[]);
  res.json({ data: { items: rows.map(rowToProjectTemplate), total: rows.length } });
});

/** 获取待审核项目模板 (管理员) */
router.get("/pending", requireRole("admin"), (_req: AuthenticatedRequest, res: Response) => {
  const rows = stmts.projectTemplateGetPending.all() as Record<string, unknown>[];
  res.json({ data: { items: rows.map(rowToProjectTemplate), total: rows.length } });
});

/** 按 ID 获取 */
router.get("/:id", (req: AuthenticatedRequest, res: Response) => {
  const row = stmts.projectTemplateGetById.get(req.params.id) as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ error: { message: "Project template not found", code: "NOT_FOUND" } });
    return;
  }
  res.json({ data: rowToProjectTemplate(row) });
});

/** 创建项目模板 (需要登录, 需审核除非 admin) */
router.post("/", (req: AuthenticatedRequest, res: Response) => {
  const body = req.body as Record<string, unknown>;
  if (typeof body.name !== "string" || body.name.trim().length === 0) {
    res.status(400).json({ error: { message: "name is required", code: "VALIDATION_ERROR" } });
    return;
  }
  if (typeof body.icon !== "string" || body.icon.length === 0) {
    res.status(400).json({ error: { message: "icon is required", code: "VALIDATION_ERROR" } });
    return;
  }
  const validation = validateFields(body.fields);
  if (!validation.valid) {
    res.status(400).json({ error: { message: validation.error, code: "VALIDATION_ERROR" } });
    return;
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  const description = typeof body.description === "string" ? body.description : "";
  // 管理员创建直接可见, 其他角色需审核
  const reviewStatus = req.user?.role === "admin" ? "approved" : "pending";
  const visible = req.user?.role === "admin" ? 1 : 0;

  stmts.projectTemplateInsert.run(
    id,
    body.name.trim(),
    description,
    body.icon,
    JSON.stringify(validation.sanitized),
    visible,
    req.user?.id ?? null,
    reviewStatus,
    "",
    now,
    now
  );
  const row = stmts.projectTemplateGetById.get(id) as Record<string, unknown>;
  res.status(201).json({ data: rowToProjectTemplate(row) });
});

/** 更新项目模板 (仅创建者或 admin) */
router.put("/:id", (req: AuthenticatedRequest, res: Response) => {
  const existing = stmts.projectTemplateGetById.get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: { message: "Project template not found", code: "NOT_FOUND" } });
    return;
  }
  const isAdmin = req.user?.role === "admin";
  const isAuthor = existing.created_by === req.user?.id;
  if (!isAdmin && !isAuthor) {
    res.status(403).json({ error: { message: "Forbidden", code: "FORBIDDEN" } });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : (existing.name as string);
  const description = typeof body.description === "string" ? body.description : (existing.description as string);
  const icon = typeof body.icon === "string" ? body.icon : (existing.icon as string);

  // 校验并清理 fields
  let finalFieldsJson: string = existing.fields as string;
  if (body.fields !== undefined) {
    const validation = validateFields(body.fields);
    if (!validation.valid) {
      res.status(400).json({ error: { message: validation.error, code: "VALIDATION_ERROR" } });
      return;
    }
    finalFieldsJson = JSON.stringify(validation.sanitized);
  }

  const now = new Date().toISOString();
  stmts.projectTemplateUpdate.run(name, description, icon, finalFieldsJson, existing.visible as number, now, req.params.id);
  const row = stmts.projectTemplateGetById.get(req.params.id) as Record<string, unknown>;
  res.json({ data: rowToProjectTemplate(row) });
});

/** 切换可见性 (admin) */
router.patch("/:id/visibility", requireRole("admin"), (req: AuthenticatedRequest, res: Response) => {
  const body = req.body as { visible?: boolean };
  if (typeof body.visible !== "boolean") {
    res.status(400).json({ error: { message: "visible (boolean) is required", code: "VALIDATION_ERROR" } });
    return;
  }
  const existing = stmts.projectTemplateGetById.get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: { message: "Project template not found", code: "NOT_FOUND" } });
    return;
  }
  stmts.projectTemplatePatch.run(body.visible ? 1 : 0, req.params.id);
  res.json({ data: { id: req.params.id, visible: body.visible } });
});

/** 审核项目模板 (admin) */
router.post("/:id/review", requireRole("admin"), (req: AuthenticatedRequest, res: Response) => {
  const body = req.body as { action?: "approve" | "reject"; comment?: string };
  if (body.action !== "approve" && body.action !== "reject") {
    res.status(400).json({ error: { message: "action must be 'approve' or 'reject'", code: "VALIDATION_ERROR" } });
    return;
  }
  const existing = stmts.projectTemplateGetById.get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: { message: "Project template not found", code: "NOT_FOUND" } });
    return;
  }
  const reviewStatus = body.action === "approve" ? "approved" : "rejected";
  const visible = body.action === "approve" ? 1 : 0;
  const now = new Date().toISOString();
  stmts.projectTemplateReview.run(reviewStatus, body.comment ?? "", visible, now, req.params.id);
  res.json({ data: { id: req.params.id, reviewStatus, visible: body.action === "approve" } });
});

/** 删除项目模板 (admin 或创建者) */
router.delete("/:id", (req: AuthenticatedRequest, res: Response) => {
  const existing = stmts.projectTemplateGetById.get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: { message: "Project template not found", code: "NOT_FOUND" } });
    return;
  }
  const isAdmin = req.user?.role === "admin";
  const isAuthor = existing.created_by === req.user?.id;
  if (!isAdmin && !isAuthor) {
    res.status(403).json({ error: { message: "Forbidden", code: "FORBIDDEN" } });
    return;
  }
  stmts.projectTemplateDelete.run(req.params.id);
  res.json({ data: { id: req.params.id, deleted: true } });
});

export default router;
