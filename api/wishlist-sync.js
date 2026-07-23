import { supabase } from "../lib/supabase.js";
import { handleCors } from "../lib/cors.js";
import { verifyShopifyAppProxy } from "../lib/shopify-auth.js";

export default async function handler(req, res) {
  if (!handleCors(req, res, { allowedMethods: ["GET", "POST", "DELETE", "OPTIONS"] })) {
    return;
  }

  const auth = verifyShopifyAppProxy(req);
  if (!auth.isValid) {
    return res.status(401).json({
      success: false,
      error: auth.error
    });
  }

  const customerId = auth.customerId;

  if (req.method === "GET") {
    if (auth.isGuest) {
      return res.json({
        success: true,
        products: []
      });
    }

    const { data, error } = await supabase
      .from("wishlist")
      .select("*")
      .eq("customer_id", customerId);

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    return res.json({
      success: true,
      products: data
    });
  }

  if (req.method === "POST") {
    if (auth.isGuest) {
      return res.json({ success: true });
    }

    const { product } = req.body || {};

    if (!product || !product.id) {
      return res.status(400).json({
        success: false,
        error: "Missing product data"
      });
    }

    const { error } = await supabase
      .from("wishlist")
      .upsert({
        customer_id: customerId,
        product_id: product.id,
        variant_id: product.variantId,
        title: product.title,
        price: product.price,
        image: product.image,
        url: product.url
      });

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    return res.json({
      success: true
    });
  }

  if (req.method === "DELETE") {
    if (auth.isGuest) {
      return res.json({ success: true, deleted: [] });
    }

    const { productId } = req.body || {};

    if (!productId) {
      return res.status(400).json({
        success: false,
        error: "Missing productId"
      });
    }

    const { data, error } = await supabase
      .from("wishlist")
      .delete()
      .eq("customer_id", customerId)
      .eq("product_id", productId)
      .select();

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    return res.json({
      success: true,
      deleted: data
    });
  }

  return res.status(405).json({
    success: false,
    error: "Method Not Allowed"
  });
}