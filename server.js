require("dotenv").config();
const express = require("express");
const multer = require("multer");
const { createClient } = require("webdav");
const path = require("path");
const fs = require("fs");

const upload = multer({ dest: "/tmp/uploads" });
const app = express();
const PORT = process.env.PORT || 3000;

app.use(require("cors")());
app.use(express.json());

// ---------- NEXTCLOUD KONFIG ----------
const ncUrl = process.env.NEXTCLOUD_URL;
const ncUser = process.env.NEXTCLOUD_USER;
const ncPass = process.env.NEXTCLOUD_PASSWORD;
const ncBasePath = process.env.NEXTCLOUD_BASE_PATH || "/";

const client = createClient(ncUrl, {
  username: ncUser,
  password: ncPass,
});

// ---------- Hilfsfunktionen ----------

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

// CSV-Writer auf Nextcloud
async function appendCsvLog({ bezirk, bkz, container, originalName, remote }) {
  const fileName = "upload-log.csv";
  const csvPath = path.posix.join(ncBasePath, fileName);

  let current = "";

  try {
    if (await client.exists(csvPath)) {
      current = await client.getFileContents(csvPath, { format: "text" });
    }
  } catch (err) {
    console.warn("CSV read error:", err);
  }

  // Header hinzufügen, falls Datei neu ist
  if (!current.includes("DatumZeit;Bezirk;BKZ;Container;Original;Remote")) {
    current =
      "DatumZeit;Bezirk;BKZ;Container;Original;Remote\n";
  }

  const line = [
    new Date().toISOString(),
    bezirk,
    bkz,
    container,
    originalName,
    remote
  ]
    .map((v) => String(v).replace(/;/g, ",")) // Sicherheit
    .join(";");

  const newContent = current + line + "\n";

  await client.putFileContents(csvPath, newContent, { overwrite: true });
}

// ---------- UPLOAD API ----------

app.post("/api/upload", upload.array("files"), async (req, res) => {
  try {
    const bezirk = req.body.bezirk || "unknown";
    const bkz = req.body.bkz || "unknown";
    let containers = req.body.containers || [];

    if (typeof containers === "string") containers = [containers];

    // Ordnerstruktur erzeugen
    const bezirkPath = path.posix.join(ncBasePath, bezirk);
    const bkzPath = path.posix.join(bezirkPath, bkz);

    await ensureFolder(bezirkPath);
    await ensureFolder(bkzPath);

    const results = [];

    for (let i = 0; i < req.files.length; i++) {
      const f = req.files[i];
      const container = containers[i] || "container";

      const ext = path.extname(f.originalname) || "";
      const baseName = container;

      let remote = path.posix.join(bkzPath, baseName + ext);

      // Wenn Datei existiert → timestamp
      let exists = false;
      try {
        exists = await client.exists(remote);
      } catch (e) {
        exists = false;
      }

      if (exists) {
        const ts = formatTimestamp();
        remote = path.posix.join(bkzPath, `${baseName}_${ts}${ext}`);
      }

      // Datei hochladen
      await client.putFileContents(
        remote,
        fs.createReadStream(f.path),
        { overwrite: false }
      );

      // lokale Datei löschen
      fs.unlinkSync(f.path);

      // CSV-Logging
      await appendCsvLog({
        bezirk,
        bkz,
        container,
        originalName: f.originalname,
        remote
      });

      results.push({
        originalName: f.originalname,
        remotePath: remote,
        container,
      });
    }

    res.json({ ok: true, files: results });

  } catch (err) {
    console.error("UPLOAD FEHLER:", err);
    res.status(500).json({ ok: false, message: err.message });
  }
});

// ---------- START ----------

app.listen(PORT, () =>
  console.log("Backend läuft auf Port", PORT)
);
