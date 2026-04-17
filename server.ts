import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");
import fs from "fs";

async function startServer() {
  const app = express();
  const PORT = 3000;

  const aiKey = process.env.GEMINI_API_KEY || "";
  if (!aiKey && process.env.NODE_ENV === "production") {
    console.warn("WARNING: GEMINI_API_KEY is not set in production environment!");
  }
  const ai = new GoogleGenAI({ apiKey: aiKey });

  // Configure multer for file uploads - use memory usage for stability in this environment
  const storage = multer.memoryStorage();
  const upload = multer({ 
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
  });

  app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: true
  }));
  app.use(express.json());

  // API to upload and parse PDF
  app.post("/api/upload", (req, res, next) => {
    upload.array("files")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      } else if (err) {
        return res.status(500).json({ error: `Server error: ${err.message}` });
      }
      next();
    });
  }, async (req, res) => {
    console.log(`Received upload request: ${req.files ? (req.files as any).length : 0} files`);
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        console.warn("No files in request");
        return res.status(400).json({ error: "No files found in the request." });
      }

      const results = [];
      for (const file of files) {
        try {
          console.log(`Parsing file in memory: ${file.originalname} (${file.size} bytes)`);
          const dataBuffer = file.buffer;
          
          // Debugging pdf-parse import - it's a CommonJS module
          let parsePdf: any;
          if (typeof pdf === 'function') {
            parsePdf = pdf;
          } else if (pdf && typeof pdf.default === 'function') {
            parsePdf = pdf.default;
          } else if (pdf && typeof pdf === 'object') {
            // Some versions of pdf-parse export the function as the only value or as a property
            parsePdf = Object.values(pdf).find(v => typeof v === 'function') || pdf;
          }

          if (typeof parsePdf !== 'function') {
             // If still not a function, check if it's the module itself (sometimes happens in certain environments)
             try {
               const pdfModule = require("pdf-parse");
               parsePdf = typeof pdfModule === 'function' ? pdfModule : pdfModule.default;
             } catch (e) {}
          }
          
          if (typeof parsePdf !== 'function') {
            console.error("Critical: pdf-parse is not a function after all checks", { 
              type: typeof pdf, 
              keys: Object.keys(pdf || {}),
            });
            throw new Error("PDF processing engine failed to initialize.");
          }

          const data = await parsePdf(dataBuffer);
          
          results.push({
            name: file.originalname,
            text: data.text,
            pages: data.numpages || 0,
            info: data.info || {},
          });
        } catch (fileError: any) {
          const errorMsg = fileError.message || String(fileError);
          console.error(`Error processing file ${file.originalname}:`, errorMsg);
          
          let friendlyError = "Failed to parse this specific PDF.";
          
          if (errorMsg.includes("PasswordException")) {
            friendlyError = "This PDF is password protected and cannot be parsed.";
          } else if (errorMsg.includes("InvalidPDFException")) {
            friendlyError = "This file does not appear to be a valid PDF.";
          } else if (errorMsg.includes("FormatError")) {
            friendlyError = "The PDF format is corrupted or unsupported.";
          } else if (errorMsg.includes("AbortException")) {
            friendlyError = "The parsing process was aborted. The file might be too complex or large.";
          } else if (errorMsg.includes("failed to initialize")) {
            friendlyError = "Internal PDF engine error. Please try again.";
          }
          
          results.push({
            name: file.originalname,
            error: friendlyError,
            status: "error"
          });
        }
      }

      res.json({ files: results });
    } catch (error: any) {
      console.error("General upload error:", error);
      res.status(500).json({ error: `Server error during file processing: ${error.message}` });
    }
  });

  // AI Endpoints
  app.post("/api/ai/generate", async (req, res) => {
    try {
      const { prompt, config } = req.body;
      
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
      }

      // Use the standard generative AI model pattern
      const modelName = "gemini-1.5-flash"; // More stable name across environments
      const model = ai.getGenerativeModel({ model: modelName });
      
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: config || { responseMimeType: "application/json" }
      });
      
      const response = await result.response;
      const text = response.text();
      res.json({ text: text });
    } catch (error: any) {
      console.error("AI Error:", error);
      res.status(500).json({ error: `AI Processing failed: ${error.message}` });
    }
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
