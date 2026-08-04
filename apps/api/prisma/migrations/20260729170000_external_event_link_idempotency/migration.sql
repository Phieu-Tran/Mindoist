-- A provider calendar may have at most one outbound event per TimeBlock.
-- PostgreSQL permits multiple NULL values, so task-only/external-only links
-- remain unaffected.
CREATE UNIQUE INDEX "external_event_links_external_calendar_id_time_block_id_key"
ON "external_event_links"("external_calendar_id", "time_block_id");
