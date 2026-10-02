-- AlterTable
ALTER TABLE "dunda_staff_shifts" ADD COLUMN     "closing_cash" INTEGER,
ADD COLUMN     "expected_cash" INTEGER,
ADD COLUMN     "opening_cash" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "variance" INTEGER;

