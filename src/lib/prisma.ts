import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from 'generated/prisma/client'

const connectionString = process.env.DATABASE_URL!

const poolMax = Number(process.env.DB_POOL_MAX ?? 20)
const poolConnectionTimeoutMs = Number(
	process.env.DB_POOL_CONNECTION_TIMEOUT_MS ?? 10_000
)
const statementTimeoutMs = Number(process.env.DB_STATEMENT_TIMEOUT_MS ?? 30_000)

const adapter = new PrismaPg({
	connectionString,
	max: poolMax,
	connectionTimeoutMillis: poolConnectionTimeoutMs,
	idleTimeoutMillis: 30_000,
	statement_timeout: statementTimeoutMs,
})

export const prisma = new PrismaClient({ adapter })
