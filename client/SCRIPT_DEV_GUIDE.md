# Script Development Guide

Reference for writing, testing, and publishing task scripts for airdrop-farm.

## 1. Overview

A task script is a Node.js program that automates blockchain interactions. The airdrop-farm app runs your script as a child process, feeds it configuration, captures its output, and manages its lifecycle.

Flow: you publish a script to the marketplace server, users discover and install it, the app renders a configuration form from your schema, then spawns your script as a child process when the user starts the task.

## 2. Project Structure

```
my-script/
  manifest.json    # Required. Script metadata and configuration schema.
  index.js         # Entry point. Must match manifest.entryPoint.
  package.json     # Optional. For npm dependencies.
```

`manifest.json` and the entry point file must exist at the zip root. Additional files are fine.

## 3. manifest.json Specification

### Field Reference

| Field                        | Required | Type     | Description                                                                                         |
| ---------------------------- | -------- | -------- | --------------------------------------------------------------------------------------------------- |
| `id`                         | yes      | string   | Unique identifier. Use a reverse-domain style string (e.g. `com.example.my-script`).                |
| `name`                       | yes      | string   | Human-readable display name.                                                                        |
| `version`                    | yes      | string   | Semantic version (e.g. `"1.0.0"`).                                                                  |
| `description`                | yes      | string   | Short description of what the script does.                                                          |
| `entryPoint`                 | yes      | string   | Filename of the entry point relative to the script directory (e.g. `"index.js"`).                   |
| `runtime`                    | yes      | string   | Must be `"node"`. No other runtimes are supported.                                                  |
| `schema`                     | yes      | object   | JSON Schema describing the configuration form. Must be `{ "type": "object", "properties": {...} }`. |
| `requiredAccountTemplateIds` | no       | string[] | Account template IDs that must be installed before this script can be used.                         |
| `permissions`                | no       | string[] | Declared permissions: `"network"`, `"filesystem"`. Informational only.                              |
| `tags`                       | no       | string[] | Category tags for marketplace discovery.                                                            |
| `changelog`                  | no       | string   | Release notes for this version.                                                                     |

### How Schema Becomes a Form

The app converts your JSON Schema into form fields using these rules:

- `type: "string"` with `enum` becomes a dropdown select
- `type: "string"` without `enum` becomes a text input
- `type: "number"` or `type: "integer"` becomes a number input (supports `minimum`, `maximum`)
- `type: "boolean"` becomes a checkbox
- `type: "object"` with nested `properties` gets flattened into dot-notation field names (e.g. `proxy.host`, `proxy.port`)
- `title` on each property becomes the field label
- `default` becomes the initial value
- `description` becomes field help text
- Top-level `required` array controls which fields are mandatory
- `pattern` on string fields sets a regex validation pattern

### Example 1: Simple Script

```json
{
  "id": "com.example.ping-checker",
  "name": "Ping Checker",
  "version": "1.0.0",
  "description": "Sends a request to a URL and reports the response time.",
  "entryPoint": "index.js",
  "runtime": "node",
  "schema": {
    "type": "object",
    "properties": {
      "targetUrl": {
        "type": "string",
        "title": "Target URL",
        "description": "The URL to ping"
      }
    },
    "required": ["targetUrl"]
  }
}
```

### Example 2: Script with Number, Boolean, and Select Fields

```json
{
  "id": "com.example.batch-faucet",
  "name": "Batch Faucet Claimer",
  "version": "1.2.0",
  "description": "Claims testnet tokens from a faucet for multiple wallets.",
  "entryPoint": "index.js",
  "runtime": "node",
  "schema": {
    "type": "object",
    "properties": {
      "threadCount": {
        "type": "number",
        "title": "Thread Count",
        "default": 1,
        "minimum": 1,
        "maximum": 10
      },
      "useProxy": {
        "type": "boolean",
        "title": "Use Proxy",
        "default": false
      },
      "proxyMode": {
        "type": "string",
        "title": "Proxy Mode",
        "enum": ["none", "per_account", "pool"],
        "default": "none"
      }
    },
    "required": []
  },
  "tags": ["faucet", "testnet"]
}
```

### Example 3: Nested Object Schema

```json
{
  "id": "com.example.proxy-scraper",
  "name": "Proxy Scraper",
  "version": "2.0.0",
  "description": "Scrapes and validates proxies from a provider API.",
  "entryPoint": "index.js",
  "runtime": "node",
  "schema": {
    "type": "object",
    "properties": {
      "maxRetries": {
        "type": "number",
        "title": "Max Retries",
        "default": 3,
        "minimum": 0,
        "maximum": 10
      },
      "proxy": {
        "type": "object",
        "title": "Proxy Config",
        "properties": {
          "host": { "type": "string", "title": "Host" },
          "port": { "type": "number", "title": "Port", "minimum": 1, "maximum": 65535 },
          "username": { "type": "string", "title": "Username" },
          "password": { "type": "string", "title": "Password" }
        },
        "required": ["host", "port"]
      }
    },
    "required": ["maxRetries"]
  },
  "permissions": ["network"]
}
```

Nested objects are flattened in the form (fields named `proxy.host`, `proxy.port`, etc.) but the config object delivered to your script preserves the nested structure.

## 4. Configuration Injection

The app injects task configuration through environment variables when spawning your script.

### Environment Variables

| Variable      | Description                                                    |
| ------------- | -------------------------------------------------------------- |
| `TASK_CONFIG` | Full config object as a JSON string. **Always use this.**      |
| `TASK_{KEY}`  | Individual config keys, uppercased. Values are always strings. |
| `TASK_ID`     | The unique task ID assigned by the app.                        |

### Reading Config

```javascript
// Preferred: parse TASK_CONFIG for typed values
const config = JSON.parse(process.env.TASK_CONFIG || '{}')
console.log(config.targetUrl) // string
console.log(config.threadCount) // number (not a string)
console.log(config.useProxy) // boolean (not a string)

// Avoid: individual env vars lose type information
const url = process.env.TASK_TARGETURL // string (ok for strings)
const count = process.env.TASK_THREADCOUNT // "3" (string, not number!)
```

Always prefer `TASK_CONFIG`. The individual `TASK_*` variables coerce everything to strings, so numbers become `"3"` and booleans become `"true"`. If you must use them, parse explicitly:

```javascript
const count = parseInt(process.env.TASK_THREADCOUNT, 10)
const useProxy = process.env.TASK_USEPROXY === 'true'
```

## 5. Logging and Output

The app captures your script's stdout and stderr line by line.

- Each line written to **stdout** is recorded as an `info` level log entry.
- Each line written to **stderr** is recorded as an `error` level log entry.
- Output is line-buffered. Each `console.log()` call produces one log entry.
- Logs appear in real-time in the task detail panel in the app.

### Exit Codes

- Exit code `0`: task marked as `complete`.
- Any non-zero exit code: task marked as `error`.
- If the process is killed by signal, the task is also marked as `error`.

### Basic Logging

```javascript
console.log('Starting task...')
console.log('Processing item 1 of 10')
console.error('Failed to connect to the RPC endpoint')
console.log('Done')
process.exit(0)
```

## 6. Lifecycle and Process Control

### State Transitions

| Action | What Happens                                                                           |
| ------ | -------------------------------------------------------------------------------------- |
| Start  | `node <entryPoint>` spawned in the script directory with config env vars.              |
| Pause  | SIGSTOP sent (Linux/macOS). On Windows, stdout/stderr streams are paused (soft pause). |
| Resume | SIGCONT sent (Linux/macOS). On Windows, streams are resumed.                           |
| Stop   | SIGTERM sent. After 5 seconds, SIGKILL is sent if the process hasn't exited.           |

### Graceful Shutdown

Handle SIGTERM to clean up before exiting:

```javascript
let shuttingDown = false

process.on('SIGTERM', () => {
  if (shuttingDown) return
  shuttingDown = true
  console.log('Shutting down gracefully...')
  // Close connections, save state, etc.
  process.exit(0)
})
```

### Pause Caveats

Do not rely on pause behavior. On Linux/macOS, SIGSTOP freezes the entire process. On Windows, only output capture is paused; the process keeps running internally. Design your script to be stoppable via SIGTERM, not pausable.

## 7. Dependencies

If a `package.json` file exists in your script directory, the app runs `npm install --production --no-audit --no-fund` before the first execution (when `node_modules/` does not exist yet). Subsequent runs skip the install step.

### What Works

Pure JavaScript packages. Examples: `ethers`, `axios`, `node-fetch`, `web3.js`, `@solana/web3.js`, `bip39`.

### What Does Not Work

Native C++ addons (any package that compiles binaries during install). They will fail because the Node.js ABI inside Electron differs from standalone Node.js. This includes packages like `better-sqlite3`, `canvas`, `sharp`, and `bcrypt`.

### Best Practice

Bundle your dependencies using a tool like `esbuild` or `webpack` before packaging. This avoids the npm install step entirely and eliminates native module issues.

## 8. Account Data Access

When your manifest declares `requiredAccountTemplateIds`, users must select accounts from the matching template before creating a task.

### How Account Data Reaches Your Script

The app injects account data directly into the config object.

**Single task mode**: the config includes an `_accounts` array.

```javascript
const config = JSON.parse(process.env.TASK_CONFIG || '{}')
const accounts = config._accounts || []

for (const account of accounts) {
  console.log(`Account: ${account.id}`)
  console.log(`Pool: ${account.pool}`)
  console.log(`Address: ${account.data.address}`)
  console.log(`Labels: ${account.labels.join(', ')}`)
}
```

Each account object has:

| Field        | Type     | Description                                       |
| ------------ | -------- | ------------------------------------------------- |
| `id`         | string   | Account UUID.                                     |
| `templateId` | string   | Template this account belongs to.                 |
| `data`       | object   | Account fields as defined by the template schema. |
| `pool`       | string   | Account pool name.                                |
| `labels`     | string[] | Labels attached to this account.                  |
| `notes`      | string   | Freeform notes.                                   |

**Batch mode** (one task per account): each task gets individual account fields.

```javascript
const config = JSON.parse(process.env.TASK_CONFIG || '{}')
const accountId = config._account_id
const accountData = config._account_data
const accountPool = config._account_pool

console.log(`Running for account ${accountId} in pool ${accountPool}`)
```

## 9. Testing Locally

### Without the App

Set the `TASK_CONFIG` environment variable and run your entry point directly:

```bash
TASK_CONFIG='{"targetUrl":"https://example.com","threadCount":3}' node index.js
```

For account data, include `_accounts` in the config:

```bash
TASK_CONFIG='{"_accounts":[{"id":"test-1","templateId":"tpl-evm","data":{"address":"0xabc","privateKey":"0x123"},"pool":"main","labels":[],"notes":""}]}' node index.js
```

### With the App

1. Package your script as a zip with `manifest.json` at the root.
2. Upload it to your marketplace server.
3. In the app, browse the marketplace, install the script.
4. Create a task, fill out the config form, start it.
5. Check the log panel for output.

## 10. Publishing to Marketplace

### Package Your Script

Create a zip archive containing your script files. `manifest.json` must be at the zip root:

```bash
cd my-script/
zip -r ../my-script.zip manifest.json index.js package.json
```

Verify the structure:

```bash
unzip -l my-script.zip
# Should show:
#   manifest.json
#   index.js
#   package.json
```

### Upload via API

Send a multipart POST request to your marketplace server:

```bash
curl -X POST http://localhost:3400/api/scripts \
  -H "Authorization: Bearer airdrop-farm-dev-key" \
  -F "name=Ping Checker" \
  -F "version=1.0.0" \
  -F "description=Sends a request and reports response time" \
  -F "entryPoint=index.js" \
  -F 'tags=["network","utility"]' \
  -F "changelog=Initial release" \
  -F "file=@my-script.zip"
```

The server validates `manifest.json` inside the zip on upload. It checks:

- `manifest.json` exists at the root.
- It is valid JSON.
- Required fields are present: `id`, `name`, `version`, `description`, `entryPoint`, `runtime`, `schema`.
- `runtime` is `"node"`.
- `schema` is a JSON Schema object with `"type": "object"`.

If validation fails, the upload is rejected with a 400 error and the zip is deleted.

### Update a Script

```bash
curl -X PUT http://localhost:3400/api/scripts/{id} \
  -H "Authorization: Bearer airdrop-farm-dev-key" \
  -F "version=1.1.0" \
  -F "changelog=Added retry logic" \
  -F "file=@my-script-v2.zip"
```

### Authentication

- GET requests are public (no token needed).
- POST, PUT, DELETE requests require `Authorization: Bearer <token>`.
- The default dev key is `airdrop-farm-dev-key`. Change it via the `MARKETPLACE_API_KEY` environment variable in production.

## 11. Common Patterns

### Simple HTTP Request

```javascript
const config = JSON.parse(process.env.TASK_CONFIG || '{}')

async function main() {
  console.log(`Fetching ${config.targetUrl}...`)
  try {
    const res = await fetch(config.targetUrl)
    console.log(`Status: ${res.status}`)
    const body = await res.text()
    console.log(`Response length: ${body.length} bytes`)
    process.exit(0)
  } catch (err) {
    console.error(`Request failed: ${err.message}`)
    process.exit(1)
  }
}

main()
```

### Wallet Interaction

```javascript
const { Wallet } = require('ethers')
const config = JSON.parse(process.env.TASK_CONFIG || '{}')
const accounts = config._accounts || []

async function main() {
  for (const account of accounts) {
    const { privateKey } = account.data
    const wallet = new Wallet(privateKey)
    const signature = await wallet.signMessage('Verify ownership')
    console.log(`${wallet.address} signed: ${signature}`)
  }
  console.log('All accounts processed')
  process.exit(0)
}

main()
```

### Retry Loop

```javascript
const config = JSON.parse(process.env.TASK_CONFIG || '{}')
const maxRetries = config.maxRetries || 3

async function runWithRetry(fn) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      console.log(`Attempt ${attempt}/${maxRetries} failed: ${err.message}`)
      if (attempt === maxRetries) throw err
      await new Promise((r) => setTimeout(r, 2000 * attempt))
    }
  }
}

async function main() {
  await runWithRetry(async () => {
    const res = await fetch(config.targetUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    console.log('Success')
  })
  process.exit(0)
}

main()
```

### Progress Reporting

There is no dedicated progress API. Use log messages to indicate progress:

```javascript
const total = 100
for (let i = 0; i < total; i++) {
  // do work
  if (i % 10 === 0) {
    console.log(`Progress: ${Math.round(((i + 1) / total) * 100)}%`)
  }
}
console.log('Progress: 100%')
```

## 12. Limitations and Gotchas

- **No structured communication protocol.** The planned JSON-RPC stdin/stdout protocol is not implemented. Communication is stdout/stderr text only.
- **No progress reporting API.** Progress can only be inferred from log messages.
- **Pause is unreliable on Windows.** SIGSTOP is unavailable on Windows. The app does a soft pause (pausing output streams), but your script keeps executing. Do not depend on pause behavior.
- **Environment variable values are always strings.** `TASK_THREADCOUNT` is `"3"`, not `3`. Use `TASK_CONFIG` (which preserves types) or parse manually.
- **Native C++ npm modules will not work.** The ABI mismatch with Electron's Node.js runtime causes them to crash on load. Stick to pure JS packages or bundle your code.
- **No inter-script communication.** Each task runs in isolation. Scripts cannot talk to each other or coordinate.
- **No workflow orchestration.** There is no way to chain tasks or define dependencies between them.
- **Full system access.** Scripts are not sandboxed. They can read and write files, make network requests, and execute other processes. Be responsible.
- **npm install runs once.** Dependencies are installed on the first run only (when `node_modules/` is absent). If you add new dependencies in an update, users must delete `node_modules/` inside the script directory before the next run.
