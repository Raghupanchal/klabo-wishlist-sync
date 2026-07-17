import { supabase } from "../lib/supabase.js";

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
        "Access-Control-Allow-Methods",
        "POST,OPTIONS"
    );
    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type"
    );

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    if (req.method !== "POST") {
        return res.status(405).json({
            success: false,
            error: "Method Not Allowed",
        });
    }

    try {
        const { customerId, shopifyCart } = req.body;

        if (!customerId) {
            return res.status(400).json({
                success: false,
                error: "Missing customerId",
            });
        }

        const shopifyItems = Array.isArray(shopifyCart)
            ? shopifyCart
            : [];

        const { data: supabaseItems, error } = await supabase
            .from("cart")
            .select("*")
            .eq("customer_id", customerId);

        if (error) {
            return res.status(500).json({
                success: false,
                error: error.message,
            });
        }

        const dbItems = supabaseItems || [];

        //--------------------------------------------------
        // Nothing
        //--------------------------------------------------

        if (shopifyItems.length === 0 && dbItems.length === 0) {
            return res.json({
                success: true,
                action: "NOTHING",
            });
        }

        //--------------------------------------------------
        // Restore
        //--------------------------------------------------

        if (shopifyItems.length === 0 && dbItems.length > 0) {
            return res.json({
                success: true,
                action: "RESTORE",
                items: dbItems,
            });
        }

        //--------------------------------------------------
        // Keep Shopify
        //--------------------------------------------------

        if (shopifyItems.length > 0 && dbItems.length === 0) {
            return res.json({
                success: true,
                action: "KEEP_SHOPIFY",
            });
        }

        //--------------------------------------------------
        // Merge
        //--------------------------------------------------

        const merged = new Map();

        // Shopify wins for duplicates
        shopifyItems.forEach((item) => {
            merged.set(String(item.variant_id || item.id), {
                variant_id: String(item.variant_id || item.id),
                quantity: Number(item.quantity),
            });
        });

        dbItems.forEach((item) => {
            const key = String(item.variant_id);

            if (!merged.has(key)) {
                merged.set(key, {
                    variant_id: key,
                    quantity: Number(item.quantity),
                });
            }
        });

        return res.json({
            success: true,
            action: "MERGE",
            items: Array.from(merged.values()),
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            error: err.message,
        });
    }
}