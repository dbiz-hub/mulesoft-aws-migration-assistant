%dw 2.0
output application/json
---
{
	status: "SUCCESS",
	timestamp: now(),
	data: {
		customerId: payload.id,
		fullName: payload.firstName ++ " " ++ payload.lastName,
		contact: {
			email: payload.emailAddress,
			phone: payload.phoneNumber
		},
		location: {
			city: payload.address.city,
			country: payload.address.country
		},
		tier: payload.membershipTier default "STANDARD",
		active: payload.isActive
	}
}
