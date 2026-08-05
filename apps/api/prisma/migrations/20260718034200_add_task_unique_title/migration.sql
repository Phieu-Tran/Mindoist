-- CreateIndex
CREATE UNIQUE INDEX "tasks_user_id_title_key" ON "tasks"("user_id", "title");
