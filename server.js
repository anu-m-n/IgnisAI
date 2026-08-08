import "dotenv/config";
import express from "express";
import cors from "cors";
import interviewRouter from "./src/routes.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Serve static UI assets
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/api", interviewRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Interview agent listening on port ${PORT}`);
  console.log(`LLM provider: ${(process.env.LLM_PROVIDER || "anthropic")}`);
});

