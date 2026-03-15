const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ── MongoDB ──────────────────────────────────────────────
const MONGO_URI = 'mongodb+srv://thedrawnsword:KvGhP0nJxMsz8mQw@phraselix.fskjirp.mongodb.net/phraselix?appName=Phraselix';
const JWT_SECRET = 'phraselix_jwt_secret_2024_change_in_production';

mongoose.connect(MONGO_URI).then(() => console.log('MongoDB connected')).catch(err => console.error('MongoDB error:', err));

// ── User Schema ──────────────────────────────────────────
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String },
  googleId: { type: String },
  avatar: { type: String },
  favorites: { type: Array, default: [] },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// ── Auth Middleware ──────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ── Auth Routes ──────────────────────────────────────────

// Sign Up
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ error: 'Email already in use' });

    const hashed = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, password: hashed });

    const token = jwt.sign({ id: user._id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Sign In
app.post('/api/auth/signin', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'All fields required' });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'No account found with this email' });
    if (!user.password) return res.status(400).json({ error: 'This account uses Google Sign-In' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'Wrong password' });

    const token = jwt.sign({ id: user._id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get current user
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Favorites Routes ─────────────────────────────────────

// Get favorites
app.get('/api/favorites', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('favorites');
    res.json(user.favorites || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Save favorites
app.post('/api/favorites', authMiddleware, async (req, res) => {
  try {
    const { favorites } = req.body;
    await User.findByIdAndUpdate(req.user.id, { favorites });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── AI Generate Route ────────────────────────────────────
const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.post('/api/generate', async (req, res) => {
  try {
    const { system, messages } = req.body;
    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      system,
      messages
    });
    res.json(response);
  } catch (e) {
    res.status(500).json({ error: { message: e.message } });
  }
});

// ── Page Routes ──────────────────────────────────────────
const pages = ['/', '/username', '/bio', '/caption', '/hashtag', '/hooks', '/scripthook', '/ideas', '/login', '/signup', '/coins'];
const fileMap = {
  '/': 'index.html',
  '/username': 'username/index.html',
  '/bio': 'bio/index.html',
  '/caption': 'caption/index.html',
  '/hashtag': 'hashtag/index.html',
  '/hooks': 'hooks/index.html',
  '/scripthook': 'scripthook/index.html',
  '/ideas': 'ideas/index.html',
  '/login': 'login/index.html',
  '/signup': 'signup/index.html',
  '/coins': 'coins/index.html'
};

pages.forEach(route => {
  app.get(route, (req, res) => {
    res.sendFile(path.join(__dirname, fileMap[route]));
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Phraselix running on port ${PORT}`));
