export function evaluateActivationGate(input) {
  const price = Number(input.price);
  const productCost = Number(input.productCost);
  const supplierShipping = Number(input.supplierShipping ?? 0);
  const shippingTimeDays = Number(input.shippingTimeDays);

  const paymentProcessingFee = price * 0.03 + 0.3;
  const platformBuffer = price * 0.03;
  const refundReturnBuffer = price * 0.08;
  const discountBuffer = price * 0.05;
  const adTestingBuffer = price * 0.1;
  const requiredProfit = Math.max(productCost * 0.35, 5);

  const totalCost =
    productCost +
    supplierShipping +
    paymentProcessingFee +
    platformBuffer +
    refundReturnBuffer +
    discountBuffer +
    adTestingBuffer;

  const minimumPrice = totalCost + requiredProfit;
  const netProfit = price - totalCost;
  const netMargin = price > 0 ? netProfit / price : 0;

  const failures = [];
  if (!Number.isFinite(price) || price <= 0) failures.push('invalid_price');
  if (!Number.isFinite(productCost) || productCost < 0) failures.push('invalid_product_cost');
  if (!Number.isFinite(supplierShipping) || supplierShipping < 0) failures.push('invalid_supplier_shipping');
  if (price < minimumPrice) failures.push('price_below_minimum');
  if (netProfit < 5) failures.push('net_profit_below_5');
  if (netMargin < 0.25) failures.push('net_margin_below_25_percent');
  if (input.supplierVerified !== true) failures.push('supplier_not_verified');
  if (input.inventoryAvailable !== true) failures.push('inventory_not_available');
  if (!Number.isFinite(shippingTimeDays) || shippingTimeDays > 12) failures.push('shipping_time_over_12_days');
  if (input.hasRealImages !== true) failures.push('missing_real_images');
  if (input.notHighRisk !== true) failures.push('high_risk_product');

  return {
    passed: failures.length === 0,
    failures,
    price,
    productCost,
    supplierShipping,
    paymentProcessingFee,
    platformBuffer,
    refundReturnBuffer,
    discountBuffer,
    adTestingBuffer,
    requiredProfit,
    totalCost,
    minimumPrice,
    netProfit,
    netMargin,
  };
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/activation-gate.mjs')) {
  const input = JSON.parse(process.argv[2] || '{}');
  console.log(JSON.stringify(evaluateActivationGate(input), null, 2));
}
