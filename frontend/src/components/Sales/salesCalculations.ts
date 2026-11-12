export function calculateKitchenSales(
  grandTotal: string | number,
  barSales: string | number,
  corkage: string | number,
  serviceCharge: string | number,
): string {
  const [grand, bar, corkageAmount, serviceChargeAmount] = [
    grandTotal,
    barSales,
    corkage,
    serviceCharge,
  ].map((value) => (value === "" ? 0 : Number(value)));
  if (
    !Number.isFinite(grand) ||
    !Number.isFinite(bar) ||
    !Number.isFinite(corkageAmount) ||
    !Number.isFinite(serviceChargeAmount)
  ) {
    return "";
  }
  const kitchenSales = grand - bar - corkageAmount - serviceChargeAmount;
  return kitchenSales === 0 ? "" : kitchenSales.toFixed(2);
}

export function calculateTotalSale(
  kitchenSales: string | number,
  barSales: string | number,
  corkage: string | number,
): string {
  const [kitchen, bar, corkageAmount] = [kitchenSales, barSales, corkage].map(
    (value) => (value === "" ? 0 : Number(value)),
  );
  if (
    !Number.isFinite(kitchen) ||
    !Number.isFinite(bar) ||
    !Number.isFinite(corkageAmount)
  ) {
    return "";
  }
  const totalSale = kitchen + bar + corkageAmount;
  return totalSale === 0 ? "" : totalSale.toFixed(2);
}
