import DeliveryZone from "../models/deliveryZone.model";

export async function resolveDeliveryZone({
  country,
  state,
  city,
}: {
  country: string;
  state?: string;
  city?: string;
}) {
  const zones = await DeliveryZone.find({
    country: country.toUpperCase(),
    isActive: true,
  })
    .sort({ priority: -1 })
    .lean();

  return zones.find((z) => {
    if (z.city && city && z.city === city) return true;
    if (!z.city && z.state && state && z.state === state) return true;
    if (!z.city && !z.state) return true;
    return false;
  });
}
  