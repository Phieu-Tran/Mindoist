-- CreateEnum
CREATE TYPE "RecurringResetMode" AS ENUM ('RESET', 'KEEP');

-- CreateEnum
CREATE TYPE "RecurrenceBasis" AS ENUM ('DUE_DATE', 'COMPLETION_DATE');

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "recurring_reset_mode" "RecurringResetMode" NOT NULL DEFAULT 'RESET',
ADD COLUMN "recurrence_basis" "RecurrenceBasis" NOT NULL DEFAULT 'DUE_DATE';

-- AlterTable
ALTER TABLE "tasks" ALTER COLUMN "recurring_reset_mode" DROP NOT NULL,
ALTER COLUMN "recurrence_basis" DROP NOT NULL;
