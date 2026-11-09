-- Run once on an existing inventory database before using the inventory API.
ALTER TABLE `inventory`
  ADD COLUMN `sku` varchar(100) DEFAULT NULL AFTER `remarks`,
  ADD COLUMN `min_stock` decimal(12,2) NOT NULL DEFAULT 5.00 AFTER `sku`,
  ADD COLUMN `max_stock` decimal(12,2) NOT NULL DEFAULT 50.00 AFTER `min_stock`,
  ADD COLUMN `cost_per_unit` decimal(12,2) NOT NULL DEFAULT 0.00 AFTER `max_stock`,
  ADD COLUMN `supplier` varchar(255) NOT NULL DEFAULT '' AFTER `cost_per_unit`,
  ADD COLUMN `last_restocked` date DEFAULT NULL AFTER `supplier`,
  ADD UNIQUE KEY `sku` (`sku`);
