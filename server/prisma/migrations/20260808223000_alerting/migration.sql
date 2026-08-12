CREATE TABLE "AlertRule" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "severity" TEXT NOT NULL DEFAULT 'HIGH',
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 30,
    "notifyInApp" BOOLEAN NOT NULL DEFAULT true,
    "notifyWebhook" BOOLEAN NOT NULL DEFAULT false,
    "webhookUrl" TEXT NOT NULL DEFAULT '',
    "encryptedWebhookSecret" TEXT NOT NULL DEFAULT '',
    "webhookSecretHint" TEXT NOT NULL DEFAULT '',
    "mutedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AlertRule_key_key" ON "AlertRule"("key");
CREATE INDEX "AlertRule_enabled_severity_idx" ON "AlertRule"("enabled", "severity");

CREATE TABLE "AlertEvent" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "targetId" TEXT,
    "metadata" JSONB,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AlertEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AlertEvent_ruleId_fingerprint_key" ON "AlertEvent"("ruleId", "fingerprint");
CREATE INDEX "AlertEvent_status_severity_lastSeenAt_idx" ON "AlertEvent"("status", "severity", "lastSeenAt");
CREATE INDEX "AlertEvent_source_targetId_idx" ON "AlertEvent"("source", "targetId");
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AlertRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
