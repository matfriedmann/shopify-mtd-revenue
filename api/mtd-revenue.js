export default async function handler(req, res) {
  const store = "0yi1hx-jw.myshopify.com";
  const token = process.env.SHOPIFY_API_TOKEN;

  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0);
  const isoStart = start.toISOString();

  let revenue = 0;
  let pageInfo = "";
  let hasNext = true;

  while (hasNext) {
    const url = `https://${store}/admin/api/2023-10/orders.json?status=any&created_at_min=${isoStart}&limit=250${pageInfo}`;
    const response = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json"
      }
    });

    const data = await response.json();
    for (const o of data.orders || []) revenue += parseFloat(o.total_price);

    const link = response.headers.get("link");
    if (link && link.includes('rel="next"')) {
      const match = link.match(/page_info=([^&>]+)/);
      pageInfo = match ? `&page_info=${match[1]}` : "";
    } else {
      hasNext = false;
    }
  }

  res.setHeader("Content-Type", "application/json");
  res.status(200).json({ number: Math.round(revenue) });
}
