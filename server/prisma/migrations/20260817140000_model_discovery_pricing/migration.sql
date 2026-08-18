ALTER TABLE "SystemSetting"
  ADD COLUMN "modelImportMarkupPercent" INTEGER NOT NULL DEFAULT 130,
  ADD COLUMN "modelPriceCatalogUrl" TEXT NOT NULL DEFAULT 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json',
  ADD COLUMN "modelPriceCatalogRefreshHours" INTEGER NOT NULL DEFAULT 12;
