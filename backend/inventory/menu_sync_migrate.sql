-- Run once on the existing inventory database before using StoreHub menu sync.
-- Existing menu rows remain unlinked (NULL product_id); synced rows are keyed
-- by StoreHub product ID so repeat syncs update instead of duplicating them.
ALTER TABLE `menu`
  ADD COLUMN `product_id` varchar(64) DEFAULT NULL AFTER `menu_id`,
  ADD UNIQUE KEY `uq_menu_product` (`product_id`);
