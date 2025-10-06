#!/usr/bin/env node
const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

// Public directory
const PUBLIC_DIR = path.join(process.cwd(), "public");
const TOOL_DIR = path.join(PUBLIC_DIR, "onetools", "downloads");
if (!fs.existsSync(TOOL_DIR)) fs.mkdirSync(TOOL_DIR, { recursive: true });

// Serve static files
app.use("/onetools", express.static(path.join(PUBLIC_DIR, "onetools")));

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-").substring(0, 200);
}

// ✅ Convert YouTube to MP3
app.post("/api/convert", async (req, res) => {
  const { url, start, end, bitrate } = req.body || {};
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing url" });
  }

  const id = uuidv4().split("-")[0];
  let title = "";

  try {
    // Fetch video title
    const ytProc = spawn("yt-dlp", [
      "--no-warnings",
      "--no-playlist",
      "--skip-download",
      "--print",
      "%(title)s",
      url,
    ]);
    ytProc.stdout.on("data", (d) => { title = String(d).trim(); });

    await new Promise((resolve, reject) => {
      ytProc.on("close", resolve);
      ytProc.on("error", reject);
    });

    const safeTitle = sanitizeFilename(title) || id;
    const filename = `${safeTitle}-${id}.mp3`;
    const outPath = path.join(TOOL_DIR, filename);

    // yt-dlp stream
    const ytArgs = ["-f", "bestaudio", "--no-playlist", "-o", "-", url];
    const ytStream = spawn("yt-dlp", ytArgs, { stdio: ["ignore", "pipe", "inherit"] });

    // ffmpeg conversion
    const ffArgs = ["-y", "-i", "pipe:0"];
    if (start) ffArgs.push("-ss", String(start));
    if (end) ffArgs.push("-to", String(end));
    if (bitrate) ffArgs.push("-b:a", `${bitrate}k`);
    ffArgs.push("-f", "mp3", outPath);

    const ffmpeg = spawn("ffmpeg", ffArgs, { stdio: ["pipe", "inherit", "inherit"] });
    ytStream.stdout.pipe(ffmpeg.stdin);

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        const fileUrl = `/onetools/downloads/${encodeURIComponent(filename)}`;
        return res.json({ success: true, title, url: fileUrl });
      } else {
        if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
        return res.status(500).json({ error: "Conversion failed" });
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// ✅ Root route
app.get("/", (req, res) => {
  res.send("✅ Backend running. Use /api/convert for conversion, /api/health for status.");
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`adsLive backend listening on ${PORT}`);
});