-- Tema visual del espacio: "auto" (halloween en temporada 15 oct–5 nov), "light" o "halloween" forzado
ALTER TABLE "workspace_settings" ADD COLUMN     "theme" TEXT NOT NULL DEFAULT 'auto';
