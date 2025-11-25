require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { createClient } = require("webdav");
const path = require('path');
const fs = require('fs').promises; // Async FS
const app = express();
const PORT = process.env.PORT || 3000;

// Multer-Setup für temporäre Uploads
const upload = multer({ dest: '/tmp/uploads' });

// Middleware
app.use(require('cors')());
app.use(express.json());

// Nextcloud-Config
const ncUrl = process.env.NEXTCLOUD_URL;
const ncUser = process.env.NEXTCLOUD_USER;
const ncPass = process.env.NEXTCLOUD_PASSWORD;
const ncBasePath = process.env.NEXTCLOUD_BASE_PATH || "/";

// WebDAV-Client
const client = createClient(ncUrl, { username: ncUser, password: ncPass });

// Hilfsfunktion: Ordner sicherstellen
async function ensureFolder(folderPath) {
  const exists = await client.exists(folderPath);
  if (!exists) await client.createDirectory(folderPath);
}

// Hilfsfunktion: Timestamp
function formatTimestamp(d = new Date()) {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
}

// Upload-Endpoint
app.post('/api/upload', upload.array('files'), async (req, res) => {
  try {
    const bezirk = req.body.bezirk || "unknown";
    const bkz = req.body.bkz || "unknown";
    let containers = req.body.containers || [];
    if (typeof containers === 'string') containers = [containers];

    await ensureFolder(ncBasePath);
    const results = [];

    for (let i = 0; i < req.files.length; i++) {
      const f = req.files[i];
      const container = containers[i] || 'container';
      const ext = path.extname(f.originalname) || '';
      const baseName = `${bezirk}_${bkz}_${container}`;
      let remote = path.posix.join(ncBasePath, baseName + ext);

      if (await client.exists(remote)) {
        const ts = formatTimestamp();
        remote = path.posix.join(ncBasePath, `${baseName}_${ts}${ext}`);
      }

      // Datei als Buffer lesen (verhindert "body stream already read")
      const fileBuffer = await fs.readFile(f.path);
      await client.putFileContents(remote, fileBuffer, { overwrite: false });

      // Temp-Datei löschen
      await fs.unlink(f.path);

      results.push({ originalName: f.originalname, remotePath: remote });
    }

    res.json({ ok: true, files: results });
  } catch (err) {
    console.error("Upload-Fehler:", err);
    res.status(500).json({ ok: false, message: err.message });
  }
});

// Server starten
app.listen(PORT, () => console.log(`Backend läuft auf Port ${PORT}`));
