import { UzumClient } from './src/uzumClient.js';

const token = process.env.UZUM_TOKEN;
const shopId = Number(process.env.SHOP_ID);

if (!token || !shopId) {
  console.error('Usage: set UZUM_TOKEN and SHOP_ID environment variables');
  console.error('Example: UZUM_TOKEN="<token>" SHOP_ID=123 npx ts-node --esm test-uzum.ts');
  process.exit(1);
}

async function tryRequest(tokenToUse: string, label: string) {
  try {
    const client = new UzumClient(tokenToUse);
    const res = await client.getShopProducts(shopId, { size: 1 });
    console.log(`Success (${label}):`);
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error(`Error (${label}):`);
    console.error(err instanceof Error ? err.message : JSON.stringify(err));
    // If object-like error, show it for debugging (avoid leaking tokens)
    if (err && typeof err === 'object') console.error(err);
  }
}

(async () => {
  console.log('Testing token as-is');
  await tryRequest(token, 'raw');
  console.log('\nTesting with Bearer prefix');
  await tryRequest('Bearer ' + token, 'bearer');
})();
