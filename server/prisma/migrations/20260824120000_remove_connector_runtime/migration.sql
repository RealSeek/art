-- Connector credentials are no longer part of the product. Drop the old
-- per-user credential table first, then remove connector tool definitions;
-- dependent bindings and audit rows use cascading foreign keys.
DROP TABLE IF EXISTS "ConnectorCredential";
DELETE FROM "ToolDefinition" WHERE "kind" = 'CONNECTOR';
