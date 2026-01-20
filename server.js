require("dotenv").config();

const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const os = require("os");
const https = require("https");
const { URL } = require("url");
const { createClient } = require("webdav");

const app = express();
const PORT = process.env.PORT || 3000;

// -------------------- MIDDLEWARE --------------------
app.use(cors());
app.use(express.json());

const upload = multer({
  dest: path.join(os.tmpdir(), "uploads")
});

// -------------------- NEXTCLOUD CONFIG --------------------
const ncUrl = process.env.NEXTCLOUD_URL;              // https://portal.gdl-jugend.de
const ncUser = process.env.NEXTCLOUD_USER;            // AndreasZimmer
const ncPass = process.env.NEXTCLOUD_PASSWORD;
const ncBasePath = process.env.NEXTCLOUD_BASE_PATH || "/Documents/BR Wahl 2026";

// ⚠️ WICHTIG: WebDAV IMMER bis /files/<user>
const client = createClient(
  `${ncUrl}/remote.php/dav/files/${ncUser}`,
  {
    username: ncUser,
    password: ncPass
  }
);

// -------------------- HELPERS --------------------
async function ensureFolder(folderPath) {
  const exists = await client.exists(folderPath);
  if (!exists) {
    await client.createDirectory(folderPath);
  }
}

function formatTimestamp(d = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}_${z(
    d.getHours()
  )}${z(d.getMinutes())}${z(d.getSeconds())}`;
}

// -------------------- STABILER RAW HTTPS UPLOAD --------------------
async function uploadToNextcloud(remoteUrl, buffer) {
  return new Promise((resolve, reject) => {
    const url = new URL(remoteUrl);

    const req = https.request(
      {
        method: "PUT",
        hostname: url.hostname,
        path: url.pathname,
        auth: `${ncUser}:${ncPass}`,
        headers: {
          "Content-Length": buffer.length,
          "Content-Type": "application/octet-stream",
          "Connection": "close"
        },
        timeout: 30000
      },
      (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`Nextcloud HTTP ${res.statusCode}`));
        }
      }
    );

    req.on("error", reject);
    req.write(buffer);
    req.end();
  });
}

// -------------------- UPLOAD API --------------------
app.post("/api/upload", upload.array("files"), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ ok: false, message: "Keine Dateien empfangen" });
    }

    const bezirk = (req.body.bezirk || "").replace(/[^A-Za-zÄÖÜäöü\-]/g, "");
    const bkz = (req.body.bkz || "").replace(/[^\d]/g, "");
    let containers = req.body.containers || [];

    if (!bezirk || !bkz) {
      return res.status(400).json({ ok: false, message: "Bezirk oder BKZ fehlt" });
    }

    if (typeof containers === "string") containers = [containers];

    const bezirkPath = path.posix.join(ncBasePath, bezirk);
    const bkzPath = path.posix.join(bezirkPath, bkz);

    await ensureFolder(ncBasePath);
    await ensureFolder(bezirkPath);
    await ensureFolder(bkzPath);

    const results = [];

    for (let i = 0; i < req.files.length; i++) {
      const f = req.files[i];
      const container = containers[i] || "datei";
      const ext = path.extname(f.originalname) || "";
      const ts = formatTimestamp();

      // 🔑 IMMER Zeitstempel im Dateinamen
      const fileName = `${container}_${ts}${ext}`;
      const remotePath = path.posix.join(bkzPath, fileName);

      const buffer = fs.readFileSync(f.path);

      const remoteUrl =
        `${ncUrl}/remote.php/dav/files/${ncUser}` +
        remotePath;

      await uploadToNextcloud(remoteUrl, buffer);

      fs.unlinkSync(f.path);

      results.push({
        name: fileName,
        path: remotePath,
        size: buffer.length
      });
    }

    res.json({ ok: true, files: results });

  } catch (err) {
    console.error("UPLOAD FEHLER:", err);
    res.status(500).json({ ok: false, message: err.message });
  }
});

// -------------------- FILE LIST API --------------------
app.get("/api/files", async (req, res) => {
  try {
    const bezirk = (req.query.bezirk || "").replace(/[^A-Za-zÄÖÜäöü\-]/g, "");
    const bkz = (req.query.bkz || "").replace(/[^\d]/g, "");

    if (!bezirk || !bkz) {
      return res.json([]);
    }

    const folderPath = path.posix.join(ncBasePath, bezirk, bkz);

    if (!(await client.exists(folderPath))) {
      return res.json([]);
    }

    const contents = await client.getDirectoryContents(folderPath);

    const files = contents
      .filter(f => f.type === "file")
      .map(f => ({
        name: f.basename,
        lastModified: f.lastmod,
        size: f.size
      }))
      .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

    res.json(files);

  } catch (err) {
    console.error("FILES API ERROR:", err);
    res.status(500).json([]);
  }
});

// -------------------- START --------------------
app.listen(PORT, () => {
  console.log("Backend läuft auf Port", PORT);
});
