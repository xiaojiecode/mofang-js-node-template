import type { JsonObject } from '../types/mofang/context'
import { Output, ProductItem } from './schema'
import { callTool, readText } from './tools'

/**
 * 输入形状由冻结 inputSchema 决定：主流商品在 `item`，辅助设置在根级。
 * 这里只声明本节点实际读取的字段。
 */
/**
 * 输入形状由冻结 inputSchema 决定。这里用交叉类型而不是 `extends JsonObject`：
 * JSON 值不接受 undefined，而可选字段在读取侧确实是 undefined。
 */
interface Input {
    item: JsonObject
    /** 辅助设置：标题最大长度。 */
    maxTitleLength?: number
}

/**
 * JSON 不能含 undefined：可选字段要么给出值，要么整个字段不存在。
 * 这里用条件展开而不是把 undefined 塞进对象。
 */
function descriptionField(value: string | undefined): JsonObject {
    return value === undefined ? {} : { description: value }
}

/**
 * main 架构：一个函数完成整件商品的处理，返回值就是完整输出。
 *
 * 与 `{entry, steps}` 状态机相比，main 不需要显式保存阶段；适合一次读完输入、
 * 至多一次业务调用、一次产出结果的节点。需要人工等待或多阶段续接时用 steps。
 */
const program = {
    main: async (ctx: {
        input: Input & JsonObject
        state: JsonObject
        call<T>(tool: string, args: JsonObject): T
        message(text: string, stage?: string): void
        complete(output: JsonObject): void
        awaitUser(intent: {
            prompt: string
            nextStep: string
            output?: JsonObject
            data?: JsonObject
        }): void
        failNode(reason: string): void
    }) => {
        ctx.message('校验商品输入', 'validate')
        const parsed = ProductItem.safeParse(ctx.input.item)
        if (!parsed.success) {
            const fields = parsed.error.issues.map((issue) =>
                issue.path.join('.')
            )
            return ctx.failNode('商品缺少必需字段：' + fields.join('、'))
        }

        const limit = ctx.input.maxTitleLength ?? 60
        const title = parsed.data.basic.title.slice(0, limit)
        if (title !== parsed.data.basic.title) {
            ctx.message('标题已截断到 ' + String(limit) + ' 个字符', 'normalize')
        }

        // 一次业务调用：把截断后的标题交给翻译能力。工具名必须已在 node.json 声明。
        let description = parsed.data.basic.description
        if (description) {
            ctx.message('翻译商品描述', 'translate')
            const translated = await ctx.call<JsonObject>('ecom.translate', {
                text: description
            })
            description = readText(translated, 'text') ?? description
        }

        const output: JsonObject = {
            items: [{ basic: { title, ...descriptionField(description) } }],
            report: { stage: 'done', normalized: 1 }
        }
        // 用 schema 再确认一次形状：outputSchema 由平台校验，这里让本地构建先失败。
        const checked = Output.safeParse(output)
        if (!checked.success) {
            return ctx.failNode('输出不符合本地 schema')
        }
        return ctx.complete(output)
    }
}

export default program
