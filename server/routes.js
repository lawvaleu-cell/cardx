const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('./db');
const { authRequired, adminRequired, sanitize } = require('./auth');

const router = express.Router();

function getPlan(planId) {
  return db.find('plans', (p) => p.id === planId) || db.find('plans', (p) => p.id === 'free');
}
function getUserSubscription(userId) {
  return db.find('subscriptions', (s) => s.userId === userId && s.status === 'active') || null;
}

// ---------- CHATBOTS ----------
router.get('/chatbots', authRequired, (req, res) => {
  const bots = db.filter('chatbots', (b) => b.ownerId === req.user.id);
  const withStats = bots.map((b) => ({
    ...b,
    stats: statsFor(b.id)
  }));
  res.json({ chatbots: withStats });
});

router.post('/chatbots', authRequired, (req, res) => {
  const sub = getUserSubscription(req.user.id);
  const plan = getPlan(sub ? sub.planId : 'free');
  const existing = db.filter('chatbots', (b) => b.ownerId === req.user.id);
  if (existing.length >= plan.maxBots) {
    return res.status(402).json({ error: `Your ${plan.name} plan allows up to ${plan.maxBots} chatbot(s). Upgrade to create more.` });
  }
  const { name, description, category, avatar } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Bot name is required' });
  const bot = db.insert('chatbots', {
    id: uuid(),
    ownerId: req.user.id,
    name,
    description: description || '',
    category: category || 'custom',
    avatar: avatar || '🤖',
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: defaultConfig(name)
  });
  const flow = db.insert('flows', {
    id: uuid(),
    botId: bot.id,
    nodes: defaultFlowNodes(),
    edges: defaultFlowEdges()
  });
  res.json({ chatbot: bot, flow });
});

router.get('/chatbots/:id', authRequired, (req, res) => {
  const bot = getOwnedBot(req, res);
  if (!bot) return;
  const flow = db.find('flows', (f) => f.botId === bot.id);
  res.json({ chatbot: bot, flow, stats: statsFor(bot.id) });
});

router.put('/chatbots/:id', authRequired, (req, res) => {
  const bot = getOwnedBot(req, res);
  if (!bot) return;
  const allowed = ['name', 'description', 'category', 'avatar', 'status', 'config'];
  const patch = {};
  for (const k of allowed) if (k in (req.body || {})) patch[k] = req.body[k];
  patch.updatedAt = new Date().toISOString();
  const updated = db.update('chatbots', bot.id, patch);
  res.json({ chatbot: updated });
});

router.delete('/chatbots/:id', authRequired, (req, res) => {
  const bot = getOwnedBot(req, res);
  if (!bot) return;
  db.remove('chatbots', bot.id);
  const flow = db.find('flows', (f) => f.botId === bot.id);
  if (flow) db.remove('flows', flow.id);
  res.json({ ok: true });
});

router.post('/chatbots/:id/publish', authRequired, (req, res) => {
  const bot = getOwnedBot(req, res);
  if (!bot) return;
  const updated = db.update('chatbots', bot.id, { status: 'active', publishedAt: new Date().toISOString() });
  res.json({
    chatbot: updated,
    publicUrl: `/chat/${bot.id}`,
    embedSnippet: `<script src="${req.protocol}://${req.get('host')}/widget.js" data-bot="${bot.id}"></script>`
  });
});

// ---------- FLOWS ----------
router.get('/chatbots/:id/flow', authRequired, (req, res) => {
  const bot = getOwnedBot(req, res);
  if (!bot) return;
  const flow = db.find('flows', (f) => f.botId === bot.id);
  res.json({ flow });
});

router.put('/chatbots/:id/flow', authRequired, (req, res) => {
  const bot = getOwnedBot(req, res);
  if (!bot) return;
  const { nodes, edges } = req.body || {};
  let flow = db.find('flows', (f) => f.botId === bot.id);
  if (!flow) {
    flow = db.insert('flows', { id: uuid(), botId: bot.id, nodes: nodes || [], edges: edges || [] });
  } else {
    flow = db.update('flows', flow.id, { nodes: nodes || flow.nodes, edges: edges || flow.edges });
  }
  res.json({ flow });
});

// ---------- ANALYTICS ----------
router.get('/chatbots/:id/analytics', authRequired, (req, res) => {
  const bot = getOwnedBot(req, res);
  if (!bot) return;
  res.json(analyticsFor(bot.id));
});

router.get('/analytics/overview', authRequired, (req, res) => {
  const bots = db.filter('chatbots', (b) => b.ownerId === req.user.id);
  const botIds = new Set(bots.map((b) => b.id));
  const conversations = db.filter('conversations', (c) => botIds.has(c.botId));
  const messages = db.filter('messages', (m) => conversations.some((c) => c.id === m.conversationId));
  const uniqueVisitors = new Set(conversations.map((c) => c.visitorId)).size;
  res.json({
    totalChatbots: bots.length,
    activeChatbots: bots.filter((b) => b.status === 'active').length,
    totalConversations: conversations.length,
    totalUsers: uniqueVisitors,
    totalMessages: messages.length
  });
});

function analyticsFor(botId) {
  const conversations = db.filter('conversations', (c) => c.botId === botId);
  const convIds = new Set(conversations.map((c) => c.id));
  const messages = db.filter('messages', (m) => convIds.has(m.conversationId));
  const events = db.filter('events', (e) => e.botId === botId);
  const buttonClicks = {};
  const questionsAsked = {};
  events.forEach((e) => {
    if (e.type === 'button_click') {
      buttonClicks[e.payload.label] = (buttonClicks[e.payload.label] || 0) + 1;
    }
    if (e.type === 'quick_question') {
      questionsAsked[e.payload.question] = (questionsAsked[e.payload.question] || 0) + 1;
    }
  });
  const handoffs = events.filter((e) => e.type === 'human_handoff').length;
  const leads = events.filter((e) => e.type === 'lead_collected').length;
  const avgLen = conversations.length
    ? messages.length / conversations.length
    : 0;
  return {
    conversations: conversations.length,
    uniqueVisitors: new Set(conversations.map((c) => c.visitorId)).size,
    messages: messages.length,
    avgConversationLength: Number(avgLen.toFixed(1)),
    humanHandoffs: handoffs,
    leadsCollected: leads,
    mostClickedButtons: Object.entries(buttonClicks).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, count]) => ({ label, count })),
    mostAskedQuestions: Object.entries(questionsAsked).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([question, count]) => ({ question, count })),
    conversationsByDay: bucketByDay(conversations)
  };
}

function bucketByDay(conversations) {
  const map = {};
  conversations.forEach((c) => {
    const day = (c.startedAt || '').slice(0, 10);
    map[day] = (map[day] || 0) + 1;
  });
  return Object.entries(map).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, count]) => ({ date, count }));
}

function statsFor(botId) {
  const conversations = db.filter('conversations', (c) => c.botId === botId);
  return { conversations: conversations.length };
}

// ---------- BILLING ----------
router.get('/billing/plans', (req, res) => {
  res.json({ plans: db.all('plans') });
});

router.get('/billing/subscription', authRequired, (req, res) => {
  const sub = getUserSubscription(req.user.id);
  const plan = getPlan(sub ? sub.planId : 'free');
  const invoices = db.filter('invoices', (i) => i.userId === req.user.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  res.json({ subscription: sub, plan, invoices });
});

// NOTE: this intentionally does not process real payments. Real Algerian
// payment gateway integration (CIB/EDAHABIA/SATIM etc.) plugs in here later
// as its own module — see server/routes.js "billing" section — without
// touching subscription/plan modeling above it. No card data is ever stored.
router.post('/billing/subscribe', authRequired, (req, res) => {
  const { planId, billingCycle } = req.body || {};
  const plan = getPlan(planId);
  if (!plan) return res.status(400).json({ error: 'Unknown plan' });
  const cycle = billingCycle === 'yearly' ? 'yearly' : 'monthly';
  const existing = getUserSubscription(req.user.id);
  if (existing) db.update('subscriptions', existing.id, { status: 'cancelled' });
  const periodDays = cycle === 'yearly' ? 365 : 30;
  const sub = db.insert('subscriptions', {
    id: uuid(),
    userId: req.user.id,
    planId: plan.id,
    status: 'pending_payment',
    billingCycle: cycle,
    currentPeriodEnd: new Date(Date.now() + periodDays * 86400000).toISOString(),
    createdAt: new Date().toISOString()
  });
  const amount = cycle === 'yearly' ? plan.priceYearlyDA : plan.priceMonthlyDA;
  const invoice = db.insert('invoices', {
    id: uuid(),
    userId: req.user.id,
    subscriptionId: sub.id,
    amountDA: amount,
    status: amount === 0 ? 'paid' : 'awaiting_gateway',
    createdAt: new Date().toISOString()
  });
  if (amount === 0) db.update('subscriptions', sub.id, { status: 'active' });
  res.json({
    subscription: db.find('subscriptions', (s) => s.id === sub.id),
    invoice,
    note: amount === 0
      ? 'Free plan activated immediately.'
      : 'Subscription created — awaiting a connected Algerian payment gateway to confirm payment before activation.'
  });
});

router.post('/billing/cancel', authRequired, (req, res) => {
  const sub = getUserSubscription(req.user.id);
  if (!sub) return res.status(400).json({ error: 'No active subscription' });
  db.update('subscriptions', sub.id, { status: 'cancelled' });
  res.json({ ok: true });
});

// ---------- ADMIN ----------
router.get('/admin/users', authRequired, adminRequired, (req, res) => {
  res.json({ users: db.all('users').map(sanitize) });
});
router.put('/admin/users/:id/suspend', authRequired, adminRequired, (req, res) => {
  const u = db.update('users', req.params.id, { suspended: !!req.body.suspended });
  if (!u) return res.status(404).json({ error: 'User not found' });
  res.json({ user: sanitize(u) });
});
router.delete('/admin/users/:id', authRequired, adminRequired, (req, res) => {
  db.remove('users', req.params.id);
  db.filter('chatbots', (b) => b.ownerId === req.params.id).forEach((b) => db.remove('chatbots', b.id));
  res.json({ ok: true });
});
router.get('/admin/chatbots', authRequired, adminRequired, (req, res) => {
  res.json({ chatbots: db.all('chatbots') });
});
router.get('/admin/conversations', authRequired, adminRequired, (req, res) => {
  res.json({ conversations: db.all('conversations').slice(-200) });
});
router.get('/admin/payments', authRequired, adminRequired, (req, res) => {
  res.json({ invoices: db.all('invoices') });
});
router.get('/admin/plans', authRequired, adminRequired, (req, res) => {
  res.json({ plans: db.all('plans') });
});
router.put('/admin/plans/:id', authRequired, adminRequired, (req, res) => {
  const plans = db.all('plans');
  const idx = plans.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Plan not found' });
  Object.assign(plans[idx], req.body || {});
  res.json({ plan: plans[idx] });
});

// ---------- helpers ----------
function getOwnedBot(req, res) {
  const bot = db.find('chatbots', (b) => b.id === req.params.id);
  if (!bot) { res.status(404).json({ error: 'Chatbot not found' }); return null; }
  if (bot.ownerId !== req.user.id && req.user.role !== 'admin') {
    res.status(403).json({ error: 'You do not have access to this chatbot' });
    return null;
  }
  return bot;
}

function defaultConfig(name) {
  return {
    languages: { default: 'ar', options: ['ar', 'darija', 'fr', 'en'], autoDetect: false },
    personality: { tone: 'friendly', responseLength: 50, emoji: 'normal' },
    welcomeMessage: `سلام 👋 مرحبا بك في ${name}، واش نقدر نعاونك فيه؟`,
    quickQuestions: [
      { id: uuid(), label: 'ما هي الأسعار؟', icon: '💰' },
      { id: uuid(), label: 'كيف يمكنني الطلب؟', icon: '🛒' },
      { id: uuid(), label: 'هل يوجد توصيل؟', icon: '🚚' }
    ],
    customerInfo: { fields: ['fullName', 'phone'], order: ['fullName', 'phone'] },
    unknownQuestion: { mode: 'custom', customResponse: 'سمحلي، ما عنديش معلومة مؤكدة على هذي النقطة. تقدر تتواصل مع الفريق تاعنا.' },
    handoff: { channel: 'whatsapp', phone: '', email: '', message: 'راح نحولك لموظف حقيقي، لحظة من فضلك.' },
    appearance: {
      primaryColor: '#5B4CFF',
      secondaryColor: '#111827',
      background: '#FFFFFF',
      position: 'bottom-right',
      borderRadius: 16,
      fontSize: 14,
      buttonStyle: 'rounded',
      widgetSize: 'medium',
      logo: ''
    }
  };
}

const DEFAULT_START_ID = 'n-start';
const DEFAULT_MSG_ID = 'n-welcome';
const DEFAULT_BTN_ID = 'n-menu';

function defaultFlowNodes() {
  return [
    { id: DEFAULT_START_ID, type: 'start', position: { x: 60, y: 60 }, data: {} },
    { id: DEFAULT_MSG_ID, type: 'message', position: { x: 60, y: 190 }, data: { text: 'سلام 👋 واش نقدر نعاونك فيه؟' } },
    { id: DEFAULT_BTN_ID, type: 'buttons', position: { x: 60, y: 320 }, data: { text: 'اختر من فضلك:', options: [
      { label: 'المنتجات', value: 'products' },
      { label: 'الأسعار', value: 'pricing' },
      { label: 'التواصل معنا', value: 'contact' }
    ] } }
  ];
}
function defaultFlowEdges() {
  return [
    { id: 'e1', source: DEFAULT_START_ID, target: DEFAULT_MSG_ID },
    { id: 'e2', source: DEFAULT_MSG_ID, target: DEFAULT_BTN_ID }
  ];
}

module.exports = router;
