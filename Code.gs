/**
 * Jira → Dev Capacity Tracker status sync (Timak tab)
 *
 * Every 5 minutes: reads the card links above the red line on the "Timak" tab,
 * asks Jira for each card's status + flag, and updates ONLY column I (Current Status).
 * Nothing else is touched: no pod, points, Final Status, Comments, or anything at/below the red line.
 *
 * One-time setup:
 *  1. Project Settings (gear icon) → Script Properties → add:
 *       SPREADSHEET_ID = <tracker spreadsheet id>
 *       SHEET_NAME     = <your tab name, default "Timak">
 *       JIRA_BASE      = https://<your-site>.atlassian.net
 *       JIRA_EMAIL     = <your Atlassian email>
 *       JIRA_TOKEN     = <your Atlassian API token>
 *  2. Run setup() once and approve the permissions prompt.
 */

const CONFIG = {
  // Set these in Project Settings → Script Properties (kept out of the code so the repo has no private IDs)
  SPREADSHEET_ID: PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID'),
  SHEET_NAME: PropertiesService.getScriptProperties().getProperty('SHEET_NAME') || 'Timak',
  JIRA_BASE: PropertiesService.getScriptProperties().getProperty('JIRA_BASE'),
  FLAG_FIELD: 'customfield_10138',
  FIRST_ROW: 3,          // first card row (row 2 holds totals/formulas)
  CARD_COL: 7,           // G – card links
  STATUS_COL: 9,         // I – Current Status
  RED_LINE_TEXT: 'PLEASE DO NOT EDIT ABOVE THIS LINE',
  MINUTES: 5,
};

// Jira status → sheet dropdown value. Statuses not listed here are left unchanged.
const STATUS_MAP = {
  'planning': 'Planning',
  'ready': 'Ready',
  'in progress': 'In Progress',
  'internal review': 'Internal Review',
  'acceptance': 'Acceptance',
  'done': 'Done',
  'cancelled': 'Removed',
};

/** Run once: creates the 5-minute trigger (removes any old copy first) and does a first sync. */
function setup() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'syncStatuses')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncStatuses').timeBased().everyMinutes(CONFIG.MINUTES).create();
  syncStatuses();
}

/** Remove the automatic sync. */
function stopSync() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'syncStatuses')
    .forEach(t => ScriptApp.deleteTrigger(t));
}

function syncStatuses() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) throw new Error('Tab not found: ' + CONFIG.SHEET_NAME);

    const lastRow = sheet.getLastRow();
    if (lastRow < CONFIG.FIRST_ROW) return;
    const numRows = lastRow - CONFIG.FIRST_ROW + 1;
    const links = sheet.getRange(CONFIG.FIRST_ROW, CONFIG.CARD_COL, numRows, 1).getValues();

    // Stop at the red line – never touch it or anything below.
    let redIdx = links.findIndex(r => String(r[0]).indexOf(CONFIG.RED_LINE_TEXT) !== -1);
    if (redIdx === -1) throw new Error('Red line not found in column G – aborting so nothing below it is touched.');
    if (redIdx === 0) return;

    const statuses = sheet.getRange(CONFIG.FIRST_ROW, CONFIG.STATUS_COL, redIdx, 1).getValues();

    // Collect card keys per row
    const rows = []; // {row, key, current}
    for (let i = 0; i < redIdx; i++) {
      const m = String(links[i][0]).match(/browse\/([A-Z][A-Z0-9]+-\d+)/i);
      if (m) rows.push({ row: CONFIG.FIRST_ROW + i, key: m[1].toUpperCase(), current: statuses[i][0] });
    }
    if (!rows.length) return;

    const jira = fetchJiraStates_(rows.map(r => r.key));

    let changed = 0;
    rows.forEach(r => {
      if (r.current === 'Removed') return; // marked removed from the sprint – leave for Timak to move below the red line
      const info = jira[r.key];
      if (!info) return; // card not found / no access – leave as is
      const target = sheetStatus_(info);
      if (target && target !== r.current) {
        sheet.getRange(r.row, CONFIG.STATUS_COL).setValue(target);
        changed++;
      }
    });
    if (changed) console.log('Updated ' + changed + ' status cell(s).');
  } finally {
    lock.releaseLock();
  }
}

/** Flagged wins over the workflow status, except for finished/cancelled cards. */
function sheetStatus_(info) {
  const s = info.status.toLowerCase();
  if (info.flagged && s !== 'done' && s !== 'cancelled') return 'Flagged';
  return STATUS_MAP[s] || null;
}

function fetchJiraStates_(keys) {
  const props = PropertiesService.getScriptProperties();
  const email = props.getProperty('JIRA_EMAIL');
  const token = props.getProperty('JIRA_TOKEN');
  if (!email || !token) throw new Error('Set JIRA_EMAIL and JIRA_TOKEN in Project Settings → Script Properties.');
  const auth = 'Basic ' + Utilities.base64Encode(email + ':' + token);

  const out = {};
  for (let i = 0; i < keys.length; i += 50) {
    const batch = [...new Set(keys.slice(i, i + 50))];
    const res = UrlFetchApp.fetch(CONFIG.JIRA_BASE + '/rest/api/3/search/jql', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: auth, Accept: 'application/json' },
      payload: JSON.stringify({
        jql: 'key in (' + batch.join(',') + ')',
        fields: ['status', CONFIG.FLAG_FIELD],
        maxResults: 100,
      }),
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() !== 200) {
      throw new Error('Jira ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
    }
    (JSON.parse(res.getContentText()).issues || []).forEach(issue => {
      const flag = issue.fields[CONFIG.FLAG_FIELD];
      out[issue.key] = {
        status: issue.fields.status.name,
        flagged: Array.isArray(flag) && flag.length > 0,
      };
    });
  }
  return out;
}
