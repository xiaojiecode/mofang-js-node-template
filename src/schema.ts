import { z } from 'zod'

/**
 * 商品输入的最小校验。字段结构由冻结 inputSchema 决定，这里只做一次形状检查，
 * 让业务逻辑在拿到值之前就知道缺什么。
 */
export const ProductItem = z.object({
    basic: z
        .object({
            title: z.string().trim().min(1),
            description: z.string().optional()
        })
        .passthrough()
})

export type ProductItem = z.infer<typeof ProductItem>

/** 输出主流：`items` 直接放业务内容，每个元素向下游形成一个独立任务。 */
export const Output = z.object({
    items: z.array(
        z.object({
            basic: z.object({
                title: z.string().min(1),
                description: z.string().optional()
            })
        })
    ),
    /** 辅助报告字段放在根部，不塞进 item。 */
    report: z
        .object({
            stage: z.string(),
            normalized: z.number().int().nonnegative()
        })
        .optional()
})

export type Output = z.infer<typeof Output>
