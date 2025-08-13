-- DropForeignKey
ALTER TABLE "remittances" DROP CONSTRAINT "fk_remittance_user_senderAccountId";

-- RenameForeignKey
ALTER TABLE "remittances" RENAME CONSTRAINT "fk_remittance_senderAccountId" TO "remittances_senderAccountId_fkey";
