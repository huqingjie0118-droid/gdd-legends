const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const MON = { slime:{exp:10}, goblin:{exp:20}, skeleton:{exp:35}, orc:{exp:55}, darkmage:{exp:65}, tiger:{exp:80} };
function run(cfg,label){
  const monScale=lv=>clamp(cfg.MON_LEVEL_FLOOR+(lv-1)*cfg.MON_LEVEL_SCALE,cfg.MON_LEVEL_FLOOR,cfg.MON_LEVEL_CAP);
  const monExp=(id,lv)=>Math.round(MON[id].exp*cfg.REWARD_SCALE*monScale(lv));
  const expToNext=lv=>Math.round(cfg.EXP_BASE*Math.pow(cfg.EXP_GROWTH,lv-1));
  let maxK=0,maxL=0,cum=0;const rows=[];
  for(let lv=1;lv<=22;lv++){
    const need=expToNext(lv);
    const avg=(monExp('slime',lv)*0.2+monExp('goblin',lv)*0.2+monExp('skeleton',lv)*0.3+monExp('orc',lv)*0.15+monExp('darkmage',lv)*0.1+monExp('tiger',lv)*0.05);
    const k=Math.ceil(need/avg); if(k>maxK){maxK=k;maxL=lv;} cum+=k; rows.push(k);
  }
  console.log(`[${label}] G=${cfg.EXP_GROWTH} CAP=${cfg.MON_LEVEL_CAP} MS=${cfg.MON_LEVEL_SCALE} FL=${cfg.MON_LEVEL_FLOOR} RS=${cfg.REWARD_SCALE}`);
  console.log(`  ${rows.join(' ')}`);
  console.log(`  max=${maxK}@Lv${maxL} total=${cum} (~${(cum*3.2/60).toFixed(1)}min)`);
}
// RS held at 7 (affects affixes too) — compensate with growth + mon scaling
run({EXP_BASE:150, EXP_GROWTH:1.20, REWARD_SCALE:7, MON_LEVEL_FLOOR:0.8, MON_LEVEL_SCALE:0.075, MON_LEVEL_CAP:3.4}, 'H');
run({EXP_BASE:150, EXP_GROWTH:1.18, REWARD_SCALE:7, MON_LEVEL_FLOOR:0.82, MON_LEVEL_SCALE:0.08, MON_LEVEL_CAP:3.6}, 'I');
run({EXP_BASE:150, EXP_GROWTH:1.19, REWARD_SCALE:7, MON_LEVEL_FLOOR:0.8, MON_LEVEL_SCALE:0.078, MON_LEVEL_CAP:3.5}, 'J');
run({EXP_BASE:150, EXP_GROWTH:1.21, REWARD_SCALE:7, MON_LEVEL_FLOOR:0.78, MON_LEVEL_SCALE:0.07, MON_LEVEL_CAP:3.3}, 'K');
