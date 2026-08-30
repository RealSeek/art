ALTER TABLE "GenerationJob"
ADD COLUMN "leaseVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "GenerationJob"
ADD CONSTRAINT "GenerationJob_leaseVersion_nonnegative" CHECK ("leaseVersion" >= 0);
