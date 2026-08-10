import { PrismaClient } from "@prisma/client";

// Serverless functions can cold-start many times per minute; without this
// global cache each one would open its own Postgres connection and Neon's
// pooled connection limit would choke fast.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
