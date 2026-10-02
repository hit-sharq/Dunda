import { z } from "zod";

/**
 * Request shapes.
 *
 * Every route parses its input through one of these before a service sees it.
 * Notably absent anywhere: prices, totals, taxes and payment statuses. Those are
 * worked out server-side from the club's own settings, so a client cannot name
 * them. Amounts are whole currency units, validated as positive integers rather
 * than as loose numbers so a fractional shilling cannot enter the books.
 */

const positiveInt = z.number().int().positive();
const nonNegativeInt = z.number().int().min(0);
const uuid = z.string().min(1);

export const openTabSchema = z.object({
  customer: z.string().min(1),
  table: z.string().min(1),
  tableId: uuid.nullable().optional(),
  branchId: uuid.nullable().optional(),
  customerId: uuid.nullable().optional(),
});

export const addTabItemSchema = z.object({
  productId: uuid,
  quantity: positiveInt,
  unitId: uuid.nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const discountSchema = z.object({
  discount: nonNegativeInt,
});

export const closeTabSchema = z.object({
  allowOutstanding: z.boolean().default(false),
  reason: z.string().nullable().optional(),
});

export const checkoutSchema = z.object({
  payments: z
    .array(
      z.object({
        method: z.enum(["CASH", "MPESA", "CARD", "BANK_TRANSFER", "OTHER"]),
        amount: positiveInt,
        reference: z.string().nullable().optional(),
        paidBy: z.string().nullable().optional(),
      }),
    )
    .min(1, "A payment needs an amount and a method.")
    .max(10, "A tab is settled by a handful of payments, not a spreadsheet."),
  idempotencyKey: z.string().min(8).max(200).nullable().optional(),
});

export const createOrderSchema = z.object({
  tableId: uuid.nullable().optional(),
  tabId: uuid.nullable().optional(),
  customerId: uuid.nullable().optional(),
  station: z.enum(["BAR", "KITCHEN"]).default("BAR"),
  notes: z.string().nullable().optional(),
  items: z
    .array(
      z.object({
        productId: uuid,
        quantity: positiveInt,
        unitId: uuid.nullable().optional(),
        notes: z.string().nullable().optional(),
      }),
    )
    .min(1, "An order needs at least one item."),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum([
    "DRAFT",
    "PENDING",
    "ACCEPTED",
    "PREPARING",
    "READY",
    "SERVED",
    "PAYMENT_PENDING",
    "COMPLETED",
    "CANCELLED",
  ]),
});

export const startPoolSessionSchema = z.object({
  poolTableId: uuid,
  tabId: uuid.nullable().optional(),
  customerId: uuid.nullable().optional(),
});

export const adjustInventorySchema = z.object({
  productId: uuid,
  quantity: z.number().int().refine((v) => v !== 0, "An adjustment has to change something."),
  reason: z.string().min(1, "An adjustment needs a reason for the audit trail."),
});

export const createProductSchema = z.object({
  name: z.string().min(1),
  categoryId: uuid,
  category: z.string().min(1),
  price: positiveInt,
  cost: nonNegativeInt.default(0),
  tax: nonNegativeInt.default(0),
  sku: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  baseUnit: z.string().default("piece"),
  minimumStock: nonNegativeInt.default(0),
  accent: z.string().default("amber"),
  trackInventory: z.boolean().default(true),
});

export const createCustomerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const createReservationSchema = z
  .object({
    customer: z.string().min(1),
    phone: z.string().min(1),
    startsAt: z.string().datetime({ message: "A reservation needs a real start time." }),
    endsAt: z.string().datetime(),
    tableId: uuid.nullable().optional(),
    poolTableId: uuid.nullable().optional(),
    tableName: z.string().min(1),
    guests: z.number().int().positive().default(1),
    notes: z.string().nullable().optional(),
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), {
    message: "A reservation has to end after it starts.",
    path: ["endsAt"],
  });

export const createShiftSchema = z.object({
  staffId: uuid,
  branchId: uuid.nullable().optional(),
  openingCash: nonNegativeInt.default(0),
  notes: z.string().nullable().optional(),
});

export const clockOutSchema = z.object({
  closingCash: nonNegativeInt,
  notes: z.string().nullable().optional(),
});

export const createExpenseSchema = z.object({
  branchId: uuid,
  category: z.enum([
    "SUPPLIES",
    "UTILITIES",
    "MAINTENANCE",
    "STAFF",
    "RENT",
    "MARKETING",
    "OTHER",
  ]),
  description: z.string().min(1),
  amount: positiveInt,
  expenseDate: z.string().datetime(),
  paymentMethod: z.enum(["CASH", "MPESA", "CARD", "BANK_TRANSFER", "OTHER"]).default("CASH"),
  reference: z.string().nullable().optional(),
  vendor: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const createEventSchema = z.object({
  branchId: uuid,
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  capacity: z.number().int().min(0).default(0),
  ticketPrice: nonNegativeInt.default(0),
});

export const createSupplierSchema = z.object({
  name: z.string().min(1),
  contact: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
});

export const createStaffSchema = z.object({
  name: z.string().min(1),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  roleId: uuid,
  branchId: uuid.nullable().optional(),
  clerkUserId: z.string().nullable().optional(),
});

export const queryPagination = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().max(120).optional(),
});
