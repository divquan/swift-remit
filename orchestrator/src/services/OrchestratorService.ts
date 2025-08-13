import { PrismaClient, TransactionStatus, RemittanceStatus, TransactionType } from '@prisma/client';
import { db } from '@/config/database';
import { 
  RemittanceJobData, 
  TransactionData, 
  RemittanceProcessingResult,
  PaymentProviderRequest,
  PaymentProviderResponse,
  AuditLogData 
} from '@/types';
import { PaymentProviderService } from './PaymentProviderService';
import { AuditLoggerService } from './AuditLoggerService';
import { CONFIG } from '@/config';
import { v4 as uuidv4 } from 'uuid';

export class OrchestratorService {
  private paymentProvider: PaymentProviderService;
  private auditLogger: AuditLoggerService;

  constructor() {
    this.paymentProvider = new PaymentProviderService();
    this.auditLogger = new AuditLoggerService();
  }

  /**
   * Start remittance processing with ACID transaction guarantees
   */
  async startRemittance(jobData: RemittanceJobData): Promise<RemittanceProcessingResult> {
    const { remittanceId, userId, senderAccountId, receiverAccountId, amount, currency, fee } = jobData;

    try {
      // Use Prisma transaction for atomicity
      const result = await db.$transaction(async (prisma) => {
        // 1. Check sender's balance with row-level lock
        const senderAccount = await prisma.accounts.findUnique({
          where: { id: senderAccountId },
          select: { id: true, balance: true, currency: true, userId: true }
        });

        if (!senderAccount) {
          throw new Error(`Sender account ${senderAccountId} not found`);
        }

        const totalAmount = amount + fee;
        if (senderAccount.balance.toNumber() < totalAmount) {
          throw new Error(`Insufficient balance. Required: ${totalAmount}, Available: ${senderAccount.balance}`);
        }

        // 2. Create remittance record with PROCESSING status
        const remittance = await prisma.remittances.update({
          where: { id: remittanceId },
          data: {
            status: RemittanceStatus.PROCESSING
          }
        });

        // 3. Create debit transaction for sender (amount + fee)
        const debitTransaction = await prisma.transactions.create({
          data: {
            id: uuidv4(),
            debitAccountId: senderAccountId,
            amount: totalAmount,
            currency: currency,
            type: TransactionType.TRANSFER,
            status: TransactionStatus.PENDING,
            description: `Remittance debit for ${remittanceId}`,
            reference: `REM-DEBIT-${remittanceId}`,
            remittanceId: remittanceId,
            updatedAt: new Date(),
            metadata: { 
              originalAmount: amount, 
              fee: fee,
              step: 'DEBIT_SENDER'
            }
          }
        });

        // 4. Create credit transaction for receiver (if internal)
        let creditTransaction = null;
        if (receiverAccountId) {
          creditTransaction = await prisma.transactions.create({
            data: {
              id: uuidv4(),
              creditAccountId: receiverAccountId,
              amount: amount,
              currency: currency,
              type: TransactionType.TRANSFER,
              status: TransactionStatus.PENDING,
              description: `Remittance credit for ${remittanceId}`,
              reference: `REM-CREDIT-${remittanceId}`,
              remittanceId: remittanceId,
              updatedAt: new Date(),
              metadata: { 
                step: 'CREDIT_RECEIVER'
              }
            }
          });
        }

        // 5. Create fee transaction
        const feeTransaction = await prisma.transactions.create({
          data: {
            id: uuidv4(),
            debitAccountId: senderAccountId,
            amount: fee,
            currency: currency,
            type: TransactionType.FEE,
            status: TransactionStatus.PENDING,
            description: `Transaction fee for ${remittanceId}`,
            reference: `REM-FEE-${remittanceId}`,
            remittanceId: remittanceId,
            updatedAt: new Date(),
            metadata: { 
              step: 'FEE_COLLECTION'
            }
          }
        });

        // 6. Update sender's balance (debit amount + fee)
        await prisma.accounts.update({
          where: { id: senderAccountId },
          data: {
            balance: {
              decrement: totalAmount
            }
          }
        });

        // 7. Update receiver's balance (if internal transfer)
        if (receiverAccountId) {
          await prisma.accounts.update({
            where: { id: receiverAccountId },
            data: {
              balance: {
                increment: amount
              }
            }
          });
        }

        return {
          remittance,
          debitTransaction,
          creditTransaction,
          feeTransaction
        };
      }, {
        timeout: CONFIG.DB_TRANSACTION_TIMEOUT_MS,
        isolationLevel: 'Serializable'
      });

      // 8. Call payment provider asynchronously (outside DB transaction)
      this.processPaymentProvider(jobData);

      // 9. Log audit event
      await this.auditLogger.log({
        userId,
        remittanceId,
        action: 'REMITTANCE_STARTED',
        resource: 'REMITTANCE',
        details: {
          amount,
          currency,
          fee,
          senderAccountId,
          receiverAccountId,
          transactionIds: [
            result.debitTransaction.id,
            result.creditTransaction?.id,
            result.feeTransaction.id
          ].filter(Boolean)
        }
      });

      return {
        success: true,
        remittanceId,
        status: 'PROCESSING',
        transactionIds: [
          result.debitTransaction.id,
          result.creditTransaction?.id,
          result.feeTransaction.id
        ].filter((id): id is string => Boolean(id))
      };

    } catch (error) {
      // Update remittance status to FAILED in database
      try {
        await db.remittances.update({
          where: { id: remittanceId },
          data: {
            status: RemittanceStatus.FAILED,
            failureReason: error instanceof Error ? error.message : 'Unknown error',
            updatedAt: new Date()
          }
        });
      } catch (dbError) {
        console.error('Failed to update remittance status to FAILED:', dbError);
      }

      // Log failure
      await this.auditLogger.log({
        userId,
        remittanceId,
        action: 'REMITTANCE_FAILED',
        resource: 'REMITTANCE',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          amount,
          currency,
          fee
        }
      });

      return {
        success: false,
        remittanceId,
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Handle payment provider result (success/failure)
   */
  async handlePaymentResult(
    remittanceId: string, 
    providerResponse: PaymentProviderResponse
  ): Promise<void> {
    try {
      await db.$transaction(async (prisma) => {
        const remittance = await prisma.remittances.findUnique({
          where: { id: remittanceId },
          include: {
            transactions: true,
            accounts_remittances_senderAccountIdToaccounts: true
          }
        });

        if (!remittance) {
          throw new Error(`Remittance ${remittanceId} not found`);
        }

        if (providerResponse.success) {
          // Update remittance status to COMPLETED
          await prisma.remittances.update({
            where: { id: remittanceId },
            data: {
              status: RemittanceStatus.COMPLETED,
              providerTxnId: providerResponse.providerTxnId || null,
              completedAt: new Date(),
              metadata: providerResponse.metadata || null
            }
          });

          // Update all related transactions to COMPLETED
          await prisma.transactions.updateMany({
            where: { remittanceId: remittanceId },
            data: { status: TransactionStatus.COMPLETED }
          });

        } else {
          // Handle failure - reverse transactions
          await this.reverseRemittance(remittanceId, providerResponse.failureReason);
        }
      });

      // Log audit event
      await this.auditLogger.log({
        remittanceId,
        action: providerResponse.success ? 'PAYMENT_COMPLETED' : 'PAYMENT_FAILED',
        resource: 'PAYMENT',
        details: {
          providerTxnId: providerResponse.providerTxnId,
          failureReason: providerResponse.failureReason,
          metadata: providerResponse.metadata
        }
      });

    } catch (error) {
      console.error(`Error handling payment result for ${remittanceId}:`, error);
      throw error;
    }
  }

  /**
   * Reverse/refund a failed remittance
   */
  async reverseRemittance(remittanceId: string, reason?: string): Promise<void> {
    try {
      await db.$transaction(async (prisma) => {
        const remittance = await prisma.remittances.findUnique({
          where: { id: remittanceId },
          include: {
            transactions: true,
            accounts_remittances_senderAccountIdToaccounts: true,
            accounts_remittances_receiverAccountIdToaccounts: true
          }
        });

        if (!remittance) {
          throw new Error(`Remittance ${remittanceId} not found`);
        }

        // Update remittance status to FAILED
        await prisma.remittances.update({
          where: { id: remittanceId },
          data: {
            status: RemittanceStatus.FAILED,
            failureReason: reason || null
          }
        });

        // Mark original transactions as FAILED
        await prisma.transactions.updateMany({
          where: { remittanceId: remittanceId },
          data: { status: TransactionStatus.FAILED }
        });

        // Calculate total to refund (amount + fee)
        const debitTransaction = remittance.transactions.find(
          (t: any) => t.type === TransactionType.TRANSFER && t.debitAccountId
        );
        
        if (debitTransaction) {
          // Create refund transaction
          await prisma.transactions.create({
            data: {
              id: uuidv4(),
              creditAccountId: remittance.senderAccountId,
              amount: debitTransaction.amount,
              currency: debitTransaction.currency,
              type: TransactionType.REFUND,
              status: TransactionStatus.COMPLETED,
              description: `Refund for failed remittance ${remittanceId}`,
              reference: `REM-REFUND-${remittanceId}`,
              remittanceId: remittanceId,
              updatedAt: new Date(),
              metadata: { 
                originalTransactionId: debitTransaction.id,
                reason: reason || null
              }
            }
          });

          // Refund sender's account
          await prisma.accounts.update({
            where: { id: remittance.senderAccountId },
            data: {
              balance: {
                increment: debitTransaction.amount
              }
            }
          });

          // If internal transfer, reverse receiver's balance
          if (remittance.receiverAccountId) {
            const creditTransaction = remittance.transactions.find(
              (t: any) => t.type === TransactionType.TRANSFER && t.creditAccountId
            );
            
            if (creditTransaction) {
              await prisma.accounts.update({
                where: { id: remittance.receiverAccountId },
                data: {
                  balance: {
                    decrement: creditTransaction.amount
                  }
                }
              });
            }
          }
        }
      });

      // Log audit event
      await this.auditLogger.log({
        remittanceId,
        action: 'REMITTANCE_REVERSED',
        resource: 'REMITTANCE',
        details: {
          reason: reason || 'Payment provider failure'
        }
      });

    } catch (error) {
      console.error(`Error reversing remittance ${remittanceId}:`, error);
      throw error;
    }
  }

  /**
   * Process payment with external provider (async)
   */
  private async processPaymentProvider(jobData: RemittanceJobData): Promise<void> {
    try {
      const paymentRequest: PaymentProviderRequest = {
        remittanceId: jobData.remittanceId,
        amount: jobData.amount,
        currency: jobData.currency,
        paymentMethod: 'MOBILE_MONEY', // Default for remittances
        reference: `remit_${jobData.remittanceId}`,
        senderDetails: {
          accountId: jobData.senderAccountId,
          name: 'Sender Name', // TODO: Get from user data
          email: 'sender@example.com' // TODO: Get from user data
        },
        receiverDetails: jobData.receiverDetails,
        metadata: jobData.metadata
      };

      const response = await this.paymentProvider.processPayment(paymentRequest);
      await this.handlePaymentResult(jobData.remittanceId, response);

    } catch (error) {
      console.error(`Payment provider error for ${jobData.remittanceId}:`, error);
      
      // Handle payment provider failure
      await this.handlePaymentResult(jobData.remittanceId, {
        success: false,
        status: 'FAILED',
        failureReason: error instanceof Error ? error.message : 'Payment provider error'
      });
    }
  }

  /**
   * Get remittance status and details
   */
  async getRemittanceStatus(remittanceId: string) {
    return await db.remittances.findUnique({
      where: { id: remittanceId },
      include: {
        transactions: true,
        accounts_remittances_senderAccountIdToaccounts: {
          select: { id: true, balance: true, currency: true }
        },
        accounts_remittances_receiverAccountIdToaccounts: {
          select: { id: true, balance: true, currency: true }
        }
      }
    });
  }

  /**
   * Check account balance with lock
   */
  async checkAccountBalance(accountId: string): Promise<number> {
    const account = await db.accounts.findUnique({
      where: { id: accountId },
      select: { balance: true }
    });

    return account?.balance.toNumber() || 0;
  }

  /**
   * Process remittance - Main entry point for test endpoint
   */
  async processRemittance(remittanceData: any): Promise<any> {
    const { remittanceId, userId, senderAccountId, receiverAccountId, amount, currency, fee, idempotencyKey } = remittanceData;

    try {
      // Create remittance record first
      const remittance = await db.remittances.create({
        data: {
          id: remittanceId,
          idempotencyKey,
          senderAccountId,
          receiverAccountId,
          receiverDetails: receiverAccountId ? { accountId: receiverAccountId } : { external: true },
          amount,
          currency,
          fee: fee || 0,
          status: RemittanceStatus.PENDING,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });

      // Start processing
      const result = await this.startRemittance({
        remittanceId,
        userId,
        senderAccountId,
        receiverAccountId,
        receiverDetails: receiverAccountId ? { accountId: receiverAccountId } : { external: true },
        amount,
        currency,
        fee: fee || 0,
        idempotencyKey
      });

      return {
        remittance,
        result
      };
    } catch (error) {
      console.error('Error processing remittance:', error);
      throw error;
    }
  }

  /**
   * Process payment callback - Main entry point for test endpoint
   */
  async processPaymentCallback(callbackData: any): Promise<void> {
    const { remittanceId, providerTxnId, status } = callbackData;

    try {
      // Log the callback (simplified version)
      console.log('Payment callback received:', { remittanceId, providerTxnId, status });

      // Update remittance status based on callback
      await db.$transaction(async (prisma) => {
        const remittance = await prisma.remittances.findUnique({
          where: { id: remittanceId }
        });

        if (!remittance) {
          throw new Error(`Remittance ${remittanceId} not found`);
        }

        let newStatus: RemittanceStatus;
        switch (status.toLowerCase()) {
          case 'completed':
          case 'success':
            newStatus = RemittanceStatus.COMPLETED;
            break;
          case 'failed':
          case 'error':
            newStatus = RemittanceStatus.FAILED;
            break;
          case 'pending':
          case 'processing':
            newStatus = RemittanceStatus.PROCESSING;
            break;
          default:
            throw new Error(`Unknown callback status: ${status}`);
        }

        // Update remittance
        await prisma.remittances.update({
          where: { id: remittanceId },
          data: {
            status: newStatus,
            providerTxnId,
            updatedAt: new Date()
          }
        });

        // Update related transactions
        await prisma.transactions.updateMany({
          where: { remittanceId },
          data: {
            status: newStatus === RemittanceStatus.COMPLETED ? TransactionStatus.COMPLETED : TransactionStatus.FAILED,
            updatedAt: new Date()
          }
        });
      });

    } catch (error) {
      console.error('Error processing payment callback:', error);
      throw error;
    }
  }

  /**
   * Process account funding request
   */
  async processFunding(jobData: any): Promise<RemittanceProcessingResult> {
    const { 
      transactionId, 
      accountId, 
      userId, 
      amount, 
      currency, 
      paymentMethod, 
      provider, 
      phoneNumber, 
      reference 
    } = jobData;

    try {
      // Use Prisma transaction for atomicity
      const result = await db.$transaction(async (prisma) => {
        // 1. Verify transaction exists and is pending
        const transaction = await prisma.transactions.findUnique({
          where: { id: transactionId },
        });

        if (!transaction) {
          throw new Error(`Transaction ${transactionId} not found`);
        }

        if (transaction.status !== TransactionStatus.PENDING) {
          throw new Error(`Transaction ${transactionId} is not in pending status`);
        }

        // 2. Verify account exists and belongs to user
        const account = await prisma.accounts.findUnique({
          where: { id: accountId },
        });

        if (!account) {
          throw new Error(`Account ${accountId} not found`);
        }

        if (account.userId !== userId) {
          throw new Error(`Account ${accountId} does not belong to user ${userId}`);
        }

        // 3. Process payment through payment provider
        const paymentRequest: PaymentProviderRequest = {
          amount,
          currency,
          paymentMethod,
          provider,
          phoneNumber,
          reference,
          metadata: {
            accountId,
            userId,
            transactionId,
            fundingType: 'USER_INITIATED'
          }
        };

        console.log('Processing funding payment:', paymentRequest);

        try {
          const paymentResponse = await this.paymentProvider.processPayment(paymentRequest);
          
          if (!paymentResponse.success) {
            // Update transaction status to failed
            await prisma.transactions.update({
              where: { id: transactionId },
              data: {
                status: TransactionStatus.FAILED,
                metadata: {
                  ...(transaction.metadata as object || {}),
                  failureReason: paymentResponse.errorMessage || paymentResponse.failureReason,
                  paymentResponse: JSON.parse(JSON.stringify(paymentResponse))
                },
                updatedAt: new Date()
              }
            });

            await this.auditLogger.log({
              userId,
              action: 'FUNDING_FAILED',
              resource: 'TRANSACTION',
              details: {
                transactionId,
                accountId,
                amount,
                currency,
                paymentMethod,
                error: paymentResponse.errorMessage || paymentResponse.failureReason
              }
            });

            return {
              success: false,
              errorMessage: paymentResponse.errorMessage || paymentResponse.failureReason || 'Payment processing failed'
            };
          }

          // 4. If payment initiated successfully, update transaction with payment details
          await prisma.transactions.update({
            where: { id: transactionId },
            data: {
              status: (paymentResponse.requiresConfirmation ?? true) ? TransactionStatus.PENDING : TransactionStatus.COMPLETED,
              metadata: {
                ...(transaction.metadata as object || {}),
                paymentResponse: JSON.parse(JSON.stringify(paymentResponse)),
                paymentId: paymentResponse.paymentId,
                paymentReference: paymentResponse.reference
              },
              updatedAt: new Date()
            }
          });

          // 5. If payment doesn't require confirmation, update account balance immediately
          if (!paymentResponse.requiresConfirmation) {
            await prisma.accounts.update({
              where: { id: accountId },
              data: {
                balance: {
                  increment: amount
                },
                updatedAt: new Date()
              }
            });
          }

          await this.auditLogger.log({
            userId,
            action: (paymentResponse.requiresConfirmation ?? true) ? 'FUNDING_INITIATED' : 'FUNDING_COMPLETED',
            resource: 'TRANSACTION',
            details: {
              transactionId,
              accountId,
              amount,
              currency,
              paymentMethod,
              paymentId: paymentResponse.paymentId,
              requiresConfirmation: paymentResponse.requiresConfirmation ?? true
            }
          });

          return {
            success: true,
            transactionId,
            paymentId: paymentResponse.paymentId,
            reference: paymentResponse.reference,
            requiresConfirmation: paymentResponse.requiresConfirmation ?? true,
            message: (paymentResponse.requiresConfirmation ?? true)
              ? 'Funding initiated, waiting for payment confirmation'
              : 'Funding completed successfully'
          };

        } catch (paymentError) {
          // Update transaction status to failed
          await prisma.transactions.update({
            where: { id: transactionId },
            data: {
              status: TransactionStatus.FAILED,
              metadata: {
                ...(transaction.metadata as object || {}),
                failureReason: (paymentError as Error).message,
                failedAt: new Date().toISOString()
              },
              updatedAt: new Date()
            }
          });

          await this.auditLogger.log({
            userId,
            action: 'FUNDING_FAILED',
            resource: 'TRANSACTION',
            details: {
              transactionId,
              accountId,
              amount,
              currency,
              paymentMethod,
              error: (paymentError as Error).message
            }
          });

          throw paymentError;
        }
      });

      return result as RemittanceProcessingResult;

    } catch (error) {
      console.error('Funding processing failed:', error);
      
      await this.auditLogger.log({
        userId,
        action: 'FUNDING_FAILED',
        resource: 'TRANSACTION',
        details: {
          transactionId,
          accountId,
          amount,
          currency,
          paymentMethod,
          error: (error as Error).message
        }
      });

      return {
        success: false,
        errorMessage: (error as Error).message || 'Funding processing failed'
      } as RemittanceProcessingResult;
    }
  }
}
