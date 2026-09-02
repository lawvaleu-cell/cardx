// db.js — lightweight file-backed JSON database.
// Not meant to replace Postgres/Mongo in a real deployment, but gives the
// whole app real persistence (survives restarts) without native build deps.
// Swapping this module for a real DB client later only touches this file,
// since every route goes through db.get/db.insert/db.update/db.remove.

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data', 'db.json');

const DEFAULT_DATA = {
  users: [],
  chatbots: [],
  flows: [],       // { id, botId, nodes: [], edges: [] }
  conversations: [], // { id, botId, visitorId, startedAt, channel }
  messages: [],     // { id, conversationId, from: 'bot'|'user', text, nodeId, createdAt }
  events: [],       // analytics events { id, botId, type, payload, createdAt }
  plans: [
    { id: 'free', name: 'Free', priceMonthlyDA: 0, priceYearlyDA: 0, maxBots: 1, maxConversationsPerMonth: 200, features: ['embed_widget_basic', 'public_link'] },
    { id: 'starter', name: 'Starter', priceMonthlyDA: 2500, priceYearlyDA: 25000, maxBots: 5, maxConversationsPerMonth: 3000, features: ['embed_widget', 'custom_branding'] },
    { id: 'pro', name: 'Pro', priceMonthlyDA: 6500, priceYearlyDA: 65000, maxBots: 20, maxConversationsPerMonth: 20000, features: ['advanced_flows', 'analytics', 'remove_branding'] },
    { id: 'business', name: 'Business', priceMonthlyDA: 15000, priceYearlyDA: 150000, maxBots: 999, maxConversationsPerMonth: 999999, features: ['team_members', 'advanced_analytics', 'priority_support'] }
  ],
  subscriptions: [], // { id, userId, planId, status, billingCycle, currentPeriodEnd, createdAt }
  invoices: []        // { id, userId, subscriptionId, amountDA, status, createdAt }
};

function load() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_DATA, null, 2));
  }
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }
}

let cache = load();
let writeQueued = false;

function persist() {
  if (writeQueued) return;
  writeQueued = true;
  setImmediate(() => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(cache, null, 2));
    writeQueued = false;
  });
}

const db = {
  all(collection) {
    return cache[collection] || [];
  },
  find(collection, predicate) {
    return (cache[collection] || []).find(predicate);
  },
  filter(collection, predicate) {
    return (cache[collection] || []).filter(predicate);
  },
  insert(collection, record) {
    if (!cache[collection]) cache[collection] = [];
    cache[collection].push(record);
    persist();
    return record;
  },
  update(collection, id, patch) {
    const list = cache[collection] || [];
    const idx = list.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...patch };
    persist();
    return list[idx];
  },
  remove(collection, id) {
    const list = cache[collection] || [];
    const idx = list.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    list.splice(idx, 1);
    persist();
    return true;
  },
  raw() {
    return cache;
  }
};

module.exports = db;
