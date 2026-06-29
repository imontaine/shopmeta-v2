---
name: ecommerce-analytics
description: Best practices for querying Magento and ecommerce data. Covers order analysis, revenue trends, product performance, and customer segmentation.
always-apply: false
---

# Ecommerce Analytics Best Practices

Comprehensive guidance for analyzing Magento ecommerce data using ClickHouse or compatible SQL analytics engines.

## Order Analysis

When analyzing orders:
- Always filter by `status` to exclude cancelled/pending orders unless explicitly asked
- Use `created_at` for time-based analysis, not `updated_at`
- Revenue should be calculated from `grand_total` minus `discount_amount`
- Count distinct `entity_id` for order counts, not row counts

## Revenue Trends

For revenue trend queries:
- Default to daily granularity unless weekly/monthly is requested
- Always include comparison periods (e.g., vs previous month)
- Format currency values with 2 decimal places
- Use running totals for cumulative views

## Product Performance

When analyzing products:
- Join through `sales_order_item` for product-level metrics
- Use `qty_ordered` not `qty_invoiced` for demand analysis
- Group by `sku` for variant-level, `product_id` for product-level
- Include return rates when available

## Customer Segmentation

For customer queries:
- Calculate RFM (Recency, Frequency, Monetary) scores
- New vs returning: use first order date
- Segment by AOV (Average Order Value) ranges
- Track cohort retention by first-purchase month
