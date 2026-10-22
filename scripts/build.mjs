// 把 TypeScript 源码打成平台可接受的单文件程序。
//
// 平台把源码包进 `(function(){'use strict'; <source> return program;})()`，
// 所以产物里不能有任何 ESM 语法，变量名必须叫 `program`。
import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'dist')

async function main() {
    await mkdir(outDir, { recursive: true })
    const result = await build({
        entryPoints: [path.join(root, 'src/program.ts')],
        bundle: true,
        write: false,
        format: 'esm',
        target: 'es2017',
        platform: 'neutral',
        minify: true,
        treeShaking: true,
        legalComments: 'none',
        logLevel: 'silent'
    })
    let code = result.outputFiles[0].text

    // esbuild 用 `export { X as default }` 发布默认导出。平台不接受任何 export，
    // 这里把导出重写回顶层 `const program`。
    const exportMatch = code.match(
        /export\s*\{\s*([A-Za-z_$][\w$]*)\s+as\s+default\s*\}\s*;?/
    )
    if (exportMatch) {
        code = code.replace(
            exportMatch[0],
            `var program = ${exportMatch[1]};`
        )
    }
    if (/^\s*(export|import)\b/m.test(code)) {
        throw new Error('产物仍包含 ESM 语法；请检查 esbuild 配置')
    }
    if (!/\bprogram\b/.test(code)) {
        throw new Error('产物没有 program 绑定；平台会报 program is not defined')
    }

    await writeFile(path.join(outDir, 'program.js'), code + '\n', 'utf8')

    // 保存请求体：元数据 + 冻结源码，可直接 POST 到平台。
    const metaSource = await readFile(path.join(root, 'src/node.ts'), 'utf8')
    void metaSource
    const nodeModule = await build({
        entryPoints: [path.join(root, 'src/node.ts')],
        bundle: true,
        write: false,
        format: 'esm',
        target: 'es2017',
        platform: 'neutral',
        logLevel: 'silent'
    })
    let metaCode = nodeModule.outputFiles[0].text
    const metaExport = metaCode.match(
        /export\s*\{\s*([A-Za-z_$][\w$]*)\s+as\s+default\s*\}\s*;?/
    )
    if (!metaExport) throw new Error('src/node.ts 必须默认导出一个对象')
    metaCode = metaCode.replace(metaExport[0], `return ${metaExport[1]};`)
    // 元数据本身是纯数据，用无宿主能力的求值即可。
    const meta = new Function(metaCode)()
    const body = { ...meta, source: code }

    await writeFile(
        path.join(outDir, 'node.json'),
        JSON.stringify(body, null, 2) + '\n',
        'utf8'
    )

    const bytes = Buffer.byteLength(code)
    console.log(`dist/program.js  ${bytes} bytes`)
    console.log(`dist/node.json    ${Buffer.byteLength(JSON.stringify(body))} bytes`)
    console.log(`工具：${body.tools.join(', ') || '（无）'}`)
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
})
