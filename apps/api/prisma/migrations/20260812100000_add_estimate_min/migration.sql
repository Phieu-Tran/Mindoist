-- Additive compatibility migration. New clients use estimate_min while old
-- clients continue to read/write duration_min until the cutover is complete.
ALTER TABLE "tasks" ADD COLUMN "estimate_min" INTEGER;

UPDATE "tasks"
SET "estimate_min" = "duration_min"
WHERE "estimate_min" IS NULL AND "duration_min" IS NOT NULL;

CREATE INDEX "tasks_estimate_min_idx" ON "tasks"("estimate_min");
