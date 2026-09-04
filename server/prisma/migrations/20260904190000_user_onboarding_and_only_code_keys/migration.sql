ALTER TABLE "UserSettings"
ADD COLUMN "onboardingRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "onboardingExperience" TEXT NOT NULL DEFAULT '',
ADD COLUMN "onboardingCapabilities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);

DROP INDEX "UserApiCredential_userId_provisionKey_key";
