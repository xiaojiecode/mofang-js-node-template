# mofang-js-node-template

魔方工作流 **JavaScript（Goja）节点**的 TypeScript 工程模板。用 `npm run build`
产出一个可直接保存到平台的单文件程序，第三方库在构建期内联。

> 这个仓库只写**执行代码**。节点的 Lit 设置面板与业务面板另见
> [mofang-lit-node-template](https://github.com/xiaojiecode/mofang-lit-node-template)。

## 快速开始

```bash
npm ci
npm run typecheck     # 类型检查（types/mofang 提供 ctx 与元数据契约）
npm run build         # 产出 dist/program.js 与 dist/node.json
npm run verify        # 按平台规则校验产物
```

`npm run check` 等于 build + verify。

把 `dist/node.json` 里的内容提交到平台即可：它是完整的保存请求体
（元数据 + 冻结源码）。

## 这个模板解决什么问题

平台的 JavaScript 节点把源码包进 `(function(){'use strict'; <source> return program;})()`
在 Goja 里同步执行。这带来几条硬约束，直接手写单文件很容易踩：

| 约束 | 后果 | 模板怎么处理 |
| --- | --- | --- |
| 源码里不能有 `import`/`export` | 语法错误 | esbuild 打包，并把 `export { X as default }` 重写成 `const program = X` |
| 源码上限 5 MiB | 超限拒绝保存 | `verify` 报告体积 |
| Goja 没有 `Intl`/`URL`/`setTimeout`/`fetch`/`console` | 运行时 `undefined` | 类型里声明为 `never`，`verify` 静态扫描 |
| Goja 不支持 async generator | 编译失败 | `verify` 拦下 |
| 每阶段最多一次业务能力调用 | 第二次直接失败 | `verify` 提示循环内调用 |
| 输出 `items` 不能必填、不能出现单数 `item` | 保存被拒 | `verify` 检查 Schema |

## 目录

```
src/program.ts   节点执行入口（main 架构）
src/schema.ts    zod 校验：输入主流、输出形状
src/tools.ts     ctx.call 的薄封装
src/node.ts      节点元数据：编码、名称、双 Schema、工具与预算
types/mofang/    ctx、钩子、元数据、Goja 差异的类型声明
scripts/         build / verify / submit
```

## 两种程序架构

### `main`：一次处理，返回值就是输出

```ts
const program = {
    main: async (ctx) => {
        const result = await ctx.call('ecom.translate', { text: ctx.input.item.basic.title })
        return { items: [{ basic: { title: result.text } }] }
    }
}
```

`main` 的返回值直接成为完整输出；返回 `undefined` 时才要求先用
`ctx.next/awaitUser/pauseNode/failNode` 声明终结意图。平台自动识别这种形状，
不需要额外配置。

### `{entry, steps}`：多阶段状态机

需要人工等待、跨阶段保存中间结果或分多次调用业务能力时用这个形状。每个阶段
必须以一个终结 API 结束：

```ts
const program = {
    entry: 'prepare',
    steps: {
        prepare(ctx) {
            ctx.message('读取商品', 'prepare')
            return ctx.next('translate', { title: ctx.input.item.basic.title })
        },
        translate(ctx) {
            const result = ctx.call('ecom.translate', { text: ctx.state.title })
            return ctx.complete({ items: [{ basic: { title: result.text } }] })
        }
    }
}
```

阶段名必须匹配 `^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`，1–50 个阶段。

### 生命周期（`createState` + 钩子 + `tasks`）

一个节点协调持续到达、多商品子任务与候选商品流转时用这种形状。它是节点级
状态机，业务调用只能放在 `tasks[handler]` 的阶段里。`types/mofang/context.d.ts`
的 `LifecycleProgram` 给出完整签名。

## 关于 `await`

Goja 没有定时器、网络或事件循环，所有 microtask 在调用返回时同步排空。因此：

- `await` 可以用来串联本地的同步计算，也可以等待 `ctx.call` 的返回值；
- **不能** `await fetch(...)`、`await new Promise(r => setTimeout(r, 0))` ——
  这些永远 settle 不了，宿主会报 `unsettled promise`。

## 校验清单

`npm run verify` 检查：

- 产物无 `import`/`export`/顶层 `await`、有 `const program` 绑定；
- 无 async generator；
- 源码 ≤ 5 MiB、有效 UTF-8、无 NUL；
- `maxToolCalls` 为正整数、`tools` 是数组、`timeoutSeconds > 0`；
- 双 Schema 根级是 `type: "object"` + `additionalProperties: false`，
  输出有 `items` 且非必填，没有手写 `$defs`。

警告项（不阻断）会列出第三方库里调用了 Goja 缺失全局的位置，确认对应分支
不会被走到即可。

## 提交到平台

```bash
# 只做语法与契约校验，不保存
MF_BASE_URL=https://your-host MF_TOKEN=… npm run build && \
  node scripts/submit.mjs --validate

# 保存新节点
MF_BASE_URL=… MF_TOKEN=… node scripts/submit.mjs --submit

# 更新已有节点（需要 expectedCatalogInstanceId / expectedCatalogRevision）
MF_BASE_URL=… MF_TOKEN=… node scripts/submit.mjs --submit --update
```

`code` 只走 URL 路径；请求体里带 `code` 会被网关拒绝，模板已处理。

## 注意

- 平台不提供单脚本硬内存隔离，这套执行环境只用于管理员发布的可信代码。
- 普通业务失败与未知结果都不会自动重发；`ctx.call` 抛出的
  `CapabilityError` 只能转人工或明确失败，不能吞掉后返回成功。
- 修改 `src/node.ts` 的 `code` 会创建另一个节点，不会重命名现有节点。
