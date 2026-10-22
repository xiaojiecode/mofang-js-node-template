/**
 * 节点元数据与冻结契约的形状。对应后台 `POST/PUT /nodes/javascript` 的请求体
 * 与 `codeSpec` 的存储形式。
 */

/** 内置类型身份：`urn:mofang:workflow:type:<kind>:1`。 */
export type ParamType =
    | 'string'
    | 'integer'
    | 'number'
    | 'boolean'
    | 'object'
    | 'array'
    | 'url'
    | 'image'
    | 'video'
    | 'product'

/** 可作为主流内容（items 元素）的业务类型。 */
export type BusinessType = 'image' | 'video' | 'product'

/** 引用系统类型：作者只能选择，不能改写内部结构。 */
export interface TypeRef {
    $ref: `urn:mofang:workflow:type:${ParamType}:1`
}

/**
 * 作者可写的 JSON Schema 子集。
 *
 * 根级只允许 `type/properties/required/additionalProperties/title/description/x-mf-ui`，
 * 且必须是 `type: "object"` + `additionalProperties: false`。业务引用旁只能附加
 * `title/description/default/x-mf-ui`；可空用 `anyOf: [X, {type: "null"}]`。
 */
export interface AuthorSchema {
    type: 'object'
    properties: Record<string, AuthorField>
    required?: string[]
    additionalProperties: false
    title?: string
    description?: string
    'x-mf-ui'?: { order?: string[] }
}

export interface AuthorField {
    $ref?: TypeRef['$ref']
    type?: 'string' | 'integer' | 'number' | 'boolean' | 'object' | 'array'
    title?: string
    description?: string
    default?: unknown
    'x-mf-ui'?: Record<string, unknown>
    anyOf?: unknown[]
    enum?: unknown[]
    items?: unknown
    format?: string
    minLength?: number
    maxLength?: number
    minimum?: number
    maximum?: number
    minItems?: number
    maxItems?: number
    pattern?: string
    [constraint: string]: unknown
}

/** 保存请求体。`code` 走 URL 路径，更新/删除还需要两个修订断言。 */
export interface JavaScriptNodeBody {
    code: string
    name: string
    description?: string
    icon?: string
    category?: string
    inputSchema: AuthorSchema
    outputSchema: AuthorSchema
    timeoutSeconds: number
    /** 冻结源码。平台原样存储并包进严格模式 IIFE，不做任何改写。 */
    source: string
    /** 显式声明的工具名；`ctx.call` 只能调用这里列出的能力。 */
    tools: string[]
    /** 每次执行的工具预算（含内置工具与业务能力）。必须为正整数。 */
    maxToolCalls: number
    expectedCatalogInstanceId?: string
    expectedCatalogRevision?: string
}

/** 校验接口的返回。 */
export interface JavaScriptValidateResult {
    programInterface: 'stages' | 'lifecycle' | 'main'
    valid: true
    entry: string
    steps: string[]
    scope: 'syntax_and_contract'
    toolAvailability: 'checked_on_submission'
}
