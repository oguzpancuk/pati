const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { signToken } = require('../utils/jwt');

const SALT_ROUNDS = 10;

async function register(req, res, next) {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email ve password zorunludur' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Şifre en az 8 karakter olmalıdır' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Bu e-posta ile kayıtlı bir kullanıcı zaten var' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, role, created_at',
      [name, email, passwordHash]
    );

    const user = result.rows[0];
    const token = signToken({ userId: user.id, role: user.role });
    res.status(201).json({ user, token });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email ve password zorunludur' });
    }

    const result = await pool.query(
      'SELECT id, name, email, password_hash, role FROM users WHERE email = $1',
      [email]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Geçersiz e-posta veya şifre' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Geçersiz e-posta veya şifre' });
    }

    const token = signToken({ userId: user.id, role: user.role });
    delete user.password_hash;
    res.json({ user, token });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login };
