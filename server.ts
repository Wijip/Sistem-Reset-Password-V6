import express from 'express';
import mysql from 'mysql2/promise';
import cors from 'cors';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { Server } from 'socket.io';
import http from 'http';
import multer from 'multer';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import session from 'express-session';
import cookieParser from 'cookie-parser';

import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'polda-jatim-jwt-secret-2024';

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Nodemailer Transporter Configuration
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || 'your-email@polda-jatim.go.id',
    pass: process.env.SMTP_PASS || 'your-app-password',
  },
});

// Middleware to check if user is Admin or Super Admin using JWT
const isAdmin = (req: any, res: any, next: any) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ success: false, message: 'Sesi berakhir. Silakan login kembali.' });
  }

  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    if (decoded && (decoded.role === 'admin' || decoded.role === 'superadmin')) {
      req.user = decoded;
      next();
    } else {
      res.status(403).json({ success: false, message: 'Akses ditolak. Hak akses tidak cukup.' });
    }
  } catch (error) {
    res.status(401).json({ success: false, message: 'Token tidak valid.' });
  }
};

// Ensure private uploads directory exists
const PRIVATE_UPLOAD_DIR = path.join(process.cwd(), 'private_uploads', 'kta');
if (!fs.existsSync(PRIVATE_UPLOAD_DIR)) {
  fs.mkdirSync(PRIVATE_UPLOAD_DIR, { recursive: true });
}

// Multer Configuration for Private Storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, PRIVATE_UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit as requested
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format file tidak didukung. Hanya JPEG, PNG, dan PDF yang diperbolehkan.'));
    }
  }
});

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
        kontak_person VARCHAR(255),
        waktu_iso VARCHAR(100),
        status ENUM('MENUNGGU', 'DIPROSES', 'SELESAI', 'DITOLAK') DEFAULT 'MENUNGGU',
        alasan TEXT,
        alasan_penolakan TEXT,
        catatan TEXT,
        dokumen_kta TEXT,
        prioritas VARCHAR(50),
        createdAt BIGINT,
        updatedAt BIGINT,
        reset_password VARCHAR(255),
        reset_info TEXT
      )
    `);

    // Ensure all columns exist for reset_requests
    const [columns]: any = await pool.query(`SHOW COLUMNS FROM reset_requests`);
    const columnNames = columns.map((c: any) => c.Field);
    
    if (!columnNames.includes('kontak_person')) await pool.query('ALTER TABLE reset_requests ADD COLUMN kontak_person VARCHAR(255)');
    if (!columnNames.includes('catatan')) await pool.query('ALTER TABLE reset_requests ADD COLUMN catatan TEXT');
    if (!columnNames.includes('updatedAt')) await pool.query('ALTER TABLE reset_requests ADD COLUMN updatedAt BIGINT');
    if (!columnNames.includes('reset_password')) await pool.query('ALTER TABLE reset_requests ADD COLUMN reset_password VARCHAR(255)');
    if (!columnNames.includes('reset_info')) await pool.query('ALTER TABLE reset_requests ADD COLUMN reset_info TEXT');
    if (!columnNames.includes('alasan_penolakan')) await pool.query('ALTER TABLE reset_requests ADD COLUMN alasan_penolakan TEXT');

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
      { id: "ADM_URY_JATIM", nama: "URYANDUKNIS SUBBIDTEKINFO", pangkat: "Admin", nrp: "410804004", jabatan: "Admin Tekinfo Bid Tik", kesatuan: "Polda Jatim", email: "uryanduknissubbidtekinfobidtik.jatim@polri.go.id", role: "admin", password: "pCtAi9T2221G" },
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
        const hashedPassword = await bcrypt.hash(p.password, 10);
        await pool.query(`
          INSERT INTO personnel (id, nama, pangkat, nrp, jabatan, kesatuan, email, role, password)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [p.id, p.nama, p.pangkat, p.nrp, p.jabatan, p.kesatuan, p.email, p.role, hashedPassword]);
      }
    }

    // Ensure specific admin user requested by the user exists
    const targetEmail = 'uryanduknissubbidtekinfobidtik.jatim@polri.go.id';
    const [targetUser]: any = await pool.query('SELECT * FROM personnel WHERE email = ?', [targetEmail]);
    if (targetUser.length === 0) {
      console.log(`[DATABASE] Menambahkan user admin khusus: ${targetEmail}`);
      const hashedPassword = await bcrypt.hash('pCtAi9T2221G', 10);
      await pool.query(`
        INSERT INTO personnel (id, nama, pangkat, nrp, jabatan, kesatuan, email, role, password)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        'ADM_URY_JATIM', 
        'URYANDUKNIS SUBBIDTEKINFO', 
        'Admin', 
        '410804004', 
        'Admin Tekinfo Bid Tik', 
        'Polda Jatim', 
        targetEmail, 
        'admin', 
        hashedPassword
      ]);
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
  app.get('/api/personnel', async (req: any, res: any) => {
    const page = parseInt(req.query.page || '1');
    const limit = parseInt(req.query.limit || '10');
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const role = req.query.role;
    const kesatuan = req.query.kesatuan;

    let query = 'SELECT * FROM personnel';
    let countQuery = 'SELECT COUNT(*) as count FROM personnel';
    let params: any[] = [];
    let whereClauses: string[] = [];

    if (search) {
      whereClauses.push('(nama LIKE ? OR nrp LIKE ? OR kesatuan LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (role && role !== 'ALL') {
      whereClauses.push('role = ?');
      params.push(role);
    }
    if (kesatuan && kesatuan !== 'ALL') {
      whereClauses.push('kesatuan = ?');
      params.push(kesatuan);
    }

    if (whereClauses.length > 0) {
      const whereStr = ' WHERE ' + whereClauses.join(' AND ');
      query += whereStr;
      countQuery += whereStr;
    }

    query += ' ORDER BY nama ASC LIMIT ? OFFSET ?';
    const countParams = [...params];
    params.push(limit, offset);

    const [rows]: any = await pool.query(query, params);
    const [totalRows]: any = await pool.query(countQuery, countParams);
    
    res.json({
      data: rows,
      total: totalRows[0].count,
      page,
      limit
    });
  });

  app.post('/api/personnel', async (req: any, res: any) => {
    const p = req.body;
    const hashedPassword = await bcrypt.hash(p.password || 'user!1234', 10);
    await pool.query(`
      INSERT INTO personnel (id, nama, pangkat, nrp, jabatan, kesatuan, email, role, password, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [p.id, p.nama, p.pangkat, p.nrp, p.jabatan, p.kesatuan, p.email, p.role, hashedPassword, p.status || 'Aktif']);
    res.json({ success: true });
  });

  app.put('/api/personnel/:id', async (req: any, res: any) => {
    const { id } = req.params;
    const p = req.body;
    
    try {
      if (p.password) {
        const hashedPassword = await bcrypt.hash(p.password, 10);
        await pool.query(`
          UPDATE personnel 
          SET nama = ?, pangkat = ?, nrp = ?, jabatan = ?, kesatuan = ?, email = ?, role = ?, status = ?, password = ?
          WHERE id = ?
        `, [p.nama, p.pangkat, p.nrp, p.jabatan, p.kesatuan, p.email, p.role, p.status, hashedPassword, id]);
      } else {
        await pool.query(`
          UPDATE personnel 
          SET nama = ?, pangkat = ?, nrp = ?, jabatan = ?, kesatuan = ?, email = ?, role = ?, status = ?
          WHERE id = ?
        `, [p.nama, p.pangkat, p.nrp, p.jabatan, p.kesatuan, p.email, p.role, p.status, id]);
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to update personnel:', error);
      res.status(500).json({ success: false, message: 'Gagal memperbarui data personel' });
    }
  });

  app.delete('/api/personnel/:id', async (req: any, res: any) => {
    const { id } = req.params;
    await pool.query('DELETE FROM personnel WHERE id = ?', [id]);
    res.json({ success: true });
  });

  app.post('/api/login', async (req: any, res: any) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email dan Password wajib diisi' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    try {
      const [rows]: any = await pool.query(
        'SELECT * FROM personnel WHERE LOWER(email) = ?', 
        [cleanEmail]
      );
      
      if (rows.length > 0) {
        const user = rows[0];
        const isMatch = await bcrypt.compare(cleanPassword, user.password);
        
        if (isMatch) {
          // Don't send password back to client
          const { password: _, ...userWithoutPassword } = user;
          
          // Create JWT Token
          const token = jwt.sign(userWithoutPassword, JWT_SECRET, { expiresIn: '24h' });
          
          // Set HttpOnly Cookie
          res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
          });
          
          res.json({ success: true, user: userWithoutPassword });
        } else {
          res.status(401).json({ success: false, message: 'Email atau Password salah' });
        }
      } else {
        res.status(401).json({ success: false, message: 'Email atau Password salah' });
      }
    } catch (error) {
      console.error('[LOGIN] Database error:', error);
      res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server' });
    }
  });

  app.post('/api/logout', (req: any, res: any) => {
    res.clearCookie('token');
    res.json({ success: true });
  });

  app.get('/api/requests', async (req: any, res: any) => {
    const page = parseInt(req.query.page || '1');
    const limit = parseInt(req.query.limit || '10');
    const offset = (page - 1) * limit;
    const status = req.query.status;
    const priority = req.query.priority;
    const search = req.query.search;

    let query = 'SELECT * FROM reset_requests';
    let countQuery = 'SELECT COUNT(*) as count FROM reset_requests';
    let params: any[] = [];
    let whereClauses: string[] = [];

    if (status && status !== 'Semua') {
      whereClauses.push('status = ?');
      params.push(status);
    }
    if (priority && priority !== 'Semua') {
      whereClauses.push('prioritas = ?');
      params.push(priority);
    }
    if (search) {
      whereClauses.push('(nama LIKE ? OR nrp LIKE ? OR kesatuan LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    if (whereClauses.length > 0) {
      const whereStr = ' WHERE ' + whereClauses.join(' AND ');
      query += whereStr;
      countQuery += whereStr;
    }

    query += ' ORDER BY createdAt DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [rows]: any = await pool.query(query, params);
    const [totalRows]: any = await pool.query(countQuery, params.slice(0, -2));

    const parsedRows = rows.map((r: any) => ({
      ...r,
      reset_info: r.reset_info ? JSON.parse(r.reset_info) : undefined
    }));

    res.json({
      data: parsedRows,
      total: totalRows[0].count,
      page,
      limit
    });
  });

  app.post('/api/requests', upload.single('dokumen_kta_file'), async (req: any, res: any) => {
    const r = req.body;
    const filename = req.file ? req.file.filename : (r.dokumen_kta || null);
    
    try {
      await pool.query(`
        INSERT INTO reset_requests (
          id, nama, pangkat, nrp, jabatan, kesatuan, kontak_person, 
          waktu_iso, status, alasan, catatan, dokumen_kta, prioritas, createdAt
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        r.id, r.nama, r.pangkat, r.nrp, r.jabatan, r.kesatuan, r.kontak_person || null, 
        r.waktu_iso, r.status, r.alasan, r.catatan || null, filename, 
        r.prioritas || 'Normal', r.createdAt
      ]);

      // Emit socket event for urgent requests
      if (r.prioritas === 'Mendesak' || r.prioritas === 'MENDESAK') {
        io.emit('urgent_request', {
          id: r.id,
          nama: r.nama,
          nrp: r.nrp,
          prioritas: r.prioritas
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Failed to create request:', error);
      res.status(500).json({ success: false, message: 'Gagal menyimpan data ke database' });
    }
  });

  // Secure Download Route - Only accessible by Admin/Super Admin
  app.get('/api/download/kta/:filename', isAdmin, async (req: any, res: any) => {
    const { filename } = req.params;
    const filePath = path.join(PRIVATE_UPLOAD_DIR, filename);
    
    if (fs.existsSync(filePath)) {
      res.download(filePath);
    } else {
      res.status(404).send('File tidak ditemukan');
    }
  });

  app.put('/api/requests/:id', async (req: any, res: any) => {
    const { id } = req.params;
    const r = req.body;
    
    try {
      // Convert reset_info to string if it's an object
      const resetInfoStr = r.reset_info ? JSON.stringify(r.reset_info) : null;
      let hashedPassword = r.reset_password || null;

      if (r.status === 'SELESAI' && r.reset_password) {
        hashedPassword = await bcrypt.hash(r.reset_password, 10);
        // Update the personnel password as well
        await pool.query('UPDATE personnel SET password = ? WHERE nrp = ?', [hashedPassword, r.nrp]);
      }

      await pool.query(`
        UPDATE reset_requests 
        SET status = ?, 
            reset_password = ?, 
            catatan = ?, 
            updatedAt = ?, 
            reset_info = ?,
            prioritas = ?,
            alasan_penolakan = ?
        WHERE id = ?
      `, [
        r.status, 
        hashedPassword, 
        r.catatan || null, 
        r.updatedAt || null, 
        resetInfoStr, 
        r.prioritas || 'Normal',
        r.alasan_penolakan || null,
        id
      ]);

      // If status is DITOLAK, send email notification
      if (r.status === 'DITOLAK') {
        const [userRows]: any = await pool.query('SELECT email FROM personnel WHERE nrp = ?', [r.nrp]);
        const userEmail = userRows.length > 0 ? userRows[0].email : null;
        
        if (userEmail) {
          const mailOptions = {
            from: process.env.SMTP_USER || 'your-email@polda-jatim.go.id',
            to: userEmail,
            subject: 'Permohonan Reset Password Ditolak',
            text: `Halo ${r.nama},\n\nPermohonan reset password Anda dengan ID ${id} telah ditolak.\n\nAlasan Penolakan: ${r.alasan_penolakan}\n\nSilakan hubungi administrator jika ada pertanyaan.\n\nTerima kasih.`
          };
          await transporter.sendMail(mailOptions);
        }
      }

      // Emit socket event if priority changed to urgent
      if (r.prioritas === 'Mendesak' || r.prioritas === 'MENDESAK') {
        io.emit('urgent_request', {
          id: id,
          nama: r.nama,
          nrp: r.nrp,
          prioritas: r.prioritas
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Failed to update request:', error);
      res.status(500).json({ success: false, message: 'Gagal memperbarui data di database' });
    }
  });

  app.delete('/api/requests/:id', async (req: any, res: any) => {
    const { id } = req.params;
    await pool.query('DELETE FROM reset_requests WHERE id = ?', [id]);
    res.json({ success: true });
  });

  app.get('/api/logs', async (_req: any, res: any) => {
    try {
      const [rows]: any = await pool.query('SELECT * FROM logs ORDER BY waktu DESC');
      const mappedLogs = rows.map((row: any) => ({
        id: row.id,
        waktu: Number(row.waktu),
        user: {
          nama: row.user_nama,
          role: row.user_role,
          initials: row.user_nama ? row.user_nama.split(' ').map((n: string) => n[0]).join('').toUpperCase() : ''
        },
        aktivitas: row.aktivitas,
        keterangan: row.keterangan,
        ipAddress: row.ipAddress
      }));
      res.json(mappedLogs);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
      res.status(500).json({ success: false, message: 'Gagal mengambil data log' });
    }
  });

  app.post('/api/logs', async (req: any, res: any) => {
    try {
      const log = req.body;
      const userNama = log.user?.nama || 'Unknown';
      const userRole = log.user?.role || 'Unknown';
      const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || log.ipAddress || 'Unknown';

      await pool.query(`
        INSERT INTO logs (id, waktu, user_nama, user_role, aktivitas, keterangan, ipAddress)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [log.id, log.waktu, userNama, userRole, log.aktivitas, log.keterangan, ipAddress]);
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to create log:', error);
      res.status(500).json({ success: false, message: 'Gagal menyimpan log' });
    }
  });

  // OTP Logic
  app.post('/api/otp/request', async (req: any, res: any) => {
    const { nrp } = req.body;
    const [rows]: any = await pool.query('SELECT * FROM personnel WHERE nrp = ?', [nrp]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'NRP tidak terdaftar' });
    }

    const user = rows[0];
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + (5 * 60 * 1000); // 5 minutes

    await pool.query('INSERT INTO otp_codes (nrp, code, expiresAt) VALUES (?, ?, ?)', [nrp, otpCode, expiresAt]);
    
    try {
      if (user.email) {
        const mailOptions = {
          from: process.env.SMTP_USER || 'your-email@polda-jatim.go.id',
          to: user.email,
          subject: 'Kode Verifikasi Reset Password (OTP)',
          text: `Halo ${user.nama},\n\nKode verifikasi (OTP) Anda adalah: ${otpCode}\n\nKode ini berlaku selama 5 menit.\n\nJika Anda tidak merasa melakukan permintaan ini, silakan abaikan email ini.`
        };
        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: 'OTP telah dikirim ke email Anda' });
      } else {
        console.log(`[SIMULASI OTP] Kode OTP untuk ${nrp} adalah: ${otpCode} (User tidak memiliki email)`);
        res.json({ success: true, message: 'OTP telah dikirim (Simulasi: Cek console server)' });
      }
    } catch (error) {
      console.error('Failed to send OTP email:', error);
      res.json({ success: true, message: 'OTP gagal dikirim via email, silakan hubungi admin. (Simulasi: Cek console server)' });
      console.log(`[SIMULASI OTP] Kode OTP untuk ${nrp} adalah: ${otpCode}`);
    }
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

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
