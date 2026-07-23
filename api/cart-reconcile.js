import { supabase } from "../lib/supabase.js";
import { handleCors } from "../lib/cors.js";

function generateSignature(items) {
  if (!items || items.length === 0) {
    return "";
  }

  const sorted = [...items].map(item => ({
    variant_id: String(item.variant_id || item.id || ''),
    quantity: Number(item.quantity || 0)
  })).sort((a, b) => a.variant_id.localeCompare(b.variant_id));

  return sorted.map(item => `${item.variant_id}:${item.quantity}`).join('|');
}

export default async function handler(req, res) {
  if (!handleCors(req, res, { allowedMethods: ["POST", "OPTIONS"] })) {
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method Not Allowed",
    });
  }

  try {
    const { customerId, shopifySignature } = req.body;

    if (!customerId || typeof customerId !== "string" || customerId.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid customerId"
      });
    }

    const { data: serverItems, error } = await supabase
      .from("cart")
      .select("*")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: true });

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    const serverSignature = generateSignature(serverItems || []);

    if (serverSignature === shopifySignature) {
      return res.json({
        same: true
      });
    }

    return res.json({
      same: false,
      serverSignature,
      serverItems: (serverItems || []).map(item => ({
        variant_id: String(item.variant_id),
        quantity: Number(item.quantity)
      }))
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}