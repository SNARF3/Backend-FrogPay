require('dotenv').config();
const crypto = require('crypto');
const pool = require('../src/config/database');

async function main() {
  const plain = process.argv[2];
  if (!plain) {
    console.error('Uso: node scripts/check-api-key.js <api_key_plana>');
    process.exit(1);
  }

  const hash = crypto.createHash('sha256').update(plain).digest('hex');
  const result = await pool.query(
    'SELECT id, correo, estado FROM empresas WHERE api_key = $1 LIMIT 5',
    [hash]
  );

  console.log('hash:', hash);
  console.log('matches:', JSON.stringify(result.rows, null, 2));
  await pool.end();
}

main().catch(async (error) => {
  console.error('Error:', error.message);
  await pool.end();
  process.exit(1);
});
