-- CreateTable
CREATE TABLE "LeadRaw" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "indiamartLeadId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "rawPayload" TEXT NOT NULL,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "rawId" INTEGER,
    "indiamartLeadId" TEXT NOT NULL,
    "buyerName" TEXT,
    "companyName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "product" TEXT,
    "quantity" TEXT,
    "message" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'new',
    "isDuplicateOfId" INTEGER,
    "claimedBy" TEXT,
    "claimedAt" DATETIME,
    "aiSummary" TEXT,
    "suggestedReply" TEXT,
    "delayed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Lead_rawId_fkey" FOREIGN KEY ("rawId") REFERENCES "LeadRaw" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lead_isDuplicateOfId_fkey" FOREIGN KEY ("isDuplicateOfId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LeadNote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "leadId" INTEGER NOT NULL,
    "author" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeadNote_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "leadId" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL DEFAULT 1,
    "error" TEXT,
    "providerMessageId" TEXT,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PriorityRule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ruleName" TEXT,
    "field" TEXT,
    "operator" TEXT,
    "value" TEXT,
    "weight" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "LeadRaw_indiamartLeadId_key" ON "LeadRaw"("indiamartLeadId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_rawId_key" ON "Lead"("rawId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_indiamartLeadId_key" ON "Lead"("indiamartLeadId");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_priority_idx" ON "Lead"("priority");

-- CreateIndex
CREATE INDEX "Lead_phone_idx" ON "Lead"("phone");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");
