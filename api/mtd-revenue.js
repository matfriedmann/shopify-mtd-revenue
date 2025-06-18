export default async function handler(req, res) {
  const STORE = "0yi1hx-jw.myshopify.com";
  const TOKEN = process.env.SHOPIFY_API_TOKEN;

  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const end   = now.toISOString();

    let revenue = 0;
    let pageInfo = "";
    let hasNext = true;

    while (hasNext) {
      const url =
        `https://${STORE}/admin/api/2025-04/orders.json` +
        `?status=any` +
        `&created_at_min=${start}` +
        `&created_at_max=${end}` +
        `&limit=250` +
        pageInfo;

      const r = await fetch(url, {
        headers: {
          "X-Shopify-Access-Token": TOKEN,
          "Content-Type": "application/json",
        },
      });

      // **Log if Shopify returns an error status**
      if (!r.ok) {
        const text = await r.text();
        console.error("Shopify API error", r.status, text);
        return res
          .status(502)
          .json({ error: `Shopify API returned ${r.status}`, body: text });
      }

      const body = await r.json();

      // **Log if the shape isn’t what we expect**
      if (!Array.isArray(body.orders)) {
        console.error("Unexpected payload:", body);
        return res
          .status(502)
          .json({ error: "Unexpected response from Shopify", body });
      }

      for (const o of body.orders) {
        if (["paid", "partially_paid", "authorized"].includes(o.financial_status)) {
          const subtotal  = parseFloat(o.subtotal_price)   || 0;
          const tax       = parseFloat(o.total_tax)        || 0;
          const shipping  = (o.shipping_lines || []).reduce((s, x) => s + parseFloat(x.price || 0), 0);
          const discounts = parseFloat(o.total_discounts)  || 0;

          // exactly how Shopify defines “Total sales”
          revenue += subtotal + tax + shipping - discounts;
        }
      }

      const link = r.headers.get("link") || "";
      if (link.includes('rel="next"')) {
        const m = link.match(/page_info=([^&>]+)/);
        pageInfo = m ? `&page_info=${m[1]}` : "";
      } else {
        hasNext = false;
      }
    }

    return res.status(200).json({ number: Math.round(revenue) });
  } catch (err) {
    console.error("Unhandled error in function:", err);
    return res.status(500).json({ error: err.toString() });
  }
}
