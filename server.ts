import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import process from "process";
import fs from "fs";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Endpoint to vend configuration to the frontend
  app.get("/api/config", (req, res) => {
    // IMPORTANT: It vends the dynamically loaded container environment variable
    res.json({ 
      apiKey: process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.API_KEY || ''
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // Support client-side routing
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
