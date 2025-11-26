require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { createClient } = require("webdav");
const path = require('path');
const fs = require('fs');
const pLimit = require("p-limit").default;

const upload = multer({ dest: '/tmp/uploads' });
const app = express();
const PORT = process.env.PORT || 3000;

app.use(require('cors')());
app.use(express.json());

const ncUrl = process.env.NEXTCLOUD_URL;
const ncUser = process.env.NEXTCLOUD_USER;
const ncPass = process.env.NEXTCLOUD_PASSWORD;
const ncBasePath = process.env.NEXTCLOUD_BASE_PATH || "/";

const client = createClient(ncUrl, { username: ncUser, password: ncPass });

// Limit für parallele Uploads
const limit = pLimit(3);

async function ensureFolder(folderPath) {
  const exists = await client.exists(folderPath);
  if (!exists) await client.createDirectory(folderPath);
}

function formatTimestamp(d = new Date()) {
  const z = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}${z(d.getMonth()+1)}${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
}

// Upload mit Retry
async function uploadFileWithRetry(remotePath, localPath, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await client.putFileContents(remotePath, fs.createReadStream(localPath), { overwrite: false });
      console.log("Upload erfolgreich:", remotePath);
      return;
    } catch (err) {
      console.warn(`Upload fehlgeschlagen (Versuch ${i+1}/${retries}):`, err.message);
      if (i === retries - 1) throw err;
    }
  }
}

app.post('/api/upload', upload.array('files'), async (req, res) => {
  try {
    const bezirk = req.body.bezirk || "unknown";
    const bkz = req.body.bkz || "unknown";
    let containers = req.body.containers || [];
    if (typeof containers === 'string') containers = [containers];

    await ensureFolder(ncBasePath);
    const results = [];

    const uploadTasks = req.files.map((f, i) => limit(async () => {
      const container = containers[i] || 'container';
      const ext = path.extname(f.originalname) || '';
      const baseName = `${bezirk}_${bkz}_${container}`;
      let remote = path.posix.join(ncBasePath, baseName + ext);

      const exists = await client.exists(remote);
      if (exists) {
        const ts = formatTimestamp();
        remote = path.posix.join(ncBasePath, `${baseName}_${ts}${ext}`);
      }

      await uploadFileWithRetry(remote, f.path);
      fs.unlinkSync(f.path);

      results.push({ originalName: f.originalname, remotePath: remote });
    }));

    await Promise.all(uploadTasks);

    res.json({ ok: true, files: results });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

app.listen(PORT, () => console.log("Backend läuft auf Port", PORT));
