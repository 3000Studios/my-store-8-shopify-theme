# Product Activation Gate

No product is allowed to be published unless the buyer price covers every known cost and leaves real profit.

## Required Inputs

- `productCost`: supplier product cost.
- `supplierShipping`: supplier shipping cost. Use `0` only when supplier explicitly includes/free-covers shipping.
- `price`: buyer-facing retail price.
- `supplierVerified`: true only after the product is linked to a real supplier source.
- `inventoryAvailable`: true only when the supplier product can be fulfilled.
- `shippingTimeDays`: supplier average shipping time.
- `hasRealImages`: true only when product media is real supplier/product media.
- `notHighRisk`: false for branded/IP, medical/health claims, risky electronics, fake/unclear products, or policy-risk items.

## Cost Formula

All buffers are costs and must be added into the activation calculation.

```text
payment_processing_fee = (price * 0.03) + 0.30
platform_buffer = price * 0.03
refund_return_buffer = price * 0.08
discount_buffer = price * 0.05
ad_testing_buffer = price * 0.10
required_profit = max(productCost * 0.35, 5.00)

total_cost =
  productCost
  + supplierShipping
  + payment_processing_fee
  + platform_buffer
  + refund_return_buffer
  + discount_buffer
  + ad_testing_buffer

minimum_price = total_cost + required_profit
net_profit = price - total_cost
net_margin = net_profit / price
```

## Publish Rules

Publish only if all checks pass:

- `price >= minimum_price`
- `net_profit >= 5.00`
- `net_margin >= 25%`
- `supplierVerified = true`
- `inventoryAvailable = true`
- `shippingTimeDays <= 12`
- `hasRealImages = true`
- `notHighRisk = true`

If any rule fails, keep the product in draft and record the rejection reason.
