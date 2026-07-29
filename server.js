'use strict';

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-before-production';
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is missing. Create/attach a Render PostgreSQL database.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key']
}));

app.options('*', cors());
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));

const idCardUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const accepted = ['image/jpeg', 'image/png', 'image/webp'];
    if (!accepted.includes(file.mimetype)) {
      return callback(new Error('ID card must be a JPG, PNG, or WebP image.'));
    }
    return callback(null, true);
  },
});

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    department: row.department,
    academicYear: row.academic_year,
    studentId: row.student_id,
    idCardFileName: row.id_card_file_name,
    idVerificationStatus: row.id_verification_status,
    verified: row.verified,
    phone: row.phone || '',
    createdAt: row.created_at,
  };
}

function signToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (_error) {
    return res.status(401).json({ message: 'Please log in again.' });
  }
}

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      department TEXT,
      academic_year TEXT,
      student_id TEXT NOT NULL UNIQUE,
      id_card_data BYTEA NOT NULL,
      id_card_mime_type TEXT NOT NULL,
      id_card_file_name TEXT,
      id_verification_status TEXT NOT NULL DEFAULT 'pending',
      verified BOOLEAN NOT NULL DEFAULT FALSE,
      phone TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS products (
      id UUID PRIMARY KEY,
      owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      owner_name TEXT NOT NULL,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS products_created_at_idx ON products(created_at DESC);
    CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications(user_id, created_at DESC);
  `);
}

app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

app.get('/', (_req, res) => {
  res.json({ name: 'ShareBox API', status: 'online', database: 'PostgreSQL' });
});

app.get('/api/health', async (_req, res) => {
  try {
    const result = await pool.query('SELECT NOW() AS time');
    res.json({ ok: true, database: 'connected', time: result.rows[0].time });
  } catch (error) {
    console.error(error);
    res.status(503).json({ ok: false, database: 'disconnected' });
  }
});

app.post('/api/auth/register', idCardUpload.single('idCard'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { name, email, password, department, academicYear, studentId } = req.body;
    if (!name || !email || !password || !studentId || !req.file) {
      return res.status(400).json({
        message: 'Name, email, password, Student ID and ID card image are required.',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedStudentId = studentId.trim();
    const duplicate = await client.query(
      'SELECT email, student_id FROM users WHERE email = $1 OR LOWER(student_id) = LOWER($2) LIMIT 1',
      [normalizedEmail, normalizedStudentId],
    );

    if (duplicate.rowCount) {
      if (duplicate.rows[0].email === normalizedEmail) {
        return res.status(409).json({ message: 'An account already exists with this email.' });
      }
      return res.status(409).json({ message: 'This Student ID is already registered.' });
    }

    const id = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await client.query(
      `INSERT INTO users (
        id, name, email, password_hash, department, academic_year, student_id,
        id_card_data, id_card_mime_type, id_card_file_name
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *`,
      [
        id,
        name.trim(),
        normalizedEmail,
        passwordHash,
        department || '',
        academicYear || '',
        normalizedStudentId,
        req.file.buffer,
        req.file.mimetype,
        req.file.originalname,
      ],
    );

    const user = publicUser(result.rows[0]);
    return res.status(201).json({ token: signToken(id), user });
  } catch (error) {
    console.error(error);
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Email or Student ID is already registered.' });
    }
    return res.status(500).json({ message: 'Registration failed.' });
  } finally {
    client.release();
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const result = await pool.query('SELECT * FROM users WHERE email = $1 LIMIT 1', [email]);
    const userRow = result.rows[0];

    if (!userRow || !(await bcrypt.compare(password, userRow.password_hash))) {
      return res.status(401).json({ message: 'Incorrect email or password.' });
    }

    return res.json({ token: signToken(userRow.id), user: publicUser(userRow) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Login failed.' });
  }
});

app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [req.user.userId]);
    if (!result.rowCount) return res.status(404).json({ message: 'User not found.' });
    return res.json({ user: publicUser(result.rows[0]) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Could not load user.' });
  }
});

app.get('/api/products', async (_req, res) => {
  try {
    const result = await pool.query('SELECT id, owner_id, owner_name, data, created_at FROM products ORDER BY created_at DESC');
    const products = result.rows.map((row) => ({
      ...row.data,
      id: row.id,
      ownerId: row.owner_id,
      ownerName: row.owner_name,
      createdAt: row.created_at,
    }));
    return res.json({ products });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Could not load products.' });
  }
});

app.post('/api/products', auth, async (req, res) => {
  try {
    const ownerResult = await pool.query('SELECT id, name FROM users WHERE id = $1 LIMIT 1', [req.user.userId]);
    if (!ownerResult.rowCount) return res.status(404).json({ message: 'User not found.' });

    const owner = ownerResult.rows[0];
    const id = crypto.randomUUID();
    const cleanData = { ...req.body };
    delete cleanData.id;
    delete cleanData.ownerId;
    delete cleanData.ownerName;
    delete cleanData.createdAt;

    const result = await pool.query(
      `INSERT INTO products (id, owner_id, owner_name, data)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING id, owner_id, owner_name, data, created_at`,
      [id, owner.id, owner.name, JSON.stringify(cleanData)],
    );
    const row = result.rows[0];
    const product = {
      ...row.data,
      id: row.id,
      ownerId: row.owner_id,
      ownerName: row.owner_name,
      createdAt: row.created_at,
    };
    return res.status(201).json({ product });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Could not publish product.' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, owner_id, owner_name, data, created_at FROM products WHERE id = $1 LIMIT 1',
      [req.params.id],
    );
    if (!result.rowCount) return res.status(404).json({ message: 'Product not found.' });
    const row = result.rows[0];
    return res.json({
      product: {
        ...row.data,
        id: row.id,
        ownerId: row.owner_id,
        ownerName: row.owner_name,
        createdAt: row.created_at,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Could not load product.' });
  }
});

app.get('/api/notifications', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, user_id, text, is_read, created_at
       FROM notifications
       WHERE user_id IS NULL OR user_id = $1
       ORDER BY created_at DESC LIMIT 50`,
      [req.user.userId],
    );
    const notifications = result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      text: row.text,
      read: row.is_read,
      createdAt: row.created_at,
    }));
    return res.json({ notifications });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Could not load notifications.' });
  }
});

// Optional, secure admin summary. Set ADMIN_KEY in Render and send it as x-admin-key.
app.get('/api/admin/users', async (req, res) => {
  if (!process.env.ADMIN_KEY || req.headers['x-admin-key'] !== process.env.ADMIN_KEY) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }
  try {
    const result = await pool.query(
      `SELECT id, name, email, department, academic_year, student_id,
              id_card_file_name, id_verification_status, verified, created_at
       FROM users ORDER BY created_at DESC`,
    );
    return res.json({ count: result.rowCount, users: result.rows });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Could not load users.' });
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  return res.status(400).json({ message: err.message || 'Request failed.' });
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`ShareBox API running on ${PORT} with PostgreSQL`);
    });
  })
  .catch((error) => {
    console.error('Database initialization failed:', error);
    process.exit(1);
  });
