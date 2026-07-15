import clientPromise from "../lib/mongodb.js";

export default async function handler(req, res) {
  try {
    const client = await clientPromise;
    const db = client.db("klabo");

    const wishlist = db.collection("wishlist");

    if (req.method === "GET") {
      const { customerId } = req.query;

      if (!customerId) {
        return res.status(400).json({
          success: false,
          message: "customerId required",
        });
      }

      const items = await wishlist.find({ customerId }).toArray();

      return res.status(200).json({
        success: true,
        wishlist: items,
      });
    }

    if (req.method === "POST") {
      const { customerId, productId } = req.body;

      if (!customerId || !productId) {
        return res.status(400).json({
          success: false,
          message: "customerId and productId required",
        });
      }

      const exists = await wishlist.findOne({
        customerId,
        productId,
      });

      if (!exists) {
        await wishlist.insertOne({
          customerId,
          productId,
          createdAt: new Date(),
        });
      }

      return res.json({
        success: true,
      });
    }

    if (req.method === "DELETE") {
      const { customerId, productId } = req.body;

      await wishlist.deleteOne({
        customerId,
        productId,
      });

      return res.json({
        success: true,
      });
    }

    return res.status(405).json({
      success: false,
      message: "Method Not Allowed",
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
}