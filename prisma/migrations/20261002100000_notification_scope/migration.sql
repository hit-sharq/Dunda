-- DropForeignKey
ALTER TABLE "dunda_notifications" DROP CONSTRAINT "dunda_notifications_staff_id_dunda_staff_id_fk";

-- AlterTable
ALTER TABLE "dunda_notifications" ADD COLUMN     "read_at" TIMESTAMPTZ(6),
ALTER COLUMN "staff_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "dunda_notifications" ADD CONSTRAINT "dunda_notifications_staff_id_dunda_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "dunda_staff"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

