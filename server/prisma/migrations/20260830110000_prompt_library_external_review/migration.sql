-- Existing rows intentionally remain NULL so historical seed data does not
-- count as administrator approval for third-party content synchronization.
ALTER TABLE "PromptLibrarySourceConfig"
ADD COLUMN "reviewAcceptedAt" TIMESTAMP(3);
