-- CreateEnum
CREATE TYPE "MpesaTransactionStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'REVERSED');

-- AlterTable
ALTER TABLE "VendorProfile" ADD COLUMN     "mpesaApiEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mpesaApiKeyEnc" TEXT,
ADD COLUMN     "mpesaEnvironment" TEXT NOT NULL DEFAULT 'sandbox',
ADD COLUMN     "mpesaPublicKey" TEXT,
ADD COLUMN     "mpesaServiceProviderCode" TEXT,
ADD COLUMN     "mpesaVerifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "VendorWallet" ADD COLUMN     "commissionOwed" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "MpesaTransaction" (
    "id" TEXT NOT NULL,
    "vendorOrderId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "customerMsisdn" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reversedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "environment" TEXT NOT NULL,
    "thirdPartyConversationId" TEXT NOT NULL,
    "transactionReference" TEXT NOT NULL,
    "status" "MpesaTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "responseCode" TEXT,
    "responseDesc" TEXT,
    "mpesaTransactionId" TEXT,
    "mpesaConversationId" TEXT,
    "initiatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MpesaTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MpesaTransaction_thirdPartyConversationId_key" ON "MpesaTransaction"("thirdPartyConversationId");

-- CreateIndex
CREATE INDEX "MpesaTransaction_vendorOrderId_idx" ON "MpesaTransaction"("vendorOrderId");

-- CreateIndex
CREATE INDEX "MpesaTransaction_status_idx" ON "MpesaTransaction"("status");

-- AddForeignKey
ALTER TABLE "MpesaTransaction" ADD CONSTRAINT "MpesaTransaction_vendorOrderId_fkey" FOREIGN KEY ("vendorOrderId") REFERENCES "VendorOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpesaTransaction" ADD CONSTRAINT "MpesaTransaction_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
