import { z } from 'zod'

export const CreateOrderSchema = z.object({
  branchId: z.string().min(1),
  tableId: z.string().optional(),
  items: z.array(z.object({
    productId: z.string().min(1),
    unitId: z.string().min(1),
    quantity: z.number().positive(),
  })).min(1),
})

export const CreatePaymentSchema = z.object({
  orderId: z.string().min(1),
  amount: z.number().positive(),
  method: z.enum(['CASH', 'MPESA', 'CARD', 'OTHER']),
})

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>
export type CreatePaymentInput = z.infer<typeof CreatePaymentSchema>
