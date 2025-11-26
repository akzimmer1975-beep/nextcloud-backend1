const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { createClient } = require("webdav");
const pLimit = require('p-limit').default;
const app = express();
const PORT = process.env.PORT || 3000;

// Lokal: .env laden, falls vorhanden
if (fs.existsSync(path.resolve(__dirname, '.env'))) {
  require('dotenv').config();
}

// Multer für temporäre Uploads
const upload = multer({ dest: '/tmp/uploads' });

// Middleware
app.use(require('cors')());
app.use(express.json());

// Nextcloud-Config aus Environment Variables
const ncUrl = process.env.NEXTCLOUD_URL;
const ncUser = process.env.NEXTCLOUD_USER;
const ncPass = process.env.NEXTCLOUD_PASSWORD;
const ncBasePath = process.env.NEXTCLOUD_BASE_PATH || "/";

// WebDAV-Client
const client = createClient(ncUrl, { username: ncUser, password: ncPass });

// Limit für parallele Uploads
const limit = pLimit(3);

// Ordner rekursiv erstellen
async function ensureFolderRecursive(folderPath) {
  const parts = folderPath.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current += '/' + part;
    if (!await client.exists(current)) {
      await client.createDirectory(current);
    }
  }
}

// Timestamp für Konflikte
function formatTimestamp(d = new Date()) {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
}

// Datei-Upload mit Retry
async function uploadFileWithRetry(localPath, remotePath, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await new Promise((resolve, reject) => {
        const readStream = fs.createReadStream(localPath);
        client.createWriteStream(remotePath, { overwrite: false })
          .then(writeStream => {
            readStream.pipe(writeStream);
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
          })
          .catch(reject);
      });
      return; // erfolgreich
    } catch (err) {
      console.warn(`Upload fehlgeschlagen (Versuch ${attempt}/${retries}):`, err.message);
      if (attempt === retries) throw err;
    }
  }
}

// Upload-Endpoint
app.post('/api/upload', upload.array('files'), async (req, res) => {
  try {
    const bezirk = req.body.bezirk || "unknown";
    const bkz = req.body.bkz || "unknown";
    let containers = req.body.containers || [];
    if (typeof containers === 'string') containers = [containers];

    await ensureFolderRecursive(ncBasePath);
    const results = [];

    const uploadPromises = req.files.map((f, i) =>
      limit(async () => {
        const container = containers[i] || 'container';
        const ext = path.extname(f.originalname) || '';
        const baseName = `${bezirk}_${bkz}_${container}`;
        let remote = path.posix.join(ncBasePath, baseName + ext);

        if (await client.exists(remote)) {
          const ts = formatTimestamp();
          remote = path.posix.join(ncBasePath, `${baseName}_${ts}${ext}`);
        }

        await uploadFileWithRetry(f.path, remote, 3);

        fs.unlink(f.path, (err) => {
          if (err) console.error("Temp-Datei löschen fehlgeschlagen:", err);
        });

        results.push({ originalName: f.originalname, remotePath: remote });
      })
    );

    await Promise.all(uploadPromises);
    res.json({ ok: true, files: results });

  } catch (err) {
    console.error("Upload-Fehler:", err);
    res.status(500).json({ ok: false, message: err.message });
  }
});

// Server starten
app.listen(PORT, () => console.log(`Backend läuft auf Port ${PORT}`));
