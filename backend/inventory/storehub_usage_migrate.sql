-- Run once on the inventory database before syncing recipe ingredient usage.
-- One row per sync date and inventory item makes re-syncs idempotent.
CREATE TABLE IF NOT EXISTS `storehub_inventory_sync_usage` (
  `sync_date` date NOT NULL,
  `inventory_id` int(11) NOT NULL,
  `quantity_used` decimal(14,4) NOT NULL DEFAULT 0.0000,
  PRIMARY KEY (`sync_date`, `inventory_id`),
  KEY `idx_storehub_sync_inventory` (`inventory_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
