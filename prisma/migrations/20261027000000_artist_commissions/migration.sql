-- CreateTable
CREATE TABLE "ArtistProfile" (
    "user_id" INTEGER NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "accepting" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "terms" TEXT NOT NULL DEFAULT '',
    "revisions" INTEGER NOT NULL DEFAULT 2,
    "portfolio_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArtistProfile_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "CommissionPrice" (
    "id" TEXT NOT NULL,
    "artist_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "amount" INTEGER NOT NULL,
    "days_min" INTEGER NOT NULL,
    "days_max" INTEGER NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CommissionPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionOrder" (
    "id" TEXT NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "artist_id" INTEGER NOT NULL,
    "request_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "brief" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "terms" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "revisions" INTEGER NOT NULL,
    "revisions_used" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "due_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "result_message_id" INTEGER,
    "cancellation_by" INTEGER,
    "customer_read" INTEGER NOT NULL DEFAULT 0,
    "artist_read" INTEGER NOT NULL DEFAULT 0,
    "customer_notification_id" INTEGER,
    "artist_notification_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionPayment" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "upfront" BOOLEAN NOT NULL DEFAULT false,
    "instructions" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'EXPECTED',
    "note" TEXT NOT NULL DEFAULT '',
    "sent_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3),

    CONSTRAINT "CommissionPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionMessage" (
    "id" SERIAL NOT NULL,
    "order_id" TEXT NOT NULL,
    "author_id" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CHAT',
    "content" TEXT NOT NULL,
    "data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionFile" (
    "id" TEXT NOT NULL,
    "owner_id" INTEGER NOT NULL,
    "order_id" TEXT,
    "message_id" INTEGER,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionReview" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "artist_id" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionCase" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "review_id" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'ORDER',
    "opened_by" INTEGER NOT NULL,
    "assigned_to" INTEGER,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "previous_status" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionDecision" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "arbiter_id" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "obligations" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionRefund" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "decision_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'EXPECTED',
    "note" TEXT NOT NULL DEFAULT '',
    "sent_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3),

    CONSTRAINT "CommissionRefund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommissionPrice_artist_id_archived_position_idx" ON "CommissionPrice"("artist_id", "archived", "position");

-- CreateIndex
CREATE INDEX "CommissionOrder_customer_id_updated_at_idx" ON "CommissionOrder"("customer_id", "updated_at");

-- CreateIndex
CREATE INDEX "CommissionOrder_artist_id_updated_at_idx" ON "CommissionOrder"("artist_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionOrder_customer_id_request_key_key" ON "CommissionOrder"("customer_id", "request_key");

-- CreateIndex
CREATE INDEX "CommissionPayment_order_id_idx" ON "CommissionPayment"("order_id");

-- CreateIndex
CREATE INDEX "CommissionMessage_order_id_id_idx" ON "CommissionMessage"("order_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionMessage_order_id_author_id_key_key" ON "CommissionMessage"("order_id", "author_id", "key");

-- CreateIndex
CREATE INDEX "CommissionFile_owner_id_created_at_idx" ON "CommissionFile"("owner_id", "created_at");

-- CreateIndex
CREATE INDEX "CommissionFile_order_id_idx" ON "CommissionFile"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionReview_order_id_key" ON "CommissionReview"("order_id");

-- CreateIndex
CREATE INDEX "CommissionReview_customer_id_hidden_created_at_idx" ON "CommissionReview"("customer_id", "hidden", "created_at");

-- CreateIndex
CREATE INDEX "CommissionCase_status_assigned_to_created_at_idx" ON "CommissionCase"("status", "assigned_to", "created_at");

-- CreateIndex
CREATE INDEX "CommissionCase_order_id_kind_status_idx" ON "CommissionCase"("order_id", "kind", "status");

-- CreateIndex
CREATE INDEX "CommissionRefund_order_id_idx" ON "CommissionRefund"("order_id");

-- AddForeignKey
ALTER TABLE "ArtistProfile" ADD CONSTRAINT "ArtistProfile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPrice" ADD CONSTRAINT "CommissionPrice_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "ArtistProfile"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionOrder" ADD CONSTRAINT "CommissionOrder_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionOrder" ADD CONSTRAINT "CommissionOrder_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPayment" ADD CONSTRAINT "CommissionPayment_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "CommissionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionMessage" ADD CONSTRAINT "CommissionMessage_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "CommissionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionMessage" ADD CONSTRAINT "CommissionMessage_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionFile" ADD CONSTRAINT "CommissionFile_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionFile" ADD CONSTRAINT "CommissionFile_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "CommissionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionFile" ADD CONSTRAINT "CommissionFile_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "CommissionMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionReview" ADD CONSTRAINT "CommissionReview_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "CommissionOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionCase" ADD CONSTRAINT "CommissionCase_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "CommissionOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionCase" ADD CONSTRAINT "CommissionCase_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "CommissionReview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionDecision" ADD CONSTRAINT "CommissionDecision_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "CommissionCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRefund" ADD CONSTRAINT "CommissionRefund_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "CommissionOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRefund" ADD CONSTRAINT "CommissionRefund_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "CommissionDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "permission" ("name", "description") VALUES ('commission:arbitrate', 'Разбор споров по заказам и жалоб на отзывы') ON CONFLICT ("name") DO NOTHING;
CREATE UNIQUE INDEX "CommissionCase_one_open_order" ON "CommissionCase" ("order_id") WHERE "kind" = 'ORDER' AND "status" = 'OPEN';
CREATE UNIQUE INDEX "CommissionCase_one_open_review" ON "CommissionCase" ("review_id") WHERE "kind" = 'REVIEW' AND "status" = 'OPEN';
ALTER TABLE "CommissionOrder" ADD CONSTRAINT "commission_different_participants" CHECK ("customer_id" <> "artist_id");
ALTER TABLE "CommissionOrder" ADD CONSTRAINT "commission_positive_total" CHECK ("total" > 0);
ALTER TABLE "CommissionPrice" ADD CONSTRAINT "commission_price_valid" CHECK ("amount" > 0 AND "days_min" > 0 AND "days_max" >= "days_min");
ALTER TABLE "CommissionPayment" ADD CONSTRAINT "commission_payment_positive" CHECK ("amount" > 0);
ALTER TABLE "CommissionRefund" ADD CONSTRAINT "commission_refund_positive" CHECK ("amount" > 0);
ALTER TABLE "CommissionReview" ADD CONSTRAINT "commission_score_range" CHECK ("score" BETWEEN 1 AND 5);

