/**
 * @file 脚本 CRUD 路由
 * @description 提供脚本的列表、详情、下载、上传、更新、删除、重新上传和审核功能。
 *              上传时通过 adm-zip（纯 JS）从内存中提取并 zod 校验 manifest.json。
 *              零外部二进制依赖，跨平台可用。
 * @module server/routes
 */
import { Router, Request, Response } from "express";
import multer from "multer";
import { createHash } from "crypto";
import AdmZip from "adm-zip";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { existsSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import JSON5 from "json5";
import { db, stmts, getScriptsDir } from "../db";
import { AuthenticatedRequest } from "../types";
import { requireRole } from "../middleware/auth";
import { ScriptManifestSchema } from "../shared/schemas/manifest";

const router = Router();

/** multer 文件上传中间件：内存存储，限制 50MB（避免磁盘 I/O） */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// ---- manifest zod schema (inlined to avoid cross-project imports) ----

/**
 * Validate a manifest.json from a zip buffer using adm-zip + zod.
 * Returns { ok: true, manifest, scriptSchema } on success, or { ok: false, error } on failure.
 */
function validateZipManifest(zipBuffer: Buffer): { ok: true; manifest: Record<string, unknown>; scriptSchema: Record<string, unknown> } | { ok: false; error: string } {
  let zip: AdmZip;
  try { zip = new AdmZip(zipBuffer); } catch {
    return { ok: false, error: "无法解析 zip 文件，请确认上传的是有效的 ZIP 压缩包" };
  }
  const entry = zip.getEntry("manifest.json");
  if (!entry) return { ok: false, error: "zip 包中缺少 manifest.json 文件" };
  let raw: string;
  try { raw = entry.getData().toString("utf-8"); } catch {
    return { ok: false, error: "无法读取 manifest.json" };
  }
  let obj: Record<string, unknown>;
  try { obj = JSON5.parse(raw) as Record<string, unknown>; } catch {
    return { ok: false, error: "manifest.json 不是有效的 JSON（支持 JSON5 注释格式）" };
  }
  const parsed = ScriptManifestSchema.safeParse(obj);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const field = first.path.join(".");
    const msg = field ? `manifest.json 字段 "${field}" 校验失败: ${first.message}` : `manifest.json 校验失败: ${first.message}`;
    return { ok: false, error: msg };
  }
  return { ok: true, manifest: obj, scriptSchema: (obj.schema as Record<string, unknown>) };
}

// ---- helper ----

function rowToScript(row: Record<string, unknown>) {
  const createdBy = (row.created_by as string) || undefined;
  let createdByName: string | undefined;
  if (createdBy) {
    const user = stmts.userGetById.get(createdBy) as { display_name?: string } | undefined;
    createdByName = user?.display_name;
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
    createdByName,
    reviewStatus: row.review_status as string,
    reviewComment: row.review_comment as string || "",
    updatedAt: row.updated_at as string,
    downloadCount: row.downloads as number,
  };
}

// ---- routes ----

router.get("/", (_req: Request, res: Response) => {
  const rows = stmts.scriptGetAllAdmin.all() as Record<string, unknown>[];
  const items = rows.map(rowToScript);
  res.json({ data: { items, total: items.length } });
});

/** 获取待审核脚本列表（管理员专用） */
router.get("/pending", requireRole("admin"), (_req: AuthenticatedRequest, res: Response) => {
  const rows = stmts.scriptGetPending.all() as Record<string, unknown>[];
  const items = rows.map(rowToScript);
  res.json({ data: { items, total: items.length } });
});

/** 获取当前用户的待审核脚本列表（管理员 + 开发者） */
router.get("/my-pending", requireRole("admin", "developer"), (req: AuthenticatedRequest, res: Response) => {
  const rows = stmts.scriptGetPendingByAuthor.all(req.user?.id) as Record<string, unknown>[];
  const items = rows.map(rowToScript);
  res.json({ data: { items, total: items.length } });
});

router.get("/:id", (req: AuthenticatedRequest, res: Response) => {
  const row = stmts.scriptGetById.get(req.params.id) as Record<string, unknown> | undefined;
  if (!row || ((row.visible as number) !== 1 && req.user?.role !== "admin")) {
    res.status(404).json({ error: { message: "脚本不存在", code: "NOT_FOUND" } });
    return;
  }
  res.json({ data: rowToScript(row) });
});

router.get("/:id/download", (req: AuthenticatedRequest, res: Response) => {
  const row = stmts.scriptGetById.get(req.params.id) as Record<string, unknown> | undefined;
  if (!row || ((row.visible as number) !== 1 && req.user?.role !== "admin")) {
    res.status(404).json({ error: { message: "脚本不存在", code: "NOT_FOUND" } });
    return;
  }
  const filePath = join(getScriptsDir(), row.file_path as string);
  if (!filePath.startsWith(getScriptsDir())) {
    res.status(403).json({ error: { message: "无效的文件路径", code: "FORBIDDEN" } });
    return;
  }
  if (!existsSync(filePath)) {
    res.status(404).json({ error: { message: "脚本文件不存在", code: "FILE_NOT_FOUND" } });
    return;
  }
  stmts.scriptIncrementDownloads.run(req.params.id);
  res.download(filePath, `${row.name}-${row.version}.zip`, (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ error: { message: "下载失败", code: "DOWNLOAD_ERROR" } });
    }
  });
});

/** POST — 上传新脚本：adm-zip 内存解压 + zod 校验，管理员直接可见，开发者需审核 */
router.post(
  "/",
  requireRole("admin", "developer"),
  upload.single("file"),
  (req: AuthenticatedRequest, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: { message: "未上传文件", code: "VALIDATION_ERROR" } });
      return;
    }
    const zipBuffer = req.file.buffer;
    const validation = validateZipManifest(zipBuffer);
    if (!validation.ok) {
      res.status(400).json({ error: { message: validation.error, code: "VALIDATION_ERROR" } });
      return;
    }
    const m = validation.manifest;
    const id = uuidv4();
    const checksum = createHash("sha256").update(zipBuffer).digest("hex");
    const filename = `${Date.now()}-${m.name || "script"}.zip`;
    const filePath = join(getScriptsDir(), filename);
    try { writeFileSync(filePath, zipBuffer); } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: { message: `文件保存失败: ${msg}`, code: "IO_ERROR" } });
      return;
    }
    const schemaStr = JSON.stringify(validation.scriptSchema);
    const tagsStr = JSON.stringify(m.tags || []);
    const visible = req.user?.role === "admin" ? 1 : 0;
    const createdBy = req.user?.id || null;
    const reviewStatus = req.user?.role === "admin" ? "approved" : "pending";
    const now = new Date().toISOString();
    try {
      stmts.scriptInsert.run(
        id, m.name, m.version, m.description || "", schemaStr,
        m.entryPoint, checksum, filename, tagsStr, m.changelog || "",
        0, visible, createdBy, reviewStatus, "", 0, 0, now, now
      );
      // Record initial version in version history
      stmts.versionInsert.run(
        uuidv4(), id, m.version, m.changelog || "",
        checksum, filename, schemaStr, createdBy, now
      );
    } catch (dbErr) {
      try { rmSync(filePath, { force: true }); } catch {}
      const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      res.status(500).json({ error: { message: `数据库写入失败: ${msg}`, code: "DB_ERROR" } });
      return;
    }
    const row = stmts.scriptGetById.get(id) as Record<string, unknown>;
    res.status(201).json({ data: rowToScript(row) });
  }
);

/** PUT — 更新脚本：可选替换 zip 包或修改元数据 */
router.put(
  "/:id",
  requireRole("admin", "developer"),
  upload.single("file"),
  (req: AuthenticatedRequest, res: Response) => {
    const existing = stmts.scriptGetById.get(req.params.id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: { message: "脚本不存在", code: "NOT_FOUND" } });
      return;
    }
    if (req.user?.role !== "admin") {
      if ((existing.created_by as string) !== req.user?.id) {
        res.status(403).json({ error: { message: "无权修改此脚本", code: "FORBIDDEN" } });
        return;
      }
    }
    const { name, version, description, entryPoint, tags, changelog, visible, reviewStatus, reviewComment } = req.body;
    const now = new Date().toISOString();
    let fileName = existing.file_path as string;
    let checksum = existing.checksum as string;
    let schemaStr = existing.schema as string;
    let manifestErr: string | null = null;
    if (req.file) {
      const zipBuffer = req.file.buffer;
      const validation = validateZipManifest(zipBuffer);
      if (!validation.ok) { manifestErr = validation.error; }
      else {
        const m = validation.manifest;
        checksum = createHash("sha256").update(zipBuffer).digest("hex");
        schemaStr = JSON.stringify(validation.scriptSchema);
        fileName = `${Date.now()}-${m.name || "script"}.zip`;
        const newPath = join(getScriptsDir(), fileName);
        try { writeFileSync(newPath, zipBuffer); } catch (err) {
          manifestErr = `文件保存失败: ${err instanceof Error ? err.message : String(err)}`;
        }
      }
    }
    if (manifestErr) {
      res.status(400).json({ error: { message: manifestErr, code: "VALIDATION_ERROR" } });
      return;
    }
    try {
      stmts.scriptUpdate.run(
        name || existing.name,
        version || existing.version,
        description !== undefined ? description : existing.description,
        schemaStr,
        entryPoint || existing.entry_point,
        checksum,
        fileName,
        tags !== undefined ? (typeof tags === 'string' ? tags : JSON.stringify(tags)) : existing.tags,
        changelog !== undefined ? changelog : existing.changelog,
        visible !== undefined ? (visible ? 1 : 0) : existing.visible,
        reviewStatus !== undefined ? reviewStatus : existing.review_status,
        reviewComment !== undefined ? reviewComment : existing.review_comment || "",
        now,
        req.params.id
      );
      // When a new file is uploaded, create a version history record
      if (req.file) {
        stmts.versionInsert.run(
          uuidv4(),
          req.params.id,
          (version || existing.version) as string,
          (changelog !== undefined ? changelog : existing.changelog) as string || "",
          checksum,
          fileName,
          schemaStr,
          req.user?.id || (existing.created_by as string) || null,
          now
        );
      }
    } catch (dbErr) {
      const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      res.status(500).json({ error: { message: `数据库更新失败: ${msg}`, code: "DB_ERROR" } });
      return;
    }
    const row = stmts.scriptGetById.get(req.params.id) as Record<string, unknown>;
    res.json({ data: rowToScript(row) });
  }
);

/** 版本历史 API */

/**
 * 获取脚本的版本历史路由
 * @function
 * @name getScriptVersions
 * @description 按脚本 ID 查询 `script_versions` 表中的所有版本记录，并按创建时间降序排列。
 * @route GET /api/scripts/:id/versions
 * @authentication 无
 * @returns {Object} JSON 响应，data 字段包含版本数组 `{ version, changelog, checksum, createdBy, createdAt }`
 */
router.get("/:id/versions", (req: Request, res: Response) => {
  const existing = stmts.scriptGetById.get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: { message: "脚本不存在", code: "NOT_FOUND" } });
    return;
  }
  const rows = stmts.versionGetByScriptId.all(req.params.id) as Record<string, unknown>[];
  const versions = rows.map((row) => ({
    id: row.id as string,
    version: row.version as string,
    changelog: (row.changelog as string) || "",
    checksum: row.checksum as string,
    schema: JSON.parse((row.schema as string) || "{}"),
    createdBy: row.created_by as string | null,
    createdAt: row.created_at as string,
  }));
  res.json({ data: versions });
});

/** DELETE — 删除脚本 */
router.delete(
  "/:id",
  requireRole("admin", "developer"),
  (req: AuthenticatedRequest, res: Response) => {
    const existing = stmts.scriptGetById.get(req.params.id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: { message: "脚本不存在", code: "NOT_FOUND" } });
      return;
    }
    if (req.user?.role !== "admin") {
      if ((existing.created_by as string) !== req.user?.id) {
        res.status(403).json({ error: { message: "无权删除此脚本", code: "FORBIDDEN" } });
        return;
      }
    }
    const filePath = join(getScriptsDir(), existing.file_path as string);
    if (existsSync(filePath)) rmSync(filePath, { force: true });
    stmts.scriptDelete.run(req.params.id);
    res.json({ data: { deleted: true } });
  }
);

/** POST — 重新上传脚本 zip 包：替换文件并重新校验 manifest */
router.post(
  "/:id/reupload",
  requireRole("admin", "developer"),
  upload.single("file"),
  (req: AuthenticatedRequest, res: Response) => {
    const existing = stmts.scriptGetById.get(req.params.id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: { message: "脚本不存在", code: "NOT_FOUND" } });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: { message: "未上传文件", code: "VALIDATION_ERROR" } });
      return;
    }
    const zipBuffer = req.file.buffer;
    const validation = validateZipManifest(zipBuffer);
    if (!validation.ok) {
      res.status(400).json({ error: { message: validation.error, code: "VALIDATION_ERROR" } });
      return;
    }
    const oldPath = join(getScriptsDir(), existing.file_path as string);
    if (existsSync(oldPath)) rmSync(oldPath, { force: true });
    const m = validation.manifest;
    const checksum = createHash("sha256").update(zipBuffer).digest("hex");
    const fileName = `${Date.now()}-${m.name || "script"}.zip`;
    const newPath = join(getScriptsDir(), fileName);
    try { writeFileSync(newPath, zipBuffer); } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: { message: `文件保存失败: ${msg}`, code: "IO_ERROR" } });
      return;
    }
    const schemaStr = JSON.stringify(validation.scriptSchema);
    const now = new Date().toISOString();
    const reviewStatus = req.user?.role === "admin" ? "approved" : "pending";
    try {
      stmts.scriptUpdate.run(
        m.name, m.version, m.description || "", schemaStr, m.entryPoint,
        fileName, checksum, JSON.stringify(m.tags || []), m.changelog || "",
        existing.visible, reviewStatus, existing.review_comment || "", now, req.params.id
      );
    } catch (dbErr) {
      const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      res.status(500).json({ error: { message: `数据库更新失败: ${msg}`, code: "DB_ERROR" } });
      return;
    }
    const row = stmts.scriptGetById.get(req.params.id) as Record<string, unknown>;
    res.json({ data: rowToScript(row) });
  }
);

/** POST — 审核脚本（仅管理员，action 形式：approve/reject） */
router.post(
  "/:id/review",
  requireRole("admin"),
  (req: AuthenticatedRequest, res: Response) => {
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
    if (action === "reject") {
      // 拒绝 = 默认删除：删除文件 + 删除 DB 记录（防止脏数据累积）
      const filePath = join(getScriptsDir(), existing.file_path as string);
      if (existsSync(filePath)) {
        try { rmSync(filePath, { force: true }); } catch { /* 文件不存在或删除失败不影响主流程 */ }
      }
      stmts.scriptDelete.run(req.params.id);
      res.json({ data: { id: req.params.id, deleted: true, comment: comment || "" } });
      return;
    }
    // approve：保持当前行为（更新审核状态 + 设为可见）
    const now = new Date().toISOString();
    stmts.scriptReview.run("approved", comment || "", 1, now, req.params.id);
    const row = stmts.scriptGetById.get(req.params.id) as Record<string, unknown>;
    res.json({ data: rowToScript(row) });
  }
);

/** PATCH — 审核脚本（仅管理员） */
router.patch(
  "/:id/review",
  requireRole("admin"),
  (req: AuthenticatedRequest, res: Response) => {
    const existing = stmts.scriptGetById.get(req.params.id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: { message: "脚本不存在", code: "NOT_FOUND" } });
      return;
    }
    const { reviewStatus, reviewComment, visible } = req.body;
    const now = new Date().toISOString();
    stmts.scriptUpdate.run(
      existing.name, existing.version, existing.description,
      existing.schema, existing.entry_point, existing.file_path,
      existing.checksum, existing.tags, existing.changelog,
      visible !== undefined ? (visible ? 1 : 0) : existing.visible,
      reviewStatus || existing.review_status,
      reviewComment !== undefined ? reviewComment : existing.review_comment || "",
      now, req.params.id
    );
    const row = stmts.scriptGetById.get(req.params.id) as Record<string, unknown>;
    res.json({ data: rowToScript(row) });
  }
);

export default router;
