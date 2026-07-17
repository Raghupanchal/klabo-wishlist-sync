import { supabase } from "../lib/supabase.js";

export default async function handler(req, res) {

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
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

    console.log("DELETE BODY:", req.body);

    const { customerId, productId } = req.body;

    const { data, error } = await supabase
      .from("wishlist")
      .delete()
      .eq("customer_id", customerId)
      .eq("product_id", productId)
      .select();

    console.log("DELETED DATA:", data);
    console.log("DELETE ERROR:", error);

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