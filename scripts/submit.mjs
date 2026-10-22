// 把 dist/node.json 提交到平台。默认只打印请求，加 --submit 才真正发送。
//
// 用法：
//   MF_BASE_URL=https://… MF_TOKEN=… node scripts/submit.mjs --validate
//   MF_BASE_URL=https://… MF_TOKEN=… node scripts/submit.mjs --submit
//   MF_BASE_URL=https://… MF_TOKEN=… node scripts/submit.mjs --submit --update
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2))

async function main() {
    const body = JSON.parse(
        await readFile(path.join(root, 'dist/node.json'), 'utf8')
    )
    const base = process.env.MF_BASE_URL?.replace(/\/$/, '')
    const token = process.env.MF_TOKEN

    if (args.has('--validate')) {
        return request('/v1/admin/workflow/nodes/javascript/validate', body)
    }
    if (args.has('--submit')) {
        // code 只能走 URL 路径，请求体里带 code 会被网关拒绝。
        const { code, expectedCatalogInstanceId, expectedCatalogRevision, ...rest } =
            body
        if (args.has('--update')) {
            return request(
                `/v1/admin/workflow/nodes/${encodeURIComponent(code)}/javascript`,
                {
                    ...rest,
                    expectedCatalogInstanceId,
                    expectedCatalogRevision
                },
                'PUT'
            )
        }
        return request('/v1/admin/workflow/nodes/javascript', {
            code,
            ...rest
        })
    }
    console.log(JSON.stringify(body, null, 2))
    console.log(
        '\n加 --validate 只做语法与契约校验；加 --submit 才保存节点。'
    )
    if (!base || !token) {
        console.log('需要 MF_BASE_URL 与 MF_TOKEN 才能发送请求。')
    }
}

async function request(pathname, body, method = 'POST') {
    const base = process.env.MF_BASE_URL?.replace(/\/$/, '')
    const token = process.env.MF_TOKEN
    if (!base || !token) {
        throw new Error('需要 MF_BASE_URL 与 MF_TOKEN')
    }
    const response = await fetch(base + pathname, {
        method,
        headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
    })
    const text = await response.text()
    console.log(response.status, text)
    if (!response.ok) process.exitCode = 1
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
})
