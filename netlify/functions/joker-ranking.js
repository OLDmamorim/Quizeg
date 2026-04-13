// netlify/functions/joker-ranking.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  // ── GET: buscar top 20 ──
  if (event.httpMethod === 'GET') {
    try {
      const result = await pool.query(`
        SELECT nome, pts, nivel, TO_CHAR(data, 'DD/MM/YYYY') AS data
        FROM joker_ranking
        ORDER BY pts DESC
        LIMIT 20
      `);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, ranking: result.rows })
      };
    } catch (err) {
      console.error('GET ranking error:', err);
      return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: err.message }) };
    }
  }

  // ── POST: guardar/atualizar resultado ──
  if (event.httpMethod === 'POST') {
    try {
      const { nome, pts, nivel } = JSON.parse(event.body || '{}');

      if (!nome || pts === undefined || pts === null) {
        return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'nome e pts obrigatórios' }) };
      }

      const nomeTrim = String(nome).trim().substring(0, 50);

      // Upsert: se já existe, só atualiza se pts for maior
      await pool.query(`
        INSERT INTO joker_ranking (nome, pts, nivel, data, updated_at)
        VALUES ($1, $2, $3, CURRENT_DATE, NOW())
        ON CONFLICT (nome) DO UPDATE
          SET pts        = GREATEST(joker_ranking.pts, EXCLUDED.pts),
              nivel      = CASE WHEN EXCLUDED.pts > joker_ranking.pts THEN EXCLUDED.nivel ELSE joker_ranking.nivel END,
              data       = CASE WHEN EXCLUDED.pts > joker_ranking.pts THEN CURRENT_DATE ELSE joker_ranking.data END,
              updated_at = NOW()
      `, [nomeTrim, pts, nivel || 0]);

      // Devolver ranking atualizado
      const result = await pool.query(`
        SELECT nome, pts, nivel, TO_CHAR(data, 'DD/MM/YYYY') AS data
        FROM joker_ranking
        ORDER BY pts DESC
        LIMIT 20
      `);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, ranking: result.rows })
      };
    } catch (err) {
      console.error('POST ranking error:', err);
      return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: err.message }) };
    }
  }

  return { statusCode: 405, headers, body: JSON.stringify({ success: false, error: 'Método não permitido' }) };
};
