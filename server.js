// ==========================================
// WEB APP ROUTING & ENTRY POINTS (Node.js / Express)
// ==========================================

const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const {
  getAllUsersMap,
  getProvinceForMunicipality,
  getCurrentUserContext,
  isUserAuthorized
} = require('./users');
const {
  authenticateUser,
  changeUserPassword,
  resetUserPassword
} = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Set your deployed Google Apps Script Web App URL here
const GOOGLE_SHEETS_WEBHOOK_URL = process.env.GOOGLE_SHEETS_WEBHOOK_URL || 'https://script.google.com/macros/library/d/1kJ0Np_pJizbzeNvo-xmAz8_quc4LBWZv1IaCdn1KlP6lQKV2LsS9Peib/1';

// Body parser middleware for handling form and JSON submissions
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from 'public' folder (CSS, JS, images, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// Page configuration matching GAS doGet pageConfig mapping
const PAGE_CONFIG = {
  'login':           { files: ['login', 'Login'], title: 'DOLE Employment Program | CALABARZON' },
  'dashboard':       { files: ['Dashboard', 'dashboard', 'GIP', 'gip', 'Index'], title: 'Dashboard | CALABARZON' },
  'mer':             { files: ['mer', 'Mer', 'MER'], title: 'JF MER Summary and Reports | CALABARZON' },
  'jfencoding':      { files: ['JFEncoding', 'JfEncoding', 'jfencoding', 'Encoding', 'encoding'], title: 'JF Encoding | CALABARZON' },
  'nationalreports': { files: ['NationalReports', 'nationalreports', 'National_Reports'], title: 'Job Fair Reports | CALABARZON' },
  'bleforms':        { files: ['BleForms', 'bleforms', 'BLEForms'], title: 'BleForms | CALABARZON' },
  'sprs':            { files: ['BleForms', 'bleforms', 'SPRS', 'sprs'], title: 'SPRS / BleForms | CALABARZON' },
  'index':           { files: ['Index', 'index', 'jobfairs_index', 'JobFairs', 'jobfairs'], title: 'Job Fairs System | CALABARZON' },
  'gip':             { files: ['GIP', 'gip', 'Gip', 'Index', 'index'], title: 'GIP | CALABARZON' },
  'spes':            { files: ['SPES', 'spes', 'Index', 'index'], title: 'SPES | CALABARZON' },
  'jobfairs':        { files: ['jobfairs_index', 'JobFairs', 'Index', 'index'], title: 'Job Fairs System | CALABARZON' }
};

const VIEWS_DIR = path.join(__dirname, 'public');

function getPageHtml(pageName) {
  const cleanName = String(pageName || '').trim().toLowerCase();
  
  const fileMap = {
    'dashboard': ['Dashboard', 'dashboard'],
    'login': ['login', 'Login'],
    'mer': ['mer', 'Mer', 'MER'],
    'jfencoding': ['JFEncoding', 'JfEncoding', 'jfencoding', 'Encoding'],
    'nationalreports': ['NationalReports', 'nationalreports'],
    'bleforms': ['BleForms', 'bleforms'],
    'sprs': ['BleForms', 'bleforms', 'SPRS'],
    'gip': ['GIP', 'gip', 'Gip', 'Index', 'index'],
    'index': ['Index', 'index', 'jobfairs_index', 'JobFairs'],
    'jobfairs': ['jobfairs_index', 'JobFairs', 'Index', 'index']
  };

  const candidates = fileMap[cleanName] || [pageName];
  for (const fileCandidate of candidates) {
    const filename = fileCandidate.endsWith('.html') ? fileCandidate : `${fileCandidate}.html`;
    const filepath = path.join(VIEWS_DIR, filename);
    if (fs.existsSync(filepath)) {
      return fs.readFileSync(filepath, 'utf8');
    }
  }
  throw new Error(`Could not find HTML file for page: ${pageName}`);
}

function tryRenderHtmlOutput(fileNames, title) {
  for (const fileName of fileNames) {
    const candidateName = fileName.endsWith('.html') ? fileName : `${fileName}.html`;
    const filePath = path.join(VIEWS_DIR, candidateName);
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf8');
      if (title && content.includes('<head>')) {
        content = content.replace('<head>', `<head><title>${title}</title><meta name="viewport" content="width=device-width, initial-scale=1">`);
      }
      return content;
    }
  }
  return null;
}

function handleDoGet(req, res) {
  const rawPage = req.query.page ? String(req.query.page).trim() : 'login';
  const cleanPage = rawPage.toLowerCase();

  const target = PAGE_CONFIG[cleanPage] || {
    files: [rawPage, rawPage.toLowerCase()],
    title: 'Job Fair Report System | CALABARZON'
  };

  const output = tryRenderHtmlOutput(target.files, target.title);
  if (output) return res.send(output);

  const loginOutput = tryRenderHtmlOutput(['login', 'Login', 'GIP', 'gip', 'Index'], 'Job Fair Report System | CALABARZON');
  if (loginOutput) return res.send(loginOutput);

  return res.status(404).send(
    `<h3 style="font-family:Arial;padding:40px;">Page Not Found: ${rawPage}<br><br>Available pages: login, dashboard, gip, mer, nationalreports</h3>`
  );
}

// Support root GET parameter ?page=...
app.get('/', handleDoGet);

// Support clean path routing (/login, /dashboard, /mer, etc.)
app.get('/:pageName', (req, res, next) => {
  const pageName = req.params.pageName.toLowerCase();
  if (PAGE_CONFIG[pageName]) {
    req.query.page = pageName;
    return handleDoGet(req, res);
  }
  next();
});

// Helper Page Getters Routes
app.get('/html/:page', (req, res) => {
  try {
    const htmlContent = getPageHtml(req.params.page);
    res.send(htmlContent);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// ==========================================
// API ENDPOINTS (AUTHENTICATION & USER CONTEXT)
// ==========================================

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const result = authenticateUser(username, password);
  res.json(result);
});

app.post('/api/auth/change-password', (req, res) => {
  const { username, currentPassword, newPassword } = req.body;
  const result = changeUserPassword(username, currentPassword, newPassword);
  res.json(result);
});

app.post('/api/auth/reset-password', (req, res) => {
  const { username } = req.body;
  const result = resetUserPassword(username);
  res.json(result);
});

app.get('/api/user/context', (req, res) => {
  const username = req.query.username;
  const context = getCurrentUserContext(username);
  res.json(context);
});

app.get('/api/user/authorized', (req, res) => {
  const email = req.query.email;
  const authorized = isUserAuthorized(email);
  res.json({ email, authorized });
});

app.get('/api/script-url', (req, res) => {
  const fullUrl = `${req.protocol}://${req.get('host')}`;
  res.json({ url: fullUrl });
});

// ==========================================
// API ENDPOINTS (JOB FAIR ENCODING & GOOGLE SHEETS)
// ==========================================

// Fetch records from Google Sheet
app.get('/api/jf/records', async (req, res) => {
  try {
    if (GOOGLE_SHEETS_WEBHOOK_URL.includes('YOUR_GOOGLE_APPS_SCRIPT')) {
      return res.json({ status: 'warning', message: 'Webhook URL not configured yet', records: [] });
    }
    const response = await axios.get(GOOGLE_SHEETS_WEBHOOK_URL);
    res.json({ status: 'success', records: response.data || [] });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message, records: [] });
  }
});

// Save a new Job Fair Encoding Record
app.post('/api/jf/encode', async (req, res) => {
  try {
    const recordData = req.body;
    const response = await axios.post(GOOGLE_SHEETS_WEBHOOK_URL, {
      action: 'create',
      data: recordData
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Update an existing record by row index
app.post('/api/jf/update-record', async (req, res) => {
  try {
    const { rowIndex, data } = req.body;
    const response = await axios.post(GOOGLE_SHEETS_WEBHOOK_URL, {
      action: 'update',
      rowIndex,
      data
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Delete a record by row index
app.post('/api/jf/delete-record', async (req, res) => {
  try {
    const { rowIndex } = req.body;
    const response = await axios.post(GOOGLE_SHEETS_WEBHOOK_URL, {
      action: 'delete',
      rowIndex
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Summary Endpoint
app.get('/api/jf/summary', async (req, res) => {
  try {
    const response = await axios.get(GOOGLE_SHEETS_WEBHOOK_URL);
    const records = Array.isArray(response.data) ? response.data : [];
    
    const summary = {
      totalRecords: records.length,
      byOffice: {}
    };

    records.forEach(rec => {
      const office = rec['FIELD OFFICE'] || rec['Field Office'] || 'UNKNOWN';
      summary.byOffice[office] = (summary.byOffice[office] || 0) + 1;
    });

    res.json({ status: 'success', summary });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ==========================================
// START SERVER (Must be placed at the end)
// ==========================================
app.listen(PORT, () => {
  console.log(`DOLE CALABARZON Server listening on port ${PORT}`);
});
