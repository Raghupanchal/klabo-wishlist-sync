import { supabase } from "../lib/supabase.js";

export default async function handler(req, res) {

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    // ===================================
    // GET CART
    // ===================================

    if (req.method === "GET") {

        const customerId = req.query.customerId;

        if (!customerId) {
            return res.status(400).json({
                success: false,
                error: "Missing customerId"
            });
        }

        const { data, error } = await supabase
            .from("cart")
            .select("*")
            .eq("customer_id", customerId)
            .order("created_at", { ascending: false });

        if (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }

        return res.json({
            success: true,
            items: data
        });
    }

    // ===================================
    // ADD TO CART
    // ===================================

    if (req.method === "POST") {

        const { customerId, product } = req.body;

        if (!customerId || !product) {
            return res.status(400).json({
                success: false,
                error: "Missing data"
            });
        }

        // Check existing item
        const { data: existing } = await supabase
            .from("cart")
            .select("*")
            .eq("customer_id", customerId)
            .eq("variant_id", product.variantId)
            .maybeSingle();

        if (existing) {

            const { error } = await supabase
                .from("cart")
                .update({
                    quantity: existing.quantity + 1
                })
                .eq("id", existing.id);

            if (error) {
                return res.status(500).json({
                    success: false,
                    error: error.message
                });
            }

            return res.json({
                success: true,
                quantity: existing.quantity + 1
            });
        }

        const { error } = await supabase
            .from("cart")
            .insert({
                customer_id: customerId,
                product_id: product.id,
                variant_id: product.variantId,
                title: product.title,
                price: product.price,
                image: product.image,
                url: product.url,
                quantity: 1
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

    // ===================================
    // UPDATE QUANTITY
    // ===================================

    if (req.method === "PATCH") {

        const {
            customerId,
            variantId,
            quantity
        } = req.body;

        if (!customerId || !variantId) {
            return res.status(400).json({
                success: false,
                error: "Missing data"
            });
        }

        if (quantity <= 0) {

            await supabase
                .from("cart")
                .delete()
                .eq("customer_id", customerId)
                .eq("variant_id", variantId);

            return res.json({
                success: true
            });
        }

        const { error } = await supabase
            .from("cart")
            .update({
                quantity
            })
            .eq("customer_id", customerId)
            .eq("variant_id", variantId);

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

    // ===================================
    // REMOVE ITEM
    // ===================================

    if (req.method === "DELETE") {

        const {
            customerId,
            variantId
        } = req.body;

        if (!customerId || !variantId) {
            return res.status(400).json({
                success: false,
                error: "Missing data"
            });
        }

        const { error } = await supabase
            .from("cart")
            .delete()
            .eq("customer_id", customerId)
            .eq("variant_id", variantId);

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

    return res.status(405).json({
        success: false,
        error: "Method Not Allowed"
    });

}