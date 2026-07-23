import { supabase } from "../lib/supabase.js";
import { handleCors } from "../lib/cors.js";

export default async function handler(req, res) {
  if (!handleCors(req, res, { allowedMethods: ["GET", "POST", "DELETE", "OPTIONS"] })) {
    return;
  }

  if (req.method === "GET") {

    const customerId = req.query.customerId;

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

    const { customerId, product } = req.body;

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

    const { customerId, productId } = req.body;

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