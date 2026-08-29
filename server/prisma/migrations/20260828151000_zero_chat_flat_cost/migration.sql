-- Text chat is billed by token units, not by the media creation-point price.
UPDATE "ModelPreset" SET "flatCreditCost" = 0 WHERE "capability" = 'CHAT';
UPDATE "ModelPriceVersion" AS v SET "flatCreditCost" = 0
FROM "ModelPreset" AS p
WHERE v."modelPresetId" = p."id" AND p."capability" = 'CHAT';
