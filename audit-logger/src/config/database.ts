import { PrismaClient } from '@prisma/client';

export const db = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
  errorFormat: 'pretty',
});

// Handle graceful shutdown
process.on('beforeExit', async () => {
  await db.$disconnect();
});
