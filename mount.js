(function() {
  'use strict';

  var MOUNTS = {
    whiteHorse: { name: '白马', speedBonus: 0.20, rarity: 'common', cost: { gold: 5000 }, desc: '普通坐骑' },
    wolf:       { name: '霜狼', speedBonus: 0.35, rarity: 'rare', cost: { gold: 15000, item: 'wolfFang' }, desc: '稀有坐骑' },
    dragon:     { name: '幼龙', speedBonus: 0.50, rarity: 'epic', cost: { gold: 50000, item: 'dragonEgg' }, desc: '史诗坐骑' },
    phoenix:    { name: '凤凰', speedBonus: 0.70, rarity: 'legendary', cost: { gold: 100000, item: 'phoenixFeather' }, desc: '传说坐骑' },
    warHorse:   { name: '战马', speedBonus: 0.25, rarity: 'common', cost: { guild: 3 }, desc: '公会坐骑' }
  };

  var OUTLOOKS = {
    default: { name: '默认', color: '#aaa' },
    flame:   { name: '烈焰', color: '#f53', cost: { gold: 20000 } },
    frost:   { name: '寒冰', color: '#6cf', cost: { gold: 20000 } },
    shadow:  { name: '暗影', color: '#86e', cost: { gold: 30000 } },
    holy:    { name: '圣光', color: '#ff4', cost: { gold: 50000 } }
  };

  function makeMountCollection() {
    return { owned: {}, active: null };
  }

  function playerMountSpeed(collection) {
    if (!collection || !collection.active) return 1;
    var mount = MOUNTS[collection.active];
    if (!mount) return 1;
    return 1 + mount.speedBonus;
  }

  function canAffordMount(mountId, playerState) {
    var mount = MOUNTS[mountId];
    if (!mount || !playerState) return false;
    var cost = mount.cost;
    if (cost.gold !== undefined && (playerState.gold === undefined || playerState.gold < cost.gold)) {
      return false;
    }
    if (cost.item !== undefined && playerState.items && playerState.items[cost.item] === undefined) {
      return false;
    }
    if (cost.item !== undefined && playerState.items && playerState.items[cost.item] <= 0) {
      return false;
    }
    if (cost.guild !== undefined && (playerState.guildLevel === undefined || playerState.guildLevel < cost.guild)) {
      return false;
    }
    return true;
  }

  function purchaseMount(collection, mountId, playerState) {
    if (!collection || !MOUNTS[mountId]) return false;
    if (collection.owned[mountId]) return false;
    if (!canAffordMount(mountId, playerState)) return false;
    var mount = MOUNTS[mountId];
    var cost = mount.cost;
    if (cost.gold !== undefined) {
      playerState.gold -= cost.gold;
    }
    if (cost.item !== undefined && playerState.items) {
      playerState.items[cost.item] = (playerState.items[cost.item] || 0) - 1;
    }
    collection.owned[mountId] = true;
    return true;
  }

  function equipMount(collection, mountId) {
    if (!collection || !collection.owned[mountId]) return false;
    collection.active = mountId;
    return true;
  }

  function unequipMount(collection) {
    if (!collection) return false;
    if (collection.active === null) return false;
    collection.active = null;
    return true;
  }

  function purchaseOutlook(outlooksOwned, outlookId, playerGold) {
    if (!outlooksOwned || !OUTLOOKS[outlookId]) return false;
    if (outlookId === 'default') return false;
    if (outlooksOwned[outlookId]) return false;
    var outlook = OUTLOOKS[outlookId];
    if (!outlook.cost) return false;
    if (playerGold === undefined || playerGold < outlook.cost.gold) return false;
    outlooksOwned[outlookId] = true;
    return true;
  }

  function getActiveSkin(outlooksOwned) {
    if (!outlooksOwned) return { name: '默认', color: '#aaa' };
    for (var id in OUTLOOKS) {
      if (outlooksOwned[id] && id !== 'default') {
        return { name: OUTLOOKS[id].name, color: OUTLOOKS[id].color };
      }
    }
    return { name: '默认', color: '#aaa' };
  }

  var exports = {
    MOUNTS: MOUNTS,
    OUTLOOKS: OUTLOOKS,
    makeMountCollection: makeMountCollection,
    playerMountSpeed: playerMountSpeed,
    canAffordMount: canAffordMount,
    purchaseMount: purchaseMount,
    equipMount: equipMount,
    unequipMount: unequipMount,
    purchaseOutlook: purchaseOutlook,
    getActiveSkin: getActiveSkin
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }
  if (typeof window !== 'undefined') {
    window.mount = exports;
    window.Mount = exports;
  }
})();
