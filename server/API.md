# TaskForge Marketplace API

**Base URL**: `http://127.0.0.1:3400`（可通过 Settings 页面修改）  
**认证**: `Authorization: Bearer <JWT>`（登录后自动获取）  
**响应格式**: `{ data: T }` 或 `{ error: { message: string, code: string } }`

---

## 端点总览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| POST | `/api/auth/setup` | 初始化管理员 |
| POST | `/api/auth/login` | 登录 |
| POST | `/api/auth/register` | 注册新用户 |
| GET | `/api/users` | 列出用户（admin 权限） |
| GET | `/api/users/me` | 获取当前用户信息 |
| PATCH | `/api/users/me` | 更新当前用户（显示名/密码） |
| POST | `/api/users/me/regenerate-key` | 重新生成 API Key |
| PUT | `/api/users/:id/role` | 更新用户角色（admin 权限） |
| GET | `/api/scripts` | 列出脚本 |
| GET | `/api/scripts/pending` | 列出待审核脚本（admin 权限） |
| GET | `/api/scripts/my-pending` | 列出我的提交（developer+） |
| GET | `/api/scripts/:id` | 获取脚本详情 |
| GET | `/api/scripts/:id/download` | 下载脚本 ZIP |
| POST | `/api/scripts` | 上传脚本 |
| PATCH | `/api/scripts/:id` | 更新脚本元数据 |
| DELETE | `/api/scripts/:id` | 删除脚本 |
| POST | `/api/scripts/:id/review` | 审核脚本（admin 权限） |
| GET | `/api/scripts/:id/versions` | 获取版本历史 |
| GET | `/api/templates` | 列出模板 |
| GET | `/api/templates/pending` | 列出待审核模板（admin） |
| GET | `/api/templates/my-pending` | 列出我的模板提交（developer+） |
| GET | `/api/templates/:id` | 获取模板详情 |
| POST | `/api/templates` | 创建模板 |
| PATCH | `/api/templates/:id` | 更新模板 |
| DELETE | `/api/templates/:id` | 删除模板 |
| POST | `/api/templates/:id/review` | 审核模板（admin 权限） |

---

## 认证 API

### GET /api/health

健康检查，无需认证。

**响应示例**:
```json
{ "data": { "status": "ok", "timestamp": "2026-06-20T00:00:00.000Z", "needsSetup": false } }
```

### POST /api/auth/setup

首次运行初始化管理员（仅在数据库中无用户时可用）。

**请求体**:
```json
{ "username": "admin", "password": "yourpassword", "displayName": "Admin" }
```

**响应**: `{ data: { token: string, user: { id, username, displayName, role } } }`

### POST /api/auth/login

用户登录。

**请求体**:
```json
{ "username": "admin", "password": "yourpassword" }
```

**响应**: `{ data: { token: string, user: { id, username, displayName, role } } }`

### POST /api/auth/register

注册新用户（默认 role = `user`）。

**请求体**:
```json
{ "username": "newuser", "password": "yourpassword", "displayName": "New User" }
```

---

## 用户 API

所有端点需 `Authorization: Bearer <token>` 头。

### GET /api/users

仅 admin 可用。返回用户列表。

**查询参数**: 无（当前全量返回）

**响应**: `{ data: { items: User[], total: number } }`

### GET /api/users/me

返回当前用户信息。

**响应**: `{ data: { id, username, displayName, role, apiKeySet, createdAt, updatedAt } }`

### PATCH /api/users/me

更新当前用户信息。

**请求体**: `{ displayName?: string, currentPassword?: string, newPassword?: string }`

### POST /api/users/me/regenerate-key

重新生成当前用户的 API Key。

**响应**: `{ data: { id, username, displayName, role, apiKey, createdAt, updatedAt } }`

---

## 脚本 API

### GET /api/scripts

列出脚本。支持分页和权限过滤。

**查询参数**:
| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `all` | boolean | `false` | Admin 专用，显示所有脚本（含不可见） |
| `page` | number | `1` | 页码 |
| `pageSize` | number | `50` | 每页数量（最大 200） |

**响应**:
```json
{
  "data": {
    "items": [
      {
        "id": "uuid",
        "name": "脚本名称",
        "version": "1.0.0",
        "description": "脚本描述",
        "entryPoint": "index.js",
        "runtime": "node",
        "schema": { /* JSON Schema */ },
        "dataRequirements": [],
        "permissions": ["network"],
        "tags": ["airdrop"],
        "changelog": "",
        "dependencies": { "axios": "^1.0.0" },
        "visible": true,
        "downloads": 0,
        "reviewStatus": "approved",
        "reviewComment": "",
        "createdBy": "user-uuid",
        "createdByName": "开发者名称",
        "updatedAt": "ISO8601",
        "downloadCount": 0
      }
    ],
    "total": 100,
    "page": 1,
    "pageSize": 50,
    "totalPages": 2
  }
}
```

### GET /api/scripts/:id

获取单个脚本详情。无需认证。

### GET /api/scripts/:id/download

下载脚本 ZIP 包。自动增加下载计数。

### POST /api/scripts

上传新脚本。需要 developer 或 admin 角色。

**Content-Type**: `multipart/form-data`

**字段**:
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | file | 是 | ZIP 文件（≤50MB），需包含 `manifest.json` |
| `customName` | string | 否 | 覆盖 manifest 中的 name |
| `customVersion` | string | 否 | 覆盖 manifest 中的 version |

> ZIP 包根目录下必须有 `manifest.json`。非管理员上传自动进入 `pending` 审核状态。

### PATCH /api/scripts/:id

更新脚本元数据。开发者只能更新自己的脚本；admin 可更新任何脚本。

**请求体**:
```json
{
  "name": "新名称",
  "version": "1.1.0",
  "description": "新描述",
  "visible": true,
  "reviewStatus": "approved",
  "reviewComment": "审核意见"
}
```

### POST /api/scripts/:id/review

审核脚本（仅 admin）。

**请求体**: `{ "action": "approve" | "reject", "comment?": "审核意见" }`

- `approve`: 设置 `review_status = 'approved'` + `visible = 1`
- `reject`: 设置 `review_status = 'rejected'` + `visible = 0`，保留记录供开发者查看

### GET /api/scripts/:id/versions

获取脚本版本历史（无需认证）。

---

## 模板 API

### GET /api/templates

列出账户模板。

**查询参数**:
| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `all` | boolean | `false` | 管理员/开发者可用，返回所有模板 |
| `page` | number | `1` | 页码 |
| `pageSize` | number | `50` | 每页数量（最大 200） |

---

## 错误处理

所有错误响应格式：

```json
{ "error": { "message": "错误描述", "code": "ERROR_CODE" } }
```

常见错误码：
| HTTP 状态码 | 含义 |
|-------------|------|
| 400 | 请求参数错误（VALIDATION_ERROR） |
| 401 | 未认证（UNAUTHORIZED） |
| 403 | 无权限（FORBIDDEN） |
| 404 | 资源不存在（NOT_FOUND） |
| 429 | 请求过于频繁（RATE_LIMITED） |
| 500 | 服务端错误（INTERNAL_ERROR） |
