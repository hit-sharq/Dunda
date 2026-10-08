-- AlterTable
ALTER TABLE "dunda_payment_attempts" ADD COLUMN     "tab_id" TEXT;

-- AddForeignKey
ALTER TABLE "dunda_payment_attempts" ADD CONSTRAINT "dunda_payment_attempts_tab_id_dunda_tabs_id_fk" FOREIGN KEY ("tab_id") REFERENCES "dunda_tabs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
