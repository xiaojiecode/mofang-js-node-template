/// <reference path="./context.d.ts" />
/// <reference path="./node.d.ts" />

/**
 * Goja 运行时与浏览器的差别。这些全局在 Goja 里不存在，`npm run verify` 会拦下
 * 对它们的引用；在这里声明成 `never`，让编辑器也提前报错。
 */
declare const Intl: never
declare const structuredClone: never
declare const URL: never
declare const URLSearchParams: never
declare const TextEncoder: never
declare const TextDecoder: never
declare const setTimeout: never
declare const setInterval: never
declare const setImmediate: never
declare const queueMicrotask: never
declare const fetch: never
declare const XMLHttpRequest: never
declare const WebSocket: never
declare const process: never
declare const require: never
declare const console: never
