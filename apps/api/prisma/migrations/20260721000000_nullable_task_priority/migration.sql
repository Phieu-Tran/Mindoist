-- AlterTable: Make task priority nullable
ALTER TABLE "tasks" ALTER COLUMN "priority" DROP NOT NULL;
ALTER TABLE "tasks" ALTER COLUMN "priority" DROP DEFAULT;
