INSERT INTO deal_buckets
	(item_id, day, qlt, ptn, unit_price, amount, buyer, trades, units)
SELECT
	item_id,
	(occurred_at AT TIME ZONE 'UTC')::date AS day,
	qlt,
	ptn,
	unit_price,
	amount,
	COALESCE(
		NULLIF(
			CASE
				WHEN jsonb_typeof(additional::jsonb -> 'buyer') = 'string'
				THEN additional::jsonb ->> 'buyer'
			END,
			''
		),
		''
	) AS buyer,
	count(*) AS trades,
	sum(amount) AS units
FROM deals
GROUP BY 1, 2, 3, 4, 5, 6, 7
ON CONFLICT (item_id, day, qlt, ptn, unit_price, amount, buyer)
DO UPDATE SET
	trades = deal_buckets.trades + EXCLUDED.trades,
	units = deal_buckets.units + EXCLUDED.units;
