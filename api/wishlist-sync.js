export default async function handler(req, res) {
  try {

    if (req.method === 'GET') {

      return res.status(200).json({
        success: true,
        wishlist: []
      });

    }

    if (req.method === 'POST') {

      const body = req.body;

      return res.status(200).json({
        success: true,
        received: body
      });

    }

    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      error: error.message
    });

  }
}