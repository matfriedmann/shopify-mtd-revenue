export default async function handler(req, res) {
  const STORE = "0yi1hx-jw.myshopify.com";
  const TOKEN = process.env.SHOPIFY_API_TOKEN;

  try {
    // Define date range: start of month → now
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endOfMonth = now.toISOString();

    let revenue = 0;
    let hasNext = true;
    let cursor = null;

    // Acceptable financial statuses
    const VALID_STATUSES = new Set([
      "PAID", "PARTIALLY_PAID", "AUTHORIZED", "PENDING", "PARTIALLY_REFUNDED"
    ]);

    // GraphQL query to fetch orders
    const QUERY = `
      query OrdersPage($first: Int!, $after: String, $query: String!) {
        orders(first: $first, after: $after, query: $query) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              displayFinancialStatus
              currentSubtotalPriceSet { shopMoney { amount } }
              totalShippingPriceSet   { shopMoney { amount } }
              totalTaxSet             { shopMoney { amount } }
              totalDiscountsSet       { shopMoney { amount } }
              transactions(first: 50) {
                edges { node { kind amountSet { shopMoney { amount } } } }
              }
              test
              cancelledAt
            }
          }
        }
      }
    `;

    // Loop through pages
    while (hasNext) {
      const response = await fetch(
        `https://${STORE}/admin/api/2025-04/graphql.json`, {
          method: "POST",
          headers: {
            "X-Shopify-Access-Token": TOKEN,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: QUERY,
            variables: {
              first: 50,
              after: cursor,
              query: `created_at:>=${startOfMonth} created_at:<=${endOfMonth}`
            }
          })
        }
      );

      if (!response.ok) {
        const text = await response.text();
        console.error("GraphQL error:", response.status, text);
        return res.status(502).json({ error: `GraphQL API returned ${response.status}`, body: text });
      }

      const { data, errors } = await response.json();
      if (errors) {
        console.error("GraphQL errors:", errors);
        return res.status(502).json({ error: errors });
      }

      // Process orders
      for (const edge of data.orders.edges) {
        const o = edge.node;
        // Skip test or cancelled
        if (o.test || o.cancelledAt) continue;
        if (!VALID_STATUSES.has(o.displayFinancialStatus)) continue;

        const subtotal = parseFloat(o.currentSubtotalPriceSet.shopMoney.amount) || 0;
        const shipping = parseFloat(o.totalShippingPriceSet.shopMoney.amount)   || 0;
        const tax      = parseFloat(o.totalTaxSet.shopMoney.amount)           || 0;
        const discounts= parseFloat(o.totalDiscountsSet.shopMoney.amount)     || 0;
        const refunds = o.transactions.edges
          .filter(t => t.node.kind === "REFUND")
          .reduce((sum, t) => sum + (parseFloat(t.node.amountSet.shopMoney.amount) || 0), 0);

        revenue += subtotal + shipping + tax - discounts - refunds;
      }

      // Pagination
      hasNext = data.orders.pageInfo.hasNextPage;
      cursor = data.orders.pageInfo.endCursor;
    }

    // Return the result
    res.setHeader("Content-Type", "application/json");
    res.status(200).json({ number: Math.round(revenue) });
  } catch (err) {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: err.toString() });
  }
}

