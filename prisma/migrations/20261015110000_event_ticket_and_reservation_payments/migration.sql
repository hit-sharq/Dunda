ALTER TABLE "dunda_events"
  ADD COLUMN "ticket_price" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "dunda_reservations"
  ADD COLUMN "deposit_amount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "deposit_paid" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "dunda_payments"
  ADD COLUMN "event_ticket_id" TEXT,
  ADD COLUMN "reservation_id" TEXT,
  ADD CONSTRAINT "dunda_payments_event_ticket_id_dunda_event_tickets_id_fk"
    FOREIGN KEY ("event_ticket_id") REFERENCES "dunda_event_tickets"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  ADD CONSTRAINT "dunda_payments_reservation_id_dunda_reservations_id_fk"
    FOREIGN KEY ("reservation_id") REFERENCES "dunda_reservations"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "dunda_payment_attempts"
  ADD COLUMN "event_ticket_id" TEXT,
  ADD COLUMN "reservation_id" TEXT,
  ADD CONSTRAINT "dunda_pay_attempts_event_ticket_fk"
    FOREIGN KEY ("event_ticket_id") REFERENCES "dunda_event_tickets"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  ADD CONSTRAINT "dunda_pay_attempts_reservation_fk"
    FOREIGN KEY ("reservation_id") REFERENCES "dunda_reservations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;