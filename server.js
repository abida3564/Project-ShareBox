'use strict';
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'database.json');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], products: [], notifications: [] }, null, 2));

const allowed = (process.env.FRONTEND_URL || '').split(',').map(x => x.trim()).filter(Boolean);
app.use(cors({ origin(origin, cb) { if (!origin || !allowed.length || allowed.includes(origin)) return cb(null, true); cb(new Error('CORS blocked')); }, credentials: false }));
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));

function readDB() { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
function writeDB(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
function publicUser(u) { const { passwordHash, idCardPath, ...safe } = u; return safe; }
function auth(req, res, next) { const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, ''); try { req.user = jwt.verify(token, JWT_SECRET); next(); } catch { res.status(401).json({ message: 'Please log in again.' }); } }
const upload = multer({ storage: multer.diskStorage({ destination: UPLOAD_DIR, filename: (_, file, cb) => cb(null, Date.now() + '-' + crypto.randomBytes(6).toString('hex') + path.extname(file.originalname).toLowerCase()) }), limits: { fileSize: 8 * 1024 * 1024 }, fileFilter: (_, file, cb) => cb(null, ['image/jpeg','image/png','image/webp'].includes(file.mimetype)) });

app.get('/', (_, res) => res.json({ name: 'ShareBox API', status: 'online' }));
app.get('/api/health', (_, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.post('/api/auth/register', upload.single('idCard'), async (req, res) => {
  try {
    const { name, email, password, department, academicYear, studentId } = req.body;
    if (!name || !email || !password || !studentId || !req.file) return res.status(400).json({ message: 'Name, email, password, Student ID and ID card image are required.' });
    const db = readDB();
    const normalizedEmail = email.trim().toLowerCase();
    if (db.users.some(u => u.email === normalizedEmail)) return res.status(409).json({ message: 'An account already exists with this email.' });
    if (db.users.some(u => u.studentId.toLowerCase() === studentId.trim().toLowerCase())) return res.status(409).json({ message: 'This Student ID is already registered.' });
    const user = { id: crypto.randomUUID(), name: name.trim(), email: normalizedEmail, passwordHash: await bcrypt.hash(password, 10), department, academicYear, studentId: studentId.trim(), idCardPath: req.file.filename, idCardFileName: req.file.originalname, idVerificationStatus: 'pending', verified: false, phone: '', createdAt: new Date().toISOString() };
    db.users.push(user); writeDB(db);
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: publicUser(user) });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Registration failed.' }); }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {}; const db = readDB();
  const user = db.users.find(u => u.email === String(email || '').trim().toLowerCase());
  if (!user || !(await bcrypt.compare(String(password || ''), user.passwordHash))) return res.status(401).json({ message: 'Incorrect email or password.' });
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: publicUser(user) });
});
app.get('/api/auth/me', auth, (req, res) => { const user = readDB().users.find(u => u.id === req.user.userId); if (!user) return res.status(404).json({ message: 'User not found.' }); res.json({ user: publicUser(user) }); });

app.get('/api/products', (_, res) => res.json({ products: readDB().products.sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt)) }));
app.post('/api/products', auth, (req, res) => { const db = readDB(); const owner = db.users.find(u => u.id === req.user.userId); if (!owner) return res.status(404).json({ message: 'User not found.' }); const p = { ...req.body, id: crypto.randomUUID(), ownerId: owner.id, ownerName: owner.name, createdAt: new Date().toISOString() }; db.products.unshift(p); writeDB(db); res.status(201).json({ product: p }); });
app.get('/api/products/:id', (req, res) => { const p = readDB().products.find(x => x.id === req.params.id); if (!p) return res.status(404).json({ message: 'Product not found.' }); res.json({ product: p }); });

app.use((err, req, res, next) => { console.error(err); res.status(400).json({ message: err.message || 'Request failed.' }); });
app.listen(PORT, '0.0.0.0', () => console.log(`ShareBox API running on ${PORT}`));
