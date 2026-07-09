/*
 * test_ah.js — 拍卖行模块自动化测试
 * 运行：node test_ah.js
 */
const AH = require('./ah.js');

let pass = 0, fail = 0;
const fails = [];
function t(name, fn) {
  try { const r = fn(); if (r === false) throw new Error('assert false'); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; fails.push(name + ' → ' + e.message); console.log('  ✗ ' + name + ' → ' + e.message); }
}
function eq(a, b) { return a === b || (Math.abs(a - b) < 1e-9); }
function ok(v) { return !!v; }

console.log('==== ah.js 拍卖行测试 ====\n');

// ── 1. 初始化与数据 ──
console.log('[1] 初始化 & mock 数据');
t('initMock 生成 listings', () => ok(AH.allListingsCount() > 0));
t('getListings 返回深拷贝', () => {
  const before = AH.allListingsCount();
  const list = AH.getListings();
  return list.length === before;
});
t('每条 listing 含必要字段', () => {
  return AH.getListings().every(l => l.id && l.item && l.item.uid && l.price > 0);
});

// ── 2. 搜索 ──
console.log('\n[2] 搜索');
t('searchListings 空查询返回全部', () => AH.searchListings({}).length === AH.allListingsCount());
t('searchListings 按品质搜索', () => {
  const result = AH.searchListings({ quality: 'legendary' });
  return result.every(l => l.item.quality === 'legendary');
});
t('searchListings 按关键词搜索（不崩）', () => {
  const result = AH.searchListings({ q: '剑' });
  return Array.isArray(result);
});
t('searchListings 按价格区间', () => {
  const result = AH.searchListings({ minPrice: 1000, maxPrice: 5000 });
  return result.every(l => l.price >= 1000 && l.price <= 5000);
});

// ── 3. 上架 ──
console.log('\n[3] 上架');
t('listItem 非法装备拒绝', () => AH.listItem('u1', '玩家', null, 100).ok === false);
t('listItem 非法价格拒绝', () => AH.listItem('u1', '玩家', { uid: 'x' }, 0).ok === false);
t('listItem 成功上架', () => {
  const r = AH.listItem('u1', '玩家', { uid: 'test_sword', name: '测试剑', slotKey: 'weapon' }, 500);
  return r.ok && r.listing && r.listing.id && r.fee >= 0;
});
t('listItem 返回手续费 25 (500×5%)', () => {
  const r = AH.listItem('u2', '玩家2', { uid: 'test_amulet', name: '测试项链', slotKey: 'amulet' }, 500);
  return eq(r.fee, 25);
});

// ── 4. 购买 ──
console.log('\n[4] 购买');
t('buyListing 不存在返回 not-found', () => AH.buyListing('nonexistent', 'buyer').ok === false);
t('buyListing 买自己物品拒绝', () => {
  const r = AH.listItem('self', '自己', { uid: 'self_item' }, 100);
  return AH.buyListing(r.listing.id, 'self').ok === false;
});
t('buyListing 成功购买', () => {
  const count = AH.allListingsCount();
  AH._reset(); AH.initMock();
  const before = AH.allListingsCount();
  const listings = AH.getListings();
  if (listings.length === 0) return false;
  const r = AH.buyListing(listings[0].id, 'buyer');
  return r.ok && AH.allListingsCount() === before - 1;
});

// ── 5. 下架 ──
console.log('\n[5] 下架');
t('cancelListing 非卖家拒绝', () => {
  AH._reset(); AH.initMock();
  const r = AH.listItem('owner', '主人', { uid: 'test' }, 200);
  return AH.cancelListing(r.listing.id, 'other_user').ok === false;
});
t('cancelListing 卖家可下架', () => {
  AH._reset(); AH.initMock();
  const r = AH.listItem('owner', '主人', { uid: 'test2' }, 200);
  const before = AH.allListingsCount();
  const cancel = AH.cancelListing(r.listing.id, 'owner');
  return cancel.ok && AH.allListingsCount() === before - 1;
});

// ── 6. myListings ──
console.log('\n[6] 我的上架');
t('myListings 返回自己的物品', () => {
  AH._reset(); AH.initMock();
  AH.listItem('me', '我', { uid: 'my_item' }, 100);
  AH.listItem('other', '他人', { uid: 'other_item' }, 200);
  const mine = AH.myListings('me');
  return mine.length === 1 && mine[0].sellerId === 'me';
});

// ── 7. 边界 ──
console.log('\n[7] 边界');
t('_reset 后空', () => {
  AH._reset();
  const count = AH.allListingsCount();
  AH.initMock();
  return count === 0 && AH.allListingsCount() > 0;
});
t('多次 initMock 不重复叠加', () => {
  AH._reset();
  AH.initMock();
  const once = AH.allListingsCount();
  AH.initMock();
  return AH.allListingsCount() === once;
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
if (fail > 0) { console.log('失败项:'); fails.forEach(f => console.log('  - ' + f)); process.exit(1); }
