require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { createClient } = require("webdav");
const path = require('path');
const fs = require('fs');

const upload = multer({ dest: '/tmp/uploads' });
const app = express();
const PORT = process.env.PORT || 3000;

app.use(require('cors')());
app.use(express.json());

// Nextcloud-Konfiguration
const ncUrl = process.env.NEXTCLOUD_URL;
const ncUser = process.env.NEXTCLOUD_USER;
const ncPass = process.env.NEXTCLOUD_PASSWORD;
const ncBasePath = process.env.NEXTCLOUD_BASE_PATH || "/";

const client = createClient(ncUrl, { username: ncUser, password: ncPass });

// Hilfsfunktion: Ordner erstellen, falls nicht vorhanden
async function ensureFolder(folderPath) {
  const exists = await client.exists(folderPath);
  if (!exists) await client.createDirectory(folderPath);
}

// Hilfsfunktion: Timestamp für Dateikonflikte
function formatTimestamp(d = new Date()) {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${z(d.getMonth()+1)}${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
}

// Upload-Route
app.post('/api/upload', upload.array('files'), async (req, res) => {
  try {
    const bezirk = req.body.bezirk || "unknown";
    const bkz = req.body.bkz || "unknown";
    let containers = req.body.containers || [];
    if (typeof containers === 'string') containers = [containers];

    // Pfade für Bezirk und BKZ
    const bezirkPath = path.posix.join(ncBasePath, bezirk);
    const bkzPath = path.posix.join(bezirkPath, bkz);

    await ensureFolder(bezirkPath);
    await ensureFolder(bkzPath);

    const results = [];

    for (let i = 0; i < req.files.length; i++) {
      const f = req.files[i];
      const container = containers[i] || 'container';
      const ext = path.extname(f.originalname) || '';
      const baseName = container;
      let remote = path.posix.join(bkzPath, baseName + ext);

      // Prüfen, ob Datei bereits existiert
      let exists = false;
      try { exists = await client.exists(remote); } catch(e) { exists = false; }
      if (exists) {
        const ts = formatTimestamp();
        remote = path.posix.join(bkzPath, `${baseName}_${ts}${ext}`);
      }

      // Datei hochladen
      await client.putFileContents(remote, fs.createReadStream(f.path), { overwrite: false });
      fs.unlinkSync(f.path);

      results.push({ originalName: f.originalname, remotePath: remote });
    }

    res.json({ ok: true, files: results });

  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

app.listen(PORT, () => console.log("Backend läuft auf Port", PORT));

