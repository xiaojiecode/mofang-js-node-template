import type { JsonObject, JsonValue } from '../types/mofang/context'

/**
 * 业务能力调用的薄封装。
 *
 * 平台只允许调用 `node.json` 里声明的工具；每阶段最多一次业务能力调用。
 * 这里不做重试：普通业务失败与未知结果都不自动重发，重试由人决定。
 */
export function callTool<TResult = JsonObject>(
    ctx: { call<T>(tool: string, args: JsonObject): T },
    name: string,
    args: JsonObject
): TResult {
    return ctx.call<TResult>(name, args)
}

/**
 * 把工具回执里常见的包装拆开。
 *
 * 适配器的回执形状由工具目录决定，这里只处理本节点实际用到的字段；
 * 拿不到就返回 `undefined`，让调用方按业务决定，不编造默认值。
 */
export function readField(
    result: JsonValue | undefined,
    key: string
): JsonValue | undefined {
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
        return undefined
    }
    return result[key]
}

/** 取字符串字段；非字符串一律当作未提供。 */
export function readText(
    result: JsonValue | undefined,
    key: string
): string | undefined {
    const value = readField(result, key)
    return typeof value === 'string' && value.trim() !== '' ? value : undefined
}
