import { PrismaClient } from "@prisma/client";


const POOL_SIZE = Number(process.env.DATABASE_POOL_SIZE ?? 20);

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    datasources: {
      db: { url: withPoolSettings(process.env.DATABASE_URL) },
    },
  });


function withPoolSettings(url: string | undefined): string | undefined {
  if (!url) return url;
  const separator = url.includes("?") ? "&" : "?";
  if (url.includes("connection_limit=")) return url;
  return `${url}${separator}connection_limit=${POOL_SIZE}&pool_timeout=20`;
}

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;