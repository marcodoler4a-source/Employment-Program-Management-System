// ==========================================
// WEB APP ROUTING & ENTRY POINTS (Express)
// ==========================================

const express = require('express');
const fs = require('fs');
const path = require('path');
const {
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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

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

  // Final fallback
  const loginOutput = tryRenderHtmlOutput(['login', 'Login', 'GIP', 'gip', 'Index'], 'Job Fair Report System | CALABARZON');
  if (loginOutput) return res.send(loginOutput);

  return res.status(404).send(
    `<h3 style="font-family:Arial;padding:40px;">Page Not Found: ${rawPage}<br><br>Available pages: login, dashboard, gip, mer, nationalreports</h3>`
  );
}

// Route mapping for GET ?page=...
app.get('/', handleDoGet);

// Route mapping for clean URLs like /login, /dashboard
app.get('/:pageName', (req, res, next) => {
  const pageName = req.params.pageName.toLowerCase();
  if (PAGE_CONFIG[pageName]) {
    req.query.page = pageName;
    return handleDoGet(req, res);
  }
  next();
});

// Helper route for raw HTML retrieval
app.get('/html/:page', (req, res) => {
  try {
    const htmlContent = getPageHtml(req.params.page);
    res.send(htmlContent);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// ==========================================
// API ENDPOINTS
// ==========================================

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  res.json(authenticateUser(username, password));
});

app.post('/api/auth/change-password', (req, res) => {
  const { username, currentPassword, newPassword } = req.body;
  res.json(changeUserPassword(username, currentPassword, newPassword));
});

app.post('/api/auth/reset-password', (req, res) => {
  const { username } = req.body;
  res.json(resetUserPassword(username));
});

app.get('/api/user/context', (req, res) => {
  res.json(getCurrentUserContext(req.query.username));
});

app.get('/api/user/authorized', (req, res) => {
  res.json({ email: req.query.email, authorized: isUserAuthorized(req.query.email) });
});

app.listen(PORT, () => {
  console.log(`DOLE CALABARZON Express Server listening on port ${PORT}`);
});


// ==========================================
// JOB FAIR ENCODING & RECORDS BACKEND MODULE
// ==========================================

const fs = require('fs');
const path = require('path');

const JF_DB_PATH = path.join(__dirname, 'jf_records.json');

// Helper: Read persistent records JSON
function getJfRecords() {
  try {
    if (fs.existsSync(JF_DB_PATH)) {
      return JSON.parse(fs.readFileSync(JF_DB_PATH, 'utf8'));
    }
  } catch (err) {
    console.error("Error reading JF database file:", err.message);
  }
  return [];
}

// Helper: Save persistent records JSON
function saveJfRecords(records) {
  try {
    fs.writeFileSync(JF_DB_PATH, JSON.stringify(records, null, 2), 'utf8');
  } catch (err) {
    console.error("Error writing JF database file:", err.message);
  }
}

// API: Get All Records (Tab 3 & Tab 6)
app.get('/api/jf/records', (req, res) => {
  const records = getJfRecords();
  res.json(records);
});

// API: Get JF Summary Data (Tab 2)
app.get('/api/jf/summary', (req, res) => {
  const records = getJfRecords();
  res.json(records);
});

// API: Save New Encoded Record (Tab 1)
app.post('/api/jf/encode', (req, res) => {
  try {
    const formData = req.body;
    const records = getJfRecords();

    const now = new Date();
    const newRecord = {
      rowIndex: Date.now(), // Unique ID / Row Index
      timestamp: now.toISOString().replace('T', ' ').substring(0, 19),
      year: now.getFullYear().toString(),
      month: formData.reportingPeriod || "JANUARY",
      province: formData.fieldOffice || "BATANGAS FIELD OFFICE",
      reportingPeriod: formData.reportingPeriod || "",
      fieldOffice: formData.fieldOffice || "",
      sponsor: formData.sponsor || "",
      contactNumber: formData.contactNumber || "",
      dateOfJobFair: formData.dateOfJobFair || "",
      dateFiled: formData.dateFiled || "",
      dateReceived: formData.dateFiled || "",
      jobFairVenue: formData.jobFairVenue || "",
      documentApplied: formData.documentApplied || "",
      actionTaken: formData.actionTaken || "APPROVED",
      disapprovedReason: formData.disapprovedReason || "N/A",
      documentNumber: formData.documentNumber || "",
      dateIssued: formData.dateIssued || "",
      entitiesOverseas: formData.entitiesOverseas || "0",
      entitiesLocal: formData.entitiesLocal || "0",
      vacanciesOverseas: formData.vacanciesOverseas || "0",
      vacanciesLocal: formData.vacanciesLocal || "0",
      proofReceivedUrl: "",
      proofReleasedUrl: ""
    };

    records.push(newRecord);
    saveJfRecords(records);

    res.json({
      success: true,
      message: "Job Fair Record saved successfully!"
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Update Record (Edit Modal)
app.post('/api/jf/update-record', (req, res) => {
  try {
    const { rowIndex, sponsor, jobFairVenue, dateOfJobFair, dateFiled, dateReceived, documentNumber } = req.body;
    let records = getJfRecords();

    const idx = records.findIndex(r => r.rowIndex == rowIndex);
    if (idx !== -1) {
      if (sponsor) records[idx].sponsor = sponsor;
      if (jobFairVenue) records[idx].jobFairVenue = jobFairVenue;
      if (dateOfJobFair) records[idx].dateOfJobFair = dateOfJobFair;
      if (dateFiled) records[idx].dateFiled = dateFiled;
      if (dateReceived) records[idx].dateReceived = dateReceived;
      if (documentNumber) records[idx].documentNumber = documentNumber;

      saveJfRecords(records);
      return res.json({ success: true, message: "Record updated successfully!" });
    }

    res.status(404).json({ success: false, message: "Record not found." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Delete Record (Delete Modal)
app.post('/api/jf/delete-record', (req, res) => {
  try {
    const { rowIndex } = req.body;
    let records = getJfRecords();

    const initialLength = records.length;
    records = records.filter(r => r.rowIndex != rowIndex);

    if (records.length < initialLength) {
      saveJfRecords(records);
      return res.json({ success: true, message: "Record deleted successfully!" });
    }

    res.status(404).json({ success: false, message: "Record not found." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Get KFS Timeline Breakdown (Tab 4)
app.get('/api/jf/tab4-breakdown', (req, res) => {
  try {
    const records = getJfRecords();
    const clearanceRecords = [];
    const permitRecords = [];

    records.forEach(r => {
      const doc = (r.documentApplied || "").toUpperCase();
      let days = null;

      if (r.dateFiled && r.dateIssued) {
        const d1 = new Date(r.dateFiled);
        const d2 = new Date(r.dateIssued);
        if (!isNaN(d1) && !isNaN(d2)) {
          days = Math.max(0, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
        }
      }

      const item = {
        month: r.reportingPeriod || r.month || "JANUARY",
        year: r.year || "2026",
        province: r.fieldOffice || r.province || "BATANGAS",
        actionTaken: r.actionTaken || "APPROVED",
        clearanceNo: r.documentNumber || "",
        documentNumber: r.documentNumber || "",
        days: days
      };

      if (doc.includes("PERMIT")) {
        permitRecords.push(item);
      } else {
        clearanceRecords.push(item);
      }
    });

    res.json({
      success: true,
      clearanceRecords,
      permitRecords
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

