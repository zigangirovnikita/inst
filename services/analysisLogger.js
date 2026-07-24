const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { recordEvent } = require('./database');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'analysis-events.jsonl');

function createAnalysisLogger(profileUrl, existingAnalysisId) {
  const analysisId = existingAnalysisId || crypto.randomUUID();
  fs.mkdirSync(LOG_DIR, { recursive: true });

  function log(event, details = {}) {
    const entry = { timestamp: new Date().toISOString(), analysisId, profileUrl, event, ...details };
    fs.appendFileSync(LOG_FILE, `${JSON.stringify(entry)}\n`, 'utf8');
    recordEvent(analysisId, event, details);
    console.log(JSON.stringify(entry));
  }

  return { analysisId, log };
}

module.exports = { createAnalysisLogger };
