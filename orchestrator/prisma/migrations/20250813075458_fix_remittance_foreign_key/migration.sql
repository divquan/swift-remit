-- RenameForeignKey
ALTER TABLE "remittances" RENAME CONSTRAINT "remittances_senderAccountId_fkey" TO "fk_remittance_senderAccountId";
