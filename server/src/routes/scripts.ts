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

const router = Router();

// 50MB file size limit
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, getScriptsDir()),
    filename: (_req, file, cb) =>
      cb(null, `${Date.now()}-${file.originalname}`),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

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
    updatedAt: row.updated_at as string,
  };
}

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

router.get("/pending", requireRole("admin"), (req: AuthenticatedRequest, res: Response) => {
  const rows = stmts.scriptGetPending.all() as Record<string, unknown>[];
  const items = rows.map(rowToScript);
  res.json({ data: { items, total: items.length } });
});

router.get("/my-pending", requireRole("admin", "developer"), (req: AuthenticatedRequest, res: Response) => {
  const rows = stmts.scriptGetPendingByAuthor.all(req.user?.id) as Record<string, unknown>[];
  const items = rows.map(rowToScript);
  res.json({ data: { items, total: items.length } });
});

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
        const manifestRaw = readFileSync(manifestPath, "utf-8");
        let manifest: Record<string, unknown>;
        try {
          manifest = JSON5.parse(manifestRaw) as Record<string, unknown>;
        } catch {
          manifestErr = "manifest.json 不是有效的 JSON（支持 JSON5 注释格式）";
          throw new Error();
        }
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
        if (manifest.runtime !== "node") {
          manifestErr = 'manifest.json 中 runtime 必须为 "node"';
          throw new Error();
        }
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
      }
    } catch (err) {
      if (!manifestErr) {
        // Real error (e.g., unzip not installed), not a validation failure
        const msg = err instanceof Error ? err.message : String(err);
        manifestErr = `验证脚本包失败: ${msg}`;
        console.error(`[scripts] zip validation error: ${msg}`);
      }
    } finally {
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

export default router;
