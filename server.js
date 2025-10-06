const express = require("express");
const bodyParser = require("body-parser");
const { ytdlp } = require("yt-dlp-exec");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(bodyParser.json());

// Downloads folder
const downloadDir = path.join(__dirname, "downloads");
if (!fs.existsSync(downloadDir)) {
  fs.mkdirSync(downloadDir);
}

// Quality mapping
const qualityMap = {
  "64": "64K",
  "128": "128K",
  "192": "192K",
  "256": "256K",
  "320": "320K"
};

// Auto cleanup (delete files older than 10 minutes)
setInterval(() => {
  const files = fs.readdirSync(downloadDir);
  const now = Date.now();
  files.forEach(file => {
    const filePath = path.join(downloadDir, file);
    const stats = fs.statSync(filePath);
    if (now - stats.mtimeMs > 10 * 60 * 1000) {
      fs.unlinkSync(filePath);
      console.log("🗑 Deleted old file:", file);
    }
  });
}, 5 * 60 * 1000); // run every 5 min

// Convert endpoint
app.post("/api/convert", async (req, res) => {
  const { url, quality } = req.body;

  if (!url) {
    return res.status(400).json({ success: false, error: "No URL provided" });
  }

  const selectedQuality = qualityMap[quality] || "192K";
  const safeName = Date.now(); // unique prefix for filename
  const outputFile = path.join(downloadDir, `${safeName}-%(title)s-${quality}kbps.%(ext)s`);

  try {
    await ytdlp(url, {
      extractAudio: true,
      audioFormat: "mp3",
      audioQuality: selectedQuality,
      output: outputFile,
    });

    // Find generated file
    const files = fs.readdirSync(downloadDir).filter(f => f.includes(safeName));
    if (!files.length) throw new Error("File not created");

    const downloadUrl = `/downloads/${files[0]}`;

    res.json({
      success: true,
      quality,
      download: downloadUrl
    });
  } catch (err) {
    console.error("yt-dlp error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Serve downloads
app.use("/downloads", express.static(downloadDir));

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});