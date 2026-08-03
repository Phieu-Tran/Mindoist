/*
  Warnings:

  - Added the required column `updated_at` to the `reminders` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ReminderType" AS ENUM ('email', 'push');

-- AlterTable
ALTER TABLE "reminders" ADD COLUMN     "type" "ReminderType" NOT NULL DEFAULT 'push',
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;
