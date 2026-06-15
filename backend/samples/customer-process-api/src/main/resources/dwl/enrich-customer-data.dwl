%dw 2.0
output application/json
---
payload ++ {
	membershipTier: if (payload.annualSpend > 5000) "GOLD" else if (payload.annualSpend > 1000) "SILVER" else "STANDARD",
	isActive: payload.status == "ACTIVE",
	processedAt: now(),
	sourceSystem: "AWS_RDS_MIGRATED"
}
