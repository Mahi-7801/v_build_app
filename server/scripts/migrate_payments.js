/** Idempotent migration: payment records captured from Razorpay. */
const db = require('../src/db');

async function main() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id          BIGINT UNSIGNED NOT NULL,
      gateway          VARCHAR(24)   NOT NULL DEFAULT 'razorpay',
      product_id       VARCHAR(190)  NULL,
      order_id         VARCHAR(190)  NULL,
      payment_id       VARCHAR(190)  NULL,
      payment_link_id  VARCHAR(190)  NULL,
      method           VARCHAR(64)   NULL,
      status           VARCHAR(32)   NOT NULL DEFAULT 'created',
      amount           DECIMAL(10,2) NOT NULL DEFAULT 0,
      currency         VARCHAR(10)   NOT NULL DEFAULT 'INR',
      discount_percent INT           NOT NULL DEFAULT 0,
      points_at_purchase INT         NOT NULL DEFAULT 0,
      callback_token   VARCHAR(80)   NULL,
      created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_payments_user (user_id, created_at),
      KEY idx_payments_status (status),
      KEY idx_payments_token (callback_token),
      KEY idx_payments_payment (payment_id),
      CONSTRAINT fk_payments_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Convert installations that were created with the old USD default.
  await db.query("UPDATE app_config SET value = 'INR' WHERE config_key = 'payment_currency' AND UPPER(value) = 'USD'").catch(() => {});

  // Support details edited by the admin can be longer than 255 characters.
  try {
    await db.query('ALTER TABLE app_config MODIFY COLUMN value TEXT NOT NULL');
  } catch {
    /* already TEXT or table not present yet */
  }

  console.log('[payments] payments table ready');
  process.exit(0);
}

main().catch((e) => {
  console.error('[payments] migration failed:', e.message);
  process.exit(1);
});
