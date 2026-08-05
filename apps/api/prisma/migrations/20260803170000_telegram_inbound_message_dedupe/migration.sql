CREATE TABLE "telegram_inbound_messages" (
    "id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "telegram_chat_id" TEXT NOT NULL,
    "telegram_message_id" TEXT NOT NULL,
    "telegram_sent_at" TIMESTAMP(3) NOT NULL,
    "accepted" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_inbound_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_inbound_messages_telegram_chat_id_telegram_message_id_key"
    ON "telegram_inbound_messages"("telegram_chat_id", "telegram_message_id");

CREATE INDEX "telegram_inbound_messages_created_at_idx"
    ON "telegram_inbound_messages"("created_at");

ALTER TABLE "telegram_inbound_messages"
    ADD CONSTRAINT "telegram_inbound_messages_connection_id_fkey"
    FOREIGN KEY ("connection_id") REFERENCES "telegram_connections"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
