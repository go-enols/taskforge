/**
 * @file 模板 CRUD 路由
 * @description 提供账户模板的列表、详情、创建、更新、部分更新、删除和审核功能。
 * @module server/routes
 */
import { Router, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { db, stmts } from "../db";
import { AuthenticatedRequest } from "../types";
import { requireRole } from "../middleware/auth";

/** 模板路由实例 */
const router = Router();

/**
 * 将数据库行记录转换为前端所需的模板响应格式
 * 解析 JSON 字段，关联创建者用户名
 *
 * @param row - 数据库查询结果行
 * @returns 格式化后的模板对象
 */
/** 安全解析 JSON 字段：已是对象直接返回，字符串则 JSON.parse，失败返回默认值 */
function safeJsonParse(value: unknown, defaultVal: unknown): unknown {
  if (typeof value === 'object' && value !== null) return value
  if (typeof value === 'string') {
    try { return JSON.parse(value) } catch { return defaultVal }
  }
  return defaultVal
}

function rowToTemplate(row: Record<string, unknown>) {
  const createdBy = (row.created_by as string) || undefined
  let createdByName: string | undefined
  if (createdBy) {
    const user = stmts.userGetById.get(createdBy) as { display_name?: string } | undefined
    createdByName = user?.display_name
  }
  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as string,
    version: row.version as string,
    description: row.description as string,
    schema: safeJsonParse(row.schema, {}),
    checksum: row.checksum as string,
    downloads: row.downloads as number,
    downloadCount: row.downloads as number,
    visible: (row.visible as number) === 1,
    createdBy,
    createdByName: createdByName || createdBy,
    reviewStatus: (row.review_status as string) || "pending",
    reviewComment: (row.review_comment as string) || "",
    updatedAt: row.updated_at as string,
  };
}

/** 获取模板列表：普通用户只看到可见模板，开发者可看到自己所有模板，管理员看到全部 */
router.get("/", (req: AuthenticatedRequest, res: Response) => {
    const showAll = req.query.all === "true" && (req.user?.role === "admin" || req.user?.role === "developer");
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize as string) || 50));
    let rows: Record<string, unknown>[];
    if (showAll) {
      rows = stmts.templateGetAllAdmin.all() as Record<string, unknown>[];
    } else if (req.user?.id && req.user?.role === "developer") {
      const visibleRows = stmts.templateGetAll.all() as Record<string, unknown>[];
      const authorRows = stmts.templateGetByAuthor.all(req.user.id) as Record<string, unknown>[];
      const visibleIds = new Set(visibleRows.map((r) => r.id));
      rows = [...visibleRows, ...authorRows.filter((r) => !visibleIds.has(r.id))];
    } else {
      rows = stmts.templateGetAll.all() as Record<string, unknown>[];
    }
    const total = rows.length;
    const offset = (page - 1) * pageSize;
    const sliced = rows.slice(offset, offset + pageSize);
    const items = sliced.map(rowToTemplate);
    res.json({ data: { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) } });
  });

/** 获取待审核模板列表（管理员专用） */
router.get("/pending", requireRole("admin"), (req: AuthenticatedRequest, res: Response) => {
  const rows = stmts.templateGetPending.all() as Record<string, unknown>[];
  const items = rows.map(rowToTemplate);
  res.json({ data: { items, total: items.length } });
});

/** 获取当前用户的待审核模板列表 */
router.get("/my-pending", requireRole("admin", "developer"), (req: AuthenticatedRequest, res: Response) => {
  const rows = stmts.templateGetMySubmissions.all(req.user?.id) as Record<string, unknown>[];
  const items = rows.map(rowToTemplate);
  res.json({ data: { items, total: items.length } });
});

/** 获取模板详情：非公开模板仅创建者和管理员可查看 */
router.get("/:id", (req: AuthenticatedRequest, res: Response) => {
  const row = stmts.templateGetById.get(req.params.id) as
    | Record<string, unknown>
    | undefined;
  if (!row) {
    res
      .status(404)
      .json({ error: { message: "模板不存在", code: "NOT_FOUND" } });
    return;
  }
  if ((row.visible as number) !== 1) {
    const isAuthor = req.user?.id && row.created_by === req.user.id;
    const isAdmin = req.user?.role === "admin";
    if (!isAuthor && !isAdmin) {
      res
        .status(404)
        .json({ error: { message: "模板不存在", code: "NOT_FOUND" } });
      return;
    }
  }
  res.json({ data: rowToTemplate(row) });
});

/** 创建新模板：管理员直接可见，开发者需审核 */
router.post(
  "/",
  requireRole("admin", "developer"),
  (req: AuthenticatedRequest, res: Response) => {
    const { name, type, version, description, schema } = req.body;
    if (!name || !type) {
      res
        .status(400)
        .json({
          error: {
            message: "名称和类型不能为空",
            code: "VALIDATION_ERROR",
          },
        });
      return;
    }

    const id = req.body.id || uuidv4();
    const now = new Date().toISOString();
    const schemaJson =
      typeof schema === "string" ? schema : JSON.stringify(schema || {});

    const visible = req.user?.role === "admin" ? 1 : 0
    const createdBy = req.user?.id || null
    const reviewStatus = req.user?.role === "admin" ? "approved" : "pending"

    stmts.templateInsert.run(
      id,
      name,
      type,
      version || "1.0.0",
      description || "",
      schemaJson,
      "",
      0,
      visible,
      createdBy,
      reviewStatus,
      "",
      now,
      now,
    );

    const row = stmts.templateGetById.get(id) as Record<string, unknown>;
    res.status(201).json({ data: rowToTemplate(row) });
  },
);

/** 更新模板：非管理员只能修改自己创建的模板 */
router.put(
  "/:id",
  requireRole("admin", "developer"),
  (req: AuthenticatedRequest, res: Response) => {
    const existing = stmts.templateGetById.get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!existing) {
      res
        .status(404)
        .json({ error: { message: "模板不存在", code: "NOT_FOUND" } });
      return;
    }

    if (req.user?.role !== "admin" && existing.created_by !== req.user?.id) {
      res
        .status(403)
        .json({ error: { message: "只能修改自己创建的模板", code: "FORBIDDEN" } });
      return;
    }

    const { name, type, version, description, schema } = req.body;
    const now = new Date().toISOString();
    const schemaJson =
      typeof schema === "string"
        ? schema
        : JSON.stringify(schema || existing.schema);

    stmts.templateUpdate.run(
      name || existing.name,
      type || existing.type,
      version || existing.version,
      description !== undefined ? description : existing.description,
      schemaJson,
      existing.checksum,
      now,
      req.params.id,
    );

    const row = stmts.templateGetById.get(req.params.id) as Record<
      string,
      unknown
    >;
    res.json({ data: rowToTemplate(row) });
  },
);

/** 部分更新模板：支持修改 visible、name、type、version 等字段 */
router.patch(
  "/:id",
  requireRole("admin", "developer"),
  (req: AuthenticatedRequest, res: Response) => {
    const existing = stmts.templateGetById.get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!existing) {
      res
        .status(404)
        .json({ error: { message: "模板不存在", code: "NOT_FOUND" } });
      return;
    }

    if (req.user?.role !== "admin" && existing.created_by !== req.user?.id) {
      res
        .status(403)
        .json({ error: { message: "只能修改自己创建的模板", code: "FORBIDDEN" } });
      return;
    }

    const { visible, name, type, version, description, schema } = req.body;

    if (visible !== undefined) {
      stmts.templatePatch.run(visible ? 1 : 0, req.params.id);
    }

    if (
      name ||
      type ||
      version ||
      description !== undefined ||
      schema !== undefined
    ) {
      const now = new Date().toISOString();
      const schemaJson =
        typeof schema === "string"
          ? schema
          : JSON.stringify(
              schema ?? safeJsonParse(existing.schema, {}),
            );
      stmts.templateUpdate.run(
        name ?? existing.name,
        type ?? existing.type,
        version ?? existing.version,
        description !== undefined ? description : existing.description,
        schemaJson,
        existing.checksum,
        now,
        req.params.id,
      );
    }

    const row = stmts.templateGetById.get(req.params.id) as Record<
      string,
      unknown
    >;
    res.json({ data: rowToTemplate(row) });
  },
);

/** 删除模板：非管理员只能删除自己创建的模板 */
router.delete(
  "/:id",
  requireRole("admin", "developer"),
  (req: AuthenticatedRequest, res: Response) => {
    const existing = stmts.templateGetById.get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!existing) {
      res
        .status(404)
        .json({ error: { message: "模板不存在", code: "NOT_FOUND" } });
      return;
    }

    // 开发者只能删除自己创建的模板
    if (req.user?.role !== "admin" && existing.created_by !== req.user?.id) {
      res
        .status(403)
        .json({ error: { message: "只能删除自己创建的模板", code: "FORBIDDEN" } });
      return;
    }

    stmts.templateDelete.run(req.params.id);
    res.json({ data: { deleted: true } });
  },
);

/** 审核模板：管理员可 approve 或 reject，通过后自动设为可见 */
router.post("/:id/review", requireRole("admin"), (req: AuthenticatedRequest, res: Response) => {
  const existing = stmts.templateGetById.get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: { message: "模板不存在", code: "NOT_FOUND" } });
    return;
  }

  const { action, comment } = req.body;
  if (!action || !["approve", "reject"].includes(action)) {
    res.status(400).json({ error: { message: "操作无效，需要 approve 或 reject", code: "VALIDATION_ERROR" } });
    return;
  }

  const now = new Date().toISOString();
  const reviewStatus = action === "approve" ? "approved" : "rejected";
  const visible = action === "approve" ? 1 : 0;

  stmts.templateReview.run(reviewStatus, comment || "", visible, now, req.params.id);

  const row = stmts.templateGetById.get(req.params.id) as Record<string, unknown>;
  res.json({ data: rowToTemplate(row) });
});

export default router;
