/**
 * 魔方工作流 JavaScript 节点（kind=code、codeRuntime=goja）的作者契约。
 *
 * 这些类型由平台源码 `mofang-server/pkg/jsprogram` 与 `pkg/workflow/code_spec.go`
 * 推导而来，只用于编写期检查；运行时没有 TypeScript，只有 Goja。
 */

/** 一次节点执行里可用的 JSON 值。JSON 不能含 undefined、函数、循环或非有限数。 */
export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
export interface JsonObject {
    [key: string]: JsonValue
}

/**
 * 业务能力调用失败。只有适配器标为 business 且失败账本已提交时脚本才能捕获；
 * 其它错误由宿主强制处理，try/catch 绕不过去。
 */
export interface CapabilityError extends Error {
    name: 'CapabilityError'
    code: string
    message: string
    toolCallId: string
    operationId: string
    result?: JsonValue
}

/** 阶段程序的上下文。每个阶段一个，不跨阶段保留。 */
export interface StageContext<TInput extends JsonObject = JsonObject> {
    /** 统一准备后的冻结输入。主流业务内容在 `item`，辅助设置是同级的根字段。 */
    readonly input: TInput
    /** 上一阶段通过 `next` 显式保存的状态；入口阶段是 `{}`。 */
    readonly state: JsonObject
    /** 人工回答，仅在 `awaitUser` 的续接阶段存在。 */
    readonly answer?: JsonValue

    /**
     * 同步调用一个已声明的工具。每阶段最多一次业务能力调用；
     * 需要多次调用时拆成具名阶段。
     */
    call<TResult = JsonValue>(tool: string, args: JsonObject): TResult

    /** 发布公开进度（不是模型思考）。不占单阶段业务能力名额，但计入工具预算。 */
    message(text: string, stage?: string): void

    /** 进入下一阶段，保存必要状态。 */
    next(step: string, data?: JsonObject): void
    /** 提交符合冻结 outputSchema 的完整输出，结束本次执行。 */
    complete(output: JsonObject): void
    /** 请求人工回答；`output` 只是预览，不是正式输出。 */
    awaitUser(intent: {
        prompt: string
        nextStep: string
        output?: JsonObject
        data?: JsonObject
    }): void
    /** 保存续接点后暂停当前执行。 */
    pauseNode(intent: {
        reason: string
        nextStep: string
        data?: JsonObject
    }): void
    /** 明确失败。 */
    failNode(reason: string): void
}

/** 生命周期钩子的上下文。每次钩子重新创建，state/view 由平台校验修订后保存。 */
export interface HookContext<TState extends JsonObject = JsonObject> {
    /** 真实的运行与节点实例身份。 */
    readonly node: Readonly<{ runId: string; nodeInstanceId: string }>
    /** 上游输入是否已关闭。 */
    readonly inputClosed: boolean
    readonly taskSummary: Readonly<{
        queued: number
        running: number
        unresolved: number
    }>
    /** 可编辑的业务状态；钩子成功返回后由平台提交。 */
    state: TState
    /** 只读的业务展示数据快照。 */
    readonly view: JsonObject | null
    /** 只读的协调配置。 */
    readonly config: JsonObject

    /** 替换业务展示数据。 */
    view_replace(value: JsonObject): void
    tasks: {
        /** 为本程序已声明的 handler 建立子任务意图，返回预分配 ID。 */
        spawn(handler: string, input: JsonObject, inputRefs?: string[]): string
    }
    outputs: {
        /** 追加候选商品，返回预分配候选 ID。 */
        append(value: JsonObject, inputRefs?: string[]): string
        /** 修改未放行候选，核对所见修订。 */
        update(id: string, expectedRevision: string, value: JsonObject): void
        /** 丢弃候选，核对修订。 */
        remove(id: string, expectedRevision: string): void
    }
    /** 声明本节点暂时不再生产；不等于节点完成。 */
    finishProduction(): void
}

/** 生命周期事件载荷。字段按钩子不同，见各钩子注释。 */
export type HookEvent = JsonObject

/** 阶段程序：`entry` 指向首个阶段。 */
export interface StageProgram {
    entry: string
    steps: Record<string, (ctx: StageContext) => void>
}

/** main 程序：一个函数返回完整输出，可选具名阶段供 `ctx.next` 使用。 */
export interface MainProgram<
    TInput extends JsonObject = JsonObject,
    TOutput extends JsonObject = JsonObject
> {
    main: (ctx: StageContext<TInput>) => TOutput | void | Promise<TOutput | void>
    steps?: Record<string, (ctx: StageContext) => void>
}

/** 生命周期程序：协调钩子 + 子任务处理器。 */
export interface LifecycleProgram {
    createState(): JsonObject
    onStart?(ctx: HookContext, event: HookEvent): void | Promise<void>
    onInput?(ctx: HookContext, event: HookEvent): void | Promise<void>
    onTaskResult?(ctx: HookContext, event: HookEvent): void | Promise<void>
    onAction?(ctx: HookContext, event: HookEvent): void | Promise<void>
    onInputClosed?(ctx: HookContext, event: HookEvent): void | Promise<void>
    onControl?(ctx: HookContext, event: HookEvent): void | Promise<void>
    onError?(ctx: HookContext, event: HookEvent): void | Promise<void>
    tasks: Record<string, StageProgram>
}
