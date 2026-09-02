const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuid } = require('uuid');
const db = require('./db');
const { step, isGreeting } = require('./flowEngine');

const router = express.Router();

function getActiveBot(botId) {
  const bot = db.find('chatbots', (b) => b.id === botId);
  if (!bot) return null;
  return bot;
}

function logEvent(botId, type, payload) {
  db.insert('events', { id: uuid(), botId, type, payload: payload || {}, createdAt: new Date().toISOString() });
}

// GET public bot config (safe subset) — used by the widget + public page + preview
router.get('/api/public/bots/:id', (req, res) => {
  const bot = getActiveBot(req.params.id);
  if (!bot) return res.status(404).json({ error: 'Chatbot not found' });
  res.json({
    id: bot.id,
    name: bot.name,
    avatar: bot.avatar,
    status: bot.status,
    config: bot.config
  });
});

// Start (or continue) a conversation. Body: { conversationId?, visitorId, input?, buttonValue? }
router.post('/api/public/bots/:id/message', (req, res) => {
  const bot = getActiveBot(req.params.id);
  if (!bot) return res.status(404).json({ error: 'Chatbot not found' });

  const flow = db.find('flows', (f) => f.botId === bot.id);
  if (!flow) return res.status(400).json({ error: 'This bot has no conversation flow configured yet' });

  const { visitorId, input, buttonValue, currentNodeId, conversationId, channel } = req.body || {};
  let conv = conversationId ? db.find('conversations', (c) => c.id === conversationId) : null;
  if (!conv) {
    conv = db.insert('conversations', {
      id: uuid(),
      botId: bot.id,
      visitorId: visitorId || uuid(),
      startedAt: new Date().toISOString(),
      channel: channel || 'widget'
    });
  }

  const userSaid = buttonValue || input || null;
  if (userSaid) {
    db.insert('messages', { id: uuid(), conversationId: conv.id, from: 'user', text: userSaid, createdAt: new Date().toISOString() });
    if (buttonValue) logEvent(bot.id, 'button_click', { label: userSaid });
  }

  const result = step(flow, bot.config, currentNodeId || null, userSaid);
  result.turns.forEach((t) => {
    if (t.text) db.insert('messages', { id: uuid(), conversationId: conv.id, from: 'bot', text: t.text, nodeId: t.nodeId, createdAt: new Date().toISOString() });
    if (t.type === 'handoff') logEvent(bot.id, 'human_handoff', {});
    if (t.type === 'input' && ['phone', 'email'].includes(t.inputType)) {
      // will be logged as a lead once the value actually comes back in a later call
    }
  });
  if (userSaid && currentNodeId) {
    const prevNode = (flow.nodes || []).find((n) => n.id === currentNodeId);
    if (prevNode && ['phone_input', 'email_input', 'text_input', 'number_input'].includes(prevNode.type)) {
      logEvent(bot.id, 'lead_collected', { field: prevNode.data.field, value: userSaid });
    }
  }

  res.json({
    conversationId: conv.id,
    nodeId: result.nodeId,
    turns: result.turns,
    done: result.done
  });
});

// widget.js — the real embeddable script referenced by <script data-bot="ID">
router.get('/widget.js', (req, res) => {
  const filePath = path.join(__dirname, '..', 'client', 'widget-embed.js');
  res.type('application/javascript');
  fs.createReadStream(filePath).pipe(res);
});

module.exports = router;
