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
    profilePhoto: row.profile_photo || '',
    coverPhoto: row.cover_photo || '',
    bio: row.bio || '',
    preferences: row.preferences || {},
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


function signAdminToken(adminId) {
  return jwt.sign({ adminId, role: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
}

function adminAuth(req, res, next) {
  const raw = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (raw) {
    try {
      const decoded = jwt.verify(raw, JWT_SECRET);
      if (decoded.role === 'admin' && decoded.adminId) {
        req.admin = decoded;
        return next();
      }
    } catch (_error) {}
  }

  // Backward-compatible emergency access using Render ADMIN_KEY.
  if (process.env.ADMIN_KEY && req.headers['x-admin-key'] === process.env.ADMIN_KEY) {
    req.admin = { role: 'admin', legacyKey: true };
    return next();
  }
  return res.status(401).json({ message: 'Admin login required.' });
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
      status TEXT NOT NULL DEFAULT 'approved',
      views INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS admins (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE products ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS views INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );


    ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo TEXT NOT NULL DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS cover_photo TEXT NOT NULL DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

    CREATE TABLE IF NOT EXISTS needs (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_name TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'Other',
      urgency TEXT NOT NULL DEFAULT '',
      reward TEXT NOT NULL DEFAULT '',
      return_time TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY,
      sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_id UUID REFERENCES users(id) ON DELETE CASCADE,
      sender_name TEXT NOT NULL,
      receiver_name TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS needs_created_at_idx ON needs(created_at DESC);
    CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages(created_at DESC);
    CREATE INDEX IF NOT EXISTS products_created_at_idx ON products(created_at DESC);
    CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS products_owner_id_idx ON products(owner_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS products_status_idx ON products(status, created_at DESC);
  `);

  // Product approval is not required: publish all existing records immediately.
  await pool.query("UPDATE products SET status = 'approved', updated_at = NOW() WHERE status <> 'approved'");

  // Create/update the first database-backed admin account.
  // Login email defaults to admin@sharebox.local and password defaults to ADMIN_KEY.
  const adminEmail = String(process.env.ADMIN_EMAIL || 'admin@sharebox.local').trim().toLowerCase();
  const adminPassword = String(process.env.ADMIN_PASSWORD || process.env.ADMIN_KEY || '');
  if (adminPassword) {
    const existing = await pool.query('SELECT id FROM admins WHERE email = $1 LIMIT 1', [adminEmail]);
    const hash = await bcrypt.hash(adminPassword, 10);
    if (existing.rowCount) {
      await pool.query('UPDATE admins SET password_hash = $1, active = TRUE WHERE email = $2', [hash, adminEmail]);
    } else {
      await pool.query(
        'INSERT INTO admins (id, name, email, password_hash) VALUES ($1,$2,$3,$4)',
        [crypto.randomUUID(), 'ShareBox Administrator', adminEmail, hash],
      );
    }
    console.log(`Database admin ready: ${adminEmail}`);
  } else {
    console.warn('ADMIN_PASSWORD or ADMIN_KEY is missing; database admin login was not seeded.');
  }
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

app.get('/api/products', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    const category = String(req.query.category || '').trim().toLowerCase();
    const result = await pool.query(
      `SELECT id, owner_id, owner_name, data, status, views, updated_at, created_at
       FROM products
       ORDER BY created_at DESC`,
    );
    let products = result.rows.map((row) => ({
      ...row.data,
      id: row.id,
      ownerId: row.owner_id,
      ownerName: row.owner_name,
      status: row.status,
      views: row.views,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
    }));
    if (q) products = products.filter((p) =>
      [p.name, p.category, p.subcategory, p.description, p.ownerName, ...(p.tags || [])]
        .join(' ').toLowerCase().includes(q));
    if (category) products = products.filter((p) => String(p.category || '').toLowerCase() === category);
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
      `INSERT INTO products (id, owner_id, owner_name, data, status)
       VALUES ($1, $2, $3, $4::jsonb, 'approved')
       RETURNING id, owner_id, owner_name, data, status, views, updated_at, created_at`,
      [id, owner.id, owner.name, JSON.stringify(cleanData)],
    );
    const row = result.rows[0];
    const product = {
      ...row.data,
      id: row.id,
      ownerId: row.owner_id,
      ownerName: row.owner_name,
      status: row.status,
      views: row.views,
      updatedAt: row.updated_at,
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
      `UPDATE products SET views = views + 1
       WHERE id = $1
       RETURNING id, owner_id, owner_name, data, status, views, updated_at, created_at`,
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
        status: row.status,
        views: row.views,
        updatedAt: row.updated_at,
        createdAt: row.created_at,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Could not load product.' });
  }
});


app.get('/api/my/products', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, owner_id, owner_name, data, status, views, updated_at, created_at
       FROM products WHERE owner_id = $1 ORDER BY created_at DESC`,
      [req.user.userId],
    );
    const products = result.rows.map((row) => ({
      ...row.data, id: row.id, ownerId: row.owner_id, ownerName: row.owner_name,
      status: row.status, views: row.views, updatedAt: row.updated_at, createdAt: row.created_at,
    }));
    return res.json({ products });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Could not load your resources.' });
  }
});

app.get('/api/my/stats', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS total_items,
              COUNT(*)::int AS active_listings,
              COALESCE(SUM(views), 0)::int AS total_views
       FROM products WHERE owner_id = $1`,
      [req.user.userId],
    );
    return res.json({
      stats: {
        totalItems: result.rows[0].total_items,
        activeListings: result.rows[0].active_listings,
        totalViews: result.rows[0].total_views,
        itemsLent: result.rows[0].active_listings,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Could not load statistics.' });
  }
});

app.patch('/api/my/products/:id', auth, async (req, res) => {
  try {
    const cleanData = { ...req.body };
    ['id','ownerId','ownerName','status','views','createdAt','updatedAt'].forEach((key) => delete cleanData[key]);
    const result = await pool.query(
      `UPDATE products SET data = data || $1::jsonb, updated_at = NOW()
       WHERE id = $2 AND owner_id = $3
       RETURNING id, owner_id, owner_name, data, status, views, updated_at, created_at`,
      [JSON.stringify(cleanData), req.params.id, req.user.userId],
    );
    if (!result.rowCount) return res.status(404).json({ message: 'Resource not found.' });
    const row = result.rows[0];
    return res.json({ product: {
      ...row.data, id: row.id, ownerId: row.owner_id, ownerName: row.owner_name,
      status: row.status, views: row.views, updatedAt: row.updated_at, createdAt: row.created_at,
    }});
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Could not update resource.' });
  }
});

app.delete('/api/my/products/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM products WHERE id = $1 AND owner_id = $2 RETURNING id',
      [req.params.id, req.user.userId],
    );
    if (!result.rowCount) return res.status(404).json({ message: 'Resource not found.' });
    return res.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Could not delete resource.' });
  }
});


app.patch('/api/auth/profile', auth, async (req, res) => {
  try {
    const { name, department, academicYear, phone, bio, profilePhoto, coverPhoto } = req.body || {};
    const result = await pool.query(
      `UPDATE users
       SET name = COALESCE(NULLIF($1,''), name),
           department = COALESCE($2, department),
           academic_year = COALESCE($3, academic_year),
           phone = COALESCE($4, phone),
           bio = COALESCE($5, bio),
           profile_photo = COALESCE($6, profile_photo),
           cover_photo = COALESCE($7, cover_photo)
       WHERE id = $8 RETURNING *`,
      [String(name||'').trim(), department ?? null, academicYear ?? null, phone ?? null,
       bio ?? null, profilePhoto ?? null, coverPhoto ?? null, req.user.userId]
    );
    if (!result.rowCount) return res.status(404).json({ message: 'User not found.' });
    return res.json({ user: publicUser(result.rows[0]) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Could not update profile.' });
  }
});

app.get('/api/my/settings', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT preferences FROM users WHERE id=$1', [req.user.userId]);
    return res.json({ settings: result.rows[0]?.preferences || {} });
  } catch (error) {
    return res.status(500).json({ message: 'Could not load settings.' });
  }
});

app.patch('/api/my/settings', auth, async (req, res) => {
  try {
    const settings = req.body || {};
    const result = await pool.query(
      `UPDATE users SET preferences = preferences || $1::jsonb WHERE id=$2 RETURNING preferences`,
      [JSON.stringify(settings), req.user.userId]
    );
    return res.json({ settings: result.rows[0]?.preferences || {} });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Could not save settings.' });
  }
});

app.get('/api/needs', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id,user_id,user_name,title,description,category,urgency,reward,return_time,status,created_at
       FROM needs WHERE status='open' ORDER BY created_at DESC`
    );
    return res.json({ needs: result.rows.map(r => ({
      id:r.id,userId:r.user_id,userName:r.user_name,title:r.title,description:r.description,
      category:r.category,urgency:r.urgency,reward:r.reward,returnTime:r.return_time,
      status:r.status,createdAt:r.created_at
    }))});
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Could not load needs.' });
  }
});

app.post('/api/needs', auth, async (req, res) => {
  try {
    const { title, description='', category='Other', urgency='', reward='', returnTime='' } = req.body || {};
    if (!String(title||'').trim()) return res.status(400).json({ message: 'Need title is required.' });
    const owner = await pool.query('SELECT name FROM users WHERE id=$1', [req.user.userId]);
    const id = crypto.randomUUID();
    const result = await pool.query(
      `INSERT INTO needs (id,user_id,user_name,title,description,category,urgency,reward,return_time)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [id, req.user.userId, owner.rows[0]?.name || 'Campus member', String(title).trim(),
       description, category, urgency, reward, returnTime]
    );
    return res.status(201).json({ need: result.rows[0] });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Could not post need.' });
  }
});

app.delete('/api/needs/:id', auth, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM needs WHERE id=$1 AND user_id=$2 RETURNING id',[req.params.id,req.user.userId]);
    if (!result.rowCount) return res.status(404).json({ message: 'Need not found.' });
    return res.json({ success:true });
  } catch (error) {
    return res.status(500).json({ message: 'Could not delete need.' });
  }
});

app.get('/api/messages', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id,sender_id,receiver_id,sender_name,receiver_name,body,created_at
       FROM messages WHERE sender_id=$1 OR receiver_id=$1 ORDER BY created_at ASC`,
      [req.user.userId]
    );
    return res.json({ messages: result.rows.map(r=>({
      id:r.id,senderId:r.sender_id,receiverId:r.receiver_id,senderName:r.sender_name,
      receiverName:r.receiver_name,body:r.body,createdAt:r.created_at
    }))});
  } catch (error) {
    return res.status(500).json({ message: 'Could not load messages.' });
  }
});

app.post('/api/messages', auth, async (req, res) => {
  try {
    const { receiverId=null, receiverName='', body } = req.body || {};
    if (!String(body||'').trim()) return res.status(400).json({ message: 'Message cannot be empty.' });
    const sender = await pool.query('SELECT name FROM users WHERE id=$1',[req.user.userId]);
    const id=crypto.randomUUID();
    const result=await pool.query(
      `INSERT INTO messages (id,sender_id,receiver_id,sender_name,receiver_name,body)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id,req.user.userId,receiverId,sender.rows[0]?.name||'Campus member',receiverName,String(body).trim()]
    );
    return res.status(201).json({ message: result.rows[0] });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Could not send message.' });
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

// Database-backed admin authentication and management.
app.post('/api/admin/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const result = await pool.query('SELECT * FROM admins WHERE email = $1 AND active = TRUE LIMIT 1', [email]);
    const admin = result.rows[0];
    if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
      return res.status(401).json({ message: 'Incorrect admin email or password.' });
    }
    return res.json({
      token: signAdminToken(admin.id),
      admin: { id: admin.id, name: admin.name, email: admin.email },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Admin login failed.' });
  }
});

app.get('/api/admin/me', adminAuth, async (req, res) => {
  if (req.admin.legacyKey) return res.json({ admin: { name: 'Legacy Administrator', email: 'ADMIN_KEY' } });
  const result = await pool.query('SELECT id, name, email FROM admins WHERE id = $1 AND active = TRUE LIMIT 1', [req.admin.adminId]);
  if (!result.rowCount) return res.status(401).json({ message: 'Admin account is unavailable.' });
  return res.json({ admin: result.rows[0] });
});

app.get('/api/admin/users', adminAuth, async (_req, res) => {
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

app.get('/api/admin/products', adminAuth, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, owner_id, owner_name, data, status, views, updated_at, created_at
       FROM products ORDER BY created_at DESC`,
    );
    const products = result.rows.map((row) => ({
      ...row.data, id: row.id, ownerId: row.owner_id, ownerName: row.owner_name,
      status: row.status, views: row.views, updatedAt: row.updated_at, createdAt: row.created_at,
    }));
    return res.json({ count: result.rowCount, products });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Could not load products.' });
  }
});

app.patch('/api/admin/users/:id/verification', adminAuth, async (req, res) => {
  const status = String(req.body?.status || '').toLowerCase();
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'Invalid verification status.' });
  }
  try {
    const result = await pool.query(
      `UPDATE users SET id_verification_status = $1, verified = $2
       WHERE id = $3
       RETURNING id, name, email, department, academic_year, student_id,
                 id_card_file_name, id_verification_status, verified, created_at`,
      [status, status === 'approved', req.params.id],
    );
    if (!result.rowCount) return res.status(404).json({ message: 'User not found.' });
    return res.json({ user: result.rows[0] });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Could not update verification.' });
  }
});

app.delete('/api/admin/products/:id', adminAuth, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ message: 'Product not found.' });
    return res.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Could not delete product.' });
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
