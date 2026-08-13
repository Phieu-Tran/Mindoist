-- CreateTable
CREATE TABLE "telegram_connections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "telegram_user_id" TEXT NOT NULL,
    "telegram_chat_id" TEXT NOT NULL,
    "telegram_username" TEXT,
    "telegram_display_name" TEXT,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_link_challenges" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_link_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "telegram_connections_user_id_key" ON "telegram_connections"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_connections_telegram_user_id_key" ON "telegram_connections"("telegram_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_connections_telegram_chat_id_key" ON "telegram_connections"("telegram_chat_id");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_link_challenges_code_hash_key" ON "telegram_link_challenges"("code_hash");

-- CreateIndex
CREATE INDEX "telegram_link_challenges_user_id_expires_at_idx" ON "telegram_link_challenges"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "telegram_link_challenges_expires_at_idx" ON "telegram_link_challenges"("expires_at");

-- AddForeignKey
ALTER TABLE "telegram_connections" ADD CONSTRAINT "telegram_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_link_challenges" ADD CONSTRAINT "telegram_link_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
