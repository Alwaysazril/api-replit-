const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const authRoutes    = require('./routes/auth');
const userRoutes    = require('./routes/user');
const whatsappRoutes = require('./routes/whatsapp');
const vpsRoutes     = require('./routes/vps');
const toolsRoutes   = require('./routes/tools');
const orderRoutes   = require('./routes/order');
const chatRoutes    = require('./routes/chat');
const controlRoutes = require('./routes/control');

const authMiddleware      = require('./middleware/authMiddleware');
const rateLimitMiddleware = require('./middleware/rateLimitMiddleware');

const app = express();

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(rateLimitMiddleware);

// Static uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/auth',      authRoutes);
app.use('/api/user',      authMiddleware, userRoutes);
app.use('/api/whatsapp',  authMiddleware, whatsappRoutes);
app.use('/api/vps',       authMiddleware, vpsRoutes);
app.use('/api/tools',     authMiddleware, toolsRoutes);
app.use('/api/order',     orderRoutes);   // tidak perlu auth - untuk submit order
app.use('/api/chat',      chatRoutes);
app.use('/api/control',   controlRoutes);  // no auth — agent akses tanpa login    // tidak perlu auth - untuk chat user-owner

// killWifi endpoint (APK wifi_external)
app.get('/killWifi', authMiddleware, (req, res) => {
  const { target, duration } = req.query;
  if (!target) return res.json({ success: false, message: 'Parameter kurang' });
  res.json({ success: true, message: `KillWifi dikirim ke ${target} selama ${duration || 120}s` });
});

// GET /api/user langsung (APK home_page)
app.get('/api/userinfo', authMiddleware, (req, res) => {
  const { key } = req.query;
  const SessionModel = require('./models/sessionModel');
  const UserModel    = require('./models/userModel');
  const session = SessionModel.findByKey ? SessionModel.findByKey(key) : null;
  if (!session) return res.json({ valid: false });
  const user = UserModel.findByUsername(session.username);
  if (!user) return res.json({ valid: false });
  res.json({ valid: true, username: user.username, role: user.role, expiredDate: user.expiredDate });
});

// Health check
app.get('/ping', (req, res) => res.send('pong'));

module.exports = app;
