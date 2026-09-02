// flowEngine.js
// Executes a visual conversation flow (nodes + edges) against user input.
// This is deterministic and rule-based — the platform is a flow builder,
// not a raw prompt-to-LLM wrapper, per the product spec.

const DARIJA_GREETINGS = ['سلام', 'صباح', 'مسا', 'واش', 'سلام خويا', 'اهلا'];

function findStartNode(nodes, edges) {
  const targets = new Set(edges.map((e) => e.target));
  return nodes.find((n) => n.type === 'start') || nodes.find((n) => !targets.has(n.id)) || nodes[0];
}

function nextNodeId(edges, fromId, handle) {
  // handle = button/choice value chosen, or null for straight-through edges
  const candidates = edges.filter((e) => e.source === fromId);
  if (handle) {
    const match = candidates.find((e) => e.sourceHandle === handle);
    if (match) return match.target;
  }
  const plain = candidates.find((e) => !e.sourceHandle);
  return plain ? plain.target : (candidates[0] ? candidates[0].target : null);
}

function getNode(nodes, id) {
  return nodes.find((n) => n.id === id) || null;
}

// Renders a node into a "bot turn": messages to show + expected input type
function renderNode(node, botConfig) {
  if (!node) return null;
  switch (node.type) {
    case 'start':
      return { type: 'passthrough' };
    case 'message':
      return { type: 'message', text: node.data.text || '' };
    case 'question':
      return { type: 'message', text: node.data.text || '', awaits: 'text' };
    case 'buttons':
      return {
        type: 'buttons',
        text: node.data.text || '',
        buttons: (node.data.options || []).map((o) => ({ label: o.label, value: o.value || o.label }))
      };
    case 'choice':
      return {
        type: 'choice',
        text: node.data.text || '',
        options: (node.data.options || []).map((o) => ({ label: o.label, value: o.value || o.label }))
      };
    case 'text_input':
      return { type: 'input', inputType: 'text', text: node.data.text || '', field: node.data.field || 'text' };
    case 'phone_input':
      return { type: 'input', inputType: 'phone', text: node.data.text || 'من فضلك أدخل رقم هاتفك', field: node.data.field || 'phone' };
    case 'email_input':
      return { type: 'input', inputType: 'email', text: node.data.text || 'من فضلك أدخل بريدك الإلكتروني', field: node.data.field || 'email' };
    case 'number_input':
      return { type: 'input', inputType: 'number', text: node.data.text || '', field: node.data.field || 'number' };
    case 'condition':
      return { type: 'passthrough' };
    case 'link':
      return { type: 'link', text: node.data.text || '', url: node.data.url || '#' };
    case 'whatsapp':
      return { type: 'link', text: node.data.text || 'تواصل معنا عبر واتساب', url: `https://wa.me/${(node.data.phone || '').replace(/\D/g, '')}` };
    case 'human_handoff':
      return { type: 'handoff', text: node.data.text || 'سيتم تحويلك إلى أحد ممثلينا قريبًا.' };
    case 'end':
      return { type: 'end', text: node.data.text || 'شكرًا لك! 🙏' };
    default:
      return { type: 'message', text: '' };
  }
}

function isGreeting(text) {
  const t = (text || '').trim();
  return DARIJA_GREETINGS.some((g) => t.includes(g));
}

// Advances the conversation by one user input (or null for the very first turn).
// Returns { nodeId, turns: [renderedNode,...], done }
// A single call may render multiple turns in a row if it passes through
// "passthrough" nodes (start / condition) without needing user input.
function step(flow, botConfig, currentNodeId, userInput) {
  const nodes = flow.nodes || [];
  const edges = flow.edges || [];
  let node;

  if (!currentNodeId) {
    node = findStartNode(nodes, edges);
  } else {
    const current = getNode(nodes, currentNodeId);
    let handle = null;
    if (current && (current.type === 'buttons' || current.type === 'choice')) {
      handle = userInput;
    } else if (current && current.type === 'condition') {
      const rules = current.data.rules || [];
      const rule = rules.find((r) => (userInput || '').toLowerCase().includes((r.contains || '').toLowerCase()));
      handle = rule ? rule.handle : 'else';
    }
    const nid = nextNodeId(edges, currentNodeId, handle);
    node = nid ? getNode(nodes, nid) : null;
  }

  const turns = [];
  let guard = 0;
  while (node && guard < 25) {
    guard += 1;
    const rendered = renderNode(node, botConfig);
    if (rendered.type === 'passthrough') {
      const nid = nextNodeId(edges, node.id, null);
      node = nid ? getNode(nodes, nid) : null;
      continue;
    }
    turns.push({ nodeId: node.id, ...rendered });
    if (['buttons', 'choice', 'input', 'end', 'handoff'].includes(rendered.type)) {
      return { nodeId: node.id, turns, done: rendered.type === 'end' };
    }
    // plain message: keep walking to the next node automatically
    const nid = nextNodeId(edges, node.id, null);
    node = nid ? getNode(nodes, nid) : null;
  }

  if (!node && turns.length === 0) {
    // Nothing configured — fall back to unknown-question behaviour
    return {
      nodeId: null,
      turns: [{ type: 'message', text: fallbackText(botConfig) }],
      done: false
    };
  }
  return { nodeId: node ? node.id : null, turns, done: false };
}

function fallbackText(botConfig) {
  const cfg = botConfig.unknownQuestion || {};
  if (cfg.mode === 'custom' && cfg.customResponse) return cfg.customResponse;
  if (cfg.mode === 'whatsapp') return 'ما عنديش جواب مؤكد، تقدر تتواصل معنا عبر واتساب.';
  if (cfg.mode === 'phone') return `ما عنديش جواب مؤكد، اتصل بنا على ${cfg.phone || ''}`;
  if (cfg.mode === 'human') return 'راح نحولك لموظف حقيقي في أقرب وقت.';
  return 'سمحلي، ما فهمتش سؤالك جيدًا. تقدر تعاود صياغته؟';
}

module.exports = { step, isGreeting, findStartNode };
