ALTER TABLE "CanvasDocument" ADD CONSTRAINT "CanvasDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
