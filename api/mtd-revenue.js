export default async function handler(req, res) {
  const STORE = "0yi1hx-jw.myshopify.com";
  const TOKEN = process.env.SHOPIFY_API_TOKEN;

  try {
    // Define our date window: start of month → now
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endOfMonth   = now.toISOString();

    // GraphQL query for orders
    const QUERY = `
      query OrdersPage($first: Int!, $after: String, $query: String!) {
        orders(first: $first, after: $after, query: $query) {
          pageInfo { hasNextPage, endCursor }
          edges {
            node {
              financialStatus
              currentSubtotalPriceSet { shopMoney { amount } }
              totalShippingPriceSet   { shopMoney { amount } }
              totalTaxSet             { shopMoney { amount } }
              totalDiscountsSet       { shopMoney { amount } }
              totalRefundedPriceSet   { shopMoney { amount } }
              test
              cancelledAt
            }
          }
        }
      }
    `;

    let revenue = 0;
    let hasNext = true;
    let cursor  = null;

    // We accept all “real” states and exclude tests/cancelled
    const VALID = new Set([
      "PAID", "PARTIALLY_PAID", "AUTHORIZED", "PENDING", "PARTIALLY_REFUNDED"
    ]);

    while (hasNext) {
      const variables = {
        first: 50,
        after: cursor,
        query: `created_at:>=${startOfMonth} created_at:<=${endOfMonth}`
      };

      const resp = await fetch(
        `https://${STORE}/admin/api/2025-04/graphql.json`,
        {
          method: "POST",
          headers: {
            "X-Shopify-Access-Token": TOKEN,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ query: QUERY, variables })
        }
      );
      if (!resp.ok) {
        const err = await resp.text();
        console.error("GraphQL error:", resp.status, err);
        return res.status(502).json({ error: err });
      }

      const { data, errors } = await resp.json();
      if (errors) {
        console.error("GraphQL errors:", errors);
        return res.status(502).json({ error: errors });
      }

      for (const edge of data.orders.edges) {
        const o = edge.node;
        // skip test orders or cancelled ones
        if (o.test || o.cancelledAt) continue;
        if (!VALID.has(o.financialStatus)) continue;

        const subtotal  = parseFloat(o.currentSubtotalPriceSet.shopMoney.amount) || 0;
        const shipping  = parseFloat(o.totalShippingPriceSet.shopMoney.amount)   || 0;
        const tax       = parseFloat(o.totalTaxSet.shopMoney.amount)             || 0;
        const discounts = parseFloat(o.totalDiscountsSet.shopMoney.amount)       || 0;
        const refunds   = parseFloat(o.totalRefundedPriceSet.shopMoney.amount)   || 0;

        // exactly how Shopify computes Total Sales:
        revenue += subtotal + shipping + tax - discounts - refunds;
      }

      hasNext = data.orders.pageInfo.hasNextPage;
      cursor  = data.orders.pageInfo.endCursor;
    }

    res.setHeader("Content-Type", "application/json");
    res.status(200).json({ number: Math.round(revenue) });
  } catch (err) {
    console.error("Unhandled error in function:", err);
    res.status(500).json({ error: err.toString() });
  }
}
