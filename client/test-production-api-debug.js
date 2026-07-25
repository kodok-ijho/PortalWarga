const N8N_URL = 'https://n8n-icyxwmjq.runner.web.id/webhook/portal-v1';
const BASIC_AUTH = 'Basic ' + Buffer.from('denmas.dyudhiantoro@gmail.com:DeganStunggal1').toString('base64');

(async () => {
  console.log('🔍 Testing n8n endpoints with Basic Auth header...');

  try {
    const resMatrix = await fetch(`${N8N_URL}/bills/matrix`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': BASIC_AUTH
      },
      body: JSON.stringify({ year: 2026, scopeUnitId: 13, unit_id: 13 })
    });
    const textMatrix = await resMatrix.text();
    console.log('📊 /bills/matrix Status:', resMatrix.status);
    console.log('📊 /bills/matrix Text:', textMatrix.substring(0, 500));
  } catch (err) {
    console.error('❌ /bills/matrix Error:', err.message);
  }

  try {
    const resPayments = await fetch(`${N8N_URL}/payments/list`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': BASIC_AUTH
      },
      body: JSON.stringify({ scopeUnitId: 13, unit_id: 13 })
    });
    const textPayments = await resPayments.text();
    console.log('💳 /payments/list Status:', resPayments.status);
    console.log('💳 /payments/list Text:', textPayments.substring(0, 500));
  } catch (err) {
    console.error('❌ /payments/list Error:', err.message);
  }
})();
