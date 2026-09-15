// ==========================================
// WEB APP ROUTING & ENTRY POINTS (Node.js / Express)
// ==========================================

const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

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

// Set your deployed Google Apps Script Web App URL here if using Google Sheets
const GOOGLE_SHEETS_WEBHOOK_URL = process.env.GOOGLE_SHEETS_WEBHOOK_URL || '';

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

  const loginOutput = tryRenderHtmlOutput(['login', 'Login', 'GIP', 'gip', 'Index'], 'Job Fair Report System | CALABARZON');
  if (loginOutput) return res.send(loginOutput);

  return res.status(404).send(
    `<h3 style="font-family:Arial;padding:40px;">Page Not Found: ${rawPage}</h3>`
  );
}

app.get('/', handleDoGet);

app.get('/:pageName', (req, res, next) => {
  const pageName = req.params.pageName.toLowerCase();
  if (PAGE_CONFIG[pageName]) {
    req.query.page = pageName;
    return handleDoGet(req, res);
  }
  next();
});

app.get('/html/:page', (req, res) => {
  try {
    res.send(getPageHtml(req.params.page));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// ==========================================
// API ENDPOINTS (AUTHENTICATION)
// ==========================================

app.post('/api/auth/login', (req, res) => {
  res.json(authenticateUser(req.body.username, req.body.password));
});

app.post('/api/auth/change-password', (req, res) => {
  res.json(changeUserPassword(req.body.username, req.body.currentPassword, req.body.newPassword));
});

app.post('/api/auth/reset-password', (req, res) => {
  res.json(resetUserPassword(req.body.username));
});

app.get('/api/user/context', (req, res) => {
  res.json(getCurrentUserContext(req.query.username));
});

app.get('/api/user/authorized', (req, res) => {
  res.json({ email: req.query.email, authorized: isUserAuthorized(req.query.email) });
});

// ==========================================
// JOB FAIR DATABASE MODULE
// ==========================================

const JF_DB_PATH = path.join(__dirname, 'jf_records.json');

function getJfRecords() {
  try {
    if (fs.existsSync(JF_DB_PATH)) {
      return JSON.parse(fs.readFileSync(JF_DB_PATH, 'utf8'));
    }
  } catch (err) {
    console.error("Error reading JF database:", err.message);
  }
  return [];
}

function saveJfRecords(records) {
  try {
    fs.writeFileSync(JF_DB_PATH, JSON.stringify(records, null, 2), 'utf8');
  } catch (err) {
    console.error("Error writing JF database:", err.message);
  }
}

app.get('/api/jf/records', async (req, res) => {
  if (GOOGLE_SHEETS_WEBHOOK_URL) {
    try {
      const response = await axios.get(GOOGLE_SHEETS_WEBHOOK_URL);
      if (response.data && Array.isArray(response.data)) {
        return res.json({ status: 'success', records: response.data });
      }
    } catch (err) {
      console.warn("Sheets fetch error, using JSON file:", err.message);
    }
  }
  res.json({ status: 'success', records: getJfRecords() });
});

app.get('/api/jf/summary', (req, res) => {
  res.json({ status: 'success', records: getJfRecords() });
});

app.post('/api/jf/encode', async (req, res) => {
  try {
    const formData = req.body;
    const records = getJfRecords();
    const now = new Date();

    const dateFiled = formData.dateFiled || formData['DATE FILED'] || '';
    const dateIssued = formData.dateIssued || formData['DATE ISSUED'] || '';
    const dateOfJobFair = formData.dateOfJobFair || formData['DATE OF JOB FAIR'] || '';
    const dateOfEncoding = formData.dateOfEncoding || formData['DATE OF ENCODING'] || now.toISOString().split('T')[0];

    const turnaroundTime = formData.turnaroundTime || formData['TURNAROUND TIME'] || '0 DAY(S)';
    const daysFiledBeforeJF = formData.daysFiledBeforeJF || formData['DAYS FILED BEFORE JF'] || '0 DAY(S)';
    const daysReported = formData.daysReported || formData['DAYS REPORTED'] || '0 DAY(S)';

    const newRecord = {
      rowIndex: Date.now(),
      timestamp: now.toISOString().replace('T', ' ').substring(0, 19),
      year: now.getFullYear().toString(),
      month: formData.reportingPeriod || formData['REPORTING PERIOD'] || "JANUARY",
      province: formData.fieldOffice || formData['FIELD OFFICE'] || "BATANGAS FIELD OFFICE",
      reportingPeriod: formData.reportingPeriod || formData['REPORTING PERIOD'] || "",
      fieldOffice: formData.fieldOffice || formData['FIELD OFFICE'] || "",
      sponsor: formData.sponsor || formData['SPONSOR / ORGANIZER'] || "",
      contactNumber: formData.contactNumber || formData['CONTACT NUMBER'] || "",
      dateOfJobFair,
      dateFiled,
      dateIssued,
      dateOfEncoding,
      turnaroundTime,
      daysFiledBeforeJF,
      daysReported,
      jobFairVenue: formData.jobFairVenue || formData['JOB FAIR VENUE'] || "",
      documentApplied: formData.documentApplied || formData['JOB FAIR DOCUMENT APPLIED'] || "",
      actionTaken: formData.actionTaken || formData['ACTION TAKEN'] || "APPROVED",
      disapprovedReason: formData.disapprovedReason || formData['REASON IF DISAPPROVED'] || "N/A",
      documentNumber: formData.documentNumber || formData['PERMIT / CLEARANCE NO.'] || "",

      // Matching uppercase header keys for Google Sheets
      "REPORTING PERIOD": formData.reportingPeriod || "",
      "FIELD OFFICE": formData.fieldOffice || "",
      "SPONSOR / ORGANIZER": formData.sponsor || "",
      "CONTACT NUMBER": formData.contactNumber || "",
      "DATE OF JOB FAIR": dateOfJobFair,
      "DATE FILED": dateFiled,
      "DATE ISSUED": dateIssued,
      "DATE OF ENCODING": dateOfEncoding,
      "TURNAROUND TIME": turnaroundTime,
      "DAYS FILED BEFORE JF": daysFiledBeforeJF,
      "NO. DAYS FILED BEFORE JF": daysFiledBeforeJF,
      "No. Days Filed before JF": daysFiledBeforeJF,
      "DAYS REPORTED": daysReported,
      "NO. DAYS REPORTED": daysReported,
      "No. days of days reported": daysReported,
      "JOB FAIR VENUE": formData.jobFairVenue || "",
      "JOB FAIR DOCUMENT APPLIED": formData.documentApplied || "",
      "ACTION TAKEN": formData.actionTaken || "APPROVED",
      "REASON IF DISAPPROVED": formData.disapprovedReason || "N/A",
      "PERMIT / CLEARANCE NO.": formData.documentNumber || ""
    };

    records.push(newRecord);
    saveJfRecords(records);

    if (GOOGLE_SHEETS_WEBHOOK_URL) {
      try {
        await axios.post(GOOGLE_SHEETS_WEBHOOK_URL, { action: 'create', data: newRecord });
      } catch (sheetErr) {
        console.warn("Sheets sync warning:", sheetErr.message);
      }
    }

    res.json({ status: 'success', success: true, message: "Job Fair Record saved successfully!" });
  } catch (err) {
    res.status(500).json({ status: 'error', success: false, message: err.message });
  }
});

app.post('/api/jf/update-record', async (req, res) => {
  try {
    const { rowIndex, data } = req.body;
    let records = getJfRecords();
    const targetIndex = rowIndex || (data && data.rowIndex);
    const idx = records.findIndex(r => r.rowIndex == targetIndex);

    if (idx !== -1) {
      records[idx] = { ...records[idx], ...(data || req.body) };
      saveJfRecords(records);

      if (GOOGLE_SHEETS_WEBHOOK_URL) {
        try {
          await axios.post(GOOGLE_SHEETS_WEBHOOK_URL, { action: 'update', rowIndex: targetIndex, data: records[idx] });
        } catch (sheetErr) {}
      }

      return res.json({ status: 'success', success: true, message: "Record updated successfully!" });
    }

    res.status(404).json({ status: 'error', success: false, message: "Record not found." });
  } catch (err) {
    res.status(500).json({ status: 'error', success: false, message: err.message });
  }
});

app.post('/api/jf/delete-record', async (req, res) => {
  try {
    const { rowIndex } = req.body;
    let records = getJfRecords();

    const initialLength = records.length;
    records = records.filter(r => r.rowIndex != rowIndex && r._rowIndex != rowIndex);

    if (records.length < initialLength) {
      saveJfRecords(records);

      if (GOOGLE_SHEETS_WEBHOOK_URL) {
        try {
          await axios.post(GOOGLE_SHEETS_WEBHOOK_URL, { action: 'delete', rowIndex });
        } catch (sheetErr) {}
      }

      return res.json({ status: 'success', success: true, message: "Record deleted successfully!" });
    }

    res.status(404).json({ status: 'error', success: false, message: "Record not found." });
  } catch (err) {
    res.status(500).json({ status: 'error', success: false, message: err.message });
  }
});

// ==========================================
// START SERVER AT THE VERY END
// ==========================================
app.listen(PORT, () => {
  console.log(`DOLE CALABARZON Express Server listening on port ${PORT}`);
});
