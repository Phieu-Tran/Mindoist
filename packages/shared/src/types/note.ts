export interface Note {
  id: string;
  userId: string;
  taskId: string | null;
  title: string | null;
  content: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CreateNoteRequest {
  title?: string;
  content?: string;
  taskId?: string;
}

export interface UpdateNoteRequest {
  title?: string | null;
  content?: string | null;
  taskId?: string | null;
}
