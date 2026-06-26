# Test

用于测试6-11

## Permissions

- `network`
- `filesystem`

## Schema Params

| `msg` | string | 消息 | Yes |
## Environment Variables

| Variable | Description |
|----------|-------------|
| `TASK_CONFIG` | 任务配置 JSON |
| `TASK_WALLETS` | 钱包列表 JSON（address, privateKey, mnemonic, walletType）|
| `TASK_SCRIPT_PARAMS` | 匹配的脚本参数数据 JSON |
| `TASK_PERM_NETWORK` | 网络权限 "1" 或 "0" |
| `TASK_PERM_FILESYSTEM` | 文件系统权限 "1" 或 "0" |
| `TASK_SANDBOX` | 沙箱模式 "1" 或 "0" |

## Usage

Install via TaskForge marketplace, then create a task using this script.
