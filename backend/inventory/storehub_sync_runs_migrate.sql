-- Track successful syncs, including dates with zero transactions.
CREATE TABLE IF NOT EXISTS `storehub_sync_runs` (
  `sync_date` date NOT NULL,
  `synced_at` datetime NOT NULL,
  `bar_items` int unsigned NOT NULL DEFAULT 0,
  `menu_items` int unsigned NOT NULL DEFAULT 0,
  `ingredients_deducted` int unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`sync_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Backfill dates already represented by synced StoreHub inventory or menu rows.
INSERT IGNORE INTO `storehub_sync_runs`
  (`sync_date`, `synced_at`, `bar_items`, `menu_items`, `ingredients_deducted`)
SELECT `inventory_date`, MAX(`updated_at`), COUNT(*), 0, 0
FROM `inventory`
WHERE `type` = 'storehub'
GROUP BY `inventory_date`;

INSERT IGNORE INTO `storehub_sync_runs`
  (`sync_date`, `synced_at`, `bar_items`, `menu_items`, `ingredients_deducted`)
SELECT `menu_date`, MAX(`updated_at`), 0, COUNT(*), 0
FROM `menu`
WHERE `product_id` IS NOT NULL AND `product_id` <> ''
GROUP BY `menu_date`;
