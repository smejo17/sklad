-- Sériové číslo na položke zásielky (prenesie sa na skladovú položku pri prijatí).
ALTER TABLE shipment_items ADD COLUMN IF NOT EXISTS serial TEXT;
