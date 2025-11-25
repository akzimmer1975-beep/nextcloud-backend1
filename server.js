const express = require('express');
const cors = require("cors");
app.use(cors({
    origin: '*' // erlaubt alle Frontend-Domains
}));
const fileUpload = require('express-fileupload');
const { createClient } = require('webdav');
const path = require('path');

const app = express();
app.use(fileUpload({ createParentPath: true }));
app.use(express.json());

// Read Nextcloud credentials from environment variables
const NEXTCLOUD_URL = process.env.NEXTCLOUD_URL || "https://portal.gdl-jugend.de/remote.php/webdav/Documents/BR%20Wahl%202026/";
const NEXTCLOUD_USER = process.env.NEXTCLOUD_USER || 'USERNAME';
const NEXTCLOUD_PASS = process.env.NEXTCLOUD_PASS || 'PASSWORD';

// Toggle code checking
const USE_CODE = true;
const EXPECTED_CODE = process.env.EXPECTED_CODE || '12345';

const client = createClient(NEXTCLOUD_URL, {
  username: NEXTCLOUD_USER,
  password: NEXTCLOUD_PASS
});

app.post('/upload', async (req, res) => {
  try {
    const { bezirk, bkz, code, dokument } = req.body;
    if (!bezirk || !bkz || !dokument) return res.status(400).json({ ok: false, error: 'bezirk, bkz und dokument erforderlich' });

    if (USE_CODE && EXPECTED_CODE && code !== EXPECTED_CODE) {
      return res.status(401).json({ ok: false, error: 'Falscher Zahlencode' });
    }

    const folderPath = `/${bezirk}/${bkz}`;
    try { await client.createDirectory(folderPath); } catch(e) { /* ignore if exists */ }

    const uploaded = [];
    const existsInfo = [];

    // req.files may have a single file field "datei"
    for (const fieldName in req.files) {
      const file = req.files[fieldName];
      const filename = file.name;
      let targetPath = `${folderPath}/${filename}`;
      const exists = await client.exists(targetPath);
      if (exists) {
        const ts = new Date().toISOString().replace(/[:.\-]/g, '');
        const dot = filename.lastIndexOf('.');
        const namePart = dot > 0 ? filename.substring(0, dot) : filename;
        const ext = dot > 0 ? filename.substring(dot) : '';
        targetPath = `${folderPath}/${namePart}_${ts}${ext}`;
        existsInfo.push({ original: filename, savedAs: targetPath });
      }
      await client.putFileContents(targetPath, file.data, { overwrite: true });
      uploaded.push(targetPath);
    }

    res.json({ ok: true, existsAlready: existsInfo.length > 0, saved: uploaded, info: existsInfo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));

