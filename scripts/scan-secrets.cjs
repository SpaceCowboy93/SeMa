// Read-only scan of tracked and nonignored untracked files. Never print matches.
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const listed = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' })
if (listed.status !== 0) {
  console.error('Could not enumerate repository files for secret scanning')
  process.exit(1)
}
const files = [...new Set(listed.stdout.split('\0').filter(Boolean))]
const patterns = [
  ['Supabase secret key', /sb_secret_[A-Za-z0-9_-]{16,}/g],
  ['JWT credential (including public legacy keys)', /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/g],
  ['GitHub credential', /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['Provider token', /\b(?:sk_live_|sk_test_|sk-proj-|sk-ant-)[A-Za-z0-9_-]{20,}/g],
  ['Literal secret assignment', /(?:SUPABASE_SERVICE_ROLE_KEY|VAPID_PRIVATE_KEY|PUSH_SEND_SECRET|CRON_SECRET|GITHUB_TOKEN|VERCEL_TOKEN|AWS_SECRET_ACCESS_KEY)\s*[:=]\s*["']([A-Za-z0-9_./+=-]{24,})["']/g],
  ['Credential in URL', /[a-z][a-z0-9+.-]*:\/\/[^\s:/]+:[^\s@/]{12,}@/gi],
]
const findings = []
let scanned = 0
for (const file of files) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue
  const bytes = fs.readFileSync(file)
  if (bytes.includes(0)) continue
  scanned++
  const content = bytes.toString('utf8')
  for (const [category, pattern] of patterns) {
    pattern.lastIndex = 0
    for (const match of content.matchAll(pattern)) findings.push({ file, line: content.slice(0, match.index).split('\n').length, category })
  }
}
console.log(JSON.stringify({ filesScanned: scanned, findings, completeValuesPrinted: false,
  scope: 'Tracked and nonignored untracked text files; ignored environment files, backups and git history excluded.' }, null, 2))
if (findings.length) process.exitCode = 1
