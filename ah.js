/*
 * ah.js — 拍卖行（Auction House）纯逻辑模块
 * 设计依据：《游戏经济系统设计.md》(GDD v1) §2.3 拍卖行
 * 双模式：Node (module.exports) + 浏览器 (window.AH)
 *
 * 职责：
 *   1. 提供本地 mock 拍卖行数据（无后端时自洽运行）
 *   2. 上架 / 购买 / 下架 / 搜索 纯函数
 *   3. 手续费委托 Economy.ahFee
 *
 * 数据模型：
 *   Listing { id, sellerId, sellerName, item, price, listedAt }
 *   Item    { uid, name, quality, slotKey, slotName, baseAtk, baseDef, enhanceLevel, affixes, set }
 */
(function (root, factory) {
  const Economy = (typeof require !== 'undefined')
    ? (() => { try { return require('./economy.js'); } catch (e) { return null; } })()
    : (root.Economy || (typeof window !== 'undefined' ? window.Economy : undefined));
  const api = factory(Economy);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.AH = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Economy) {
  'use strict';

  const TAX_RATE = 0.05; // 拍卖行手续费 5%

  // ── Mock 数据：初始拍卖品 ──
  const QUALITY_NAMES = { common: '普通', good: '优秀', rare: '稀有', epic: '史诗', legendary: '传说', mythic: '神话' };
  const QUALITY_COLORS = { common: '#aaa', good: '#2ecc71', rare: '#3498db', epic: '#9b59b6', legendary: '#f39c12', mythic: '#e74c3c' };

  let _listings = [];
  let _nextId = 1;

  // 生成 mock 拍卖品（质量越高属性越好）
  function _makeMockItem(slotKey, quality, level) {
    level = level || 1;
    const slotNames = { weapon: '武器', helmet: '头盔', armor: '护甲', belt: '腰带', boots: '靴子', ring1: '戒指', ring2: '戒指', amulet: '项链' };
    const baseNames = { weapon: '钢刃', helmet: '铁盔', armor: '锁甲', belt: '皮带', boots: '战靴', ring1: '指环', ring2: '指环', amulet: '护符' };
    const qualMult = { common: 1, good: 1.2, rare: 1.5, epic: 2.0, legendary: 2.8, mythic: 4.0 };
    const mult = qualMult[quality] || 1;
    const baseAtk = slotKey === 'weapon' || slotKey === 'ring1' || slotKey === 'ring2' ? Math.round((10 + level * 3) * mult) : 0;
    const baseDef = (slotKey === 'helmet' || slotKey === 'armor' || slotKey === 'belt' || slotKey === 'boots') ? Math.round((8 + level * 2) * mult) : 0;
    const priceBase = { common: 50, good: 200, rare: 800, epic: 3000, legendary: 12000, mythic: 50000 };
    return {
      uid: 'mock_' + String(Date.now()) + '_' + Math.random().toString(36).slice(2, 6),
      name: QUALITY_NAMES[quality] + baseNames[slotKey] || (slotNames[slotKey] || slotKey),
      quality: quality,
      qualityName: QUALITY_NAMES[quality],
      color: QUALITY_COLORS[quality],
      slotKey: slotKey,
      slotName: slotNames[slotKey] || slotKey,
      baseAtk: baseAtk,
      baseDef: baseDef,
      enhanceLevel: 0,
      price: (priceBase[quality] || 100) + level * 20,
      affixes: [],
    };
  }

  // 初始化 mock 数据
  function initMock() {
    if (_listings.length > 0) return; // 已有数据不覆盖
    const slots = ['weapon', 'helmet', 'armor', 'belt', 'boots', 'ring1', 'amulet'];
    const qualities = ['common', 'good', 'rare', 'epic', 'legendary'];
    // 生成 15 个 mock 拍卖品
    for (let i = 0; i < 15; i++) {
      const slot = slots[Math.floor(Math.random() * slots.length)];
      const quality = qualities[Math.floor(Math.random() * qualities.length)];
      const level = 1 + Math.floor(Math.random() * 10);
      const item = _makeMockItem(slot, quality, level);
      _listings.push({
        id: 'ah_' + (_nextId++),
        sellerId: 'system',
        sellerName: '系统',
        item: item,
        price: item.price,
        listedAt: Date.now() - Math.floor(Math.random() * 86400000),
      });
    }
  }

  // ── 核心函数 ──

  // 获取所有 listing
  function getListings() {
    return JSON.parse(JSON.stringify(_listings));
  }

  // 搜索：按关键词/品质/类型筛选
  // query: { q?, quality?, slotKey?, minPrice?, maxPrice? }
  function searchListings(query) {
    query = query || {};
    let results = _listings;
    if (query.q) {
      const kw = query.q.toLowerCase();
      results = results.filter(l => l.item.name.toLowerCase().includes(kw));
    }
    if (query.quality) {
      results = results.filter(l => l.item.quality === query.quality);
    }
    if (query.slotKey) {
      results = results.filter(l => l.item.slotKey === query.slotKey);
    }
    if (Number.isFinite(query.minPrice)) {
      results = results.filter(l => l.price >= query.minPrice);
    }
    if (Number.isFinite(query.maxPrice)) {
      results = results.filter(l => l.price <= query.maxPrice);
    }
    return JSON.parse(JSON.stringify(results));
  }

  // 上架装备
  // 返回 { ok, listing, cost(fee) }
  function listItem(sellerId, sellerName, item, price) {
    if (!item || !item.uid) return { ok: false, reason: 'invalid-item' };
    if (!Number.isFinite(price) || price < 1) return { ok: false, reason: 'invalid-price' };
    const fee = Economy ? Economy.ahFee(price) : Math.round(price * TAX_RATE);
    const listing = {
      id: 'ah_' + (_nextId++),
      sellerId: sellerId || 'unknown',
      sellerName: sellerName || '未知',
      item: JSON.parse(JSON.stringify(item)),
      price: price,
      listedAt: Date.now(),
    };
    _listings.push(listing);
    return { ok: true, listing, fee };
  }

  // 购买：返回 { ok, listing, fee }
  function buyListing(listingId, buyerId) {
    const idx = _listings.findIndex(l => l.id === listingId);
    if (idx === -1) return { ok: false, reason: 'not-found' };
    const listing = _listings[idx];
    if (listing.sellerId === buyerId) return { ok: false, reason: 'cannot-buy-own' };
    const fee = Economy ? Economy.ahFee(listing.price) : Math.round(listing.price * TAX_RATE);
    _listings.splice(idx, 1);
    return { ok: true, listing, fee };
  }

  // 下架：仅卖家可操作
  function cancelListing(listingId, userId) {
    const idx = _listings.findIndex(l => l.id === listingId);
    if (idx === -1) return { ok: false, reason: 'not-found' };
    const listing = _listings[idx];
    if (listing.sellerId !== userId) return { ok: false, reason: 'not-owner' };
    _listings.splice(idx, 1);
    return { ok: true, listing };
  }

  // 获取某玩家的上架列表
  function myListings(userId) {
    return JSON.parse(JSON.stringify(_listings.filter(l => l.sellerId === userId)));
  }

  function allListingsCount() { return _listings.length; }

  // 重置（测试用）
  function _reset() { _listings = []; _nextId = 1; }

  // 初始化
  initMock();

  return {
    TAX_RATE, getListings, searchListings, listItem, buyListing,
    cancelListing, myListings, allListingsCount, _reset, initMock,
  };
});
