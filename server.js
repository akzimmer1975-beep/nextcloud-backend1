require("dotenv").config();
const express = require("express");
const multer = require("multer");
const { createClient } = require("webdav");
const path = require("path");
const fs = require("fs");
const cors = require("cors");

const upload = multer({ dest: "/tmp/uploads" });
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
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

// ---------- HILFSFUNKTIONEN ----------

async function ensureFolder(folderPath) {
  if (!(await client.exists(folderPath))) {
    await client.createDirectory(folderPath);
  }
}

function formatTimestamp(d = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}_${z(
    d.getHours()
  )}${z(d.getMinutes())}${z(d.getSeconds())}`;
}

// ---------- CSV LOG ----------
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

  if (!current.startsWith("DatumZeit;")) {
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
    .map(v => String(v).replace(/;/g, ","))
    .join(";");

  await client.putFileContents(
    csvPath,
    current + line + "\n",
    { overwrite: true }
  );
}

// ---------- UPLOAD API ----------
app.post("/api/upload", upload.array("files"), async (req, res) => {
  try {
    const bezirk = (req.body.bezirk || "").replace(/[^A-Za-zÄÖÜäöü\-]/g, "");
    const bkz = (req.body.bkz || "").replace(/[^\d]/g, "");
    let containers = req.body.containers || [];

    if (!bezirk || !bkz) {
      return res.status(400).json({ ok: false, message: "Bezirk oder BKZ fehlt" });
    }

    if (typeof containers === "string") containers = [containers];

    const bezirkPath = path.posix.join(ncBasePath, bezirk);
    const bkzPath = path.posix.join(bezirkPath, bkz);

    await ensureFolder(bezirkPath);
    await ensureFolder(bkzPath);

    const results = [];

    for (let i = 0; i < req.files.length; i++) {
      const f = req.files[i];
      const container = containers[i] || "datei";
      const ext = path.extname(f.originalname) || "";

      // 🔥 IMMER Zeitstempel
      const ts = formatTimestamp();
      const remoteFileName = `${container}_${ts}${ext}`;
      const remote = path.posix.join(bkzPath, remoteFileName);

      await client.putFileContents(
        remote,
        fs.createReadStream(f.path),
        { overwrite: false }
      );

      fs.unlinkSync(f.path);

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
        timestamp: ts
      });
    }

    res.json({ ok: true, files: results });

  } catch (err) {
    console.error("UPLOAD FEHLER:", err);
    res.status(500).json({ ok: false, message: err.message });
  }
});

// ---------- DATEILISTE API ----------
app.get("/api/files", async (req, res) => {
  try {
    const bezirk = (req.query.bezirk || "").replace(/[^A-Za-zÄÖÜäöü\-]/g, "");
    const bkz = (req.query.bkz || "").replace(/[^\d]/g, "");

    if (!bezirk || !bkz) {
      return res.status(400).json({ error: "Bezirk oder BKZ fehlt" });
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
        lastModified: f.lastmod
      }))
      .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

    res.json(files);

  } catch (err) {
    console.error("FEHLER /api/files:", err);
    res.status(500).json({ error: "Dateiliste konnte nicht geladen werden" });
  }
});

// ---------- START ----------
app.listen(PORT, () => {
  console.log("Backend läuft auf Port", PORT);
});
