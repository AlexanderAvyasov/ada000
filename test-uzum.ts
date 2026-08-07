const token = process.env.UZUM_TOKEN;
const shopId = Number(process.env.SHOP_ID);

if (!token || !shopId) {
  console.error('Usage: set UZUM_TOKEN and SHOP_ID environment variables');
  console.error('Example: UZUM_TOKEN="<token>" SHOP_ID=123 npx ts-node --esm test-uzum.ts');
  process.exit(1);
}

const BASE = 'https://api-seller.uzum.uz/api/seller-openapi';

async function tryFetch(authValue: string, label: string) {
  const url = `${BASE}/v1/product/shop/${shopId}?size=1`;
  try {
    console.log(`Requesting ${url} with ${label} header`);
    const res = await fetch(url, { method: 'GET', headers: { Authorization: authValue } });
    const text = await res.text();
    console.log(`${label} -> HTTP ${res.status}`);
    try {
      console.log(JSON.stringify(JSON.parse(text), null, 2));
    } catch (_) {
      console.log(text);
    }
  } catch (err) {
    console.error(`${label} -> fetch error:`, err instanceof Error ? err.message : String(err));
  }
}

(async () => {
  await tryFetch(token, 'raw');
  console.log('\n---\n');
  await tryFetch('Bearer ' + token, 'bearer');
})();
