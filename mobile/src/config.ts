/**
 * @file 服务器地址配置
 * @description App/PWA 均可修改 Marketplace Server 地址（默认：App 用官方服务器，Web 用同源）。
 * @module mobile/src/config
 */
import { Capacitor } from '@capacitor/core'

const SERVER_KEY = 'tf_mobile_server'

/** 官方服务器（App 默认值；同时作为更新源域名） */
export const OFFICIAL_SERVER = 'https://task.likecloud.top'

/** 版本更新清单地址（固定官方源，避免自建市场服务器覆盖更新通道） */
export const UPDATE_FEED_URL = `${OFFICIAL_SERVER}/download/latest.json`

function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

/** 规范化用户输入的服务器地址：补协议、去尾斜杠、只保留 origin + path */
export function normalizeServerUrl(input: string): string {
  let value = input.trim()
  if (!value) throw new Error('请输入服务器地址')
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('服务器地址格式不正确')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('只支持 http/https 地址')
  if (!url.hostname) throw new Error('服务器地址缺少主机名')
  const path = url.pathname.replace(/\/+$/, '')
  return `${url.origin}${path}`
}

/** 当前 API 服务器地址；空字符串表示与页面同源（Web 默认） */
export function getServerBase(): string {
  try {
    const stored = localStorage.getItem(SERVER_KEY)
    if (stored) return stored
  } catch {
    /* ignore */
  }
  return isNativePlatform() ? OFFICIAL_SERVER : ''
}

/** 保存/清除自定义服务器地址 */
export function setServerBase(value: string | null): void {
  try {
    if (value) localStorage.setItem(SERVER_KEY, value)
    else localStorage.removeItem(SERVER_KEY)
  } catch {
    /* ignore */
  }
}

/** 面板展示用地址 */
export function getServerDisplay(): string {
  const base = getServerBase()
  if (base) return base
  if (typeof window !== 'undefined') return window.location.origin
  return OFFICIAL_SERVER
}

/** 拼接 API 路径 */
export function apiUrl(path: string): string {
  const base = getServerBase()
  if (!base) return path
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

/** 默认服务器（用于「恢复默认」） */
export function getDefaultServer(): string {
  return isNativePlatform() ? OFFICIAL_SERVER : ''
}
