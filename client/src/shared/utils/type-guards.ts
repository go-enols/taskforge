/**
 * @file 类型守卫工具集
 * @description 提供 auto-view 判定所需的轻量类型守卫，无依赖、可独立使用。
 */

/** 100KB 截断阈值（防止大数据块阻塞主进程） */
export const MAX_SNAPSHOT_SIZE = 100 * 1024

/**
 * 判断是否为纯对象（排除 null、Array、Map、Set 等）
 */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * 判断是否为原始类型（string / number / boolean / bigint / symbol / null / undefined）
 */
export function isPrimitive(v: unknown): v is string | number | boolean | bigint | symbol | null | undefined {
  return v === null || (typeof v !== 'object' && typeof v !== 'function')
}

/**
 * 判断是否为扁平原始值对象（所有 value 均为 isPrimitive 判定为真）
 * — 适用于 KV 视图展示
 */
export function isKeyValue(v: unknown): v is Record<string, unknown> {
  if (!isPlainObject(v)) return false
  return Object.values(v).every(isPrimitive)
}

/**
 * 判断是否为小数组（≤5 项，每项为纯对象且 key ≤ 3）— 适用于 Card 网格视图
 */
export function isCardable<T extends Record<string, unknown>>(arr: unknown): arr is T[] {
  return Array.isArray(arr) && arr.length > 0 && arr.length <= 5 &&
    arr.every(x => isPlainObject(x) && Object.keys(x).length <= 3)
}

/**
 * 判断是否为大对象数组（length > 0，每项为纯对象，key > 3）— 适用于 Table 视图
 */
export function isTableable<T extends Record<string, unknown>>(arr: unknown): arr is T[] {
  return Array.isArray(arr) && arr.length > 0 &&
    arr.every(x => isPlainObject(x) && Object.keys(x).length > 3)
}

/**
 * 数据大小（JSON 序列化后字节数估算）
 * — 超过 MAX_SNAPSHOT_SIZE 时上层应截断
 */
export function estimateSize(v: unknown): number {
  try {
    return JSON.stringify(v)?.length ?? 0
  } catch {
    return Number.POSITIVE_INFINITY
  }
}
