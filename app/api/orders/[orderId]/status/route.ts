import { NextResponse } from "next/server";
import { route, requireSession, requirePermission } from "@/lib/server/http";
import { updateOrderStatus } from "@/lib/server/tabs";
import { updateOrderStatusSchema } from "@/lib/server/schemas";

export const dynamic = "force-dynamic";


export const PATCH = route(
  async (request: Request, context: { params: Promise<{ orderId: string }> }) => {
    const { orderId } = await context.params;
    const session = await requireSession();
    const organizationId = session.organizationId as string;

    const body = await request.json().catch(() => ({}));
    const parsed = updateOrderStatusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "That is not a state an order can be in.", code: "VALIDATION_FAILED" },
        { status: 422 },
      );
    }

    if (parsed.data.status === "CANCELLED") {
      const permitted = await requirePermission("void_order");
      void permitted;
    }

    const order = await updateOrderStatus(
      organizationId,
      orderId,
      parsed.data.status,
      session.staffId,
    );

    return NextResponse.json({
      id: order.id,
      number: order.number,
      status: order.status,
    });
  },
);