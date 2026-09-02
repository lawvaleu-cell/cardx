// flowBuilder.js — a real drag/drop/connect node editor (no external lib).

const NODE_TYPES = {
  start:        { label: { ar: 'بداية', fr: 'Début', en: 'Start' }, color: '#111827', icon: '▶' },
  message:      { label: { ar: 'رسالة', fr: 'Message', en: 'Message' }, color: '#5B4CFF', icon: '💬' },
  question:     { label: { ar: 'سؤال', fr: 'Question', en: 'Question' }, color: '#7c3aed', icon: '❓' },
  buttons:      { label: { ar: 'أزرار', fr: 'Boutons', en: 'Buttons' }, color: '#0891b2', icon: '🔘' },
  choice:       { label: { ar: 'اختيار', fr: 'Choix', en: 'Choice' }, color: '#0e7490', icon: '☑' },
  text_input:   { label: { ar: 'إدخال نص', fr: 'Saisie texte', en: 'Text Input' }, color: '#059669', icon: '✏️' },
  phone_input:  { label: { ar: 'رقم الهاتف', fr: 'Téléphone', en: 'Phone Input' }, color: '#059669', icon: '📞' },
  email_input:  { label: { ar: 'البريد الإلكتروني', fr: 'E-mail', en: 'Email Input' }, color: '#059669', icon: '✉️' },
  number_input: { label: { ar: 'رقم', fr: 'Nombre', en: 'Number Input' }, color: '#059669', icon: '#' },
  condition:    { label: { ar: 'شرط', fr: 'Condition', en: 'Condition' }, color: '#d97706', icon: '⑂' },
  link:         { label: { ar: 'رابط', fr: 'Lien', en: 'Link' }, color: '#2563eb', icon: '🔗' },
  whatsapp:     { label: { ar: 'واتساب', fr: 'WhatsApp', en: 'WhatsApp' }, color: '#16a34a', icon: '🟢' },
  human_handoff:{ label: { ar: 'تحويل لموظف', fr: 'Transfert humain', en: 'Human Handoff' }, color: '#dc2626', icon: '🙋' },
  end:          { label: { ar: 'نهاية', fr: 'Fin', en: 'End' }, color: '#374151', icon: '⏹' }
};

function createFlowBuilder(container, initialFlow, onChange) {
  let nodes = JSON.parse(JSON.stringify(initialFlow.nodes || []));
  let edges = JSON.parse(JSON.stringify(initialFlow.edges || []));
  let selectedNodeId = null;
  let connectingFrom = null;
  let dragState = null;

  container.innerHTML = `
    <div class="flow-wrap">
      <div class="flow-palette" id="fb-palette"></div>
      <div class="flow-canvas-wrap" id="fb-canvas-wrap">
        <div class="flow-canvas" id="fb-canvas">
          <svg class="flow-edges" id="fb-edges" width="2200" height="1400"></svg>
        </div>
      </div>
      <div class="flow-side-panel" id="fb-side"></div>
    </div>
  `;

  const paletteEl = container.querySelector('#fb-palette');
  const canvasEl = container.querySelector('#fb-canvas');
  const svgEl = container.querySelector('#fb-edges');
  const sideEl = container.querySelector('#fb-side');

  paletteEl.innerHTML = `<h4>${i18n.t('add_node')}</h4>` + Object.entries(NODE_TYPES).filter(([t]) => t !== 'start').map(([type, def]) => `
    <div class="palette-item" draggable="true" data-type="${type}">
      <span>${def.icon}</span><span>${def.label[i18n.locale] || def.label.en}</span>
    </div>
  `).join('');

  paletteEl.querySelectorAll('.palette-item').forEach((el) => {
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', el.dataset.type);
    });
  });

  const wrapEl = container.querySelector('#fb-canvas-wrap');
  wrapEl.addEventListener('dragover', (e) => e.preventDefault());
  wrapEl.addEventListener('drop', (e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('text/plain');
    if (!type) return;
    const rect = canvasEl.getBoundingClientRect();
    const x = e.clientX - rect.left + wrapEl.scrollLeft - 90;
    const y = e.clientY - rect.top + wrapEl.scrollTop - 20;
    addNode(type, { x: Math.max(0, x), y: Math.max(0, y) });
  });

  function uid() { return 'n-' + Math.random().toString(36).slice(2, 10); }

  function addNode(type, position) {
    const node = { id: uid(), type, position, data: defaultDataFor(type) };
    nodes.push(node);
    render();
    selectNode(node.id);
    emitChange();
  }

  function defaultDataFor(type) {
    switch (type) {
      case 'message': return { text: 'اكتب رسالة البوت هنا...' };
      case 'question': return { text: 'ما هو سؤالك؟' };
      case 'buttons': return { text: 'اختر من فضلك:', options: [{ label: 'خيار 1', value: 'opt1' }, { label: 'خيار 2', value: 'opt2' }] };
      case 'choice': return { text: 'اختر واحدًا:', options: [{ label: 'خيار 1', value: 'opt1' }] };
      case 'text_input': return { text: 'من فضلك اكتب إجابتك', field: 'custom_text' };
      case 'phone_input': return { text: 'من فضلك أدخل رقم هاتفك', field: 'phone' };
      case 'email_input': return { text: 'من فضلك أدخل بريدك الإلكتروني', field: 'email' };
      case 'number_input': return { text: 'من فضلك أدخل رقمًا', field: 'number' };
      case 'condition': return { rules: [{ contains: 'نعم', handle: 'yes' }] };
      case 'link': return { text: 'اضغط هنا', url: 'https://example.com' };
      case 'whatsapp': return { text: 'تواصل معنا عبر واتساب', phone: '213555000000' };
      case 'human_handoff': return { text: 'سيتم تحويلك إلى أحد ممثلينا قريبًا.' };
      case 'end': return { text: 'شكرًا لك! 🙏' };
      default: return {};
    }
  }

  function render() {
    canvasEl.querySelectorAll('.flow-node').forEach((n) => n.remove());
    nodes.forEach((node) => canvasEl.appendChild(renderNode(node)));
    renderEdges();
  }

  function renderNode(node) {
    const def = NODE_TYPES[node.type] || NODE_TYPES.message;
    const el = document.createElement('div');
    el.className = 'flow-node' + (node.id === selectedNodeId ? ' selected' : '');
    el.style.left = node.position.x + 'px';
    el.style.top = node.position.y + 'px';
    el.dataset.id = node.id;

    let bodyHtml = `<div class="flow-node-body">${escapeHtml((node.data.text || '').slice(0, 60) || '—')}</div>`;
    let portsHtml = `<div class="flow-node-ports">
        ${node.type !== 'start' ? `<div class="port port-in" data-port="in" data-node="${node.id}" title="input"></div>` : '<span></span>'}
        ${!['end'].includes(node.type) && !['buttons', 'choice', 'condition'].includes(node.type) ? `<div class="port port-out" data-port="out" data-node="${node.id}" title="output"></div>` : ''}
      </div>`;

    if (node.type === 'buttons' || node.type === 'choice') {
      bodyHtml = `<div class="flow-node-body" style="max-height:none">${escapeHtml(node.data.text || '')}
        ${(node.data.options || []).map((o) => `<div class="opt-row"><span>${escapeHtml(o.label)}</span><div class="port port-out" data-port="out" data-handle="${escapeHtml(o.value || o.label)}" data-node="${node.id}" style="position:static;width:9px;height:9px"></div></div>`).join('')}
      </div>`;
      portsHtml = `<div class="flow-node-ports"><div class="port port-in" data-port="in" data-node="${node.id}"></div><span></span></div>`;
    }
    if (node.type === 'condition') {
      bodyHtml = `<div class="flow-node-body" style="max-height:none">${(node.data.rules || []).map((r) => `<div class="opt-row"><span>"${escapeHtml(r.contains)}"</span><div class="port port-out" data-port="out" data-handle="${escapeHtml(r.handle)}" data-node="${node.id}" style="position:static;width:9px;height:9px"></div></div>`).join('')}<div class="opt-row"><span class="muted">else</span><div class="port port-out" data-port="out" data-handle="else" data-node="${node.id}" style="position:static;width:9px;height:9px"></div></div></div>`;
      portsHtml = `<div class="flow-node-ports"><div class="port port-in" data-port="in" data-node="${node.id}"></div><span></span></div>`;
    }

    el.innerHTML = `
      <div class="flow-node-head" style="background:${def.color}">
        <span>${def.icon}</span><span>${(def.label[i18n.locale] || def.label.en)}</span>
      </div>
      ${bodyHtml}
      ${portsHtml}
    `;

    el.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('port')) return;
      dragState = { id: node.id, startX: e.clientX, startY: e.clientY, origX: node.position.x, origY: node.position.y };
      selectNode(node.id);
      e.stopPropagation();
    });

    el.querySelectorAll('.port-out').forEach((p) => {
      p.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        connectingFrom = { nodeId: node.id, handle: p.dataset.handle || null };
      });
    });
    el.querySelectorAll('.port-in').forEach((p) => {
      p.addEventListener('mouseup', (e) => {
        e.stopPropagation();
        if (connectingFrom && connectingFrom.nodeId !== node.id) {
          edges = edges.filter((ed) => !(ed.source === connectingFrom.nodeId && ed.sourceHandle == connectingFrom.handle));
          edges.push({ id: uid(), source: connectingFrom.nodeId, target: node.id, sourceHandle: connectingFrom.handle || undefined });
          render();
          emitChange();
        }
        connectingFrom = null;
      });
    });

    return el;
  }

  function renderEdges() {
    svgEl.innerHTML = `<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#5B4CFF"/></marker></defs>`;
    edges.forEach((edge) => {
      const source = nodes.find((n) => n.id === edge.source);
      const target = nodes.find((n) => n.id === edge.target);
      if (!source || !target) return;
      const x1 = source.position.x + 200, y1 = source.position.y + 46;
      const x2 = target.position.x, y2 = target.position.y + 20;
      const midX = (x1 + x2) / 2;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`);
      path.setAttribute('stroke', '#5B4CFF');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('fill', 'none');
      path.setAttribute('marker-end', 'url(#arrow)');
      svgEl.appendChild(path);
    });
  }

  document.addEventListener('mousemove', (e) => {
    if (dragState) {
      const node = nodes.find((n) => n.id === dragState.id);
      if (!node) return;
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      node.position.x = Math.max(0, dragState.origX + dx);
      node.position.y = Math.max(0, dragState.origY + dy);
      const el = canvasEl.querySelector(`.flow-node[data-id="${node.id}"]`);
      if (el) { el.style.left = node.position.x + 'px'; el.style.top = node.position.y + 'px'; }
      renderEdges();
    }
  });
  document.addEventListener('mouseup', () => {
    if (dragState) emitChange();
    dragState = null;
    connectingFrom = null;
  });

  function selectNode(id) {
    selectedNodeId = id;
    container.querySelectorAll('.flow-node').forEach((el) => el.classList.toggle('selected', el.dataset.id === id));
    renderSidePanel();
  }

  function renderSidePanel() {
    const node = nodes.find((n) => n.id === selectedNodeId);
    if (!node) {
      sideEl.innerHTML = `<div class="muted small">اضغط على أي عنصر لتحريره، أو اسحب عنصرًا جديدًا من القائمة.</div>`;
      return;
    }
    const def = NODE_TYPES[node.type];
    let fields = '';
    if ('text' in node.data) {
      fields += `<div class="field"><label>النص</label><textarea rows="3" data-key="text">${escapeHtml(node.data.text || '')}</textarea></div>`;
    }
    if (node.type === 'url' || node.type === 'link') {
      fields += `<div class="field"><label>الرابط (URL)</label><input data-key="url" value="${escapeHtml(node.data.url || '')}"></div>`;
    }
    if (node.type === 'whatsapp') {
      fields += `<div class="field"><label>رقم واتساب (بدون +)</label><input data-key="phone" value="${escapeHtml(node.data.phone || '')}"></div>`;
    }
    if (['text_input', 'phone_input', 'email_input', 'number_input'].includes(node.type)) {
      fields += `<div class="field"><label>اسم الحقل</label><input data-key="field" value="${escapeHtml(node.data.field || '')}"></div>`;
    }
    if (node.type === 'buttons' || node.type === 'choice') {
      fields += `<div class="field"><label>الخيارات</label><div id="opt-list"></div><button class="btn btn-secondary btn-sm" id="add-opt" type="button">+ إضافة خيار</button></div>`;
    }
    if (node.type === 'condition') {
      fields += `<div class="field"><label>القواعد (إذا احتوت الرسالة على)</label><div id="rule-list"></div><button class="btn btn-secondary btn-sm" id="add-rule" type="button">+ إضافة قاعدة</button></div>`;
    }

    sideEl.innerHTML = `
      <div class="flex justify-between items-center mb-16">
        <strong>${def.icon} ${def.label[i18n.locale] || def.label.en}</strong>
        ${node.type !== 'start' ? `<button class="btn btn-danger btn-sm" id="del-node" type="button">${i18n.t('delete')}</button>` : ''}
      </div>
      ${fields || '<div class="muted small">لا توجد إعدادات إضافية لهذا العنصر.</div>'}
    `;

    sideEl.querySelectorAll('[data-key]').forEach((input) => {
      input.addEventListener('input', () => {
        node.data[input.dataset.key] = input.value;
        render();
        selectNode(node.id);
        emitChange();
      });
    });
    const delBtn = sideEl.querySelector('#del-node');
    if (delBtn) delBtn.addEventListener('click', () => {
      nodes = nodes.filter((n) => n.id !== node.id);
      edges = edges.filter((e) => e.source !== node.id && e.target !== node.id);
      selectedNodeId = null;
      render();
      renderSidePanel();
      emitChange();
    });

    if (node.type === 'buttons' || node.type === 'choice') {
      const listEl = sideEl.querySelector('#opt-list');
      const drawOpts = () => {
        listEl.innerHTML = (node.data.options || []).map((o, i) => `
          <div class="flex gap-8 mb-8">
            <input value="${escapeHtml(o.label)}" data-i="${i}" data-f="label" style="flex:1">
            <button class="btn btn-secondary btn-sm" data-rm="${i}" type="button">✕</button>
          </div>`).join('');
        listEl.querySelectorAll('input').forEach((inp) => {
          inp.addEventListener('input', () => {
            const i = +inp.dataset.i;
            node.data.options[i].label = inp.value;
            node.data.options[i].value = inp.value;
            render(); selectNode(node.id); emitChange();
          });
        });
        listEl.querySelectorAll('[data-rm]').forEach((btn) => {
          btn.addEventListener('click', () => {
            node.data.options.splice(+btn.dataset.rm, 1);
            render(); selectNode(node.id); emitChange();
          });
        });
      };
      drawOpts();
      sideEl.querySelector('#add-opt').addEventListener('click', () => {
        node.data.options = node.data.options || [];
        node.data.options.push({ label: 'خيار جديد', value: 'opt' + (node.data.options.length + 1) });
        render(); selectNode(node.id); emitChange();
      });
    }

    if (node.type === 'condition') {
      const listEl = sideEl.querySelector('#rule-list');
      const drawRules = () => {
        listEl.innerHTML = (node.data.rules || []).map((r, i) => `
          <div class="flex gap-8 mb-8">
            <input value="${escapeHtml(r.contains)}" data-i="${i}" placeholder="نص" style="flex:1">
            <button class="btn btn-secondary btn-sm" data-rm="${i}" type="button">✕</button>
          </div>`).join('');
        listEl.querySelectorAll('input').forEach((inp) => {
          inp.addEventListener('input', () => {
            const i = +inp.dataset.i;
            node.data.rules[i].contains = inp.value;
            node.data.rules[i].handle = 'rule' + i;
            render(); selectNode(node.id); emitChange();
          });
        });
        listEl.querySelectorAll('[data-rm]').forEach((btn) => {
          btn.addEventListener('click', () => {
            node.data.rules.splice(+btn.dataset.rm, 1);
            render(); selectNode(node.id); emitChange();
          });
        });
      };
      drawRules();
      sideEl.querySelector('#add-rule').addEventListener('click', () => {
        node.data.rules = node.data.rules || [];
        node.data.rules.push({ contains: '', handle: 'rule' + node.data.rules.length });
        render(); selectNode(node.id); emitChange();
      });
    }
  }

  function emitChange() {
    if (onChange) onChange({ nodes, edges });
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  render();
  renderSidePanel();

  return {
    getFlow() { return { nodes, edges }; }
  };
}
