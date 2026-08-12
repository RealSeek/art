DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PluginUsage_jobId_fkey'
  ) THEN
    ALTER TABLE "PluginUsage"
      ADD CONSTRAINT "PluginUsage_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES "GenerationJob"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
