import type { AuthorSchema, JavaScriptNodeBody } from '../types/mofang/node'

/**
 * 节点元数据。保存时 `source` 由构建产物填入，其余字段直接进入请求体。
 *
 * 输入/输出 Schema 写作者形式（`$ref` 引用内置类型）；平台保存时会解析所选
 * 确切版本并把依赖打包进 `$defs`，不要手写那份打包结果。
 */
const product = 'urn:mofang:workflow:type:product:1' as const

const inputSchema: AuthorSchema = {
    type: 'object',
    properties: {
        item: {
            $ref: product,
            title: '商品',
            description: '当前到达的主流商品'
        },
        maxTitleLength: {
            type: 'integer',
            title: '标题最大长度',
            description: '截断商品标题的字符数',
            default: 60
        }
    },
    required: ['item'],
    additionalProperties: false,
    'x-mf-ui': { order: ['item', 'maxTitleLength'] }
}

const outputSchema: AuthorSchema = {
    type: 'object',
    properties: {
        items: {
            type: 'array',
            title: '商品',
            items: { $ref: product }
        },
        report: {
            type: 'object',
            title: '报告'
        }
    },
    additionalProperties: false,
    'x-mf-ui': { order: ['items', 'report'] }
}

/** 构建脚本用 `node.json` 与本字段拼出保存请求体。 */
const node: Omit<JavaScriptNodeBody, 'source'> = {
    code: 'product-title-normalizer',
    name: '商品标题规范化',
    description: '按设置截断商品标题，并可选翻译商品描述',
    icon: '',
    category: '商品',
    inputSchema,
    outputSchema,
    timeoutSeconds: 60,
    // 必须显式声明；工具名要与平台工具目录一致。
    tools: ['ecom.translate'],
    // 本次执行最多 20 次工具调用，包含内置写输出/推进与业务能力。
    maxToolCalls: 20
}

export default node
