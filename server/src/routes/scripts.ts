/**
 * @file 脚本 CRUD 路由
 * @description 提供脚本的列表、详情、下载、上传、更新、删除、重新上传和审核功能。
 *              上传时自动解压并验证 manifest.json 格式。
 * @module server/routes
 */
import { Router, Request, Response } from "express";
import multer from "multer";
import { createHash } from "crypto";
import { execFileSync } from "child_process";
import { v4 as uuidv4 } from "uuid";
import { existsSync, rmSync } from "fs";
import { join, resolve } from "path";
import JSON5 from "json5";
import { db, stmts, getScriptsDir } from "../db";
import { AuthenticatedRequest } from "../types";
import { requireRole } from "../middleware/auth";

/** 脚本路由实例 */
const router = Router();

// 50MB file size limit
/** multer 文件上传中间件：存储到脚本目录，限制 50MB */
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, getScriptsDir()),
    filename: (_req, file, cb) =>
      cb(null, `${Date.now()}-${file.originalname}`),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

/**
 * 将数据库行记录转换为前端所需的脚本响应格式
 * 负责解析 JSON 字段、关联创建者用户名
 *
 * @param row - 数据库查询结果行
 * @returns 格式化后的脚本对象
 */
function rowToScript(row: Record<string, unknown>) {
  const createdBy = (row.created_by as string) || undefined
  let createdByName: string | undefined
  if (createdBy) {
    const user = stmts.userGetById.get(createdBy) as { display_name?: string } | undefined
    createdByName = user?.display_name
  }
  return {
    id: row.id as string,
    name: row.name as string,
    version: row.version as string,
    description: row.description as string,
    schema: JSON.parse((row.schema as string) || "{}"),
    entryPoint: row.entry_point as string,
    checksum: row.checksum as string,
    downloadUrl: `/api/scripts/${row.id}/download`,
    tags: JSON.parse((row.tags as string) || "[]"),
    changelog: row.changelog as string,
    downloads: row.downloads as number,
    visible: (row.visible as number) === 1,
    createdBy,
    createdByName: createdByName || createdBy,
    reviewStatus: (row.review_status as string) || "pending",
    reviewComment: (row.review_comment as string) || "",
    avgRating: (row.avg_rating as number) ?? 0,
    reviewCount: (row.review_count as number) ?? 0,
    updatedAt: row.updated_at as string,
  };
}

/** 获取脚本列表：普通用户只看到可见脚本，开发者可看到自己所有脚本，管理员看到全部 */
router.get("/", (req: AuthenticatedRequest, res: Response) => {
    const showAll = req.query.all === "true" && (req.user?.role === "admin" || req.user?.role === "developer");
    let rows: Record<string, unknown>[];
    if (showAll) {
      rows = stmts.scriptGetAllAdmin.all() as Record<string, unknown>[];
    } else if (req.user?.id && req.user?.role === "developer") {
      const visibleRows = stmts.scriptGetAll.all() as Record<string, unknown>[];
      const authorRows = stmts.scriptGetByAuthor.all(req.user.id) as Record<string, unknown>[];
      const visibleIds = new Set(visibleRows.map((r) => r.id));
      rows = [...visibleRows, ...authorRows.filter((r) => !visibleIds.has(r.id))];
    } else {
      rows = stmts.scriptGetAll.all() as Record<string, unknown>[];
    }
    const items = rows.map(rowToScript);
    res.json({ data: { items, total: items.length } });
  });

/** 获取待审核脚本列表（管理员专用） */
router.get("/pending", requireRole("admin"), (req: AuthenticatedRequest, res: Response) => {
  const rows = stmts.scriptGetPending.all() as Record<string, unknown>[];
  const items = rows.map(rowToScript);
  res.json({ data: { items, total: items.length } });
});

/** 获取当前用户的待审核脚本列表 */
router.get("/my-pending", requireRole("admin", "developer"), (req: AuthenticatedRequest, res: Response) => {
  const rows = stmts.scriptGetPendingByAuthor.all(req.user?.id) as Record<string, unknown>[];
  const items = rows.map(rowToScript);
  res.json({ data: { items, total: items.length } });
});

/** 获取脚本详情：非公开脚本仅创建者和管理员可查看 */
router.get("/:id", (req: AuthenticatedRequest, res: Response) => {
  const row = stmts.scriptGetById.get(req.params.id) as
    | Record<string, unknown>
    | undefined;
  if (!row) {
    res
      .status(404)
      .json({ error: { message: "脚本不存在", code: "NOT_FOUND" } });
    return;
  }
  if ((row.visible as number) !== 1) {
    const isAuthor = req.user?.id && row.created_by === req.user.id;
    const isAdmin = req.user?.role === "admin";
    if (!isAuthor && !isAdmin) {
      res
        .status(404)
        .json({ error: { message: "脚本不存在", code: "NOT_FOUND" } });
      return;
    }
  }
  res.json({ data: rowToScript(row) });
});

/** 下载脚本 zip 包：自动增加下载计数，校验路径安全性 */
router.get("/:id/download", (req: AuthenticatedRequest, res: Response) => {
  const row = stmts.scriptGetById.get(req.params.id) as
    | Record<string, unknown>
    | undefined;
  if (!row || ((row.visible as number) !== 1 && req.user?.role !== "admin")) {
    res
      .status(404)
      .json({ error: { message: "脚本不存在", code: "NOT_FOUND" } });
    return;
  }

  const resolved = resolve(getScriptsDir(), row.file_path as string);
  if (!resolved.startsWith(getScriptsDir())) {
    res
      .status(403)
      .json({ error: { message: "无效的文件路径", code: "FORBIDDEN" } });
    return;
  }
  if (!existsSync(resolved)) {
    res
      .status(404)
      .json({
        error: { message: "脚本文件不存在", code: "FILE_NOT_FOUND" },
      });
    return;
  }

  stmts.scriptIncrementDownloads.run(req.params.id);
  res.download(resolved, `${row.name}-${row.version}.zip`, (err) => {
    if (err) {
      if (!res.headersSent) {
        res
          .status(500)
          .json({
            error: { message: "下载失败", code: "DOWNLOAD_ERROR" },
          });
      }
    }
  });
});

/** 上传新脚本：自动解压并校验 manifest.json，管理员直接可见，开发者需审核 */
router.post(
  "/",
  requireRole("admin", "developer"),
  upload.single("file"),
  (req: AuthenticatedRequest, res: Response) => {
    if (!req.file) {
      res
        .status(400)
        .json({
          error: { message: "未上传文件", code: "VALIDATION_ERROR" },
        });
      return;
    }

    const { name, version, description, entryPoint, tags, changelog } =
      req.body;
    if (!name || !version) {
      rmSync(req.file.path, { force: true });
      res
        .status(400)
        .json({
          error: {
            message: "名称和版本不能为空",
            code: "VALIDATION_ERROR",
          },
        });
      return;
    }

    const id = uuidv4();
    // Validate manifest.json inside the uploaded zip
    let manifestErr: string | null = null;
    let manifestSchema: Record<string, unknown> | null = null;
    let tmpDir: string | undefined;
    try {
      // 解压 zip 包到临时目录
      const { mkdtempSync, readFileSync } = require("fs");
      const { join: pathJoin } = require("path");
      const { tmpdir } = require("os");

      tmpDir = mkdtempSync(pathJoin(tmpdir(), "script-upload-"));
      execFileSync("unzip", ["-o", req.file.path, "-d", tmpDir!], {
        timeout: 30000,
      });
      const manifestPath = pathJoin(tmpDir, "manifest.json");
      if (!existsSync(manifestPath)) {
        manifestErr = "zip 包中缺少 manifest.json 文件";
      } else {
        // 解析 manifest.json（支持 JSON5 注释语法）
        const manifestRaw = readFileSync(manifestPath, "utf-8");
        let manifest: Record<string, unknown>;
        try {
          manifest = JSON5.parse(manifestRaw) as Record<string, unknown>;
        } catch {
          manifestErr = "manifest.json 不是有效的 JSON（支持 JSON5 注释格式）";
          throw new Error();
        }
        // 校验必填字段
        const requiredFields = [
          "id",
          "name",
          "version",
          "description",
          "entryPoint",
          "runtime",
          "schema",
        ];
        for (const field of requiredFields) {
          if (!manifest[field]) {
            manifestErr = `manifest.json 缺少必填字段: ${field}`;
            throw new Error();
          }
        }
        // 校验运行时类型（目前仅支持 node）
        if (manifest.runtime !== "node") {
          manifestErr = 'manifest.json 中 runtime 必须为 "node"';
          throw new Error();
        }
        // 校验 schema 格式（必须是 object 类型的 JSON Schema）
        const mSchema = manifest.schema as Record<string, unknown>;
        if (
          !mSchema ||
          typeof mSchema !== "object" ||
          mSchema.type !== "object"
        ) {
          manifestErr =
            'manifest.json 中 schema 必须为 { "type": "object", ... } 格式的 JSON Schema';
          throw new Error();
        }
        manifestSchema = mSchema;

        // 校验可选字段 requiredAccountTemplateIds (string[])
        if (manifest.requiredAccountTemplateIds !== undefined) {
          const ids = manifest.requiredAccountTemplateIds;
          if (!Array.isArray(ids) || !ids.every((x) => typeof x === "string")) {
            manifestErr =
              "manifest.json 中 requiredAccountTemplateIds 必须为 string[] (UUID 数组)";
            throw new Error();
          }
        }

        // 校验可选字段 permissions (string[] from "network"|"filesystem")
        if (manifest.permissions !== undefined) {
          const perms = manifest.permissions;
          const validPerms = ["network", "filesystem"];
          if (
            !Array.isArray(perms) ||
            !perms.every((p) => typeof p === "string" && validPerms.includes(p))
          ) {
            manifestErr = `manifest.json 中 permissions 必须为 string[]，取值只能是: ${validPerms.join(", ")}`;
            throw new Error();
          }
        }
      }
    } catch (err) {
      if (!manifestErr) {
        // 捕获未预先处理的异常
        const msg = err instanceof Error ? err.message : String(err);
        manifestErr = `验证脚本包失败: ${msg}`;
        console.error(`[scripts] zip validation error: ${msg}`);
      }
    } finally {
      // 清理临时目录
      if (tmpDir) { try { rmSync(tmpDir, { recursive: true, force: true }) } catch {} }
    }
    if (manifestErr) {
      rmSync(req.file.path, { force: true });
      res
        .status(400)
        .json({ error: { message: manifestErr, code: "VALIDATION_ERROR" } });
      return;
    }

    const checksum = createHash("sha256")
      .update(require("fs").readFileSync(req.file.path))
      .digest("hex");
    const now = new Date().toISOString();
    const schema = manifestSchema ? JSON.stringify(manifestSchema) : "{}";
    const tagsJson =
      typeof tags === "string" ? tags : JSON.stringify(tags || []);

    const visible = req.user?.role === "admin" ? 1 : 0
    const createdBy = req.user?.id || null
    const reviewStatus = req.user?.role === "admin" ? "approved" : "pending"

    try {
      stmts.scriptInsert.run(
        id,
        name,
        version,
        description || "",
        schema,
        entryPoint || "",
        checksum,
        req.file.filename,
        tagsJson,
        changelog || "",
        0,
        visible,
        createdBy,
        reviewStatus,
        "",
        0,
        0,
        now,
        now,
      );
    } catch (dbErr) {
      rmSync(req.file.path, { force: true });
      const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      res
        .status(500)
        .json({
          error: { message: `数据库写入失败: ${msg}`, code: "DB_ERROR" },
        });
      return;
    }

    const row = stmts.scriptGetById.get(id) as Record<string, unknown>;
    res.status(201).json({ data: rowToScript(row) });
  },
);

/** 更新脚本：可替换 zip 包或修改元数据，非管理员只能修改自己的脚本 */
router.put(
  "/:id",
  requireRole("admin", "developer"),
  upload.single("file"),
  (req: AuthenticatedRequest, res: Response) => {
    const existing = stmts.scriptGetById.get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!existing) {
      if (req.file) rmSync(req.file.path, { force: true });
      res
        .status(404)
        .json({ error: { message: "脚本不存在", code: "NOT_FOUND" } });
      return;
    }

    if (req.user?.role !== "admin" && existing.created_by !== req.user?.id) {
      if (req.file) rmSync(req.file.path, { force: true });
      res
        .status(403)
        .json({ error: { message: "只能修改自己创建的脚本", code: "FORBIDDEN" } });
      return;
    }

    const { name, version, description, entryPoint, tags, changelog, schema } =
      req.body;
    const now = new Date().toISOString();

    let checksum = existing.checksum as string;
    let filePath = existing.file_path as string;

    if (req.file) {
      checksum = createHash("sha256")
        .update(require("fs").readFileSync(req.file.path))
        .digest("hex");
      const oldPath = join(getScriptsDir(), filePath);
      if (existsSync(oldPath)) rmSync(oldPath, { force: true });
      filePath = req.file.filename;
    }

    stmts.scriptUpdate.run(
      name || existing.name,
      version || existing.version,
      description !== undefined ? description : existing.description,
      schema || existing.schema,
      entryPoint || existing.entry_point,
      checksum,
      filePath,
      typeof tags === "string"
        ? tags
        : JSON.stringify(tags || JSON.parse((existing.tags as string) || "[]")),
      changelog !== undefined ? changelog : existing.changelog,
      now,
      req.params.id,
    );

    const row = stmts.scriptGetById.get(req.params.id) as Record<
      string,
      unknown
    >;
    res.json({ data: rowToScript(row) });
  },
);

/** 部分更新脚本：支持修改 visible、name、version 等字段 */
router.patch(
  "/:id",
  requireRole("admin", "developer"),
  (req: AuthenticatedRequest, res: Response) => {
    const existing = stmts.scriptGetById.get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!existing) {
      res
        .status(404)
        .json({ error: { message: "脚本不存在", code: "NOT_FOUND" } });
      return;
    }

    if (req.user?.role !== "admin" && existing.created_by !== req.user?.id) {
      res
        .status(403)
        .json({ error: { message: "只能修改自己创建的脚本", code: "FORBIDDEN" } });
      return;
    }

    const { visible, name, version, description, tags, changelog } = req.body;

    if (visible !== undefined) {
      stmts.scriptPatch.run(visible ? 1 : 0, req.params.id);
    }

    if (
      name ||
      version ||
      description !== undefined ||
      tags !== undefined ||
      changelog !== undefined
    ) {
      const now = new Date().toISOString();
      stmts.scriptUpdate.run(
        name ?? existing.name,
        version ?? existing.version,
        description !== undefined ? description : existing.description,
        existing.schema,
        existing.entry_point,
        existing.checksum,
        existing.file_path,
        typeof tags === "string"
          ? tags
          : JSON.stringify(
              tags ?? JSON.parse((existing.tags as string) || "[]"),
            ),
        changelog !== undefined ? changelog : existing.changelog,
        now,
        req.params.id,
      );
    }

    const row = stmts.scriptGetById.get(req.params.id) as Record<
      string,
      unknown
    >;
    res.json({ data: rowToScript(row) });
  },
);

/** 删除脚本：同时删除关联的 zip 文件，非管理员只能删除自己创建的脚本 */
router.delete(
  "/:id",
  requireRole("admin", "developer"),
  (req: AuthenticatedRequest, res: Response) => {
    const existing = stmts.scriptGetById.get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!existing) {
      res
        .status(404)
        .json({ error: { message: "脚本不存在", code: "NOT_FOUND" } });
      return;
    }

    // 开发者只能删除自己创建的脚本
    if (req.user?.role !== "admin" && existing.created_by !== req.user?.id) {
      res
        .status(403)
        .json({ error: { message: "只能删除自己创建的脚本", code: "FORBIDDEN" } });
      return;
    }

    const filePath = join(getScriptsDir(), existing.file_path as string);
    if (existsSync(filePath)) rmSync(filePath, { force: true });

    stmts.scriptDelete.run(req.params.id);
    res.json({ data: { deleted: true } });
  },
);

/** 重新上传脚本 zip 包：替换文件并重新校验 manifest，非管理员需重新审核 */
router.post(
  "/:id/reupload",
  requireRole("admin", "developer"),
  upload.single("file"),
  (req: AuthenticatedRequest, res: Response) => {
    const existing = stmts.scriptGetById.get(req.params.id) as Record<string, unknown> | undefined;
    if (!existing) {
      if (req.file) rmSync(req.file.path, { force: true });
      res.status(404).json({ error: { message: "脚本不存在", code: "NOT_FOUND" } });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: { message: "未上传文件", code: "VALIDATION_ERROR" } });
      return;
    }

    const { name, version, description, entryPoint, tags, changelog } = req.body;

    let manifestErr: string | null = null;
    let tmpDir: string | undefined;
    try {
      const { mkdtempSync, readFileSync } = require("fs");
      const { join: pathJoin } = require("path");
      const { tmpdir } = require("os");

      tmpDir = mkdtempSync(pathJoin(tmpdir(), "script-reupload-"));
      execFileSync("unzip", ["-o", req.file.path, "-d", tmpDir!], { timeout: 30000 });
      const manifestPath = pathJoin(tmpDir, "manifest.json");
      if (!existsSync(manifestPath)) {
        manifestErr = "zip 包中缺少 manifest.json 文件";
      } else {
        const manifestRaw = readFileSync(manifestPath, "utf-8");
        let manifest: Record<string, unknown>;
        try {
          manifest = JSON5.parse(manifestRaw) as Record<string, unknown>;
        } catch {
          manifestErr = "manifest.json 不是有效的 JSON（支持 JSON5 注释格式）";
          throw new Error();
        }
        const requiredFields = ["id", "name", "version", "description", "entryPoint", "runtime", "schema"];
        for (const field of requiredFields) {
          if (!manifest[field]) {
            manifestErr = `manifest.json 缺少必填字段: ${field}`;
            throw new Error();
          }
        }
        if (manifest.runtime !== "node") {
          manifestErr = 'manifest.json 中 runtime 必须为 "node"';
          throw new Error();
        }
        const mSchema = manifest.schema as Record<string, unknown>;
        if (!mSchema || typeof mSchema !== "object" || mSchema.type !== "object") {
          manifestErr = 'manifest.json 中 schema 必须为 { "type": "object", ... } 格式的 JSON Schema';
          throw new Error();
        }

        // 校验可选字段 requiredAccountTemplateIds (string[])
        if (manifest.requiredAccountTemplateIds !== undefined) {
          const ids = manifest.requiredAccountTemplateIds;
          if (!Array.isArray(ids) || !ids.every((x) => typeof x === "string")) {
            manifestErr = "manifest.json 中 requiredAccountTemplateIds 必须为 string[] (UUID 数组)";
            throw new Error();
          }
        }

        // 校验可选字段 permissions (string[] from "network"|"filesystem")
        if (manifest.permissions !== undefined) {
          const perms = manifest.permissions;
          const validPerms = ["network", "filesystem"];
          if (!Array.isArray(perms) || !perms.every((p) => typeof p === "string" && validPerms.includes(p))) {
            manifestErr = `manifest.json 中 permissions 必须为 string[]，取值只能是: ${validPerms.join(", ")}`;
            throw new Error();
          }
        }
      }
    } catch (err) {
      if (!manifestErr) {
        const msg = err instanceof Error ? err.message : String(err);
        manifestErr = `验证脚本包失败: ${msg}`;
        console.error(`[scripts] zip validation error: ${msg}`);
      }
    } finally {
      if (tmpDir) { try { rmSync(tmpDir, { recursive: true, force: true }) } catch {} }
    }
    if (manifestErr) {
      rmSync(req.file.path, { force: true });
      res.status(400).json({ error: { message: manifestErr, code: "VALIDATION_ERROR" } });
      return;
    }

    const oldFilePath = join(getScriptsDir(), existing.file_path as string);
    if (existsSync(oldFilePath)) rmSync(oldFilePath, { force: true });

    const checksum = createHash("sha256").update(require("fs").readFileSync(req.file.path)).digest("hex");
    const now = new Date().toISOString();

    stmts.scriptUpdate.run(
      name || existing.name,
      version || existing.version,
      description !== undefined ? description : existing.description,
      existing.schema,
      entryPoint || existing.entry_point,
      checksum,
      req.file.filename,
      typeof tags === "string" ? tags : JSON.stringify(tags ? (typeof tags === "string" ? JSON.parse(tags) : tags) : JSON.parse((existing.tags as string) || "[]")),
      changelog !== undefined ? changelog : existing.changelog,
      now,
      req.params.id,
    );
    if (req.user?.role !== "admin") {
      stmts.scriptPatch.run(0, req.params.id);
      stmts.scriptReview.run('pending', '', 0, now, req.params.id);
    }

    const updated = stmts.scriptGetById.get(req.params.id) as Record<string, unknown>;
    res.json({ data: rowToScript(updated) });
  },
);

/** 审核脚本：管理员可 approve 或 reject，通过后自动设为可见 */
router.post("/:id/review", requireRole("admin"), (req: AuthenticatedRequest, res: Response) => {
  const existing = stmts.scriptGetById.get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: { message: "脚本不存在", code: "NOT_FOUND" } });
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

  stmts.scriptReview.run(reviewStatus, comment || "", visible, now, req.params.id);

  const row = stmts.scriptGetById.get(req.params.id) as Record<string, unknown>;
  res.json({ data: rowToScript(row) });
});

/** 获取脚本的当前用户评分（需认证） */
router.get("/:id/reviews/me", (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: { message: "Authentication required", code: "UNAUTHORIZED" } });
    return;
  }

  const existing = stmts.scriptGetById.get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: { message: "脚本不存在", code: "NOT_FOUND" } });
    return;
  }

  const row = stmts.reviewGetByUserAndScript.get(req.params.id, req.user.id) as Record<string, unknown> | undefined;
  if (!row) {
    res.json({ data: null });
    return;
  }

  const review: Record<string, unknown> = { ...row };
  const user = stmts.userGetById.get(row.user_id as string) as { display_name?: string } | undefined;
  review.username = user?.display_name || (row.user_id as string);
  res.json({ data: review });
});

/** 创建/更新脚本评分（upsert）：任何已认证用户可对脚本评分 */
router.post("/:id/reviews", (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: { message: "Authentication required", code: "UNAUTHORIZED" } });
    return;
  }

  const existing = stmts.scriptGetById.get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: { message: "脚本不存在", code: "NOT_FOUND" } });
    return;
  }

  const { rating, comment } = req.body;
  if (typeof rating !== "number" || rating < 1 || rating > 5) {
    res.status(400).json({ error: { message: "评分必须为 1-5 之间的数字", code: "VALIDATION_ERROR" } });
    return;
  }

  const reviewId = uuidv4()

  const now = new Date().toISOString();
  const commentStr = typeof comment === "string" ? comment : "";

  // 检查是否已有评分（决定 created_at）
  const prev = stmts.reviewGetByUserAndScript.get(req.params.id, req.user.id) as Record<string, unknown> | undefined;
  const createdAt = prev ? (prev.created_at as string) : now;

  stmts.reviewUpsert.run(reviewId, req.params.id, req.user.id, rating, commentStr, createdAt, now);

  // 更新脚本聚合字段
  const stats = stmts.reviewGetStats.get(req.params.id) as { avg_rating: number | null; count: number } | undefined;
  const avgRating = stats?.avg_rating ?? 0;
  const reviewCount = stats?.count ?? 0;
  stmts.scriptUpdateRatingAgg.run(Math.round(avgRating * 100) / 100, reviewCount, req.params.id);

  const row = stmts.reviewGetByUserAndScript.get(req.params.id, req.user.id) as Record<string, unknown>;
  const review: Record<string, unknown> = { ...row };
  review.username = req.user.displayName || req.user.username;
  res.json({ data: review });
});

/** 获取脚本的评分列表（公开，分页） */
router.get("/:id/reviews", (req: AuthenticatedRequest, res: Response) => {
  const existing = stmts.scriptGetById.get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: { message: "脚本不存在", code: "NOT_FOUND" } });
    return;
  }

  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize as string) || 10));
  const offset = (page - 1) * pageSize;

  const rows = stmts.reviewGetByScriptId.all(req.params.id, pageSize, offset) as Record<string, unknown>[];
  const countRow = stmts.reviewCountByScriptId.get(req.params.id) as { count: number };

  const items = rows.map((row) => {
    const r: Record<string, unknown> = { ...row };
    const user = stmts.userGetById.get(row.user_id as string) as { display_name?: string } | undefined;
    r.username = user?.display_name || (row.user_id as string);
    return r;
  });

  res.json({
    data: {
      items,
      total: countRow.count,
      page,
      pageSize,
      totalPages: Math.ceil(countRow.count / pageSize) || 1,
    },
  });
});

/** 删除当前用户的脚本评分 */
router.delete("/:id/reviews", (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: { message: "Authentication required", code: "UNAUTHORIZED" } });
    return;
  }

  const existing = stmts.scriptGetById.get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: { message: "脚本不存在", code: "NOT_FOUND" } });
    return;
  }

  const review = stmts.reviewGetByUserAndScript.get(req.params.id, req.user.id) as Record<string, unknown> | undefined;
  if (!review) {
    res.status(404).json({ error: { message: "评分不存在", code: "NOT_FOUND" } });
    return;
  }

  if (req.user.role !== "admin" && review.user_id !== req.user.id) {
    res.status(403).json({ error: { message: "只能删除自己的评分", code: "FORBIDDEN" } });
    return;
  }

  stmts.reviewDelete.run(review.id);

  // 更新脚本聚合字段
  const stats = stmts.reviewGetStats.get(req.params.id) as { avg_rating: number | null; count: number } | undefined;
  const avgRating = stats?.avg_rating ?? 0;
  const reviewCount = stats?.count ?? 0;
  stmts.scriptUpdateRatingAgg.run(Math.round(avgRating * 100) / 100, reviewCount, req.params.id);

  res.json({ data: { deleted: true } });
});

/** 获取脚本评分统计（平均分 + 各星级分布） */
router.get("/:id/rating-stats", (req: AuthenticatedRequest, res: Response) => {
  const existing = stmts.scriptGetById.get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: { message: "脚本不存在", code: "NOT_FOUND" } });
    return;
  }

  const row = stmts.reviewGetStats.get(req.params.id) as Record<string, number | null> | undefined;
  if (!row) {
    res.json({ data: { avgRating: 0, count: 0, distribution: { stars5: 0, stars4: 0, stars3: 0, stars2: 0, stars1: 0 } } });
    return;
  }

  res.json({
    data: {
      avgRating: Math.round(((row.avg_rating as number) ?? 0) * 100) / 100,
      count: (row.count as number) ?? 0,
      distribution: {
        stars5: (row.stars5 as number) ?? 0,
        stars4: (row.stars4 as number) ?? 0,
        stars3: (row.stars3 as number) ?? 0,
        stars2: (row.stars2 as number) ?? 0,
        stars1: (row.stars1 as number) ?? 0,
      },
    },
  });
});

export default router;
