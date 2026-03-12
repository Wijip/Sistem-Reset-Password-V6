import express from 'express';
import mysql from 'mysql2/promise';
import cors from 'cors';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Database Configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  port: parseInt(process.env.DB_PORT || '3306'),
};

const DB_NAME = process.env.DB_NAME || 'polda_jatim_reset';

async function initializeDatabase() {
  let connection;
  try {
    // 1. Connect without database to check/create it
    connection = await mysql.createConnection(dbConfig);
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
    await connection.end();

    // 2. Connect with database to create tables
    const pool = mysql.createPool({ ...dbConfig, database: DB_NAME });

    // Table: Personnel
    await pool.query(`
      CREATE TABLE IF NOT EXISTS personnel (
        id VARCHAR(50) PRIMARY KEY,
        nama VARCHAR(255) NOT NULL,
        pangkat VARCHAR(100),
        nrp VARCHAR(50) UNIQUE NOT NULL,
        jabatan VARCHAR(255),
        kesatuan VARCHAR(255),
        email VARCHAR(255),
        role ENUM('SUPERADMIN', 'ADMIN', 'USER') DEFAULT 'USER',
        password VARCHAR(255) NOT NULL,
        lastLogin BIGINT
      )
    `);

    // Table: Reset Requests
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reset_requests (
        id VARCHAR(50) PRIMARY KEY,
        nama VARCHAR(255),
        pangkat VARCHAR(100),
        nrp VARCHAR(50),
        jabatan VARCHAR(255),
        kesatuan VARCHAR(255),
        waktu_iso VARCHAR(100),
        status ENUM('MENUNGGU', 'DIPROSES', 'SELESAI', 'DITOLAK') DEFAULT 'MENUNGGU',
        alasan TEXT,
        dokumen_kta TEXT,
        prioritas VARCHAR(50),
        createdAt BIGINT
      )
    `);

    // Table: Logs
    await pool.query(`
      CREATE TABLE IF NOT EXISTS logs (
        id VARCHAR(50) PRIMARY KEY,
        waktu BIGINT,
        user_nama VARCHAR(255),
        user_role VARCHAR(100),
        aktivitas VARCHAR(255),
        keterangan TEXT,
        ipAddress VARCHAR(50)
      )
    `);

    // Table: OTP
    await pool.query(`
      CREATE TABLE IF NOT EXISTS otp_codes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nrp VARCHAR(50) NOT NULL,
        code VARCHAR(6) NOT NULL,
        expiresAt BIGINT NOT NULL,
        token VARCHAR(255),
        isUsed BOOLEAN DEFAULT FALSE
      )
    `);

    // Insert Default SuperAdmin if not exists
    const [rows]: any = await pool.query('SELECT * FROM personnel WHERE nrp = ?', ['12345678']);
    if (rows.length === 0) {
      await pool.query(`
        INSERT INTO personnel (id, nama, pangkat, nrp, jabatan, kesatuan, email, role, password)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, ['P-1', 'Super Admin Polda', 'AKBP', '12345678', 'Kasubdit Tekinfo', 'Bid Tik Polda Jatim', 'admin@polri.go.id', 'SUPERADMIN', 'admin123']);
    }

    console.log('Database and Tables initialized successfully');
    return pool;
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  }
}

async function startServer() {
  const pool = await initializeDatabase();

  // API Routes
  app.get('/api/personnel', async (_req: any, res: any) => {
    const [rows] = await pool.query('SELECT * FROM personnel');
    res.json(rows);
  });

  app.post('/api/login', async (req: any, res: any) => {
    const { nrp, password } = req.body;
    const [rows]: any = await pool.query('SELECT * FROM personnel WHERE nrp = ? AND password = ?', [nrp, password]);
    if (rows.length > 0) {
      res.json({ success: true, user: rows[0] });
    } else {
      res.status(401).json({ success: false, message: 'NRP atau Password salah' });
    }
  });

  app.get('/api/requests', async (_req: any, res: any) => {
    const [rows] = await pool.query('SELECT * FROM reset_requests ORDER BY createdAt DESC');
    res.json(rows);
  });

  app.post('/api/requests', async (req: any, res: any) => {
    const reqData = req.body;
    await pool.query(`
      INSERT INTO reset_requests (id, nama, pangkat, nrp, jabatan, kesatuan, waktu_iso, status, alasan, dokumen_kta, prioritas, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [reqData.id, reqData.nama, reqData.pangkat, reqData.nrp, reqData.jabatan, reqData.kesatuan, reqData.waktu_iso, reqData.status, reqData.alasan, reqData.dokumen_kta, reqData.prioritas, reqData.createdAt]);
    res.json({ success: true });
  });

  app.get('/api/logs', async (_req: any, res: any) => {
    const [rows] = await pool.query('SELECT * FROM logs ORDER BY waktu DESC');
    res.json(rows);
  });

  app.post('/api/logs', async (req: any, res: any) => {
    const log = req.body;
    await pool.query(`
      INSERT INTO logs (id, waktu, user_nama, user_role, aktivitas, keterangan, ipAddress)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [log.id, log.waktu, log.user.nama, log.user.role, log.aktivitas, log.keterangan, log.ipAddress]);
    res.json({ success: true });
  });

  // OTP Logic
  app.post('/api/otp/request', async (req: any, res: any) => {
    const { nrp } = req.body;
    const [rows]: any = await pool.query('SELECT * FROM personnel WHERE nrp = ?', [nrp]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'NRP tidak terdaftar' });
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + (5 * 60 * 1000); // 5 minutes

    await pool.query('INSERT INTO otp_codes (nrp, code, expiresAt) VALUES (?, ?, ?)', [nrp, otpCode, expiresAt]);
    
    console.log(`[SIMULASI OTP] Kode OTP untuk ${nrp} adalah: ${otpCode}`);
    res.json({ success: true, message: 'OTP telah dikirim (Cek console server untuk simulasi)' });
  });

  app.post('/api/otp/verify', async (req: any, res: any) => {
    const { nrp, code } = req.body;
    const [rows]: any = await pool.query(
      'SELECT * FROM otp_codes WHERE nrp = ? AND code = ? AND isUsed = FALSE AND expiresAt > ?',
      [nrp, code, Date.now()]
    );

    if (rows.length > 0) {
      const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
      await pool.query('UPDATE otp_codes SET isUsed = TRUE, token = ? WHERE id = ?', [token, rows[0].id]);
      res.json({ success: true, token });
    } else {
      res.status(400).json({ success: false, message: 'Kode OTP salah atau sudah kadaluarsa' });
    }
  });

  // Vite Middleware
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: any, res: any) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
