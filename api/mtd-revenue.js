export default async function handler(req, res) {
  const store = "0yi1hx-jw.myshopify.com";
  const token = process.env.SHOPIFY_API_TOKEN;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const isoStart = startOfMonth.toISOString();
  const isoEnd = now.toISOString();

  let revenue = 0;
  let pageInfo = "";
  let hasNext = true;

  while (hasNext) {
    const url = `https://${store}/admin/api/2025-04/orders.json?status=any&created_at_min=${isoStart}&created_at_max=${isoEnd}&limit=250${pageInfo}`;

    const response = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json"
      }
    });

    const data = await response.json();
    if (!data.orders || data.orders.length === 0) break;

    for (const order of data.orders) {
      const validStatuses = ["paid", "partially_paid", "authorized"];
      if (validStatuses.includes(order.financial_status)) {
        revenue += parseFloat(order.current_total_price);
      }
    }

    const linkHeader = response.headers.get("link");
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const match = linkHeader.match(/page_info=([^&>]+)/);
      pageInfo = match ? `&page_info=${match[1]}` : "";
    } else {
      hasNext = false;
    }
  }

  res.setHeader("Content-Type", "application/json");
  res.status(200).json({ number: Math.round(revenue) });
}
