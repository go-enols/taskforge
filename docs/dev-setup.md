# Windows 开发环境配置

## `unzip` 命令缺失的解决

项目 git hooks 依赖 `unzip` 命令。Windows 不自带，但 Git for Windows 自带的 `unzip.exe`
位于 `Git\usr\bin\` 目录，默认不加入系统 PATH。

### 一键修复

以管理员身份运行 PowerShell：

```powershell
$gitUsrBin = "$env:ProgramFiles\Git\usr\bin"
if (-not (Test-Path "$gitUsrBin\unzip.exe")) {
    $gitUsrBin = "${env:ProgramFiles(x86)}\Git\usr\bin"
}
if (-not (Test-Path "$gitUsrBin\unzip.exe")) {
    $gitUsrBin = "$env:LOCALAPPDATA\Programs\Git\usr\bin"
}
$oldPath = [Environment]::GetEnvironmentVariable('PATH', 'User')
if ($oldPath -notmatch [regex]::Escape($gitUsrBin)) {
    [Environment]::SetEnvironmentVariable('PATH', "$oldPath;$gitUsrBin", 'User')
    Write-Host "已添加 $gitUsrBin 到用户 PATH。"
    Write-Host "请重启终端使配置生效。"
} else {
    Write-Host "$gitUsrBin 已在 PATH 中。"
}
```

**重启终端后**，`unzip` 命令即全局可用。

---

## Node.js 版本要求

- Node.js ≥ 22
- npm ≥ 10
