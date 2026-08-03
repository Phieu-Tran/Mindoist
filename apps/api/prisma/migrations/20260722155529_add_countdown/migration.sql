-- CreateTable
CREATE TABLE "countdowns" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "target_date" TIMESTAMP(3) NOT NULL,
    "color" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "countdowns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "countdowns_user_id_idx" ON "countdowns"("user_id");

-- AddForeignKey
ALTER TABLE "countdowns" ADD CONSTRAINT "countdowns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
