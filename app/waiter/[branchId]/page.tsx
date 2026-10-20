import { WaiterOrder } from "@/components/orders/WaiterOrder";
import { prisma } from "@/lib/db/client";
import { resolveSession } from "@/lib/server/http";
import { notFound } from "@/lib/errors.server";
import { notFound as nextNotFound } from "next/navigation";

export default async function WaiterPage({
  params,
}: {
  params: { branchId: string };
}) {
  const session = await resolveSession();
  if (!session) return nextNotFound();
  if (!session.organizationId) return nextNotFound();

  const branch = await prisma.dunda_branches.findFirst({
    where: {
      id: params.branchId as string,
      organization_id: session.organizationId as string,
    },
    select: { id: true, name: true, organization_id: true },
  });

  if (!branch) return nextNotFound();

  return (
    <div className="p-4 md:p-6 h-full bg-[hsl(var(--app-bg))]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[hsl(var(--app-ink))]">Waiter Order</h1>
          <p className="text-[hsl(var(--app-faint))] text-sm">
            Table ordering for {branch.name}
          </p>
        </div>
        <div className="flex items-center gap-2 text-[hsl(var(--app-faint))] text-sm">
          <span className="bg-[hsl(var(--app-green-soft))] text-[hsl(var(--app-green))] rounded-full px-2 py-0.5 text-[10px]">
            Online
          </span>
          <span>Tablet mode</span>
        </div>
      </div>

      <WaiterOrder
        organizationId={session.organizationId}
        branchId={branch.id}
      />
    </div>
  );
}
