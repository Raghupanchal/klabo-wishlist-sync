import { handleCors } from "../lib/cors.js";

export default function handler(req, res) {
  if (!handleCors(req, res, { allowedMethods: ["GET", "OPTIONS"] })) {
    return;
  }
  res.status(200).send(`
    <html>
      <head>
        <title>KLABO Wishlist Sync</title>
      </head>
      <body style="font-family:sans-serif;padding:40px">
        <h1>KLABO Wishlist Sync</h1>
        <p>App connected successfully.</p>
      </body>
    </html>
  `);
}