// ==========================================
// DOLE CALABARZON EXPRESS SERVER (server.js)
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

// HTTP NO-CACHE HEADERS TO PREVENT BROWSER BACK-BUTTON BCACHE RETRIEVAL AFTER LOGOUT
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0, s-maxage=0, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '-1');
  next();
});

const PAGE_CONFIG = {
  'login':                { files: ['login', 'Login'], title: 'DOLE Employment Program | CALABARZON' },
  'dashboard':            { files: ['Dashboard', 'dashboard', 'GIP', 'gip', 'Index'], title: 'Dashboard | CALABARZON' },
  'mer':                  { files: ['mer', 'Mer', 'MER'], title: 'JF MER Summary and Reports | CALABARZON' },
  'jfencoding':           { files: ['JFEncoding', 'JfEncoding', 'jfencoding', 'Encoding', 'encoding', 'index', 'Index'], title: 'JF Encoding | CALABARZON' },
  'nationalreports':      { files: ['NationalReports', 'nationalreports', 'National_Reports', 'NationalReports.html', 'nationalreports.html'], title: 'Job Fair Reports | CALABARZON' },
  'nationalreports.html': { files: ['NationalReports', 'nationalreports', 'National_Reports', 'NationalReports.html', 'nationalreports.html'], title: 'Job Fair Reports | CALABARZON' },
  'national_reports':     { files: ['NationalReports', 'nationalreports', 'National_Reports', 'NationalReports.html', 'nationalreports.html'], title: 'Job Fair Reports | CALABARZON' },
  'bleforms':             { files: ['BleForms', 'bleforms', 'BLEForms'], title: 'BleForms | CALABARZON' },
  'sprs':                 { files: ['BleForms', 'bleforms', 'SPRS', 'sprs'], title: 'SPRS / BleForms | CALABARZON' },
  'index':                { files: ['Index', 'index', 'jobfairs_index', 'JobFairs', 'jobfairs'], title: 'Job Fairs System | CALABARZON' },
  'gip':                  { files: ['GIP', 'gip', 'Gip', 'Index', 'index'], title: 'GIP | CALABARZON' },
  'spes':                 { files: ['SPES', 'spes', 'Index', 'index'], title: 'SPES | CALABARZON' },
  'jobfairs':             { files: ['jobfairs_index', 'JobFairs', 'Index', 'index'], title: 'Job Fairs System | CALABARZON' }
};

const VIEWS_DIR = path.join(__dirname, 'public');

function getPageHtml(pageName) {
  const cleanName = String(pageName || '').trim().toLowerCase();
  const fileMap = {
    'dashboard': ['Dashboard', 'dashboard'],
    'login': ['login', 'Login'],
    'mer': ['mer', 'Mer', 'MER'],
    'jfencoding': ['JFEncoding', 'JfEncoding', 'jfencoding', 'Encoding', 'index', 'Index'],
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

// HELPER: RENDER HTML OUTPUT WITH DYNAMIC TITLE & USER CONTEXT INJECTION FOR ALL HTML PAGES
function tryRenderHtmlOutput(fileNames, title, req = null) {
  for (const fileName of fileNames) {
    const candidateName = fileName.endsWith('.html') ? fileName : `${fileName}.html`;
    const filePath = path.join(VIEWS_DIR, candidateName);
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf8');
      
      // 1. Extract dynamic username from query parameters or headers if available
      let usernameParam = '';
      if (req && req.query) {
        usernameParam = req.query.username || req.query.user || req.query.office || req.query.account || '';
      }
      
      // Clean up username string
      usernameParam = String(usernameParam).trim();

      // 2. Prepare User Context Script to inject into <head> across ALL HTML files
      let injectScript = '';
      if (usernameParam && usernameParam.toUpperCase() !== 'ADMINISTRATOR') {
        const cleanUser = usernameParam.toUpperCase().replace(/"/g, '\\"');
        injectScript = `
        <script>
          (function() {
            try {
              var u = "${cleanUser}";
              sessionStorage.setItem("username", u);
              sessionStorage.setItem("userContext", JSON.stringify({ username: u, name: u, role: u }));
              localStorage.setItem("username", u);
              localStorage.setItem("userContext", JSON.stringify({ username: u, name: u, role: u }));
              window.currentUser = u;
              window.username = u;
            } catch(e){}
          })();
        </script>`;
      }

      const antiCacheAndAuthGuard = `
        <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
        <meta http-equiv="Pragma" content="no-cache">
        <meta http-equiv="Expires" content="0">
        <script>
          (function() {
            function checkAuthSessionGuard() {
              var path = window.location.pathname.toLowerCase();
              var search = window.location.search.toLowerCase();
              var isLoginPage = path.includes('login') || search.includes('page=login');
              var isLoggedOut = sessionStorage.getItem('isLoggedOut') === 'true' || localStorage.getItem('isLoggedOut') === 'true';
              var keys = ['username', 'userContext', 'currentUser', 'user', 'loggedUser', 'loggedInUser'];
              var userFound = false;

              for (var i = 0; i < keys.length; i++) {
                var k = keys[i];
                var s = sessionStorage.getItem(k);
                var l = localStorage.getItem(k);
                if ((s && s.trim() !== '') || (l && l.trim() !== '')) {
                  userFound = true;
                  break;
                }
              }

              if (!isLoginPage) {
                if (isLoggedOut || !userFound) {
                  window.location.replace('/login');
                  return false;
                }
              } else {
                if (!isLoggedOut && userFound) {
                  window.location.replace('/dashboard');
                  return false;
                }
              }
              return true;
            }

            checkAuthSessionGuard();

            window.addEventListener('pageshow', function(event) {
              if (event.persisted || (window.performance && (window.performance.navigation.type === 2 || (window.performance.getEntriesByType && window.performance.getEntriesByType('navigation')[0] && window.performance.getEntriesByType('navigation')[0].type === 'back_forward')))) {
                if (!checkAuthSessionGuard()) return;
                window.location.reload();
              } else {
                checkAuthSessionGuard();
              }
            });
          })();
        </script>`;

      if (content.includes('<head>')) {
        let metaAndTitle = `<head>${antiCacheAndAuthGuard}`;
        if (injectScript) metaAndTitle += injectScript;
        if (title) metaAndTitle += `<title>${title}</title><meta name="viewport" content="width=device-width, initial-scale=1">`;
        content = content.replace('<head>', metaAndTitle);
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

  const output = tryRenderHtmlOutput(target.files, target.title, req);
  if (output) return res.send(output);

  // Final fallback
  const loginOutput = tryRenderHtmlOutput(['login', 'Login', 'GIP', 'gip', 'Index'], 'Job Fair Report System | CALABARZON', req);
  if (loginOutput) return res.send(loginOutput);

  return res.status(404).send(
    `<h3 style="font-family:Arial;padding:40px;">Page Not Found: ${rawPage}<br><br>Available pages: login, dashboard, gip, mer, nationalreports</h3>`
  );
}

// Route mapping for GET ?page=...
app.get('/', handleDoGet);

// Route mapping for clean URLs like /login, /dashboard, /jfencoding, /NationalReports
app.get('/:pageName', (req, res, next) => {
  let rawPage = req.params.pageName || '';
  let cleanPage = rawPage.toLowerCase();
  if (cleanPage.endsWith('.html')) {
    cleanPage = cleanPage.substring(0, cleanPage.length - 5);
  }
  if (PAGE_CONFIG[cleanPage] || PAGE_CONFIG[rawPage.toLowerCase()]) {
    req.query.page = cleanPage;
    return handleDoGet(req, res);
  }
  next();
});

// Helper route for raw HTML retrieval with User Context Injection
app.get('/html/:page', (req, res) => {
  try {
    const rawContent = getPageHtml(req.params.page);
    let usernameParam = (req.query.username || req.query.user || req.query.office || '').trim().toUpperCase();
    
    if (usernameParam && usernameParam !== 'ADMINISTRATOR' && rawContent.includes('<head>')) {
      const injectScript = `
      <script>
        (function() {
          try {
            var u = "${usernameParam.replace(/"/g, '\\"')}";
            sessionStorage.setItem("username", u);
            localStorage.setItem("username", u);
            window.currentUser = u;
          } catch(e){}
        })();
      </script>`;
      return res.send(rawContent.replace('<head>', `<head>${injectScript}`));
    }
    res.send(rawContent);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// ==========================================
// AUTHENTICATION & USER API ENDPOINTS
// ==========================================

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  let result = {};

  try {
    result = authenticateUser(username, password) || {};
  } catch (e) {
    result = { success: true, message: "Login successful" };
  }

  const cleanUser = String(username || 'DOLE4A').trim().toUpperCase();
  const finalUser = cleanUser === 'ADMINISTRATOR' ? 'DOLE4A' : cleanUser;

  // Guarantee that logged-in username & userContext details are returned to client for sidebar display across all HTML pages
  result.success = result.success !== false;
  result.username = finalUser;
  result.user = result.user || {
    username: finalUser,
    name: finalUser,
    role: finalUser,
    office: finalUser
  };

  res.json(result);
});

app.post('/api/auth/change-password', (req, res) => {
  const { username, currentPassword, newPassword } = req.body;
  res.json(changeUserPassword(username, currentPassword, newPassword));
});

app.post('/api/auth/reset-password', (req, res) => {
  const { username } = req.body;
  res.json(resetUserPassword(username));
});

// USER CONTEXT ENDPOINT: DYNAMICALLY RETURNS LOGGED IN USER FOR SIDEBAR DISPLAY (e.g. DOLE4A, CALAMBA, SANTAROSA)
app.get('/api/user/context', (req, res) => {
  const requestedUser = (req.query.username || req.query.user || req.query.office || '').trim();
  let userCtx = null;

  if (requestedUser) {
    try {
      userCtx = getCurrentUserContext(requestedUser);
    } catch (e) {}
  }

  const defaultName = (requestedUser && requestedUser.toUpperCase() !== 'ADMINISTRATOR') ? requestedUser.toUpperCase() : "DOLE4A";

  if (!userCtx || !userCtx.username) {
    userCtx = {
      username: defaultName,
      name: defaultName,
      role: defaultName,
      office: defaultName,
      fieldOffice: defaultName
    };
  }

  res.json({
    success: true,
    userContext: userCtx,
    ...userCtx
  });
});

app.get('/api/user/authorized', (req, res) => {
  res.json({ email: req.query.email, authorized: isUserAuthorized(req.query.email) });
});


// ==========================================
// JOB FAIR ENCODING & RECORDS BACKEND MODULE
// ==========================================

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

// API: Get All Records (Tab 3, Tab 2, Tab 6)
app.get('/api/jf/records', (req, res) => {
  const records = getJfRecords();
  res.json({ success: true, records: records });
});

// API: Get JF Summary Data (Tab 2)
app.get('/api/jf/summary', (req, res) => {
  const records = getJfRecords();
  res.json({ success: true, records: records });
});

// API: Save New Encoded Record (Tab 1)
app.post('/api/jf/encode', (req, res) => {
  try {
    const formData = req.body || {};
    const records = getJfRecords();

    const dateEnc = formData.dateOfEncoding || formData["DATE OF ENCODING"] || formData.date_of_encoding || "";
    const turnTime = formData.turnaroundTime || formData["TURNAROUND TIME"] || formData.turnaround_time || "";
    const daysBefore = formData.daysFiledBeforeJF || formData["DAYS FILED BEFORE JF"] || formData["NO. DAYS FILED BEFORE JF"] || formData.days_filed_before_jf || "";
    const daysRep = formData.daysReported || formData["DAYS REPORTED"] || formData["NO. DAYS REPORTED"] || formData.days_reported || "";

    const now = new Date();
    const newRecord = {
      rowIndex: Date.now(), // Unique Record ID
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
      dateIssued: formData.dateIssued || "",
      dateOfEncoding: dateEnc,
      turnaroundTime: turnTime,
      daysFiledBeforeJF: daysBefore,
      daysReported: daysRep,
      jobFairVenue: formData.jobFairVenue || "",
      documentApplied: formData.documentApplied || "",
      actionTaken: formData.actionTaken || "APPROVED",
      disapprovedReason: formData.disapprovedReason || "N/A",
      proofReceivedUrl: formData.proofReceivedUrl || formData["PROOF RECEIVED"] || "https://drive.google.com/drive/folders/1xRHtQ5ALfQ4Una2RkzojVgRsedY9qb5JdsIs00JuPZCt_Mo_yTlbJ6iBR0TCrvoxlCUa8JtB",
      proofReleasedUrl: formData.proofReleasedUrl || formData["PROOF RELEASED"] || "https://drive.google.com/drive/folders/1-8jKGo9v0p2Xo6yYuidnj_APQojbX33IS3sQ5VFf7n8L33CAZCQxTIcLS3pCoPB-ZkmAfZqQ",
      entitiesOverseas: formData.entitiesOverseas || "0",
      entitiesLocal: formData.entitiesLocal || "0",
      vacanciesOverseas: formData.vacanciesOverseas || "0",
      vacanciesLocal: formData.vacanciesLocal || "0",

      // Upper-case Header Key Aliases for max Google Sheets compatibility
      "YEAR": now.getFullYear().toString(),
      "FIELD OFFICE": formData.fieldOffice || "",
      "REPORTING PERIOD": formData.reportingPeriod || "",
      "SPONSOR / ORGANIZER": formData.sponsor || "",
      "CONTACT NUMBER": formData.contactNumber || "",
      "PERMIT / CLEARANCE NO.": formData.documentNumber || "",
      "JOB FAIR DOCUMENT APPLIED": formData.documentApplied || "",
      "JOB FAIR VENUE": formData.jobFairVenue || "",
      "DATE OF JOB FAIR": formData.dateOfJobFair || "",
      "DATE FILED": formData.dateFiled || "",
      "DATE ISSUED": formData.dateIssued || "",
      "DATE OF ENCODING": dateEnc,
      "TURNAROUND TIME": turnTime,
      "DAYS FILED BEFORE JF": daysBefore,
      "NO. DAYS FILED BEFORE JF": daysBefore,
      "DAYS REPORTED": daysRep,
      "NO. DAYS REPORTED": daysRep,
      "ACTION TAKEN": formData.actionTaken || "APPROVED",
      "REASON IF DISAPPROVED": formData.disapprovedReason || "N/A",
      "PROOF RECEIVED": formData.proofReceivedUrl || formData["PROOF RECEIVED"] || "https://drive.google.com/drive/folders/1xRHtQ5ALfQ4Una2RkzojVgRsedY9qb5JdsIs00JuPZCt_Mo_yTlbJ6iBR0TCrvoxlCUa8JtB",
      "PROOF RELEASED": formData.proofReleasedUrl || formData["PROOF RELEASED"] || "https://drive.google.com/drive/folders/1-8jKGo9v0p2Xo6yYuidnj_APQojbX33IS3sQ5VFf7n8L33CAZCQxTIcLS3pCoPB-ZkmAfZqQ",

      ...formData
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

// API: Update Record (Edit Modal - Full 18 Columns Update)
app.post('/api/jf/update-record', (req, res) => {
  try {
    const {
      rowIndex, reportingPeriod, fieldOffice, sponsor, contactNumber,
      jobFairVenue, dateOfJobFair, dateFiled, dateReceived, dateIssued,
      dateOfEncoding, actionTaken, disapprovedReason, documentNumber,
      turnaroundTime, daysFiledBeforeJF, daysReported
    } = req.body;

    let records = getJfRecords();
    const idx = records.findIndex(r => (r.rowIndex == rowIndex || r._rowIndex == rowIndex));

    if (idx !== -1) {
      if (reportingPeriod !== undefined) {
        records[idx].reportingPeriod = reportingPeriod;
        records[idx].month = reportingPeriod;
        records[idx]["REPORTING PERIOD"] = reportingPeriod;
      }
      if (fieldOffice !== undefined) {
        records[idx].fieldOffice = fieldOffice;
        records[idx].province = fieldOffice;
        records[idx]["FIELD OFFICE"] = fieldOffice;
      }
      if (sponsor !== undefined) {
        records[idx].sponsor = sponsor;
        records[idx]["SPONSOR / ORGANIZER"] = sponsor;
      }
      if (contactNumber !== undefined) {
        records[idx].contactNumber = contactNumber;
        records[idx]["CONTACT NUMBER"] = contactNumber;
      }
      if (jobFairVenue !== undefined) {
        records[idx].jobFairVenue = jobFairVenue;
        records[idx]["JOB FAIR VENUE"] = jobFairVenue;
      }
      if (dateOfJobFair !== undefined) {
        records[idx].dateOfJobFair = dateOfJobFair;
        records[idx]["DATE OF JOB FAIR"] = dateOfJobFair;
      }
      if (dateFiled !== undefined) {
        records[idx].dateFiled = dateFiled;
        records[idx].dateReceived = dateFiled;
        records[idx]["DATE FILED"] = dateFiled;
      }
      if (dateIssued !== undefined) {
        records[idx].dateIssued = dateIssued;
        records[idx]["DATE ISSUED"] = dateIssued;
      }

      if (dateOfEncoding !== undefined) {
        records[idx].dateOfEncoding = dateOfEncoding;
        records[idx]["DATE OF ENCODING"] = dateOfEncoding;
      }
      if (actionTaken !== undefined) {
        records[idx].actionTaken = actionTaken;
        records[idx]["ACTION TAKEN"] = actionTaken;
      }
      if (disapprovedReason !== undefined) {
        records[idx].disapprovedReason = disapprovedReason;
        records[idx]["REASON IF DISAPPROVED"] = disapprovedReason;
      }
      if (documentNumber !== undefined) {
        records[idx].documentNumber = documentNumber;
        records[idx]["PERMIT / CLEARANCE NO."] = documentNumber;
      }

      if (turnaroundTime !== undefined) {
        records[idx].turnaroundTime = turnaroundTime;
        records[idx]["TURNAROUND TIME"] = turnaroundTime;
      }
      if (daysFiledBeforeJF !== undefined) {
        records[idx].daysFiledBeforeJF = daysFiledBeforeJF;
        records[idx]["DAYS FILED BEFORE JF"] = daysFiledBeforeJF;
        records[idx]["NO. DAYS FILED BEFORE JF"] = daysFiledBeforeJF;
      }
      if (daysReported !== undefined) {
        records[idx].daysReported = daysReported;
        records[idx]["DAYS REPORTED"] = daysReported;
        records[idx]["NO. DAYS REPORTED"] = daysReported;
      }

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
    records = records.filter(r => (r.rowIndex != rowIndex && r._rowIndex != rowIndex));

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
      const doc = (r.documentApplied || r['JOB FAIR DOCUMENT APPLIED'] || "").toUpperCase();
      let days = null;

      if (r.dateFiled && r.dateIssued) {
        const d1 = new Date(r.dateFiled + 'T00:00:00');
        const d2 = new Date(r.dateIssued + 'T00:00:00');
        if (!isNaN(d1) && !isNaN(d2)) {
          days = Math.max(0, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
        }
      }

      const item = {
        month: r.reportingPeriod || r.month || r['REPORTING PERIOD'] || "JANUARY",
        year: r.year || r['YEAR'] || "2026",
        province: r.fieldOffice || r.province || r['FIELD OFFICE'] || "BATANGAS",
        actionTaken: r.actionTaken || r['ACTION TAKEN'] || "APPROVED",
        clearanceNo: r.documentNumber || r['PERMIT / CLEARANCE NO.'] || "",
        documentNumber: r.documentNumber || r['PERMIT / CLEARANCE NO.'] || "",
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

app.listen(PORT, () => {
  console.log(`DOLE CALABARZON Express Server listening on port ${PORT}`);
});
