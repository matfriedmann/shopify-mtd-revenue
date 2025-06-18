export default async function handler(req, res) {
  const STORE = "0yi1hx-jw.myshopify.com";
  const TOKEN = process.env.SHOPIFY_API_TOKEN;
  
  // boundaries: first of this month → now
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const endOfMonth   = now.toISOString();

  let revenue = 0;
  let pageInfo = "";
  let hasNext  = true;

  while(hasNext) {
    // fetch up to 250 orders at a time
    const url = `https://${STORE}/admin/api/2025-04/orders.json` +
                `?status=any` +
                `&created_at_min=${startOfMonth}` +
                `&created_at_max=${endOfMonth}` +
                `&limit=250` +
                pageInfo;

    const r = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": TOKEN,
        "Content-Type": "application/json"
      }
    });
    const { orders } = await r.json();
    if (!orders.length) break;

    for (const o of orders) {
      // only count real revenue
      if (!["paid","partially_paid","authorized"].includes(o.financial_status)) 
        continue;

      const subtotal  = parseFloat(o.subtotal_price);                     // line items before discounts
      const tax       = parseFloat(o.total_tax);                          // total tax
      const shipping  = (o.shipping_lines || [])
                         .reduce((sum,s) => sum + parseFloat(s.price), 0);
      const discounts = parseFloat(o.total_discounts || 0);

      // Shopify’s “Total sales” = subtotal + tax + shipping − discounts
      revenue += subtotal + tax + shipping - discounts;
    }

    // pagination
    const link = r.headers.get("link") || "";
    if (link.includes('rel="next"')) {
      const match = link.match(/page_info=([^&>]+)/);
      pageInfo = match ? `&page_info=${match[1]}` : "";
    } else {
      hasNext = false;
    }
  }

  res.setHeader("Content-Type","application/json");
  res.status(200).json({ number: Math.round(revenue) });
}
