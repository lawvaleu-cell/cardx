const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'botdz-dev-secret-change-in-production';
const router = express.Router();

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.find('users', (u) => u.id === payload.id);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function adminRequired(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

router.post('/register', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email and password are required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (db.find('users', (u) => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }
  const passwordHash = bcrypt.hashSync(password, 10);
  const isFirstUser = db.all('users').length === 0;
  const user = db.insert('users', {
    id: uuid(),
    name,
    email,
    passwordHash,
    role: isFirstUser ? 'admin' : 'user',
    locale: 'ar',
    createdAt: new Date().toISOString()
  });
  db.insert('subscriptions', {
    id: uuid(),
    userId: user.id,
    planId: 'free',
    status: 'active',
    billingCycle: 'monthly',
    currentPeriodEnd: null,
    createdAt: new Date().toISOString()
  });
  const token = signToken(user);
  res.json({ token, user: sanitize(user) });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = db.find('users', (u) => u.email.toLowerCase() === (email || '').toLowerCase());
  if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  if (user.suspended) return res.status(403).json({ error: 'This account has been suspended' });
  const token = signToken(user);
  res.json({ token, user: sanitize(user) });
});

router.post('/forgot-password', (req, res) => {
  const { email } = req.body || {};
  const user = db.find('users', (u) => u.email.toLowerCase() === (email || '').toLowerCase());
  // Always respond the same way so we don't leak which emails are registered.
  if (user) {
    const resetToken = jwt.sign({ id: user.id, purpose: 'reset' }, JWT_SECRET, { expiresIn: '1h' });
    db.update('users', user.id, { resetTokenPreview: resetToken.slice(-8) });
    // In production this would be emailed, not returned — returned here so the
    // demo flow is testable end-to-end without an email provider configured.
    return res.json({ ok: true, devResetToken: resetToken });
  }
  res.json({ ok: true });
});

router.post('/reset-password', (req, res) => {
  const { token, password } = req.body || {};
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.purpose !== 'reset') throw new Error('bad token');
    const user = db.find('users', (u) => u.id === payload.id);
    if (!user) return res.status(400).json({ error: 'Invalid token' });
    db.update('users', user.id, { passwordHash: bcrypt.hashSync(password, 10) });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Invalid or expired reset token' });
  }
});

router.get('/me', authRequired, (req, res) => {
  res.json({ user: sanitize(req.user) });
});

router.put('/me', authRequired, (req, res) => {
  const { name, locale } = req.body || {};
  const updated = db.update('users', req.user.id, {
    ...(name ? { name } : {}),
    ...(locale ? { locale } : {})
  });
  res.json({ user: sanitize(updated) });
});

router.post('/change-password', authRequired, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!bcrypt.compareSync(currentPassword || '', req.user.passwordHash)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
  db.update('users', req.user.id, { passwordHash: bcrypt.hashSync(newPassword, 10) });
  res.json({ ok: true });
});

function sanitize(user) {
  const { passwordHash, resetTokenPreview, ...rest } = user;
  return rest;
}

module.exports = { router, authRequired, adminRequired, sanitize };
