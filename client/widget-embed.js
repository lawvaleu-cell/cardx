(function () {
  var scriptEl = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();
  var botId = scriptEl.getAttribute('data-bot');
  if (!botId) { console.error('BotDZ widget: missing data-bot attribute'); return; }
  var origin = (function () {
    var src = scriptEl.getAttribute('src');
    var a = document.createElement('a');
    a.href = src;
    return a.protocol + '//' + a.host;
  })();

  var visitorId = localStorage.getItem('botdz_visitor_' + botId);
  if (!visitorId) {
    visitorId = 'v_' + Math.random().toString(36).slice(2);
    localStorage.setItem('botdz_visitor_' + botId, visitorId);
  }

  var conversationId = null;
  var currentNodeId = null;
  var config = null;
  var open = false;

  var root = document.createElement('div');
  root.id = 'botdz-widget-root';
  document.body.appendChild(root);

  var style = document.createElement('style');
  style.textContent = [
    '#botdz-widget-root{position:fixed;z-index:999999;font-family:system-ui,-apple-system,Segoe UI,sans-serif}',
    '.botdz-fab{position:fixed;width:58px;height:58px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:26px;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.2);border:none;color:#fff}',
    '.botdz-window{position:fixed;width:340px;max-width:92vw;height:480px;max-height:75vh;background:#fff;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.2);display:flex;flex-direction:column;overflow:hidden}',
    '.botdz-head{padding:14px 16px;color:#fff;display:flex;align-items:center;gap:10px;font-weight:700}',
    '.botdz-body{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:#fafafa}',
    '.botdz-bubble{max-width:80%;padding:9px 12px;border-radius:14px;font-size:13.5px;line-height:1.45}',
    '.botdz-bubble.bot{align-self:flex-start;background:#fff;border:1px solid #e5e7eb;border-bottom-left-radius:4px}',
    '.botdz-bubble.user{align-self:flex-end;color:#fff;border-bottom-right-radius:4px}',
    '.botdz-btns{display:flex;flex-wrap:wrap;gap:6px;align-self:flex-start;max-width:92%}',
    '.botdz-btn{padding:7px 11px;border-radius:9px;border:1.5px solid;background:#fff;font-size:12.5px;font-weight:700;cursor:pointer}',
    '.botdz-input-row{display:flex;gap:6px;padding:10px;border-top:1px solid #e5e7eb;background:#fff}',
    '.botdz-input-row input{flex:1;border:1px solid #e5e7eb;border-radius:9px;padding:8px 10px;font-size:13px}',
    '.botdz-input-row button{border:none;color:#fff;border-radius:9px;width:36px;height:36px;cursor:pointer}',
    '.botdz-link{display:inline-block;padding:8px 12px;border-radius:9px;color:#fff;text-decoration:none;font-size:12.5px;font-weight:700;align-self:flex-start}'
  ].join('');
  document.head.appendChild(style);

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'style') Object.assign(e.style, attrs[k]);
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }

  fetch(origin + '/api/public/bots/' + botId)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      config = data.config || {};
      renderFab();
    })
    .catch(function (err) { console.error('BotDZ widget failed to load bot config', err); });

  function primaryColor() { return (config && config.appearance && config.appearance.primaryColor) || '#5B4CFF'; }
  function positionStyle(isWindow) {
    var pos = (config && config.appearance && config.appearance.position) || 'bottom-right';
    var side = pos.indexOf('left') !== -1 ? 'left' : 'right';
    var vert = pos.indexOf('top') !== -1 ? 'top' : 'bottom';
    var s = {};
    s[vert] = isWindow ? '90px' : '24px';
    s[side] = '24px';
    return s;
  }

  var fabEl, windowEl, bodyEl, inputEl;

  function renderFab() {
    fabEl = el('button', {
      class: 'botdz-fab',
      style: Object.assign({ background: primaryColor() }, positionStyle(false)),
      onclick: toggleWindow
    }, ['💬']);
    root.appendChild(fabEl);
  }

  function toggleWindow() {
    open = !open;
    if (open) { renderWindow(); if (!conversationId) startConversation(); }
    else if (windowEl) { windowEl.remove(); windowEl = null; }
  }

  function renderWindow() {
    if (windowEl) return;
    windowEl = el('div', { class: 'botdz-window', style: positionStyle(true) });
    var head = el('div', { class: 'botdz-head', style: { background: primaryColor() } }, [
      el('span', {}, [(config && config.avatar) || '🤖']),
      el('span', {}, [(config && config.botName) || 'Assistant'])
    ]);
    bodyEl = el('div', { class: 'botdz-body' });
    var inputRow = el('div', { class: 'botdz-input-row' });
    inputEl = el('input', { placeholder: 'اكتب رسالتك...', onkeydown: function (e) { if (e.key === 'Enter') sendText(); } });
    var sendBtn = el('button', { style: { background: primaryColor() }, onclick: sendText }, ['➤']);
    inputRow.appendChild(inputEl); inputRow.appendChild(sendBtn);
    windowEl.appendChild(head); windowEl.appendChild(bodyEl); windowEl.appendChild(inputRow);
    root.appendChild(windowEl);
  }

  function addBubble(text, from) {
    bodyEl.appendChild(el('div', {
      class: 'botdz-bubble ' + from,
      style: from === 'user' ? { background: primaryColor(), alignSelf: 'flex-end' } : {}
    }, [text]));
    bodyEl.scrollTop = bodyEl.scrollHeight;
  }

  function addButtons(buttons) {
    var wrap = el('div', { class: 'botdz-btns' });
    buttons.forEach(function (b) {
      wrap.appendChild(el('button', {
        class: 'botdz-btn',
        style: { borderColor: primaryColor(), color: primaryColor() },
        onclick: function () { addBubble(b.label, 'user'); sendMessage(null, b.value); }
      }, [b.label]));
    });
    bodyEl.appendChild(wrap);
    bodyEl.scrollTop = bodyEl.scrollHeight;
  }

  function addLink(text, url) {
    bodyEl.appendChild(el('a', { class: 'botdz-link', style: { background: primaryColor() }, href: url, target: '_blank' }, [text]));
    bodyEl.scrollTop = bodyEl.scrollHeight;
  }

  function startConversation() { sendMessage(null, null); }
  function sendText() {
    var v = inputEl.value.trim();
    if (!v) return;
    addBubble(v, 'user');
    inputEl.value = '';
    sendMessage(v, null);
  }

  function sendMessage(input, buttonValue) {
    fetch(origin + '/api/public/bots/' + botId + '/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId: visitorId, conversationId: conversationId, currentNodeId: currentNodeId, input: input, buttonValue: buttonValue, channel: 'widget' })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        conversationId = data.conversationId;
        currentNodeId = data.nodeId;
        (data.turns || []).forEach(function (t) {
          if (t.type === 'buttons' || t.type === 'choice') {
            if (t.text) addBubble(t.text, 'bot');
            addButtons(t.buttons || t.options || []);
          } else if (t.type === 'link') {
            addLink(t.text, t.url);
          } else if (t.text) {
            addBubble(t.text, 'bot');
          }
        });
      })
      .catch(function (err) { console.error('BotDZ widget error', err); });
  }
})();
