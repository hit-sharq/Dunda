-- AlterTable
ALTER TABLE "dunda_audit_logs" ADD COLUMN     "new_value" JSONB,
ADD COLUMN     "previous_value" JSONB;

