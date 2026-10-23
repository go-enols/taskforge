/**
 * @file 原生 APK 更新插件（AppUpdater）的 JS 封装
 * @description 由 android/app/src/main/java/top/likecloud/taskforge/AppUpdaterPlugin.java 提供。
 * @module mobile/src/update-native
 */
import { registerPlugin } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'

export interface InstalledVersion {
  versionCode: number
  versionName: string
  packageName: string
}

export interface DownloadProgressEvent {
  percent: number
  downloaded: number
  total: number
}

export interface AppUpdaterPlugin {
  /** 当前已安装的版本信息 */
  getVersion(): Promise<InstalledVersion>
  /** 下载 APK 并调起系统安装器（需要「安装未知应用」权限） */
  downloadAndInstall(options: { url: string; sha256?: string; fileName?: string }): Promise<void>
  addListener(
    eventName: 'downloadProgress',
    listener: (event: DownloadProgressEvent) => void
  ): Promise<PluginListenerHandle>
  removeAllListeners(): Promise<void>
}

export const AppUpdater = registerPlugin<AppUpdaterPlugin>('AppUpdater')
