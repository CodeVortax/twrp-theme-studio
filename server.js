// server.js
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'src')));

// Serve theme XML files statically
app.use('/theme', express.static(path.join(__dirname, 'theme')));

// Endpoint to save updated XML and images
app.post('/save', (req, res) => {
  const { xmlFiles, images } = req.body; // xmlFiles: {path: content}
  try {
    // Write each XML file
    for (const [relPath, content] of Object.entries(xmlFiles)) {
      const absPath = path.join(__dirname, relPath);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, content, 'utf8');
    }
    // Save images (base64 data URLs)
    for (const [relPath, dataUrl] of Object.entries(images)) {
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
      const buffer = Buffer.from(base64, 'base64');
      const absPath = path.join(__dirname, relPath);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, buffer);
    }
    // Auto-commit using git (assuming git is available)
    const execSync = require('child_process').execSync;
    execSync('git add .', { cwd: __dirname });
    execSync('git commit -m "Theme edited via TWRP Theme Studio"', { cwd: __dirname });
    // Push (may require auth setup)
    try {
      execSync('git push', { cwd: __dirname, stdio: 'ignore' });
    } catch (e) {
      // ignore push errors if no remote
    }
    res.json({ status: 'ok' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`TWRP Theme Studio server running at http://localhost:${PORT}`);
});
