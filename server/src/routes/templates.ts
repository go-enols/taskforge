import { Router, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { db, stmts } from "../db";
import { AuthenticatedRequest } from "../types";
import { requireRole } from "../middleware/auth";

const router = Router();

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
    schema: JSON.parse((row.schema as string) || "{}"),
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

router.get("/", (req: AuthenticatedRequest, res: Response) => {
    const showAll = req.query.all === "true" && (req.user?.role === "admin" || req.user?.role === "developer");
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
    const items = rows.map(rowToTemplate);
    res.json({ data: { items, total: items.length } });
  });

router.get("/pending", requireRole("admin"), (req: AuthenticatedRequest, res: Response) => {
  const rows = stmts.templateGetPending.all() as Record<string, unknown>[];
  const items = rows.map(rowToTemplate);
  res.json({ data: { items, total: items.length } });
});

router.get("/my-pending", requireRole("admin", "developer"), (req: AuthenticatedRequest, res: Response) => {
  const rows = stmts.templateGetPendingByAuthor.all(req.user?.id) as Record<string, unknown>[];
  const items = rows.map(rowToTemplate);
  res.json({ data: { items, total: items.length } });
});

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
              schema ?? JSON.parse((existing.schema as string) || "{}"),
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
