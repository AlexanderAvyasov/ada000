const token = process.env.UZUM_TOKEN;
if (!token) {
  console.error('Set UZUM_TOKEN environment variable');
  process.exit(1);
}

const BASE = 'https://api-seller.uzum.uz/api/seller-openapi';

async function listShops() {
  const url = `${BASE}/v1/shops`;
  const res = await fetch(url, { method: 'GET', headers: { Authorization: token } });
  const text = await res.text();
  if (!res.ok) {
    console.error('Request failed', res.status, text);
    process.exit(2);
  }
  const data = JSON.parse(text);
  if (!Array.isArray(data)) {
    console.error('Unexpected response:', JSON.stringify(data, null, 2));
    process.exit(3);
  }
  const shops = data.map((s: any) => ({ id: s.id, name: s.name }));
  console.log('Shops:', shops.map((s: any) => `${s.id} (${s.name})`).join(', '));
  console.log('\nIDs:', shops.map((s: any) => s.id).join(', '));
}

listShops().catch((e) => {
  console.error('Error:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
