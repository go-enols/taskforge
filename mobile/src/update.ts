/**
 * @file App 自动更新
 * @description 启动时检查官方更新清单，发现新版本后提示下载并调起系统安装器。
 * @module mobile/src/update
 */
import { isNativeApp } from './native'
import { UPDATE_FEED_URL } from './config'
import { APP_VERSION, APP_VERSION_CODE } from './version'
import { AppUpdater, type DownloadProgressEvent, type InstalledVersion } from './update-native'

/** 服务器返回的更新清单 */
export interface UpdateInfo {
  versionCode: number
  versionName: string
  url: string
  size?: number
  sha256?: string
  changelog?: string
  mandatory?: boolean
}

/** 检查更新；无更新或检查失败返回 null */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!isNativeApp) return null
  try {
    const response = await fetch(`${UPDATE_FEED_URL}?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    })
    if (!response.ok) return null
    const info = (await response.json()) as UpdateInfo
    if (!info || typeof info.versionCode !== 'number' || typeof info.url !== 'string') return null
    if (!info.versionCode || info.versionCode <= APP_VERSION_CODE) return null
    return info
  } catch {
    return null
  }
}

/** 读取已安装版本（原生取 PackageInfo，Web 用构建常量） */
export async function getInstalledVersion(): Promise<InstalledVersion> {
  if (!isNativeApp) {
    return { versionCode: APP_VERSION_CODE, versionName: APP_VERSION, packageName: 'web' }
  }
  try {
    return await AppUpdater.getVersion()
  } catch {
    return { versionCode: APP_VERSION_CODE, versionName: APP_VERSION, packageName: 'unknown' }
  }
}

/** 下载并调起安装；返回取消监听的清理函数 */
export async function installUpdate(
  info: UpdateInfo,
  onProgress: (event: DownloadProgressEvent) => void
): Promise<void> {
  const handle = await AppUpdater.addListener('downloadProgress', onProgress)
  try {
    await AppUpdater.downloadAndInstall({
      url: info.url,
      sha256: info.sha256,
      fileName: `TaskForge-${info.versionName || info.versionCode}.apk`
    })
  } finally {
    await handle.remove()
  }
}
