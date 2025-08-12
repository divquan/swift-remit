import { createClient } from 'tigerbeetle-node';
import { config } from '../config';

interface TigerBeetleAccount {
  id: bigint;
  debits_pending: bigint;
  debits_posted: bigint;
  credits_pending: bigint;
  credits_posted: bigint;
  user_data_128: bigint;
  user_data_64?: bigint;
  user_data_32?: number;
  reserved?: number;
  ledger: number;
  code: number;
  flags: number;
}

interface TigerBeetleTransfer {
  id: bigint;
  debit_account_id: bigint;
  credit_account_id: bigint;
  amount: bigint;
  pending_id?: bigint;
  user_data_128?: bigint;
  user_data_64?: bigint;
  user_data_32?: number;
  timeout?: number;
  reserved?: number;
  ledger: number;
  code: number;
  flags: number;
}

export class TigerBeetleService {
  private static client: any;
  private static isConnected = false;

  static async connect(): Promise<void> {
    try {
      if (!this.isConnected) {
        // Connect to TigerBeetle cluster
        // Use the Docker service name for inter-container communication
        const clusterConfig = [{
          host: "0.0.0.0",
          port: config.tigerBeetle.port
        }];

        console.log("TB_Address:", clusterConfig)
        
        try {
          this.client = createClient({
            cluster_id: 0n,
            replica_addresses: clusterConfig.map(c => `${c.host}:${c.port}`)
          });
          
          this.isConnected = true;
          console.log('✅ TigerBeetle client connected successfully');
        } catch (clientError) {
          console.error('❌ TigerBeetle createClient failed:', clientError);
          throw new Error(`Failed to create TigerBeetle client: ${clientError}`);
        }
      }
    } catch (error) {
      console.error('❌ TigerBeetle connection failed:', error);
      throw error;
    }
  }

  static async disconnect(): Promise<void> {
    if (this.client && this.isConnected) {
      this.client.destroy();
      this.isConnected = false;
      console.log('✅ TigerBeetle client disconnected');
    }
  }

  static async createAccount(accountData: {
    id: string;
    userId: string;
    ledger: number;
    code: number;
  }): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      // Convert string ID to bigint (TigerBeetle uses 128-bit IDs)
      const accountId = BigInt('0x' + accountData.id.replace(/-/g, '').substring(0, 16));
      const userIdBigInt = BigInt('0x' + accountData.userId.replace(/-/g, '').substring(0, 16));

      const account: TigerBeetleAccount = {
        id: accountId,
        debits_pending: 0n,
        debits_posted: 0n,
        credits_pending: 0n,
        credits_posted: 0n,
        user_data_128: userIdBigInt,
        user_data_64: 0n,
        user_data_32: 0,
        reserved: 0,
        ledger: accountData.ledger,
        code: accountData.code,
        flags: 0
      };

      const result = await this.client.createAccounts([account]);
      
      if (result.length > 0) {
        throw new Error(`TigerBeetle account creation failed: ${JSON.stringify(result)}`);
      }
      
      console.log(`✅ TigerBeetle account created: ${accountData.id}`);
    } catch (error) {
      console.error('❌ TigerBeetle createAccount failed:', error);
      throw error;
    }
  }

  static async getAccount(accountId: string): Promise<TigerBeetleAccount | null> {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      const id = BigInt('0x' + accountId.replace(/-/g, '').substring(0, 16));
      const accounts = await this.client.lookupAccounts([id]);
      
      return accounts.length > 0 ? accounts[0] : null;
    } catch (error) {
      console.error('❌ TigerBeetle getAccount failed:', error);
      throw error;
    }
  }

  static async createTransfer(transferData: {
    id: string;
    debitAccountId: string;
    creditAccountId: string;
    amount: string;
    ledger: number;
    code: number;
    flags?: number;
  }): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      const transferId = BigInt('0x' + transferData.id.replace(/-/g, '').substring(0, 16));
      const debitAccountId = BigInt('0x' + transferData.debitAccountId.replace(/-/g, '').substring(0, 16));
      const creditAccountId = BigInt('0x' + transferData.creditAccountId.replace(/-/g, '').substring(0, 16));

      const transfer: TigerBeetleTransfer = {
        id: transferId,
        debit_account_id: debitAccountId,
        credit_account_id: creditAccountId,
        amount: BigInt(transferData.amount),
        ledger: transferData.ledger,
        code: transferData.code,
        flags: transferData.flags || 0
      };

      const result = await this.client.createTransfers([transfer]);
      
      if (result.length > 0) {
        throw new Error(`TigerBeetle transfer creation failed: ${JSON.stringify(result)}`);
      }
      
      console.log(`✅ TigerBeetle transfer created: ${transferData.id}`);
    } catch (error) {
      console.error('❌ TigerBeetle createTransfer failed:', error);
      throw error;
    }
  }

  static async healthCheck(): Promise<boolean> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      
      // Simple health check by trying to lookup a non-existent account
      await this.client.lookupAccounts([1n]);
      return true;
    } catch (error) {
      console.error('❌ TigerBeetle health check failed:', error);
      return false;
    }
  }

  static formatBalance(account: TigerBeetleAccount): {
    available: number;
    pending: number;
  } {
    return {
      available: Number(account.credits_posted - account.debits_posted) / 100, // Assuming amounts are in cents
      pending: Number(account.credits_pending - account.debits_pending) / 100
    };
  }
}
