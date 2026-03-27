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
    // 1. Connect without database to check existence
    connection = await mysql.createConnection(dbConfig);
    
    const [databases]: any = await connection.query(`SHOW DATABASES LIKE '${DB_NAME}'`);
    
    if (databases.length > 0) {
      console.log(`[DATABASE] Database '${DB_NAME}' ditemukan. Menggunakan data yang ada.`);
    } else {
      console.log(`[DATABASE] Database '${DB_NAME}' tidak ditemukan. Membuat database baru...`);
      await connection.query(`CREATE DATABASE \`${DB_NAME}\``);
    }
    await connection.end();

    // 2. Connect with database to ensure tables exist
    const pool = mysql.createPool({ ...dbConfig, database: DB_NAME });

    console.log('[DATABASE] Memeriksa struktur tabel...');

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
        role ENUM('superadmin', 'admin', 'user') DEFAULT 'user',
        password VARCHAR(255) NOT NULL,
        lastLogin BIGINT
      )
    `);

    // Ensure role enum is lowercase and update existing data
    await pool.query("ALTER TABLE personnel MODIFY COLUMN role ENUM('superadmin', 'admin', 'user') DEFAULT 'user'");
    await pool.query("UPDATE personnel SET role = LOWER(role)");

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

    // --- MIGRATION DATA FROM mock-data.ts ---
    const mockPersonnel = [
      { id: "SA1", nama: "AKBP Budiono", pangkat: "AKBP", nrp: "78010001", jabatan: "Kabid Tik", kesatuan: "Polda Jatim", email: "superadmin1@polri.go.id", role: "superadmin", password: "superadmin123" },
      { id: "SA2", nama: "Kompol Siti Aminah", pangkat: "Kompol", nrp: "82050002", jabatan: "Kasubag Tekinfo", kesatuan: "Polda Jatim", email: "superadmin2@polri.go.id", role: "superadmin", password: "siperadmin123" },
      { id: "SA3", nama: "URYANDUKNIS", pangkat: "Super Admin", nrp: "410804003", jabatan: "URYANDUKNIS SUBBIDTEKINFO BID TIK POLDA JATIM", kesatuan: "Polda Jatim", email: "uryanduknis.superadmin@polri.go.id", role: "superadmin", password: "pCtAi9T2221G" },
      { id: "ADM_416409000", nama: "Polrestabes Surabaya", pangkat: "User", nrp: "416409000", jabatan: "Kasi Tik", kesatuan: "POLRESTABES SURABAYA", email: "sitikrestabessurabaya.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" },
      { id: "ADM_415809000", nama: "Polresta Sidoarjo", pangkat: "User", nrp: "415809000", jabatan: "Kasi Tik", kesatuan: "POLRESTA SIDOARJO", email: "sitikrestasidoarjo.jatim@polri.go.id", role: "user", password: "B41ShY4ASw6m" },
      { id: "ADM_414409000", nama: "Polres Malang Kota", pangkat: "User", nrp: "414409000", jabatan: "Kasi Tik", kesatuan: "POLRES MALANG KOTA", email: "sitikresmalangkota.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" },
      { id: "ADM_412709000", nama: "Polresta Banyuwangi", pangkat: "User", nrp: "412709000", jabatan: "Kasi Tik", kesatuan: "POLRESTA BANYUWANGI", email: "sitikrestabanyuwangi.jatim@polri.go.id", role: "user", password: "B41ShY4ASw6m" },
      { id: "ADM_415309000", nama: "Polres Pelabuhan Tanjung Perak", pangkat: "User", nrp: "415309000", jabatan: "Kasi Tik", kesatuan: "POLRES PELABUHAN TANJUNG PERAK", email: "sitikrespelabuhantanjungperak.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" },
      { id: "ADM_413309000", nama: "Polres Gresik", pangkat: "User", nrp: "413309000", jabatan: "Kasi Tik", kesatuan: "POLRES GRESIK", email: "sitikresgresik.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" },
      { id: "ADM_414309000", nama: "Polres Malang", pangkat: "User", nrp: "414309000", jabatan: "Kasi Tik", kesatuan: "POLRES MALANG", email: "sitikresmalang.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" },
      { id: "ADM_415109000", nama: "Polres Pasuruan", pangkat: "User", nrp: "415109000", jabatan: "Kasi Tik", kesatuan: "POLRES PASURUAN", email: "sitikrespasuruan.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" },
      { id: "ADM_415209000", nama: "Polres Pasuruan Kota", pangkat: "User", nrp: "415209000", jabatan: "Kasi Tik", kesatuan: "POLRES PASURUAN KOTA", email: "sitikrespasuruankota.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" },
      { id: "ADM_415509000", nama: "Polres Probolinggo", pangkat: "User", nrp: "415509000", jabatan: "Kasi Tik", kesatuan: "POLRES PROBOLINGGO", email: "sitikresprobolinggo.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" },
      { id: "ADM_415609000", nama: "Polres Probolinggo Kota", pangkat: "User", nrp: "415609000", jabatan: "Kasi Tik", kesatuan: "POLRES PROBOLINGGO KOTA", email: "sitikresprobolinggokota.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" },
      { id: "ADM_412809000", nama: "Polres Batu", pangkat: "User", nrp: "412809000", jabatan: "Kasi Tik", kesatuan: "POLRES BATU", email: "sitikresbatu.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" },
      { id: "ADM_413909000", nama: "Polres Lumajang", pangkat: "User", nrp: "413909000", jabatan: "Kasi Tik", kesatuan: "POLRES LUMAJANG", email: "sitikreslumajang.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" },
      { id: "ADM_413209000", nama: "Polres Bondowoso", pangkat: "User", nrp: "413209000", jabatan: "Kasi Tik", kesatuan: "POLRES BONDOWOSO", email: "sitikresbondowoso.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" },
      { id: "ADM_415909000", nama: "Polres Situbondo", pangkat: "User", nrp: "415909000", jabatan: "Kasi Tik", kesatuan: "POLRES SITUBONDO", email: "sitikressitubondo.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" },
      { id: "ADM_413409000", nama: "Polres Jember", pangkat: "User", nrp: "413409000", jabatan: "Kasi Tik", kesatuan: "POLRES JEMBER", email: "sitikresjember.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" },
      { id: "ADM_413609000", nama: "Polres Kediri", pangkat: "User", nrp: "413609000", jabatan: "Kasi Tik", kesatuan: "POLRES KEDIRI", email: "sitikreskediri.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" },
      { id: "ADM_413709000", nama: "Polres Kediri Kota", pangkat: "User", nrp: "413709000", jabatan: "Kasi Tik", kesatuan: "POLRES KEDIRI KOTA", email: "sitikreskedirikota.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" },
      { id: "ADM_416309000", nama: "Polres Tulungagung", pangkat: "User", nrp: "416309000", jabatan: "Kasi Tik", kesatuan: "POLRES TULUNGAGUNG", email: "sitikrestulungagung.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" },
      { id: "ADM_412909000", nama: "Polres Blitar", pangkat: "User", nrp: "412909000", jabatan: "Kasi Tik", kesatuan: "POLRES BLITAR", email: "sitikresblitar.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" },
      { id: "ADM_413009000", nama: "Polres Blitar Kota", pangkat: "User", nrp: "413009000", jabatan: "Kasi Tik", kesatuan: "POLRES BLITAR KOTA", email: "sitikresblitarkota.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" },
      { id: "ADM_416109000", nama: "Polres Trenggalek", pangkat: "User", nrp: "416109000", jabatan: "Kasi Tik", kesatuan: "POLRES TRENGGALEK", email: "sitikrestrenggalek.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" },
      { id: "ADM_414709000", nama: "Polres Nganjuk", pangkat: "User", nrp: "414709000", jabatan: "Kasi Tik", kesatuan: "POLRES NGANJUK", email: "sitikresnganjuk.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" },
      { id: "ADM_413509000", nama: "Polres Jombang", pangkat: "User", nrp: "413509000", jabatan: "Kasi Tik", kesatuan: "POLRES JOMBANG", email: "sitikresjombang.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" },
      { id: "ADM_414009000", nama: "Polres Madiun", pangkat: "User", nrp: "414009000", jabatan: "Kasi Tik", kesatuan: "POLRES MADIUN", email: "sitikresmadiun.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" },
      { id: "ADM_414109000", nama: "Polres Madiun Kota", pangkat: "User", nrp: "414109000", jabatan: "Kasi Tik", kesatuan: "POLRES MADIUN KOTA", email: "sitikresmadiunkota.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" },
      { id: "ADM_414809000", nama: "Polres Ngawi", pangkat: "User", nrp: "414809000", jabatan: "Kasi Tik", kesatuan: "POLRES NGAWI", email: "sitikresngawi.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" },
      { id: "ADM_414209000", nama: "Polres Magetan", pangkat: "User", nrp: "414209000", jabatan: "Kasi Tik", kesatuan: "POLRES MAGETAN", email: "sitikresmagetan.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" },
      { id: "ADM_415409000", nama: "Polres Ponorogo", pangkat: "User", nrp: "415409000", jabatan: "Kasi Tik", kesatuan: "POLRES PONOROGO", email: "sitikresponorogo.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" },
      { id: "ADM_414909000", nama: "Polres Pacitan", pangkat: "User", nrp: "414909000", jabatan: "Kasi Tik", kesatuan: "POLRES PACITAN", email: "sitikrespacitan.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" },
      { id: "ADM_413109000", nama: "Polres Bojonegoro", pangkat: "User", nrp: "413109000", jabatan: "Kasi Tik", kesatuan: "POLRES BOJONEGORO", email: "sitikresbojonegoro.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" },
      { id: "ADM_416209000", nama: "Polres Tuban", pangkat: "User", nrp: "416209000", jabatan: "Kasi Tik", kesatuan: "POLRES TUBAN", email: "sitikrestuban.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" },
      { id: "ADM_413809000", nama: "Polres Lamongan", pangkat: "User", nrp: "413809000", jabatan: "Kasi Tik", kesatuan: "POLRES LAMONGAN", email: "sitikreslamongan.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" },
      { id: "ADM_414509000", nama: "Polres Mojokerto", pangkat: "User", nrp: "414509000", jabatan: "Kasi Tik", kesatuan: "POLRES MOJOKERTO", email: "sitikresmojokerto.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" },
      { id: "ADM_414609000", nama: "Polres Mojokerto Kota", pangkat: "User", nrp: "414609000", jabatan: "Kasi Tik", kesatuan: "POLRES MOJOKERTO KOTA", email: "sitikresmojokertokota.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" },
      { id: "ADM_412609000", nama: "Polres Bangkalan", pangkat: "User", nrp: "412609000", jabatan: "Kasi Tik", kesatuan: "POLRES BANGKALAN", email: "sitikresbangkalan.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" },
      { id: "ADM_415709000", nama: "Polres Sampang", pangkat: "User", nrp: "415709000", jabatan: "Kasi Tik", kesatuan: "POLRES SAMPANG", email: "sitikressampang.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" },
      { id: "ADM_415009000", nama: "Polres Pamekasan", pangkat: "User", nrp: "415009000", jabatan: "Kasi Tik", kesatuan: "POLRES PAMEKASAN", email: "sitikrespamekasan.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" },
      { id: "ADM_416009000", nama: "Polres Sumenep", pangkat: "User", nrp: "416009000", jabatan: "Kasi Tik", kesatuan: "POLRES SUMENEP", email: "sitikressumenep.jatim@polri.go.id", role: "user", password: "pCtAi9T2221G" }
    ];

    // Insert Personnel ONLY if table is empty or missing these users
    const [rows]: any = await pool.query('SELECT COUNT(*) as count FROM personnel');
    if (rows[0].count === 0) {
      console.log('[DATABASE] Melakukan migrasi data personel dari mock-data...');
      for (const p of mockPersonnel) {
        await pool.query(`
          INSERT INTO personnel (id, nama, pangkat, nrp, jabatan, kesatuan, email, role, password)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [p.id, p.nama, p.pangkat, p.nrp, p.jabatan, p.kesatuan, p.email, p.role, p.password]);
      }
    }

    console.log('[DATABASE] Inisialisasi selesai. Sistem siap digunakan.');
    return pool;
  } catch (error) {
    console.error('[DATABASE] Gagal menginisialisasi database:', error);
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

  app.get('/api/personnel', async (_req: any, res: any) => {
    const [rows] = await pool.query('SELECT * FROM personnel ORDER BY nama ASC');
    res.json(rows);
  });

  app.post('/api/personnel', async (req: any, res: any) => {
    const p = req.body;
    await pool.query(`
      INSERT INTO personnel (id, nama, pangkat, nrp, jabatan, kesatuan, email, role, password, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [p.id, p.nama, p.pangkat, p.nrp, p.jabatan, p.kesatuan, p.email, p.role, p.password || 'user!1234', p.status || 'Aktif']);
    res.json({ success: true });
  });

  app.put('/api/personnel/:id', async (req: any, res: any) => {
    const { id } = req.params;
    const p = req.body;
    await pool.query(`
      UPDATE personnel 
      SET nama = ?, pangkat = ?, nrp = ?, jabatan = ?, kesatuan = ?, email = ?, role = ?, status = ?
      WHERE id = ?
    `, [p.nama, p.pangkat, p.nrp, p.jabatan, p.kesatuan, p.email, p.role, p.status, id]);
    res.json({ success: true });
  });

  app.delete('/api/personnel/:id', async (req: any, res: any) => {
    const { id } = req.params;
    await pool.query('DELETE FROM personnel WHERE id = ?', [id]);
    res.json({ success: true });
  });

  app.post('/api/login', async (req: any, res: any) => {
    const { email, password } = req.body;
    console.log(`[LOGIN] Attempt for email: ${email}`);
    
    const [rows]: any = await pool.query(
      'SELECT * FROM personnel WHERE email = ? AND password = ?', 
      [email.trim(), password.trim()]
    );
    
    if (rows.length > 0) {
      console.log(`[LOGIN] Success for: ${rows[0].nama}`);
      res.json({ success: true, user: rows[0] });
    } else {
      console.log(`[LOGIN] Failed for email: ${email}`);
      res.status(401).json({ success: false, message: 'Email atau Password salah' });
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

  app.put('/api/requests/:id', async (req: any, res: any) => {
    const { id } = req.params;
    const { status, reset_password, admin_note } = req.body;
    await pool.query(`
      UPDATE reset_requests 
      SET status = ?, reset_password = ?, admin_note = ?
      WHERE id = ?
    `, [status, reset_password, admin_note, id]);
    res.json({ success: true });
  });

  app.delete('/api/requests/:id', async (req: any, res: any) => {
    const { id } = req.params;
    await pool.query('DELETE FROM reset_requests WHERE id = ?', [id]);
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
