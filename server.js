const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'erp.json');
const DEMO_EMPLOYEES = [
  { id: 1, name: 'Dr. Maya Patel', email: 'maya.patel@northstar.org', department: 'Clinical', role: 'Medical Director', status: 'Active', startDate: '2021-03-15' },
  { id: 2, name: 'Jon Bell', email: 'jon.bell@northstar.org', department: 'Operations', role: 'Operations Manager', status: 'Active', startDate: '2022-08-01' },
  { id: 3, name: 'Sofia Reyes', email: 'sofia.reyes@northstar.org', department: 'Clinical', role: 'Registered Nurse', status: 'Active', startDate: '2023-01-09' },
  { id: 4, name: 'Liam Chen', email: 'liam.chen@northstar.org', department: 'Administration', role: 'Finance Coordinator', status: 'On leave', startDate: '2020-11-23' },
  { id: 5, name: 'Nina Okafor', email: 'nina.okafor@northstar.org', department: 'Support', role: 'Patient Coordinator', status: 'Active', startDate: '2024-02-12' }
];
const DEMO_INVENTORY = [
  { id: 1, name: 'Nitrile examination gloves', category: 'Medical supplies', quantity: 840, unitCost: 0.18, supplier: 'Medline', reorderLevel: 300 },
  { id: 2, name: 'Surgical masks (box of 50)', category: 'Medical supplies', quantity: 46, unitCost: 8.5, supplier: 'Cardinal Health', reorderLevel: 50 },
  { id: 3, name: 'Saline solution 500ml', category: 'Pharmacy', quantity: 125, unitCost: 4.25, supplier: 'McKesson', reorderLevel: 40 },
  { id: 4, name: 'Digital blood pressure monitor', category: 'Equipment', quantity: 12, unitCost: 74.99, supplier: 'Omron', reorderLevel: 5 },
  { id: 5, name: 'Exam table paper rolls', category: 'Office', quantity: 8, unitCost: 12.25, supplier: 'Medline', reorderLevel: 12 },
  { id: 6, name: 'Alcohol prep pads', category: 'Medical supplies', quantity: 0, unitCost: 3.75, supplier: 'Cardinal Health', reorderLevel: 20 }
];
const scrypt = (password, salt) => crypto.scryptSync(password, salt, 64).toString('hex');
function initialData() { const salt = crypto.randomBytes(16).toString('hex'); return { users: [{ id: 1, email: 'admin@careops.local', name: 'Alex Morgan', role: 'Administrator', salt, passwordHash: scrypt('admin123', salt) }], employees: DEMO_EMPLOYEES, inventory: DEMO_INVENTORY, sessions: {} }; }
function load() { fs.mkdirSync(DATA_DIR, { recursive: true }); if (!fs.existsSync(DATA_FILE)) { const data = initialData(); fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); return data; } try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { throw new Error('data/erp.json is not valid JSON'); } }
let db = load();
function save() { const temp = `${DATA_FILE}.tmp`; fs.writeFileSync(temp, JSON.stringify(db, null, 2)); fs.renameSync(temp, DATA_FILE); }
function corsHeaders(req) { const origin = req.headers.origin; return { 'Access-Control-Allow-Origin': origin || '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS', 'Vary': 'Origin' }; }
function json(res, status, body, req) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...corsHeaders(req || {}) }); res.end(JSON.stringify(body)); }
function fail(res, status, message, req) { json(res, status, { error: message }, req); }
function readBody(req) { return new Promise((resolve, reject) => { let raw = ''; req.on('data', chunk => { raw += chunk; if (raw.length > 1024 * 1024) reject(new Error('Request too large')); }); req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); } }); req.on('error', reject); }); }
function auth(req) { const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, ''); const session = token && db.sessions[token]; if (!session) return null; if (Date.now() - session.createdAt > 7 * 86400000) { delete db.sessions[token]; save(); return null; } return db.users.find(user => user.id === session.userId) || null; }
function nextId(records) { return records.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1; }
function validateRecord(kind, input) { if (!input || !String(input.name || '').trim()) return 'name is required'; if (kind === 'employee' && !String(input.email || '').trim()) return 'email is required'; if (kind === 'inventory' && (!Number.isFinite(Number(input.quantity)) || !Number.isFinite(Number(input.unitCost)))) return 'quantity and unitCost must be numbers'; return null; }
function dashboard() { const value = db.inventory.reduce((sum, x) => sum + Number(x.quantity) * Number(x.unitCost), 0); const lowStock = db.inventory.filter(x => Number(x.quantity) <= Number(x.reorderLevel)); return { totalSpending: 27840 + db.employees.length * 420, balanceLeft: 62000 - (27840 + db.employees.length * 420), inventoryValue: value, employeeCount: db.employees.length, inventoryCount: db.inventory.length, lowStockCount: lowStock.length, categoryTotals: db.inventory.reduce((out, x) => { out[x.category] = (out[x.category] || 0) + Number(x.quantity) * Number(x.unitCost); return out; }, {}) }; }
async function api(req, res, url) {
  if (req.method === 'OPTIONS') { res.writeHead(204, corsHeaders(req)); return res.end(); }
  if (url.pathname === '/api/auth/login' && req.method === 'POST') { const body = await readBody(req); const user = db.users.find(x => x.email === String(body.email || '').trim().toLowerCase()); if (!user || !crypto.timingSafeEqual(Buffer.from(scrypt(String(body.password || ''), user.salt), 'hex'), Buffer.from(user.passwordHash, 'hex'))) return fail(res, 401, 'Invalid email or password', req); const token = crypto.randomBytes(32).toString('hex'); db.sessions[token] = { userId: user.id, createdAt: Date.now() }; save(); return json(res, 200, { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } }, req); }
  if (url.pathname === '/api/auth/logout' && req.method === 'POST') { const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, ''); if (token && db.sessions[token]) { delete db.sessions[token]; save(); } return json(res, 200, { ok: true }, req); }
  const user = auth(req); if (!user) return fail(res, 401, 'Authentication required', req);
  if (url.pathname === '/api/auth/me' && req.method === 'GET') return json(res, 200, { user: { id: user.id, email: user.email, name: user.name, role: user.role } }, req);
  if (url.pathname === '/api/dashboard' && req.method === 'GET') return json(res, 200, dashboard(), req);
  for (const [kind, collection] of [['employees', 'employees'], ['inventory', 'inventory']]) {
    const parts = url.pathname.split('/').filter(Boolean);
    const isCollection = url.pathname === `/api/${kind}`;
    const id = parts.length === 3 && parts[0] === 'api' && parts[1] === kind ? Number(parts[2]) : NaN;
    if (req.method === 'GET' && isCollection) return json(res, 200, db[collection], req);
    if (req.method === 'POST' && isCollection) { const body = await readBody(req); const error = validateRecord(kind === 'employees' ? 'employee' : 'inventory', body); if (error) return fail(res, 400, error, req); const item = { ...body, id: nextId(db[collection]) }; if (kind === 'inventory') { item.quantity = Number(item.quantity); item.unitCost = Number(item.unitCost); item.reorderLevel = Number(item.reorderLevel || 0); } db[collection].push(item); save(); return json(res, 201, item, req); }
    if (req.method === 'DELETE' && Number.isFinite(id)) { const before = db[collection].length; db[collection] = db[collection].filter(item => item.id !== id); if (before === db[collection].length) return fail(res, 404, 'Record not found', req); save(); return json(res, 200, { ok: true }, req); }
  }
  return fail(res, 404, 'Not found', req);
}
function serve(req, res, url) { let requested = url.pathname === '/' ? 'index.html' : url.pathname.slice(1); let file; try { file = path.resolve(ROOT, requested); if (file !== ROOT && !file.startsWith(`${ROOT}${path.sep}`)) throw new Error(); } catch { return fail(res, 400, 'Invalid path'); } fs.stat(file, (error, stat) => { if (error || !stat.isFile()) return fail(res, 404, 'Not found'); const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' }; res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res); }); }
const server = http.createServer(async (req, res) => { const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); try { if (url.pathname.startsWith('/api/')) await api(req, res, url); else if (req.method === 'GET' || req.method === 'HEAD') serve(req, res, url); else fail(res, 405, 'Method not allowed'); } catch (error) { fail(res, error.message === 'Invalid JSON' || error.message === 'Request too large' ? 400 : 500, error.message); } });
if (require.main === module) server.listen(PORT, () => console.log(`CareOps running at http://localhost:${PORT}`));
module.exports = server;
