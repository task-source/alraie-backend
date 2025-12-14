export const STOCK_RESERVATION_MINUTES = 15;

export function getReservationExpiry() {
  return new Date(Date.now() + STOCK_RESERVATION_MINUTES * 60 * 1000);
}