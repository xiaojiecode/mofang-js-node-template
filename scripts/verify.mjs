// 提交前校验：把平台会拒绝的写法在本地挡下来。
//
// 这些规则来自 mofang-server/pkg/jsprogram 与 pkg/workflow/code_spec.go：
// 平台编译失败时只会给一句中文错误，先在这里定位更省时间。
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** 与 jsprogram.MaxSourceBytes 一致。 */
const MAX_SOURCE_BYTES = 5 << 20
/** 与 pkg/workflow.CodeSourceBytes 一致。 */
const MAX_JSON_BYTES = 256 << 10

/** Goja 里不存在的全局；引用即运行时 undefined。 */
const MISSING_GLOBALS = [
    'Intl',
    'structuredClone',
    'URL',
    'URLSearchParams',
    'TextEncoder',
    'TextDecoder',
    'setTimeout',
    'setInterval',
    'setImmediate',
    'queueMicrotask',
    'requestAnimationFrame',
    'fetch',
    'XMLHttpRequest',
    'WebSocket',
    'process',
    'require',
    'window',
    'document',
    'navigator',
    'localStorage',
    'sessionStorage',
    'console'
]

const problems = []
/** 第三方库内部可能走到、但本节点用不到的分支。 */
const warnings = []

async function main() {
    const source = await readFile(path.join(root, 'dist/program.js'), 'utf8')
    const body = JSON.parse(
        await readFile(path.join(root, 'dist/node.json'), 'utf8')
    )

    checkEncoding(source)
    checkModuleSyntax(source)
    checkTopLevelAwait(source)
    checkMissingGlobals(source)
    checkAsyncGenerators(source)
    checkProgramShape(source)
    checkBudget(body)
    checkSchemas(body)

    const bytes = Buffer.byteLength(source)
    console.log(`源码 ${bytes} / ${MAX_SOURCE_BYTES} bytes`)
    console.log(`工具预算 maxToolCalls=${body.maxToolCalls}`)
    console.log(`声明工具：${body.tools.join(', ') || '（无）'}`)

    if (warnings.length) {
        console.log('\n警告（不阻断，确认对应分支不会被走到即可）：')
        for (const warning of warnings) console.log(' - ' + warning)
    }
    if (problems.length) {
        console.error('\n发现 ' + problems.length + ' 个问题：')
        for (const problem of problems) console.error(' - ' + problem)
        process.exitCode = 1
        return
    }
    console.log('\n校验通过。')
}

function checkEncoding(source) {
    if (source.includes('\u0000')) problems.push('源码不能包含 NUL 字节')
    if (!source.trim()) problems.push('源码不能为空')
    const bytes = Buffer.byteLength(source)
    if (bytes > MAX_SOURCE_BYTES) {
        problems.push(`源码 ${bytes} 字节，超过 ${MAX_SOURCE_BYTES}`)
    }
    // 平台要求有效 UTF-8；Node 的 readFile 已按 utf8 解码，这里检查孤立代理项。
    if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(source)) {
        problems.push('源码包含孤立的 UTF-16 高代理项')
    }
    if (/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(source)) {
        problems.push('源码包含孤立的 UTF-16 低代理项')
    }
}

function checkModuleSyntax(source) {
    if (/^\s*(import|export)\b/m.test(source)) {
        problems.push('产物仍含 import/export；平台在严格模式 IIFE 里执行源码')
    }
    if (/\bimport\s*\(/.test(source)) {
        problems.push('不能使用动态 import()')
    }
}

function checkTopLevelAwait(source) {
    // 只有 main 内部允许 await；顶层 await 在平台里是语法错误。
    if (/^\s*await\b/m.test(source)) {
        problems.push('不能使用顶层 await；await 只能写在 main 或钩子函数体内')
    }
}

function checkMissingGlobals(source) {
    // 只认"裸标识符"位置：前一个字符不能是 `.`（属性名）、引号（字符串内容）
    // 或标识符字符。第三方库内部常有 `kind === "url"` 这类字面量，不能误报。
    for (const name of MISSING_GLOBALS) {
        const pattern = new RegExp(`(?<![\\w$.'"\`])${name}(?![\\w$])`, 'g')
        let match
        while ((match = pattern.exec(source)) !== null) {
            const before = source.slice(Math.max(0, match.index - 2), match.index)
            // `new URL(...)`、`URL(` 这类构造/调用才是真引用；单独出现在
            // 三元表达式里的比较操作数也可能是字符串字面量，交给上下文判断。
            const after = source.slice(
                match.index + name.length,
                match.index + name.length + 12
            )
            const isCallOrConstruct = /^\s*\(/.test(after)
            if (!isCallOrConstruct) continue
            warnings.push(
                `调用 Goja 里不存在的全局 ${name}（附近：${source
                    .slice(Math.max(0, match.index - 30), match.index + 30)
                    .replace(/\s+/g, ' ')}）`
            )
            break
        }
    }
}

function checkAsyncGenerators(source) {
    if (/async\s+function\s*\*/.test(source)) {
        problems.push('Goja 不支持 async generator（Async generators are not supported yet）')
    }
}

function checkProgramShape(source) {
    // 平台在 IIFE 末尾 return program，因此必须存在这个绑定。
    if (!/\b(?:var|let|const)\s+program\s*=/.test(source)) {
        problems.push('产物缺少 `const program = ...` 绑定')
    }
    // 业务能力每阶段最多一次；这里只提示明显的循环内调用。
    const loopCall = /for\s*\([^)]*\)\s*\{[^}]*\.call\s*\(/s
    if (loopCall.test(source)) {
        problems.push('看起来在循环里调用 ctx.call；每个阶段最多一次业务能力调用')
    }
}

function checkBudget(body) {
    if (!Number.isInteger(body.maxToolCalls) || body.maxToolCalls <= 0) {
        problems.push('maxToolCalls 必须是正整数')
    }
    if (!Array.isArray(body.tools)) {
        problems.push('tools 必须是数组（不能省略）')
    }
    for (const tool of body.tools ?? []) {
        if (typeof tool !== 'string' || !tool.trim()) {
            problems.push('tools 里的工具名必须是非空字符串')
        }
    }
    if (body.timeoutSeconds <= 0) problems.push('timeoutSeconds 必须大于 0')
    const json = Buffer.byteLength(JSON.stringify(body))
    if (json > MAX_JSON_BYTES) {
        problems.push(`保存请求体 ${json} 字节，超过单次 JSON 上限 ${MAX_JSON_BYTES}`)
    }
}

function checkSchemas(body) {
    for (const [name, schema] of [
        ['inputSchema', body.inputSchema],
        ['outputSchema', body.outputSchema]
    ]) {
        if (!schema || schema.type !== 'object') {
            problems.push(`${name} 根级必须是 type: "object"`)
            continue
        }
        if (schema.additionalProperties !== false) {
            problems.push(`${name}.additionalProperties 必须是 false`)
        }
        if (!schema.properties || typeof schema.properties !== 'object') {
            problems.push(`${name}.properties 必须声明`)
        }
        if ('$defs' in schema || 'definitions' in schema) {
            problems.push(
                `${name} 不能手写 $defs/definitions；平台保存时自行打包`
            )
        }
    }
    const output = body.outputSchema
    if (output?.properties && !('items' in output.properties)) {
        problems.push('outputSchema 必须声明 items 主流字段')
    }
    if (Array.isArray(output?.required) && output.required.includes('items')) {
        problems.push('outputSchema.items 不能是必填；空结果必须合法')
    }
    if (output?.properties && 'item' in output.properties) {
        problems.push('outputSchema 不能声明单数 item；主流输出用 items')
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
})
