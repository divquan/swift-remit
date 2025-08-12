import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

export interface CreateAccountData {
  id: string;
  currency: string;
  type: string;
}

export interface CreateTransferData {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  currency: string;
  description?: string;
  reference?: string;
  remittanceId?: string;
}

export interface AccountBalance {
  balance: number;
  currency: string;
}

export class TigerBeetleService {
  static async connect(): Promise<void> {
    try {
      await prisma.$connect();
      console.log("✅ PostgreSQL transaction service connected successfully");
    } catch (error) {
      console.error("❌ PostgreSQL connection failed:", error);
      throw new Error(`Failed to connect to PostgreSQL: ${error}`);
    }
  }

  static async disconnect(): Promise<void> {
    await prisma.$disconnect();
    console.log("✅ PostgreSQL transaction service disconnected");
  }

  static async createAccount(accountData: CreateAccountData): Promise<void> {
    // Account creation is handled by the main account creation flow
    // This method exists for compatibility with the old TigerBeetle interface
    console.log(`✅ Account ready for transactions: ${accountData.id}`);
  }

  static async getAccount(accountId: string): Promise<any> {
    try {
      const account = await prisma.account.findUnique({
        where: { id: accountId },
        select: {
          id: true,
          balance: true,
          currency: true,
          status: true,
        },
      });

      if (!account) {
        return null;
      }

      return {
        id: account.id,
        balance: account.balance,
        currency: account.currency,
        status: account.status,
      };
    } catch (error) {
      console.error("❌ PostgreSQL getAccount failed:", error);
      throw error;
    }
  }

  static async createTransfer(transferData: CreateTransferData): Promise<void> {
    const reference = transferData.reference || uuidv4();

    try {
      await prisma.$transaction(async (tx) => {
        // Check sender account balance
        const senderAccount = await tx.account.findUnique({
          where: { id: transferData.fromAccountId },
        });

        if (!senderAccount) {
          throw new Error('Sender account not found');
        }

        if (senderAccount.balance.lt(transferData.amount)) {
          throw new Error('Insufficient balance');
        }

        // Check receiver account exists
        const receiverAccount = await tx.account.findUnique({
          where: { id: transferData.toAccountId },
        });

        if (!receiverAccount) {
          throw new Error('Receiver account not found');
        }

        // Update sender balance (debit)
        await tx.account.update({
          where: { id: transferData.fromAccountId },
          data: {
            balance: {
              decrement: transferData.amount,
            },
          },
        });

        // Update receiver balance (credit)
        await tx.account.update({
          where: { id: transferData.toAccountId },
          data: {
            balance: {
              increment: transferData.amount,
            },
          },
        });

        // Create transaction record
        await tx.transaction.create({
          data: {
            debitAccountId: transferData.fromAccountId,
            creditAccountId: transferData.toAccountId,
            amount: transferData.amount,
            currency: transferData.currency,
            type: 'TRANSFER',
            status: 'COMPLETED',
            description: transferData.description,
            reference,
            remittanceId: transferData.remittanceId,
          },
        });

        console.log(`✅ Transfer completed: ${reference}`);
      });
    } catch (error) {
      console.error("❌ PostgreSQL transfer failed:", error);
      throw error;
    }
  }

  static async healthCheck(): Promise<boolean> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      console.error("❌ PostgreSQL health check failed:", error);
      return false;
    }
  }

  static formatBalance(account: any): {
    available: number;
    pending: number;
  } {
    return {
      available: Number(account.balance || 0),
      pending: 0, // No pending balance in simple PostgreSQL implementation
    };
  }
}
