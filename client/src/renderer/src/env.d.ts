/// <reference types="vite/client" />

/**
 * 构建时注入的应用版本号（见 electron.vite.config.ts 的 renderer.define）
 * 用于登录页脚注等无需异步请求即可展示版本的位置。
 */
declare const __APP_VERSION__: string
