-- AlterTable: Add sync fields to task_tags
ALTER TABLE "task_tags" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- DropIndex (from earlier migration cleanup)
DROP INDEX IF EXISTS "tasks_user_id_title_key";
