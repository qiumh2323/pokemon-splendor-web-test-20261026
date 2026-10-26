// Exact feature layout of v62 + v66 planning + v67 privileged-deck entities.
export const colors=['red','blue','black','pink','yellow','master'];
const kinds=['take-distinct','take-double','reserve','catch','discard','evolve','skip-evolution','pass-stalemate'];
const decks=['tier-1','tier-2','tier-3','rare','legendary'];
const sources=[null,'market','reserved','deck-top'];
const one=(n,k)=>Array.from({length:n},(_,i)=>+(i===k));
const ordinal=keys=>{const map=new Map([...new Set(keys)].sort().map((k,i)=>[k,i]));return keys.map(k=>map.get(k));};
const pystr=s=>s===null?'None':`'${s}'`;
const enumrepr=(name,key,value)=>`<${name}.${key}: '${value}'>`;
const tup=xs=>'('+xs.join(', ')+(xs.length===1?',':'')+')';
const pairs=values=>colors.map((c,i)=>[c,values[i]]).filter(x=>x[1]).sort((a,b)=>a[0]<b[0]?-1:1);
function tokenrepr(values){return tup(pairs(values).map(([c,n])=>tup([enumrepr('BallColor',c.toUpperCase(),c),String(n)])));}
export function tieRanks(actions,data){
 const common=a=>[enumrepr('ActionType',kinds[a.kind].replaceAll('-','_').toUpperCase(),kinds[a.kind]),
   a.source?enumrepr('CardSource',sources[a.source].replaceAll('-','_').toUpperCase(),sources[a.source]):'None',
   a.source?enumrepr('PokemonDeck',decks[a.deck].replace('tier-','TIER_').toUpperCase(),decks[a.deck]):'None',
   pystr(data.cards[a.card]?.id??null)];
 const groups=actions.map(a=>tup(a.kind===3?common(a):[...common(a),pystr(data.cards[a.evolves_from]?.id??null),tokenrepr(a.tokens)]));
 const variants=actions.map(a=>{
   let parts=[kinds[a.kind]];if(a.source)parts.push(sources[a.source],decks[a.deck]);
   if(data.cards[a.card])parts.push(data.cards[a.card].id);
   if(data.cards[a.evolves_from])parts.push('from='+data.cards[a.evolves_from].id);
   if(a.tokens.some(Boolean))parts.push('tokens='+pairs(a.tokens).map(([c,n])=>`${c}:${n}`).join(','));
   if(a.payment.some(Boolean))parts.push('pay='+pairs(a.payment).map(([c,n])=>`${c}:${n}`).join(','));
   return pystr(parts.join(':'));
 });
 return {group_ranks:ordinal(groups),variant_ranks:ordinal(variants)};
}
export function encode(packet,data){
 const o=packet.observation,v=o.viewer,own=o.players[v],opp=o.players[1-v];
 const bonus=p=>p.active.reduce((out,c)=>{const card=data.cards[c];out[card.bonus_color]+=card.bonus_value;return out;},[0,0,0,0,0,0]);
 const global=[own.score/18,opp.score/18,(own.score-opp.score)/18,o.turns_completed[v]/30,o.turns_completed[1-v]/30,o.turn_number/60,
   ...one(3,o.phase),+(o.current_player===v),+(o.starting_player===v),+(o.end_triggered_by===v),+(o.end_triggered_by===1-v),
   ...own.tokens.map(x=>x/10),...opp.tokens.map(x=>x/10),...o.supply.map(x=>x/7),...bonus(own).map(x=>x/10),...bonus(opp).map(x=>x/10),
   own.active.length/30,opp.active.length/30,own.reserved.length/3,opp.reserved.length/3,own.tucked.length/15,opp.tucked.length/15,
   ...o.deck_counts.map(x=>x/35),Math.min(o.history.length,12)/12,o.consecutive_passes/4];
 const features=c=>data.cards[c]?.features??data.empty_features;
 const entity=(role,c,action=null)=>{
   const row=(data.cards[c]?.entity??data.empty_entity).slice();row.fill(0,0,10);row[role]=1;
   if(action){const start=10+features(c).length;
     row.splice(start,31,...one(9,action.kind),...one(4,action.source?action.source-1:3),...one(6,action.source?action.deck:5),
       ...action.tokens.map(x=>x/3),...action.payment.map(x=>x/8));}
   return [...row,0,0];
 };
 const entities=[];o.market.forEach(cards=>cards.forEach(c=>entities.push(entity(0,c))));
 o.players.forEach((p,i)=>{const isOwn=i===v;
   p.active.forEach(c=>entities.push(entity(isOwn?1:2,c)));
   p.tucked.forEach(c=>entities.push(entity(isOwn?6:7,c)));
   p.reserved.forEach(r=>entities.push(entity(r.card===65535?5:(isOwn?3:4),r.card)));
 });
 o.history.forEach(h=>entities.push(entity(h.actor===v?8:9,h.action.card,h.action)));
 if(!entities.length)entities.push(entity(0,65535));
 if(o.decks)o.decks.forEach(cards=>[...cards].reverse().forEach((c,i)=>{const row=entity(0,c);row.fill(0,0,10);row[row.length-2]=1;row[row.length-1]=i/cards.length;entities.push(row);}));
 const actions=packet.actions.map((a,i)=>[...one(8,a.kind),...one(4,a.source?a.source-1:3),...one(6,a.source?a.deck:5),
   ...a.tokens.map(x=>x/3),...a.payment.map(x=>x/8),...features(a.card),...features(a.evolves_from),...packet.planning[i]]);
 return {global,entities,actions};
}
