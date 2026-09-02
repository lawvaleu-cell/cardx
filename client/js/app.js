// app.js — SPA router + all dashboard pages.
const state = { user: null, currentFlowBuilder: null };

function toast(message, type = '') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function esc(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(i18n.locale === 'ar' ? 'ar-DZ' : i18n.locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

const app = document.getElementById('app');

// Changing location.hash to the value it already holds does NOT fire a
// hashchange event in browsers — so redirects that target the current
// route (e.g. "go back to #/login while already on #/login") would
// otherwise leave the page frozen on the initial "Loading..." placeholder.
// This helper re-runs the router directly in that case instead of relying
// on a hash change that will never come.
function redirectTo(hash) {
  if (location.hash === hash) {
    router();
  } else {
    location.hash = hash;
  }
}

async function router() {
  try {
    const hash = location.hash.slice(1) || '/login';
    const [pathPart, query] = hash.split('?');
    const params = new URLSearchParams(query || '');
    const segs = pathPart.split('/').filter(Boolean);

    if (!api.token() && !['login', 'register', 'forgot'].includes(segs[0])) {
      return redirectTo('#/login');
    }
    if (api.token() && !state.user) {
      try { const r = await api.get('/api/auth/me'); state.user = r.user; }
      catch (e) { api.setToken(null); return redirectTo('#/login'); }
    }

    if (segs[0] === 'login') return renderAuth('login');
    if (segs[0] === 'register') return renderAuth('register');
    if (segs[0] === 'forgot') return renderAuth('forgot');

    renderShell(segs, params);
  } catch (err) {
    console.error('BotDZ router error:', err);
    app.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center">
        <div>
          <div style="font-size:15px;color:#dc2626;font-weight:700;margin-bottom:10px">حدث خطأ غير متوقع في التطبيق</div>
          <div style="font-size:13px;color:#6b7280;margin-bottom:16px">${esc(err.message || String(err))}</div>
          <button onclick="location.reload()" style="padding:10px 18px;border-radius:10px;border:none;background:#5B4CFF;color:#fff;font-weight:700;cursor:pointer">إعادة تحميل الصفحة</button>
        </div>
      </div>`;
  }
}
window.addEventListener('hashchange', router);
window.addEventListener('error', (e) => {
  console.error('BotDZ uncaught error:', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('BotDZ unhandled promise rejection:', e.reason);
});

// ---------------- AUTH PAGES ----------------
function renderAuth(mode) {
  document.body.classList.add('rtl', i18n.dict().dir === 'rtl' ? 'rtl' : '');
  let inner = '';
  if (mode === 'login') {
    inner = `
      <div class="auth-logo"><span class="dot" style="width:12px;height:12px;border-radius:4px;background:linear-gradient(135deg,#5B4CFF,#8b7bff)"></span> ${i18n.t('app_name')}</div>
      <div class="auth-sub">${i18n.t('login_subtitle')}</div>
      <div id="auth-error"></div>
      <form id="auth-form">
        <div class="field"><label>${i18n.t('email')}</label><input type="email" name="email" required></div>
        <div class="field"><label>${i18n.t('password')}</label><input type="password" name="password" required></div>
        <button class="btn btn-primary btn-block" type="submit">${i18n.t('login_btn')}</button>
      </form>
      <div class="auth-alt">
        <a href="#/forgot">${i18n.t('forgot_password')}</a><br><br>
        ${i18n.t('no_account')} <a href="#/register">${i18n.t('register_btn')}</a>
      </div>`;
  } else if (mode === 'register') {
    inner = `
      <div class="auth-logo"><span class="dot" style="width:12px;height:12px;border-radius:4px;background:linear-gradient(135deg,#5B4CFF,#8b7bff)"></span> ${i18n.t('app_name')}</div>
      <div class="auth-sub">${i18n.t('register_subtitle')}</div>
      <div id="auth-error"></div>
      <form id="auth-form">
        <div class="field"><label>${i18n.t('full_name')}</label><input name="name" required></div>
        <div class="field"><label>${i18n.t('email')}</label><input type="email" name="email" required></div>
        <div class="field"><label>${i18n.t('password')}</label><input type="password" name="password" minlength="6" required></div>
        <button class="btn btn-primary btn-block" type="submit">${i18n.t('register_btn')}</button>
      </form>
      <div class="auth-alt">${i18n.t('have_account')} <a href="#/login">${i18n.t('login_btn')}</a></div>`;
  } else {
    inner = `
      <div class="auth-logo">${i18n.t('app_name')}</div>
      <div class="auth-sub">${i18n.t('forgot_password')}</div>
      <div id="auth-error"></div>
      <form id="auth-form">
        <div class="field"><label>${i18n.t('email')}</label><input type="email" name="email" required></div>
        <button class="btn btn-primary btn-block" type="submit">${i18n.t('login_btn')}</button>
      </form>
      <div class="auth-alt"><a href="#/login">${i18n.t('login_btn')}</a></div>`;
  }

  app.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="lang-switch mb-16">${langButtons()}</div>
        ${inner}
      </div>
    </div>`;
  bindLangButtons(() => renderAuth(mode));

  const form = document.getElementById('auth-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const body = Object.fromEntries(fd.entries());
    const errEl = document.getElementById('auth-error');
    errEl.innerHTML = '';
    try {
      if (mode === 'login') {
        const r = await api.post('/api/auth/login', body);
        api.setToken(r.token); state.user = r.user;
        redirectTo('#/overview');
      } else if (mode === 'register') {
        const r = await api.post('/api/auth/register', body);
        api.setToken(r.token); state.user = r.user;
        redirectTo('#/overview');
      } else {
        await api.post('/api/auth/forgot-password', body);
        errEl.innerHTML = `<div class="ok-box">تم إرسال رابط إعادة التعيين إذا كان البريد مسجلاً لدينا.</div>`;
      }
    } catch (err) {
      errEl.innerHTML = `<div class="error-box">${esc(err.message)}</div>`;
    }
  });
}

function langButtons() {
  return ['ar', 'fr', 'en'].map((l) => `<button class="lang-btn ${i18n.locale === l ? 'active' : ''}" data-lang="${l}" type="button">${l.toUpperCase()}</button>`).join('');
}
function bindLangButtons(rerender) {
  document.querySelectorAll('[data-lang]').forEach((btn) => {
    btn.addEventListener('click', () => { i18n.setLocale(btn.dataset.lang); rerender(); });
  });
}

// ---------------- SHELL + NAV ----------------
const NAV_ITEMS = [
  { key: 'overview', icon: '📊', label: 'nav_overview' },
  { key: 'bots', icon: '🤖', label: 'nav_bots' },
  { key: 'create', icon: '➕', label: 'nav_create' },
  { key: 'conversations', icon: '💬', label: 'nav_conversations' },
  { key: 'analytics', icon: '📈', label: 'nav_analytics' },
  { key: 'billing', icon: '💳', label: 'nav_billing' },
  { key: 'settings', icon: '⚙️', label: 'nav_settings' }
];

function renderShell(segs, params) {
  const activeKey = segs[0] || 'overview';
  const isAdmin = state.user && state.user.role === 'admin';
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="sidebar-logo"><span class="dot"></span>${i18n.t('app_name')}</div>
        <nav>
          ${NAV_ITEMS.map((n) => `<a class="nav-item ${activeKey === n.key ? 'active' : ''}" href="#/${n.key}"><span class="ic">${n.icon}</span>${i18n.t(n.label)}</a>`).join('')}
          ${isAdmin ? `<a class="nav-item ${activeKey === 'admin' ? 'active' : ''}" href="#/admin"><span class="ic">🛡️</span>${i18n.t('nav_admin')}</a>` : ''}
        </nav>
        <div class="sidebar-foot">
          <div class="lang-switch">${langButtons()}</div>
          <div class="nav-item" id="logout-btn"><span class="ic">↩</span>${i18n.t('nav_logout')}</div>
        </div>
      </aside>
      <div class="main">
        <div class="topbar">
          <h1 id="page-title"></h1>
          <div class="muted small">${esc(state.user ? state.user.name : '')}</div>
        </div>
        <div class="content" id="page-content"><div class="skeleton" style="height:200px"></div></div>
      </div>
    </div>
    <div id="toast-root"></div>
  `;
  bindLangButtons(() => renderShell(segs, params));
  document.getElementById('logout-btn').addEventListener('click', () => {
    api.setToken(null); state.user = null; redirectTo('#/login');
  });

  const pageContent = document.getElementById('page-content');
  const pageTitle = document.getElementById('page-title');

  const pages = {
    overview: { title: i18n.t('nav_overview'), render: renderOverview },
    bots: { title: i18n.t('nav_bots'), render: renderBotsList },
    create: { title: i18n.t('create_new_chatbot'), render: renderCreateWizard },
    bot: { title: '', render: () => renderCreateWizard(pageContent, segs, params) },
    conversations: { title: i18n.t('nav_conversations'), render: renderConversations },
    analytics: { title: i18n.t('nav_analytics'), render: renderAnalytics },
    billing: { title: i18n.t('nav_billing'), render: renderBilling },
    settings: { title: i18n.t('nav_settings'), render: renderSettings },
    admin: { title: i18n.t('nav_admin'), render: renderAdmin }
  };
  const page = pages[activeKey] || pages.overview;
  pageTitle.textContent = page.title;
  page.render(pageContent, segs, params);
}

// ---------------- OVERVIEW ----------------
async function renderOverview(el) {
  try {
    const [ov, bots] = await Promise.all([api.get('/api/analytics/overview'), api.get('/api/chatbots')]);
    el.innerHTML = `
      <div class="stat-grid">
        ${statCard(i18n.t('stat_total_bots'), ov.totalChatbots)}
        ${statCard(i18n.t('stat_active_bots'), ov.activeChatbots)}
        ${statCard(i18n.t('stat_total_conversations'), ov.totalConversations)}
        ${statCard(i18n.t('stat_total_users'), ov.totalUsers)}
        ${statCard(i18n.t('stat_messages'), ov.totalMessages)}
      </div>
      <div class="section-head"><h2>${i18n.t('nav_bots')}</h2><a class="btn btn-primary btn-sm" href="#/create">+ ${i18n.t('create_new_chatbot')}</a></div>
      ${botGridHtml(bots.chatbots.slice(0, 6))}
    `;
    bindBotCardActions(el);
  } catch (e) { el.innerHTML = errorBlock(e); }
}
function statCard(label, value) {
  return `<div class="stat-card"><div class="label">${esc(label)}</div><div class="value">${value}</div></div>`;
}

// ---------------- BOTS LIST ----------------
async function renderBotsList(el) {
  try {
    const r = await api.get('/api/chatbots');
    el.innerHTML = `
      <div class="section-head"><h2>${i18n.t('nav_bots')}</h2><a class="btn btn-primary btn-sm" href="#/create">+ ${i18n.t('create_new_chatbot')}</a></div>
      ${botGridHtml(r.chatbots)}
    `;
    bindBotCardActions(el);
  } catch (e) { el.innerHTML = errorBlock(e); }
}

function botGridHtml(bots) {
  if (!bots.length) {
    return `<div class="empty-state"><div class="icon">🤖</div><h3>${i18n.t('empty_bots_title')}</h3><p>${i18n.t('empty_bots_sub')}</p><a class="btn btn-primary" href="#/create">+ ${i18n.t('create_new_chatbot')}</a></div>`;
  }
  return `<div class="bot-grid">${bots.map((b) => `
    <div class="bot-card">
      <div class="bot-card-top">
        <div class="bot-avatar">${esc(b.avatar || '🤖')}</div>
        <div>
          <div class="bot-name">${esc(b.name)}</div>
          <span class="badge ${b.status === 'active' ? 'badge-active' : 'badge-draft'}">${b.status === 'active' ? i18n.t('status_active') : i18n.t('status_draft')}</span>
        </div>
      </div>
      <div class="bot-desc">${esc(b.description || '')}</div>
      <div class="bot-meta"><span>${i18n.t('conversations_col')}: ${b.stats ? b.stats.conversations : 0}</span><span>${fmtDate(b.createdAt)}</span></div>
      <div class="bot-actions">
        <a class="btn btn-secondary btn-sm" href="#/bot/${b.id}">${i18n.t('open')}</a>
        <button class="btn btn-secondary btn-sm" data-preview="${b.id}">${i18n.t('preview')}</button>
        <button class="btn btn-secondary btn-sm" data-deploy="${b.id}">${i18n.t('deploy')}</button>
        <button class="btn btn-danger btn-sm" data-del="${b.id}">${i18n.t('delete')}</button>
      </div>
    </div>
  `).join('')}</div>`;
}

function bindBotCardActions(el) {
  el.querySelectorAll('[data-del]').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('سيتم حذف هذا البوت نهائيًا. متابعة؟')) return;
    try { await api.del(`/api/chatbots/${btn.dataset.del}`); toast('تم الحذف', 'success'); router(); }
    catch (e) { toast(e.message, 'error'); }
  }));
  el.querySelectorAll('[data-deploy]').forEach((btn) => btn.addEventListener('click', () => {
    redirectTo(`#/bot/${btn.dataset.deploy}?step=9`);
  }));
  el.querySelectorAll('[data-preview]').forEach((btn) => btn.addEventListener('click', () => {
    redirectTo(`#/bot/${btn.dataset.preview}?step=8`);
  }));
}

function errorBlock(e) { return `<div class="error-box">${esc(e.message)}</div>`; }

// ---------------- CREATE / EDIT WIZARD ----------------
const WIZARD_STEPS = ['basic', 'personality', 'language', 'welcome', 'questions', 'info', 'flow', 'preview', 'publish'];
const STEP_LABELS = { basic: 'step_basic', personality: 'step_personality', language: 'step_language', welcome: 'step_welcome', questions: 'step_questions', info: 'step_info', flow: 'step_flow', preview: 'step_preview', publish: 'step_publish' };
const WIZARD_CATEGORIES = ['customer_support', 'sales_assistant', 'restaurant', 'ecommerce', 'appointment_booking', 'medical_reception', 'hotel', 'education', 'company_assistant', 'faq', 'custom'];
const WIZARD_CATEGORY_LABELS = {
  ar: { customer_support: 'دعم العملاء', sales_assistant: 'مساعد مبيعات', restaurant: 'مطعم', ecommerce: 'متجر إلكتروني', appointment_booking: 'حجز مواعيد', medical_reception: 'استقبال طبي', hotel: 'فندق', education: 'تعليم', company_assistant: 'مساعد شركة', faq: 'أسئلة شائعة', custom: 'مخصص' },
  fr: { customer_support: 'Support client', sales_assistant: 'Assistant commercial', restaurant: 'Restaurant', ecommerce: 'E-commerce', appointment_booking: 'Prise de RDV', medical_reception: 'Réception médicale', hotel: 'Hôtel', education: 'Éducation', company_assistant: "Assistant d'entreprise", faq: 'FAQ', custom: 'Personnalisé' },
  en: { customer_support: 'Customer Support', sales_assistant: 'Sales Assistant', restaurant: 'Restaurant', ecommerce: 'E-commerce', appointment_booking: 'Appointment Booking', medical_reception: 'Medical Reception', hotel: 'Hotel', education: 'Education', company_assistant: 'Company Assistant', faq: 'FAQ Assistant', custom: 'Custom' }
};

async function renderCreateWizard(el, segs, params) {
  const botId = segs && segs[1];
  let bot = null, flow = null;
  let stepIndex = params && params.get('step') ? Math.max(0, Math.min(8, (+params.get('step')) - 1)) : 0;

  if (botId) {
    try {
      const r = await api.get(`/api/chatbots/${botId}`);
      bot = r.chatbot; flow = r.flow;
    } catch (e) { el.innerHTML = errorBlock(e); return; }
  } else {
    bot = { name: '', description: '', category: 'custom', avatar: '🤖', config: null };
  }

  renderWizardStep();

  function renderWizardStep() {
    el.innerHTML = `
      <div class="wizard-steps">
        ${WIZARD_STEPS.map((s, i) => `<span class="wizard-step-pill ${i === stepIndex ? 'active' : (i < stepIndex ? 'done' : '')}">${i + 1}. ${i18n.t(STEP_LABELS[s])}</span>`).join('')}
      </div>
      <div class="wizard">
        <div class="card-panel" id="wizard-panel"></div>
        <div>
          <h4 class="mb-8">${i18n.t('preview')}</h4>
          <div class="preview-shell" id="live-preview"></div>
        </div>
      </div>
    `;
    renderStepPanel();
    renderLivePreview();
  }

  function panelNav() {
    return `
      <div class="flex justify-between mb-24" style="margin-top:24px">
        ${stepIndex > 0 ? `<button class="btn btn-secondary" id="wiz-back">${i18n.t('back')}</button>` : '<span></span>'}
        <button class="btn btn-primary" id="wiz-next">${stepIndex === WIZARD_STEPS.length - 1 ? i18n.t('save') : i18n.t('next')}</button>
      </div>`;
  }

  function attachNav(saveFn) {
    const backBtn = document.getElementById('wiz-back');
    if (backBtn) backBtn.addEventListener('click', async () => { await saveFn(false); stepIndex--; renderWizardStep(); });
    document.getElementById('wiz-next').addEventListener('click', async () => {
      const ok = await saveFn(true);
      if (ok === false) return;
      if (stepIndex < WIZARD_STEPS.length - 1) { stepIndex++; renderWizardStep(); }
    });
  }

  async function ensureBotExists() {
    if (bot.id) return true;
    if (!bot.name) { toast('اكتب اسم البوت أولاً', 'error'); return false; }
    try {
      const r = await api.post('/api/chatbots', { name: bot.name, description: bot.description, category: bot.category, avatar: bot.avatar });
      bot = r.chatbot; flow = r.flow;
      history.replaceState(null, '', `#/bot/${bot.id}?step=${stepIndex + 1}`);
      return true;
    } catch (e) { toast(e.message, 'error'); return false; }
  }

  async function saveBot(patch) {
    if (!(await ensureBotExists())) return false;
    try {
      const r = await api.put(`/api/chatbots/${bot.id}`, patch);
      bot = r.chatbot;
      toast(i18n.t('saved'), 'success');
      return true;
    } catch (e) { toast(e.message, 'error'); return false; }
  }

  function renderStepPanel() {
    const panel = document.getElementById('wizard-panel');
    const step = WIZARD_STEPS[stepIndex];
    if (step === 'basic') return stepBasic(panel);
    if (step === 'personality') return stepPersonality(panel);
    if (step === 'language') return stepLanguage(panel);
    if (step === 'welcome') return stepWelcome(panel);
    if (step === 'questions') return stepQuestions(panel);
    if (step === 'info') return stepInfo(panel);
    if (step === 'flow') return stepFlow(panel);
    if (step === 'preview') return stepPreview(panel);
    if (step === 'publish') return stepPublish(panel);
  }

  function stepBasic(panel) {
    panel.innerHTML = `
      <h3>${i18n.t('step_basic')}</h3>
      <div class="field"><label>${i18n.t('bot_name')}</label><input id="f-name" value="${esc(bot.name)}"></div>
      <div class="field"><label>${i18n.t('bot_description')}</label><textarea id="f-desc" rows="2">${esc(bot.description)}</textarea></div>
      <div class="grid-2">
        <div class="field"><label>Avatar</label><input id="f-avatar" value="${esc(bot.avatar || '🤖')}"></div>
        <div class="field"><label>${i18n.t('bot_category')}</label>
          <select id="f-cat">${WIZARD_CATEGORIES.map((c) => `<option value="${c}" ${bot.category === c ? 'selected' : ''}>${(WIZARD_CATEGORY_LABELS[i18n.locale] || WIZARD_CATEGORY_LABELS.en)[c]}</option>`).join('')}</select>
        </div>
      </div>
      ${panelNav()}
    `;
    attachNav(async () => {
      bot.name = document.getElementById('f-name').value.trim();
      bot.description = document.getElementById('f-desc').value.trim();
      bot.avatar = document.getElementById('f-avatar').value.trim() || '🤖';
      bot.category = document.getElementById('f-cat').value;
      return bot.id ? await saveBot({ name: bot.name, description: bot.description, avatar: bot.avatar, category: bot.category }) : await ensureBotExists();
    });
  }

  function ensureConfig() {
    if (!bot.config) bot.config = defaultClientConfig(bot.name || 'Bot');
    return bot.config;
  }
  function defaultClientConfig(name) {
    return {
      languages: { default: 'ar', options: ['ar', 'darija', 'fr', 'en'], autoDetect: false },
      personality: { tone: 'friendly', responseLength: 50, emoji: 'normal' },
      welcomeMessage: `سلام 👋 مرحبا بك في ${name}`,
      quickQuestions: [],
      customerInfo: { fields: ['fullName', 'phone'], order: ['fullName', 'phone'] },
      unknownQuestion: { mode: 'custom', customResponse: 'سمحلي، ما عنديش معلومة مؤكدة على هذي النقطة.' },
      handoff: { channel: 'whatsapp', phone: '', email: '', message: 'راح نحولك لموظف حقيقي.' },
      appearance: { primaryColor: '#5B4CFF', secondaryColor: '#111827', background: '#FFFFFF', position: 'bottom-right', borderRadius: 16, fontSize: 14, buttonStyle: 'rounded', widgetSize: 'medium', logo: '' }
    };
  }

  function stepPersonality(panel) {
    const cfg = ensureConfig();
    const tones = [['professional', 'محترف'], ['friendly', 'ودود'], ['formal', 'رسمي'], ['casual', 'عفوي'], ['funny', 'فكاهي'], ['short_direct', 'مختصر ومباشر'], ['detailed', 'مفصّل']];
    const emojiOpts = [['none', 'بدون'], ['minimal', 'قليل'], ['normal', 'عادي'], ['frequent', 'كثير']];
    panel.innerHTML = `
      <h3>${i18n.t('step_personality')}</h3>
      <div class="field"><label>${i18n.t('tone')}</label>
        <div class="chips">${tones.map(([v, l]) => `<div class="chip ${cfg.personality.tone === v ? 'selected' : ''}" data-tone="${v}">${l}</div>`).join('')}</div>
      </div>
      <div class="field">
        <label>${i18n.t('response_length')}</label>
        <div class="range-row"><span>${i18n.t('short')}</span><input type="range" id="f-len" min="0" max="100" value="${cfg.personality.responseLength}"><span>${i18n.t('detailed')}</span></div>
      </div>
      <div class="field"><label>${i18n.t('emoji_usage')}</label>
        <div class="chips">${emojiOpts.map(([v, l]) => `<div class="chip ${cfg.personality.emoji === v ? 'selected' : ''}" data-emoji="${v}">${l}</div>`).join('')}</div>
      </div>
      ${panelNav()}
    `;
    panel.querySelectorAll('[data-tone]').forEach((c) => c.addEventListener('click', () => { cfg.personality.tone = c.dataset.tone; stepPersonality(panel); }));
    panel.querySelectorAll('[data-emoji]').forEach((c) => c.addEventListener('click', () => { cfg.personality.emoji = c.dataset.emoji; stepPersonality(panel); }));
    panel.querySelector('#f-len').addEventListener('input', (e) => { cfg.personality.responseLength = +e.target.value; renderLivePreview(); });
    attachNav(async () => saveBot({ config: bot.config }));
  }

  function stepLanguage(panel) {
    const cfg = ensureConfig();
    const langs = [['ar', 'العربية'], ['darija', i18n.t('darija')], ['fr', 'Français'], ['en', 'English'], ['auto', i18n.t('auto_detect')]];
    panel.innerHTML = `
      <h3>${i18n.t('step_language')}</h3>
      <div class="field"><label>${i18n.t('default_language')}</label>
        <div class="chips">${langs.map(([v, l]) => `<div class="chip ${cfg.languages.default === v ? 'selected' : ''}" data-def-lang="${v}">${l}</div>`).join('')}</div>
      </div>
      <label class="flex items-center gap-8 mb-16"><input type="checkbox" id="f-auto" ${cfg.languages.autoDetect ? 'checked' : ''}> كشف لغة الزائر تلقائيًا</label>
      <div class="field"><label>مثال على الرد بالدارجة الجزائرية</label>
        <div class="card-panel" style="background:#fafafa">
          <div class="bubble user" style="display:inline-block">سلام خويا، واش كاين عندكم؟</div><br><br>
          <div class="bubble bot" style="display:inline-block">وعليكم السلام خويا 👋 أكيد، كاين بزاف منتجات متوفرة. واش حاب تشوف؟</div>
        </div>
      </div>
      ${panelNav()}
    `;
    panel.querySelectorAll('[data-def-lang]').forEach((c) => c.addEventListener('click', () => { cfg.languages.default = c.dataset.defLang; stepLanguage(panel); }));
    panel.querySelector('#f-auto').addEventListener('change', (e) => { cfg.languages.autoDetect = e.target.checked; });
    attachNav(async () => saveBot({ config: bot.config }));
  }

  function stepWelcome(panel) {
    const cfg = ensureConfig();
    panel.innerHTML = `
      <h3>${i18n.t('step_welcome')}</h3>
      <div class="field"><label>${i18n.t('welcome_message')}</label><textarea id="f-welcome" rows="3">${esc(cfg.welcomeMessage)}</textarea></div>
      ${panelNav()}
    `;
    panel.querySelector('#f-welcome').addEventListener('input', (e) => { cfg.welcomeMessage = e.target.value; renderLivePreview(); });
    attachNav(async () => saveBot({ config: bot.config }));
  }

  function stepQuestions(panel) {
    const cfg = ensureConfig();
    panel.innerHTML = `
      <h3>${i18n.t('step_questions')}</h3>
      <div id="qq-list" class="mb-16"></div>
      <button class="btn btn-secondary btn-sm" id="qq-add">+ ${i18n.t('add_question')}</button>
      ${panelNav()}
    `;
    const listEl = panel.querySelector('#qq-list');
    function draw() {
      listEl.innerHTML = cfg.quickQuestions.map((q, i) => `
        <div class="flex gap-8 mb-8">
          <input value="${esc(q.icon || '❓')}" data-i="${i}" data-f="icon" style="width:50px;text-align:center">
          <input value="${esc(q.label)}" data-i="${i}" data-f="label" style="flex:1">
          <button class="btn btn-danger btn-sm" data-rm="${i}">✕</button>
        </div>`).join('') || `<div class="muted small">لا توجد أسئلة بعد.</div>`;
      listEl.querySelectorAll('input').forEach((inp) => inp.addEventListener('input', () => {
        cfg.quickQuestions[+inp.dataset.i][inp.dataset.f] = inp.value; renderLivePreview();
      }));
      listEl.querySelectorAll('[data-rm]').forEach((btn) => btn.addEventListener('click', () => {
        cfg.quickQuestions.splice(+btn.dataset.rm, 1); draw(); renderLivePreview();
      }));
    }
    draw();
    panel.querySelector('#qq-add').addEventListener('click', () => {
      cfg.quickQuestions.push({ id: 'q' + Date.now(), label: 'سؤال جديد', icon: '❓' });
      draw(); renderLivePreview();
    });
    attachNav(async () => saveBot({ config: bot.config }));
  }

  function stepInfo(panel) {
    const cfg = ensureConfig();
    const ALL = [['fullName', 'الاسم الكامل'], ['phone', 'رقم الهاتف'], ['email', 'البريد الإلكتروني'], ['wilaya', 'الولاية'], ['address', 'العنوان'], ['company', 'الشركة']];
    panel.innerHTML = `
      <h3>${i18n.t('step_info')}</h3>
      <div class="field">${ALL.map(([v, l]) => `
        <label class="flex items-center gap-8 mb-8"><input type="checkbox" data-field="${v}" ${cfg.customerInfo.fields.includes(v) ? 'checked' : ''}> ${l}</label>
      `).join('')}</div>
      <div class="muted small mb-16">ترتيب الحقول: ${cfg.customerInfo.fields.map((f) => (ALL.find((a) => a[0] === f) || [])[1] || f).join(' ← ') || '—'}</div>
      ${panelNav()}
    `;
    panel.querySelectorAll('[data-field]').forEach((cb) => cb.addEventListener('change', () => {
      const f = cb.dataset.field;
      if (cb.checked) { if (!cfg.customerInfo.fields.includes(f)) cfg.customerInfo.fields.push(f); }
      else { cfg.customerInfo.fields = cfg.customerInfo.fields.filter((x) => x !== f); }
      cfg.customerInfo.order = cfg.customerInfo.fields;
      stepInfo(panel);
    }));
    attachNav(async () => saveBot({ config: bot.config }));
  }

  function stepFlow(panel) {
    panel.innerHTML = `<h3>${i18n.t('flow_builder')}</h3><div id="flow-builder-host" style="height:560px"></div>${panelNav()}`;
    const host = panel.querySelector('#flow-builder-host');
    state.currentFlowBuilder = createFlowBuilder(host, flow || { nodes: [], edges: [] }, (newFlow) => { flow = newFlow; });
    attachNav(async () => {
      if (!(await ensureBotExists())) return false;
      try {
        await api.put(`/api/chatbots/${bot.id}/flow`, state.currentFlowBuilder.getFlow());
        toast(i18n.t('saved'), 'success');
        return true;
      } catch (e) { toast(e.message, 'error'); return false; }
    });
  }

  function stepPreview(panel) {
    panel.innerHTML = `<h3>${i18n.t('step_preview')}</h3><p class="muted">${i18n.t('test_chatbot')} — ${i18n.t('preview')} →</p>${panelNav()}`;
    attachNav(async () => true);
  }

  function stepPublish(panel) {
    const embedCode = bot.id ? `<script src="${location.origin}/widget.js" data-bot="${bot.id}"></scr` + `ipt>` : '';
    const realPublicUrl = bot.id ? `${location.origin}/chat/${bot.id}` : '';
    panel.innerHTML = `
      <h3>${i18n.t('step_publish')}</h3>
      ${bot.status === 'active' ? `<div class="ok-box">${i18n.t('published')}</div>` : ''}
      <button class="btn btn-primary mb-24" id="btn-publish">${i18n.t('publish')}</button>
      <div class="field"><label>${i18n.t('embed_code')}</label>
        <textarea rows="2" readonly>${esc(embedCode)}</textarea>
        <button class="btn btn-secondary btn-sm" style="margin-top:8px" id="copy-embed">${i18n.t('copy')}</button>
      </div>
      <div class="field"><label>${i18n.t('public_link')}</label>
        <input readonly value="${esc(realPublicUrl)}">
        <div class="flex gap-8" style="margin-top:8px">
          <button class="btn btn-secondary btn-sm" id="copy-link">${i18n.t('copy_link')}</button>
          <a class="btn btn-secondary btn-sm" href="${esc(realPublicUrl)}" target="_blank">${i18n.t('open')}</a>
        </div>
      </div>
      ${panelNav()}
    `;
    panel.querySelector('#btn-publish').addEventListener('click', async () => {
      if (!(await ensureBotExists())) return;
      try {
        const r = await api.post(`/api/chatbots/${bot.id}/publish`);
        bot = r.chatbot;
        toast(i18n.t('published'), 'success');
        stepPublish(panel);
      } catch (e) { toast(e.message, 'error'); }
    });
    const copyEmbed = panel.querySelector('#copy-embed');
    if (copyEmbed) copyEmbed.addEventListener('click', () => { navigator.clipboard.writeText(embedCode); toast(i18n.t('copied'), 'success'); });
    const copyLink = panel.querySelector('#copy-link');
    if (copyLink) copyLink.addEventListener('click', () => { navigator.clipboard.writeText(realPublicUrl); toast(i18n.t('copied'), 'success'); });
    attachNav(async () => true);
  }

  // ---------------- LIVE PREVIEW ----------------
  function renderLivePreview() {
    const previewEl = document.getElementById('live-preview');
    if (!previewEl) return;
    const cfg = bot.config || {};
    const primary = (cfg.appearance && cfg.appearance.primaryColor) || '#5B4CFF';
    const quickQs = (cfg.quickQuestions || []).map((q) => `<div class="bubble-btn" style="border-color:${primary};color:${primary}">${esc(q.icon || '')} ${esc(q.label)}</div>`).join('');
    previewEl.innerHTML = `
      <div class="preview-head" style="background:${primary}"><span>${esc(bot.avatar || '🤖')}</span><span>${esc(bot.name || 'Bot')}</span></div>
      <div class="preview-body">
        <div class="bubble bot">${esc(cfg.welcomeMessage || i18n.t('welcome_message'))}</div>
        ${quickQs ? `<div class="bubble-btns">${quickQs}</div>` : ''}
      </div>
      <div class="preview-input"><input placeholder="${i18n.t('write_message')}" disabled><button disabled>➤</button></div>
    `;
  }
}

// ---------------- CONVERSATIONS ----------------
async function renderConversations(el) {
  try {
    const bots = (await api.get('/api/chatbots')).chatbots;
    if (!bots.length) { el.innerHTML = `<div class="empty-state"><div class="icon">💬</div><h3>${i18n.t('empty_bots_title')}</h3></div>`; return; }
    el.innerHTML = `
      <div class="field" style="max-width:320px"><label>${i18n.t('nav_bots')}</label>
        <select id="conv-bot-select">${bots.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select>
      </div>
      <div id="conv-content"></div>
    `;
    const sel = el.querySelector('#conv-bot-select');
    const load = async () => {
      const a = await api.get(`/api/chatbots/${sel.value}/analytics`);
      el.querySelector('#conv-content').innerHTML = `
        <div class="stat-grid">
          ${statCard(i18n.t('conversations_col'), a.conversations)}
          ${statCard(i18n.t('stat_total_users'), a.uniqueVisitors)}
          ${statCard(i18n.t('stat_messages'), a.messages)}
          ${statCard('Human Handoffs', a.humanHandoffs)}
        </div>
        <p class="muted small">افتح الرابط العام للبوت لتجربة محادثة حقيقية تُسجَّل هنا فورًا.</p>
      `;
    };
    sel.addEventListener('change', load);
    load();
  } catch (e) { el.innerHTML = errorBlock(e); }
}

// ---------------- ANALYTICS ----------------
async function renderAnalytics(el) {
  try {
    const bots = (await api.get('/api/chatbots')).chatbots;
    if (!bots.length) { el.innerHTML = `<div class="empty-state"><div class="icon">📈</div><h3>${i18n.t('empty_bots_title')}</h3></div>`; return; }
    el.innerHTML = `
      <div class="field" style="max-width:320px"><label>${i18n.t('nav_bots')}</label>
        <select id="an-bot-select">${bots.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select>
      </div>
      <div id="an-content"></div>
    `;
    const sel = el.querySelector('#an-bot-select');
    const load = async () => {
      const a = await api.get(`/api/chatbots/${sel.value}/analytics`);
      el.querySelector('#an-content').innerHTML = `
        <div class="stat-grid">
          ${statCard(i18n.t('conversations_col'), a.conversations)}
          ${statCard(i18n.t('stat_total_users'), a.uniqueVisitors)}
          ${statCard(i18n.t('stat_messages'), a.messages)}
          ${statCard('Avg. length', a.avgConversationLength)}
          ${statCard('Handoffs', a.humanHandoffs)}
          ${statCard('Leads', a.leadsCollected)}
        </div>
        <div class="grid-2">
          <div class="card-panel">
            <h4>Most clicked buttons</h4>
            ${a.mostClickedButtons.length ? a.mostClickedButtons.map((b) => barRow(b.label, b.count, a.mostClickedButtons[0].count)).join('') : `<div class="muted small">لا توجد بيانات بعد</div>`}
          </div>
          <div class="card-panel">
            <h4>Most asked questions</h4>
            ${a.mostAskedQuestions.length ? a.mostAskedQuestions.map((b) => barRow(b.question, b.count, a.mostAskedQuestions[0].count)).join('') : `<div class="muted small">لا توجد بيانات بعد</div>`}
          </div>
        </div>
      `;
    };
    sel.addEventListener('change', load);
    load();
  } catch (e) { el.innerHTML = errorBlock(e); }
}
function barRow(label, value, max) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return `<div class="mb-8"><div class="flex justify-between small mb-8"><span>${esc(label)}</span><b>${value}</b></div>
    <div style="background:#f3f4f6;border-radius:6px;height:8px"><div style="background:#5B4CFF;width:${pct}%;height:8px;border-radius:6px"></div></div></div>`;
}

// ---------------- BILLING ----------------
async function renderBilling(el) {
  try {
    const [plansR, subR] = await Promise.all([api.get('/api/billing/plans'), api.get('/api/billing/subscription')]);
    const currentPlanId = subR.plan ? subR.plan.id : 'free';
    let cycle = 'monthly';
    const draw = () => {
      el.innerHTML = `
        <div class="section-head"><h2>${i18n.t('billing_plans')}</h2>
          <div class="pill-toggle">
            <button class="${cycle === 'monthly' ? 'active' : ''}" data-cycle="monthly">${i18n.t('month')}</button>
            <button class="${cycle === 'yearly' ? 'active' : ''}" data-cycle="yearly">${i18n.t('year')}</button>
          </div>
        </div>
        <div class="plans-grid mb-24">
          ${plansR.plans.map((p) => `
            <div class="plan-card ${p.id === currentPlanId ? 'current' : ''}">
              <div><strong>${esc(p.name)}</strong> ${p.id === currentPlanId ? `<span class="badge badge-active">${i18n.t('current_plan')}</span>` : ''}</div>
              <div class="plan-price">${cycle === 'monthly' ? p.priceMonthlyDA : p.priceYearlyDA} <span class="small muted">${cycle === 'monthly' ? i18n.t('per_month') : i18n.t('per_year')}</span></div>
              <div class="plan-feat">📦 ${p.maxBots >= 999 ? '∞' : p.maxBots} chatbots</div>
              <div class="plan-feat">💬 ${p.maxConversationsPerMonth >= 999999 ? '∞' : p.maxConversationsPerMonth} conversations/mo</div>
              ${p.features.map((f) => `<div class="plan-feat">✓ ${f.replace(/_/g, ' ')}</div>`).join('')}
              <button class="btn ${p.id === currentPlanId ? 'btn-secondary' : 'btn-primary'} btn-block" data-subscribe="${p.id}" ${p.id === currentPlanId ? 'disabled' : ''}>${p.id === currentPlanId ? i18n.t('current_plan') : i18n.t('upgrade')}</button>
            </div>
          `).join('')}
        </div>
        <h3>Invoices</h3>
        <table class="data-table">
          <thead><tr><th>Date</th><th>Amount (DA)</th><th>Status</th></tr></thead>
          <tbody>${subR.invoices.length ? subR.invoices.map((i) => `<tr><td>${fmtDate(i.createdAt)}</td><td>${i.amountDA}</td><td>${esc(i.status)}</td></tr>`).join('') : '<tr><td colspan="3" class="muted">No invoices yet</td></tr>'}</tbody>
        </table>
        <p class="muted small mb-24">لم يتم ربط بوابة دفع جزائرية بعد — البنية جاهزة وقابلة للربط لاحقًا. لا يتم تخزين أي بيانات بطاقة بنكية.</p>
      `;
      el.querySelectorAll('[data-cycle]').forEach((b) => b.addEventListener('click', () => { cycle = b.dataset.cycle; draw(); }));
      el.querySelectorAll('[data-subscribe]').forEach((b) => b.addEventListener('click', async () => {
        try {
          const r = await api.post('/api/billing/subscribe', { planId: b.dataset.subscribe, billingCycle: cycle });
          toast(r.note, 'success');
          renderBilling(el);
        } catch (e) { toast(e.message, 'error'); }
      }));
    };
    draw();
  } catch (e) { el.innerHTML = errorBlock(e); }
}

// ---------------- SETTINGS ----------------
async function renderSettings(el) {
  el.innerHTML = `
    <div class="card-panel" style="max-width:480px">
      <h3>Profile</h3>
      <div class="field"><label>${i18n.t('full_name')}</label><input id="s-name" value="${esc(state.user.name)}"></div>
      <div class="field"><label>${i18n.t('email')}</label><input value="${esc(state.user.email)}" disabled></div>
      <button class="btn btn-primary" id="s-save">${i18n.t('save')}</button>
      <hr style="margin:24px 0;border-color:var(--border)">
      <h3>Change password</h3>
      <div class="field"><label>Current password</label><input type="password" id="s-cur"></div>
      <div class="field"><label>New password</label><input type="password" id="s-new"></div>
      <button class="btn btn-secondary" id="s-pw">Update password</button>
    </div>
  `;
  el.querySelector('#s-save').addEventListener('click', async () => {
    try { const r = await api.put('/api/auth/me', { name: el.querySelector('#s-name').value }); state.user = r.user; toast(i18n.t('saved'), 'success'); }
    catch (e) { toast(e.message, 'error'); }
  });
  el.querySelector('#s-pw').addEventListener('click', async () => {
    try {
      await api.post('/api/auth/change-password', { currentPassword: el.querySelector('#s-cur').value, newPassword: el.querySelector('#s-new').value });
      toast(i18n.t('saved'), 'success');
    } catch (e) { toast(e.message, 'error'); }
  });
}

// ---------------- ADMIN ----------------
async function renderAdmin(el) {
  if (!state.user || state.user.role !== 'admin') { el.innerHTML = errorBlock({ message: 'Admin access required' }); return; }
  let tab = 'users';
  const draw = async () => {
    el.innerHTML = `
      <div class="pill-toggle mb-24">
        ${['users', 'chatbots', 'conversations', 'plans', 'payments'].map((t) => `<button class="${tab === t ? 'active' : ''}" data-tab="${t}">${i18n.t('admin_' + t)}</button>`).join('')}
      </div>
      <div id="admin-content"><div class="skeleton" style="height:200px"></div></div>
    `;
    el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; draw(); }));
    const content = el.querySelector('#admin-content');
    try {
      if (tab === 'users') {
        const r = await api.get('/api/admin/users');
        content.innerHTML = `<table class="data-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>
          ${r.users.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.role)}</td><td>${u.suspended ? 'Suspended' : 'Active'}</td>
            <td><button class="btn btn-secondary btn-sm" data-susp="${u.id}" data-val="${!u.suspended}">${u.suspended ? i18n.t('unsuspend') : i18n.t('suspend')}</button>
            <button class="btn btn-danger btn-sm" data-deluser="${u.id}">${i18n.t('delete')}</button></td></tr>`).join('')}
        </tbody></table>`;
        content.querySelectorAll('[data-susp]').forEach((b) => b.addEventListener('click', async () => {
          await api.put(`/api/admin/users/${b.dataset.susp}/suspend`, { suspended: b.dataset.val === 'true' }); draw();
        }));
        content.querySelectorAll('[data-deluser]').forEach((b) => b.addEventListener('click', async () => {
          if (!confirm('Delete this user and all their bots?')) return;
          await api.del(`/api/admin/users/${b.dataset.deluser}`); draw();
        }));
      } else if (tab === 'chatbots') {
        const r = await api.get('/api/admin/chatbots');
        content.innerHTML = `<table class="data-table"><thead><tr><th>Name</th><th>Owner</th><th>Status</th><th>Category</th></tr></thead><tbody>
          ${r.chatbots.map((b) => `<tr><td>${esc(b.name)}</td><td>${esc(b.ownerId).slice(0, 8)}</td><td>${esc(b.status)}</td><td>${esc(b.category)}</td></tr>`).join('')}
        </tbody></table>`;
      } else if (tab === 'conversations') {
        const r = await api.get('/api/admin/conversations');
        content.innerHTML = `<table class="data-table"><thead><tr><th>Bot</th><th>Channel</th><th>Started</th></tr></thead><tbody>
          ${r.conversations.map((c) => `<tr><td>${esc(c.botId).slice(0, 8)}</td><td>${esc(c.channel)}</td><td>${fmtDate(c.startedAt)}</td></tr>`).join('')}
        </tbody></table>`;
      } else if (tab === 'plans') {
        const r = await api.get('/api/admin/plans');
        content.innerHTML = `<table class="data-table"><thead><tr><th>Plan</th><th>Monthly (DA)</th><th>Yearly (DA)</th><th>Max bots</th></tr></thead><tbody>
          ${r.plans.map((p) => `<tr><td>${esc(p.name)}</td><td>${p.priceMonthlyDA}</td><td>${p.priceYearlyDA}</td><td>${p.maxBots}</td></tr>`).join('')}
        </tbody></table>`;
      } else if (tab === 'payments') {
        const r = await api.get('/api/admin/payments');
        content.innerHTML = `<table class="data-table"><thead><tr><th>User</th><th>Amount (DA)</th><th>Status</th><th>Date</th></tr></thead><tbody>
          ${r.invoices.length ? r.invoices.map((i) => `<tr><td>${esc(i.userId).slice(0, 8)}</td><td>${i.amountDA}</td><td>${esc(i.status)}</td><td>${fmtDate(i.createdAt)}</td></tr>`).join('') : '<tr><td colspan="4" class="muted">No payments yet</td></tr>'}
        </tbody></table>`;
      }
    } catch (e) { content.innerHTML = errorBlock(e); }
  };
  draw();
}

router();
