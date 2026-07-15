import clientPromise from "../lib/mongodb.js";

export default async function handler(req, res) {
  try {
    const client = await clientPromise;
    const db = client.db("klabo");
    const wishlist = db.collection("wishlist");

    // -----------------------
    // GET WISHLIST
    // -----------------------
    if (req.method === "GET") {
      const customerId = String(req.query.customerId || "");

      if (!customerId) {
        return res.status(400).json({
          success: false,
          message: "customerId required",
        });
      }

      const items = await wishlist
        .find({ customerId })
        .project({ _id: 0, product: 1 })
        .toArray();

      return res.json({
        success: true,
        products: items.map(item => item.product),
      });
    }

    // -----------------------
    // ADD PRODUCT
    // -----------------------
    if (req.method === "POST") {
      const customerId = String(req.body.customerId || "");
      const product = req.body.product;

      if (!customerId || !product || !product.id) {
        return res.status(400).json({
          success: false,
          message: "customerId and product required",
        });
      }

      await wishlist.updateOne(
        {
          customerId,
          "product.id": String(product.id),
        },
        {
          $set: {
            customerId,
            product: {
              id: String(product.id),
              variantId: String(product.variantId),
              title: product.title,
              price: product.price,
              image: product.image,
              url: product.url,
            },
            createdAt: new Date(),
          },
        },
        {
          upsert: true,
        }
      );

      return res.json({
        success: true,
      });
    }

    // -----------------------
    // REMOVE PRODUCT
    // -----------------------
    if (req.method === "DELETE") {
      const customerId = String(req.body.customerId || "");
      const productId = String(req.body.productId || "");

      if (!customerId || !productId) {
        return res.status(400).json({
          success: false,
          message: "customerId and productId required",
        });
      }

      await wishlist.deleteOne({
        customerId,
        "product.id": productId,
      });

      return res.json({
        success: true,
      });
    }

    return res.status(405).json({
      success: false,
      message: "Method not allowed",
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
}