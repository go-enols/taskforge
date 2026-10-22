/**
 * @file 服务端 API 集成测试
 * @description 通过 supertest 直接挂载 Express app（不监听端口），覆盖 Batch 1 修复的安全边界：
 *              审核自批、上传文件名、schema 校验、并发注册、JWT 查库/吊销、legacy key、密码策略等。
 * @module server/test
 */
import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import AdmZip from 'adm-zip'
import { readdirSync } from 'fs'
import { join } from 'path'
import { createApp } from '../src/app'

const app = createApp()

let adminToken = ''
let devToken = ''
let userToken = ''
let devId = ''
let scriptId = ''

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })

async function login(username: string, password: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ username, password })
  return res.body?.data?.token ?? ''
}

/** 构造一个合法的脚本 zip */
function buildScriptZip(overrides: Record<string, unknown> = {}): Buffer {
  const zip = new AdmZip()
  zip.addFile(
    'manifest.json',
    Buffer.from(
      JSON.stringify({
        id: 'test-script',
        name: 'Test Script',
        version: '1.0.0',
        description: 'integration test',
        entryPoint: 'index.js',
        runtime: 'node',
        schema: { type: 'object', properties: {} },
        ...overrides
      })
    )
  )
  zip.addFile('index.js', Buffer.from('console.log("hi")'))
  return zip.toBuffer()
}

function dataDir(): string {
  return process.env.MARKETPLACE_DATA_DIR as string
}

describe('marketplace server API', () => {
  beforeAll(async () => {
    const setup = await request(app)
      .post('/api/auth/setup')
      .send({ username: 'admin', password: 'adminpass1', displayName: 'Admin' })
    adminToken = setup.body?.data?.token

    const dev = await request(app)
      .post('/api/auth/register')
      .send({ username: 'dev', password: 'devpass12', displayName: 'Dev' })
    devId = dev.body?.data?.user?.id
    await request(app).patch(`/api/users/${devId}`).set(bearer(adminToken)).send({ role: 'developer' })
    devToken = await login('dev', 'devpass12')

    const user = await request(app)
      .post('/api/auth/register')
      .send({ username: 'user', password: 'userpass1', displayName: 'User' })
    userToken = user.body?.data?.token
  })

  it('GET /api/health reports ready after setup', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.needsSetup).toBe(false)
  })

  it('second setup is forbidden', async () => {
    const res = await request(app)
      .post('/api/auth/setup')
      .send({ username: 'admin2', password: 'adminpass2' })
    expect(res.status).toBe(403)
  })

  it('rejects password shorter than 8 chars', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'shortpw', password: 'abc123' })
    expect(res.status).toBe(400)
    // 校验层错误信息可能是字段名或中文提示，二者都说明被拒绝
    expect(JSON.stringify(res.body)).toMatch(/8|密码/)
  })

  it('returns 400 (not 500) for invalid JSON body', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"username": ')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_JSON')
  })

  it('rejects legacy global admin API key by default', async () => {
    const res = await request(app)
      .post('/api/project-templates')
      .set('Authorization', `Bearer ${process.env.MARKETPLACE_API_KEY}`)
      .send({ name: 'legacy', icon: 'Folder', fields: [] })
    expect(res.status).toBe(401)
  })

  it('plain user cannot create project templates (403)', async () => {
    const res = await request(app)
      .post('/api/project-templates')
      .set(bearer(userToken))
      .send({ name: 'user-template', icon: 'Folder', fields: [] })
    expect(res.status).toBe(403)
  })

  it('developer upload creates pending + invisible script with uuid filename', async () => {
    const res = await request(app)
      .post('/api/scripts')
      .set(bearer(devToken))
      .attach('file', buildScriptZip(), 'script.zip')
    expect(res.status).toBe(201)
    expect(res.body.data.visible).toBe(false)
    expect(res.body.data.reviewStatus).toBe('pending')
    scriptId = res.body.data.id

    const files = readdirSync(join(dataDir(), 'uploads', 'scripts'))
    expect(files.some((f) => f.includes('..') || f.includes('Test Script'))).toBe(false)
    expect(files.some((f) => /^[0-9a-f-]{36}\.zip$/.test(f))).toBe(true)
  })

  it('developer PUT/PATCH cannot self-approve (P0-5)', async () => {
    const put = await request(app)
      .put(`/api/scripts/${scriptId}`)
      .set(bearer(devToken))
      .send({ name: 'Renamed', visible: true, reviewStatus: 'approved', reviewComment: 'self' })
    expect(put.status).toBe(200)

    const patch = await request(app)
      .patch(`/api/scripts/${scriptId}`)
      .set(bearer(devToken))
      .send({ visible: true })
    expect(patch.status).toBe(200)

    const check = await request(app).get(`/api/scripts/${scriptId}`).set(bearer(adminToken))
    expect(check.body.data.visible).toBe(false)
    expect(check.body.data.reviewStatus).toBe('pending')
  })

  it('admin approve makes the script visible', async () => {
    const res = await request(app)
      .post(`/api/scripts/${scriptId}/review`)
      .set(bearer(adminToken))
      .send({ action: 'approve', comment: 'ok' })
    expect(res.status).toBe(200)
    expect(res.body.data.reviewStatus).toBe('approved')
    expect(res.body.data.visible).toBe(true)
  })

  it('invalid reviewStatus enum is rejected (400)', async () => {
    const res = await request(app)
      .patch(`/api/scripts/${scriptId}/review`)
      .set(bearer(adminToken))
      .send({ reviewStatus: 'whatever' })
    expect(res.status).toBe(400)
  })

  it('developer reupload resets script to pending + invisible', async () => {
    const res = await request(app)
      .post(`/api/scripts/${scriptId}/reupload`)
      .set(bearer(devToken))
      .attach('file', buildScriptZip(), 'script.zip')
    expect(res.status).toBe(200)
    expect(res.body.data.visible).toBe(false)
    expect(res.body.data.reviewStatus).toBe('pending')
  })

  it('rejects invalid template schema (400) and self-visibility (P0-5)', async () => {
    const bad = await request(app)
      .post('/api/templates')
      .set(bearer(devToken))
      .send({ name: 'bad', type: 'evm-wallet', schema: 'oops' })
    expect(bad.status).toBe(400)

    const good = await request(app)
      .post('/api/templates')
      .set(bearer(devToken))
      .send({ name: 'good', type: 'evm-wallet', schema: { type: 'object', properties: {} } })
    expect(good.status).toBe(201)
    const templateId = good.body.data.id

    const patch = await request(app)
      .patch(`/api/templates/${templateId}`)
      .set(bearer(devToken))
      .send({ visible: true })
    expect(patch.status).toBe(200)

    const check = await request(app)
      .get(`/api/templates/${templateId}?all=true`)
      .set(bearer(adminToken))
    expect(check.body.data.visible).toBe(false)
  })

  it('concurrent duplicate registration returns 409 without crashing', async () => {
    const results = await Promise.all(
      Array.from({ length: 4 }).map(() =>
        request(app).post('/api/auth/register').send({ username: 'race', password: 'racepass1' })
      )
    )
    const statuses = results.map((r) => r.status).sort()
    expect(statuses.filter((s) => s === 201).length).toBe(1)
    expect(statuses.filter((s) => s === 409).length).toBeGreaterThanOrEqual(1)

    const health = await request(app).get('/api/health')
    expect(health.status).toBe(200)
  })

  it('role changes in DB take effect immediately for existing JWTs', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ username: 'promoted', password: 'promoted1' })
    const oldToken = reg.body?.data?.token
    const userId = reg.body?.data?.user?.id

    // 旧 token 中 role=user，先在 DB 提升为 developer
    await request(app).patch(`/api/users/${userId}`).set(bearer(adminToken)).send({ role: 'developer' })

    const res = await request(app)
      .post('/api/project-templates')
      .set(bearer(oldToken))
      .send({ name: 'promoted-template', icon: 'Folder', fields: [] })
    expect(res.status).toBe(201)
  })

  it('deleted users JWTs are revoked on next request (401)', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ username: 'removed', password: 'removed1' })
    const token = reg.body?.data?.token
    const userId = reg.body?.data?.user?.id

    await request(app).delete(`/api/users/${userId}`).set(bearer(adminToken)).expect(200)

    const res = await request(app)
      .patch('/api/users/me')
      .set(bearer(token))
      .send({ displayName: 'ghost' })
    expect(res.status).toBe(401)
  })

  it('GET list endpoints are public (no auth required)', async () => {
    const res = await request(app).get('/api/scripts')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data.items)).toBe(true)
  })
})
