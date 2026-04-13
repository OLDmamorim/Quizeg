// netlify/functions/joker-questions.js
const https = require('https');

const ANTHROPIC_API_KEY  = process.env.ANTHROPIC_API_KEY;
const POWERING_EG_API_KEY = process.env.POWERING_EG_API_KEY;
const POWERING_EG_HOST   = 'poweringeg-3c9mozlh.manus.space';

function httpsGet(host, path, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: host, path, method: 'GET', headers }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.end();
  });
}

function httpsPost(host, path, body, headers) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const req = https.request({
      hostname: host, path, method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(bodyStr) }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

const PEG_HEADERS = {
  'Authorization': `Bearer ${POWERING_EG_API_KEY}`,
  'X-API-Key': POWERING_EG_API_KEY,
  'Content-Type': 'application/json'
};

// Buscar resultados de um período
async function fetchResultados(mes, ano) {
  try {
    const data = await httpsGet(POWERING_EG_HOST, `/api/external/resultados?mes=${mes}&ano=${ano}`, PEG_HEADERS);
    return data.resultados || data.data || [];
  } catch { return []; }
}

// Gerar facto interessante a partir dos dados reais
async function gerarFactoPEG() {
  const agora = new Date();
  // Escolher um mês aleatório dos últimos 6 meses
  const offset = Math.floor(Math.random() * 6) + 1;
  let mes = agora.getMonth() + 1 - offset;
  let ano = agora.getFullYear();
  if (mes <= 0) { mes += 12; ano -= 1; }

  const resultados = await fetchResultados(mes, ano);
  if (!resultados || resultados.length < 3) return null;

  const nomeMes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][mes-1];

  // Escolher tipo de pergunta aleatoriamente
  const tipo = Math.floor(Math.random() * 6);

  if (tipo === 0) {
    // Maior taxa de reparação
    const sorted = resultados.filter(r => r.taxaReparacao != null)
      .sort((a,b) => b.taxaReparacao - a.taxaReparacao);
    if (sorted.length < 4) return null;
    const top = sorted[0];
    const taxa = Math.round(top.taxaReparacao * 1000) / 10;
    // 3 distratores aleatórios
    const outros = sorted.slice(1, 4).map(r => r.lojaNome || r.nome);
    const opcoes = shuffle([top.lojaNome || top.nome, ...outros]);
    const correta = opcoes.indexOf(top.lojaNome || top.nome);
    return {
      q: `Qual foi a loja com maior taxa de reparação em ${nomeMes} de ${ano}?`,
      o: opcoes,
      c: correta,
      e: `${top.lojaNome || top.nome} teve a maior taxa de reparação: ${taxa}%.`,
      eg: true
    };
  }

  if (tipo === 1) {
    // Maior número de serviços
    const sorted = resultados.filter(r => r.totalServicos != null)
      .sort((a,b) => b.totalServicos - a.totalServicos);
    if (sorted.length < 4) return null;
    const top = sorted[0];
    const outros = sorted.slice(1, 4).map(r => r.lojaNome || r.nome);
    const opcoes = shuffle([top.lojaNome || top.nome, ...outros]);
    const correta = opcoes.indexOf(top.lojaNome || top.nome);
    return {
      q: `Qual a loja com mais serviços realizados em ${nomeMes} de ${ano}?`,
      o: opcoes,
      c: correta,
      e: `${top.lojaNome || top.nome} liderou com ${top.totalServicos} serviços.`,
      eg: true
    };
  }

  if (tipo === 2) {
    // Total de serviços da região (soma)
    const total = resultados.reduce((acc, r) => acc + (r.totalServicos || 0), 0);
    if (total === 0) return null;
    // Gerar 3 valores próximos como distratores
    const d1 = total + Math.floor(Math.random()*30) + 5;
    const d2 = total - Math.floor(Math.random()*30) - 5;
    const d3 = total + Math.floor(Math.random()*60) + 30;
    const opcoes = shuffle([String(total), String(d1), String(d2 > 0 ? d2 : d1+10), String(d3)]);
    const correta = opcoes.indexOf(String(total));
    return {
      q: `Quantos serviços totais foram realizados na região em ${nomeMes} de ${ano}?`,
      o: opcoes,
      c: correta,
      e: `Em ${nomeMes} de ${ano} foram realizados ${total} serviços no total.`,
      eg: true
    };
  }

  if (tipo === 3) {
    // Desvio objetivo — quem atingiu ou superou
    const superaram = resultados.filter(r => r.totalServicos != null && r.objetivoMensal != null && r.totalServicos >= r.objetivoMensal);
    const total = resultados.filter(r => r.objetivoMensal != null).length;
    if (total < 3) return null;
    const n = superaram.length;
    const d1 = n + 1; const d2 = Math.max(0, n-2); const d3 = n + 3;
    const opcoes = shuffle([String(n), String(d1), String(d2), String(d3)]);
    const correta = opcoes.indexOf(String(n));
    return {
      q: `Quantas lojas atingiram ou superaram o objetivo mensal em ${nomeMes} de ${ano}?`,
      o: opcoes,
      c: correta,
      e: `${n} de ${total} lojas atingiram ou superaram o objetivo em ${nomeMes} de ${ano}.`,
      eg: true
    };
  }

  if (tipo === 4) {
    // Menor taxa de reparação
    const sorted = resultados.filter(r => r.taxaReparacao != null && r.taxaReparacao > 0)
      .sort((a,b) => a.taxaReparacao - b.taxaReparacao);
    if (sorted.length < 4) return null;
    const bottom = sorted[0];
    const taxa = Math.round(bottom.taxaReparacao * 1000) / 10;
    const outros = sorted.slice(1, 4).map(r => r.lojaNome || r.nome);
    const opcoes = shuffle([bottom.lojaNome || bottom.nome, ...outros]);
    const correta = opcoes.indexOf(bottom.lojaNome || bottom.nome);
    return {
      q: `Qual a loja com menor taxa de reparação em ${nomeMes} de ${ano}?`,
      o: opcoes,
      c: correta,
      e: `${bottom.lojaNome || bottom.nome} teve a menor taxa: ${taxa}%.`,
      eg: true
    };
  }

  if (tipo === 5) {
    // Loja mais próxima do objetivo
    const valid = resultados.filter(r => r.totalServicos != null && r.objetivoMensal != null && r.objetivoMensal > 0);
    if (valid.length < 4) return null;
    const comDesvio = valid.map(r => ({
      ...r,
      desvio: Math.abs((r.totalServicos / r.objetivoMensal) - 1)
    })).sort((a,b) => a.desvio - b.desvio);
    const top = comDesvio[0];
    const outros = comDesvio.slice(1, 4).map(r => r.lojaNome || r.nome);
    const opcoes = shuffle([top.lojaNome || top.nome, ...outros]);
    const correta = opcoes.indexOf(top.lojaNome || top.nome);
    const pct = Math.round((1 - top.desvio) * 100);
    return {
      q: `Qual a loja que ficou mais próxima do seu objetivo mensal em ${nomeMes} de ${ano}?`,
      o: opcoes,
      c: correta,
      e: `${top.lojaNome || top.nome} foi a mais próxima do objetivo (${pct}% de cumprimento).`,
      eg: true
    };
  }

  return null;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };

  try {
    const { prompt, useRealData } = JSON.parse(event.body || '{}');

    // Modo dados reais: gerar pergunta com dados do PoweringEG
    if (useRealData && POWERING_EG_API_KEY) {
      const facto = await gerarFactoPEG();
      if (facto) {
        return { statusCode: 200, headers, body: JSON.stringify({ realData: facto }) };
      }
      // fallback para IA se não houver dados suficientes
    }

    // Modo IA: gerar pergunta com Anthropic
    if (!ANTHROPIC_API_KEY) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY não configurada' }) };
    }
    if (!prompt) return { statusCode: 400, headers, body: JSON.stringify({ error: 'prompt obrigatório' }) };

    // Reforçar que só queremos perguntas de automóvel/vidros
    const systemPrompt = 'És um especialista em automóveis, vidros automóvel, código da estrada PORTUGUÊS e setor de reparação de vidros. Só geras perguntas relacionadas com estes temas. MUITO IMPORTANTE: usa sempre terminologia portuguesa correta — por exemplo o vidro traseiro chama-se ÓCULO TRASEIRO (não luneta, não vidro posterior), o para-brisas é o vidro frontal, as janelas laterais chamam-se vidros laterais. As perguntas e respostas devem ser 100% corretas e usar português de Portugal. Nunca inventes termos técnicos — se não tens a certeza, não uses. As perguntas devem ser práticas, interessantes e acessíveis para qualquer pessoa que trabalhe no setor automóvel.';
    const resposta = await httpsPost('api.anthropic.com', '/v1/messages', {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }]
    }, {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    });

    const text = resposta.content?.[0]?.text || '';
    return { statusCode: 200, headers, body: JSON.stringify({ text }) };

  } catch (err) {
    console.error('joker-questions error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
