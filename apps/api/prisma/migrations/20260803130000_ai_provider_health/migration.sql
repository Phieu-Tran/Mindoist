ALTER TABLE "ai_provider_configs"
ADD COLUMN "last_test_status" TEXT,
ADD COLUMN "last_tested_at" TIMESTAMP(3),
ADD COLUMN "last_test_latency_ms" INTEGER,
ADD COLUMN "last_test_http_status" INTEGER,
ADD COLUMN "last_test_error" TEXT;
