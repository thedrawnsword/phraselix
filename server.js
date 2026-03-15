const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const MONGO_URI = 'mongodb+srv://thedrawnsword:KvGhP0nJxMsz8mQw@phraselix.fskjirp.mongodb.net/phraselix?appName=Phraselix';
const JWT_SECRET = 'phraselix_jwt_secret_2024_change_in_production';

mongoose.connect(MONGO_URI).then(() => console.log('MongoDB connected')).catch(err => console.error('MongoDB error:', err));

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String },
  googleId: { type: String },
  avatar: { type: String },
  favorites: { type: Array, default: [] },
  coins: { type: Number, default: 11 },
  lastFreeCoins: { type: Date, default: null },
  coinHistory: { type: Array, default: [] },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

// Sign Up
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ error: 'Email already in use' });
    const hashed = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, password: hashed, coins: 11, coinHistory: [{ amount: 11, reason: 'Welcome bonus!', date: new Date() }] });
    const token = jwt.sign({ id: user._id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Firebase Google sign in
app.post('/api/auth/firebase', async (req, res) => {
  try {
    const { uid, name, email } = req.body;
    if (!uid || !email) return res.status(400).json({ error: 'Missing fields' });
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({ name: name || email.split('@')[0], email, googleId: uid, coins: 11, coinHistory: [{ amount: 11, reason: 'Welcome bonus!', date: new Date() }] });
    }
    const token = jwt.sign({ id: user._id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get coins
app.get('/api/coins', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('coins coinHistory lastFreeCoins');
    if (!user) return res.status(404).json({ error: 'User not found' });
    const FREE_INTERVAL = 10 * 60 * 1000;
    const FREE_AMOUNT = 11;
    const now = new Date();
    const lastClaim = user.lastFreeCoins ? new Date(user.lastFreeCoins) : new Date(0);
    if (now - lastClaim >= FREE_INTERVAL) {
      if (user.coins < FREE_AMOUNT) {
        const toAdd = FREE_AMOUNT - user.coins;
        user.coins = FREE_AMOUNT;
        user.coinHistory.unshift({ amount: toAdd, reason: 'Auto top-up to 11 coins', date: now });
        if (user.coinHistory.length > 50) user.coinHistory = user.coinHistory.slice(0, 50);
      }
      user.lastFreeCoins = now;
      await user.save();
    }
    const nextTopupMs = Math.max(0, FREE_INTERVAL - (now - new Date(user.lastFreeCoins || 0)));
    res.json({ coins: user.coins, history: user.coinHistory || [], nextTopupMs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Spend coins
app.post('/api/coins/spend', authMiddleware, async (req, res) => {
  try {
    const { amount, reason } = req.body;
    if (!amount || amount < 1) return res.status(400).json({ error: 'Invalid amount' });
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.coins < amount) return res.status(400).json({ error: 'Not enough coins', coins: user.coins });
    user.coins -= amount;
    user.coinHistory.unshift({ amount: -amount, reason: reason || 'Generation', date: new Date() });
    if (user.coinHistory.length > 50) user.coinHistory = user.coinHistory.slice(0, 50);
    await user.save();
    res.json({ ok: true, coins: user.coins });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Add coins (purchases)
app.post('/api/coins/add', authMiddleware, async (req, res) => {
  try {
    const { amount, reason } = req.body;
    if (!amount || amount < 1) return res.status(400).json({ error: 'Invalid amount' });
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.coins += amount;
    user.coinHistory.unshift({ amount, reason: reason || 'Purchase', date: new Date() });
    if (user.coinHistory.length > 50) user.coinHistory = user.coinHistory.slice(0, 50);
    await user.save();
    res.json({ ok: true, coins: user.coins });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Favorites
app.get('/api/favorites', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('favorites');
    res.json(user.favorites || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/favorites', authMiddleware, async (req, res) => {
  try {
    const { favorites } = req.body;
    await User.findByIdAndUpdate(req.user.id, { favorites });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// AI Generate
const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.post('/api/generate', async (req, res) => {
  try {
    const { system, messages } = req.body;
    const response = await client.messages.create({ model: 'claude-opus-4-5', max_tokens: 1024, system, messages });
    res.json(response);
  } catch (e) { res.status(500).json({ error: { message: e.message } }); }
});

// Pages
const fileMap = {
  '/': 'index.html', '/username': 'username/index.html', '/bio': 'bio/index.html',
  '/caption': 'caption/index.html', '/hashtag': 'hashtag/index.html', '/hooks': 'hooks/index.html',
  '/scripthook': 'scripthook/index.html', '/ideas': 'ideas/index.html',
  '/login': 'login/index.html', '/signup': 'signup/index.html', '/coins': 'coins/index.html'
};
Object.keys(fileMap).forEach(route => {
  app.get(route, (req, res) => res.sendFile(path.join(__dirname, fileMap[route])));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Phraselix running on port ${PORT}`));
