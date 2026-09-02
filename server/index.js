const express = require('express');
const cors = require('cors');
const path = require('path');

const { router: authRouter } = require('./auth');
const apiRouter = require('./routes');
const publicRouter = require('./public');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// API
app.use('/api/auth', authRouter);
app.use('/api', apiRouter);
app.use('/', publicRouter); // /api/public/* + /widget.js

// Static client (SPA)
const clientDir = path.join(__dirname, '..', 'client');
app.use(express.static(clientDir));

// Public standalone chat page: /chat/:botId
app.get('/chat/:botId', (req, res) => {
  res.sendFile(path.join(clientDir, 'public-chat.html'));
});

// SPA fallback for everything else (dashboard app)
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`BotDZ server running on http://localhost:${PORT}`);
});
