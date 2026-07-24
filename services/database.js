const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const database = new DatabaseSync(path.join(DATA_DIR, 'analysis.sqlite'));

database.exec(`
  CREATE TABLE IF NOT EXISTS analyses (
    id TEXT PRIMARY KEY,
    client_id TEXT,
    profile_url TEXT NOT NULL,
    profile_json TEXT,
    status TEXT NOT NULL,
    content_status TEXT NOT NULL DEFAULT 'processing',
    answers_json TEXT,
    error_status TEXT NOT NULL DEFAULT 'waiting',
    error_analysis_json TEXT,
    funnel_plan_json TEXT,
    growth_plan_json TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    error_message TEXT
  );
  CREATE TABLE IF NOT EXISTS reels (
    analysis_id TEXT NOT NULL, reel_index INTEGER NOT NULL, reel_id TEXT, reel_json TEXT NOT NULL,
    PRIMARY KEY (analysis_id, reel_index)
  );
  CREATE TABLE IF NOT EXISTS analysis_events (
    id INTEGER PRIMARY KEY, analysis_id TEXT NOT NULL, created_at TEXT NOT NULL, event TEXT NOT NULL, details_json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS lead_requests (
    id TEXT PRIMARY KEY, analysis_id TEXT NOT NULL, payload_json TEXT NOT NULL,
    status TEXT NOT NULL, error_message TEXT, created_at TEXT NOT NULL
  );
`);

function addColumn(name, definition) {
  const columns = database.prepare('PRAGMA table_info(analyses)').all().map(column => column.name);
  if (!columns.includes(name)) database.exec(`ALTER TABLE analyses ADD COLUMN ${name} ${definition}`);
}

addColumn('content_status', "TEXT NOT NULL DEFAULT 'processing'");
addColumn('client_id', 'TEXT');
addColumn('answers_json', 'TEXT');
addColumn('error_status', "TEXT NOT NULL DEFAULT 'waiting'");
addColumn('error_analysis_json', 'TEXT');
addColumn('funnel_plan_json', 'TEXT');
addColumn('growth_plan_json', 'TEXT');
database.exec("UPDATE analyses SET content_status='ready' WHERE profile_json IS NOT NULL AND content_status='processing'");

function createAnalysis(id, profileUrl, clientId) {
  database.prepare('INSERT INTO analyses (id, client_id, profile_url, status, content_status, error_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, clientId, profileUrl, 'processing', 'processing', 'waiting', new Date().toISOString());
}

function findClientAnalysis(clientId, profileUrl) {
  if (!clientId) return null;
  const row = database.prepare('SELECT id FROM analyses WHERE client_id=? AND profile_url=? ORDER BY created_at DESC LIMIT 1').get(clientId, profileUrl);
  return row ? getAnalysis(row.id) : null;
}

function recordEvent(analysisId, event, details) {
  database.prepare('INSERT INTO analysis_events (analysis_id, created_at, event, details_json) VALUES (?, ?, ?, ?)')
    .run(analysisId, new Date().toISOString(), event, JSON.stringify(details));
}

function saveContent(analysisId, profile, reels) {
  database.prepare('UPDATE analyses SET profile_json=?, status=?, content_status=?, error_message=NULL WHERE id=?')
    .run(JSON.stringify(profile), 'content_ready', 'ready', analysisId);
  database.prepare('DELETE FROM reels WHERE analysis_id=?').run(analysisId);
  const insert = database.prepare('INSERT INTO reels (analysis_id, reel_index, reel_id, reel_json) VALUES (?, ?, ?, ?)');
  reels.forEach((reel, index) => insert.run(analysisId, index, reel.id || null, JSON.stringify(reel)));
}

function saveAnswers(analysisId, answers) {
  database.prepare('UPDATE analyses SET answers_json=? WHERE id=?').run(JSON.stringify(answers), analysisId);
}

function claimErrorAnalysis(analysisId) {
  const result = database.prepare("UPDATE analyses SET error_status='processing' WHERE id=? AND content_status='ready' AND answers_json IS NOT NULL AND error_status='waiting'").run(analysisId);
  return result.changes === 1;
}

function saveErrorAnalysis(analysisId, report) {
  database.prepare("UPDATE analyses SET error_status='ready', error_analysis_json=?, status='completed', completed_at=? WHERE id=?")
    .run(JSON.stringify(report), new Date().toISOString(), analysisId);
}

function saveFunnelPlan(analysisId, plan) {
  database.prepare('UPDATE analyses SET funnel_plan_json=?, growth_plan_json=NULL WHERE id=?').run(JSON.stringify(plan), analysisId);
}

function saveGrowthPlan(analysisId, plan) {
  database.prepare('UPDATE analyses SET growth_plan_json=? WHERE id=?').run(JSON.stringify(plan), analysisId);
}

function saveLeadRequest(id, analysisId, payload, status, errorMessage = null) {
  database.prepare('INSERT INTO lead_requests (id, analysis_id, payload_json, status, error_message, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, analysisId, JSON.stringify(payload), status, errorMessage, new Date().toISOString());
}

function updateLeadRequest(id, status, errorMessage = null) {
  database.prepare('UPDATE lead_requests SET status=?, error_message=? WHERE id=?').run(status, errorMessage, id);
}

function failErrorAnalysis(analysisId, message) {
  database.prepare("UPDATE analyses SET error_status='failed', error_message=? WHERE id=?").run(message, analysisId);
}

function failContent(analysisId, message) {
  database.prepare("UPDATE analyses SET status='failed', content_status='failed', error_message=?, completed_at=? WHERE id=?")
    .run(message, new Date().toISOString(), analysisId);
}

function getAnalysis(analysisId) {
  const row = database.prepare('SELECT * FROM analyses WHERE id=?').get(analysisId);
  if (!row) return null;
  const reels = database.prepare('SELECT reel_json FROM reels WHERE analysis_id=? ORDER BY reel_index').all(analysisId).map(item => JSON.parse(item.reel_json));
  return {
    analysisId: row.id, profileUrl: row.profile_url, status: row.status, contentStatus: row.content_status, errorStatus: row.error_status,
    profile: row.profile_json ? JSON.parse(row.profile_json) : null, reels, answers: row.answers_json ? JSON.parse(row.answers_json) : null,
    errorAnalysis: row.error_analysis_json ? JSON.parse(row.error_analysis_json) : null,
    funnelPlan: row.funnel_plan_json ? JSON.parse(row.funnel_plan_json) : null, error: row.error_message,
    growthPlan: row.growth_plan_json ? JSON.parse(row.growth_plan_json) : null,
    createdAt: row.created_at, completedAt: row.completed_at,
  };
}

module.exports = { createAnalysis, findClientAnalysis, recordEvent, saveContent, saveAnswers, claimErrorAnalysis, saveErrorAnalysis, saveFunnelPlan, saveGrowthPlan, saveLeadRequest, updateLeadRequest, failErrorAnalysis, failContent, getAnalysis };
