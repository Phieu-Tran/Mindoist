-- Project hierarchy
ALTER TABLE "projects" ADD COLUMN "parent_id" TEXT;
CREATE INDEX "projects_parent_id_idx" ON "projects"("parent_id");
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_parent_id_fkey"
  FOREIGN KEY ("parent_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Kanban columns
CREATE TABLE "project_columns" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "is_done" BOOLEAN NOT NULL DEFAULT false,
  "sort_order" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "project_columns_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "project_columns_project_id_idx" ON "project_columns"("project_id");
ALTER TABLE "project_columns"
  ADD CONSTRAINT "project_columns_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Task placement on a Kanban board
ALTER TABLE "tasks" ADD COLUMN "project_column_id" TEXT;
CREATE INDEX "tasks_project_column_id_idx" ON "tasks"("project_column_id");
ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_project_column_id_fkey"
  FOREIGN KEY ("project_column_id") REFERENCES "project_columns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
