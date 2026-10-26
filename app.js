const $=s=>document.querySelector(s),names=['红球','蓝球','黑球','粉球','黄球','大师球'];
const sprites=['ball-red','ball-blue','ball-black','ball-pink','ball-yellow','ball-master'];
const deckNames=['初级','进阶','高级','稀有','传说'];
const deckFiles=['tier-1','tier-2','tier-3','rare','legendary'];
let cards=[],state=null,busy=false,pending=null,selectedCard=null,selectedDeck=null,chosenBalls=[0,0,0,0,0,0],requestId=0;
let log=[],zoomTimer,worker=new Worker('./worker.js',{type:'module'}),gameSeed=0;
const glareProfiles={'pdf-t3-alakazam-01':'top-right','pdf-t2-haunter-01':'right','pdf-t1-charmander-01':'right','pdf-legendary-mewtwo':'top-right'};
const waiting=new Map();
const sprite=c=>`assets/balls/${sprites[c]}.png`;
const art=c=>`assets/cards/${cards[c].id}.jpg`;
function cardSurface(c){
 const surface=document.createElement('span');surface.className='card-surface';
 surface.dataset.glare=glareProfiles[cards[c].id]??'gentle';
 const image=document.createElement('img');image.src=art(c);image.alt=cards[c].name;surface.append(image);
 const correction=image.cloneNode();correction.alt='';correction.setAttribute('aria-hidden','true');correction.className='glare-correction';surface.append(correction);
 return surface;
}
const countText=v=>v.map((n,i)=>n?`${names[i]}×${n}`:'').filter(Boolean).join('、')||'无需支付';
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;setTimeout(()=>$('#toast').hidden=true,5000);}
function send(req){return new Promise((resolve,reject)=>{req.id=++requestId;waiting.set(req.id,{resolve,reject});worker.postMessage(req);});}
worker.onmessage=({data:m})=>{
 if(m.type==='ready'){cards=m.data.cards;$('#version').textContent=m.data.version;$('#new').disabled=false;$('#new').textContent='开始对战';$('#hint').textContent='本地引擎准备完成。选好难度，开始你的第一回合。';}
 if(m.type==='loading')$('#hint').textContent=m.message;
 if(m.type==='result'){const task=waiting.get(m.id);waiting.delete(m.id);task?.resolve(m);}
 if(m.type==='error'){const task=waiting.get(m.id);waiting.delete(m.id);task?.reject(Error(m.message));if(!task){toast('加载失败：'+m.message);$('#hint').textContent='加载失败，请刷新重试：'+m.message;}}
};
worker.onerror=e=>toast('浏览器引擎错误：'+e.message);
function clearSelection(){pending=null;selectedCard=null;selectedDeck=null;chosenBalls.fill(0);render();}
function actionLabel(a){
 const name=cards[a.card]?.name??'牌库顶';
 if(a.kind===0||a.kind===1)return `拿球 · ${countText(a.tokens)}`;
 if(a.kind===2)return `保留 · ${a.source===3?deckNames[a.deck]+'牌库顶':name}`;
 if(a.kind===3)return `捕获 · ${name}`;
 if(a.kind===4)return `弃球 · ${countText(a.tokens)}`;
 if(a.kind===5)return `进化 · ${cards[a.evolves_from]?.name} → ${name}`;
 if(a.kind===6)return '跳过本回合进化';
 return '无其他合法行动 · 让过';
}
function visibleActions(){
 if(!state||busy||state.current_player!==0||state.terminal)return [];
 const all=state.actions;
 if(chosenBalls.some(Boolean))return all.filter(a=>[0,1,4].includes(a.kind)&&a.tokens.every((n,i)=>n===chosenBalls[i]));
 if(selectedCard!==null)return all.filter(a=>a.card===selectedCard);
 if(selectedDeck!==null)return all.filter(a=>a.source===3&&a.deck===selectedDeck);
 return all.filter(a=>[6,7].includes(a.kind));
}
function cardButton(c,cls='card'){
 const b=document.createElement('button');b.className=cls;b.title=cards[c].name;b.setAttribute('aria-label',cards[c].name);
 if(cls==='card'){b.append(cardSurface(c));}else b.textContent=cards[c].name;
 if(state?.actions?.some(a=>a.card===c&&a.kind===3))b.classList.add('affordable');
 if(state?.actions?.some(a=>a.card===c&&a.kind===5))b.classList.add('evolvable');
 if(selectedCard===c)b.classList.add('selected');
 b.onclick=()=>{if(busy||state?.terminal)return;selectedCard=c;selectedDeck=null;chosenBalls.fill(0);pending=null;render();};
 b.onmouseenter=()=>{zoomTimer=setTimeout(()=>{$('#zoom').replaceChildren(cardSurface(c));$('#zoom').hidden=false;},550);};
 b.onmouseleave=()=>{clearTimeout(zoomTimer);$('#zoom').hidden=true;};b.onblur=b.onmouseleave;
 return b;
}
function renderPlayer(index,id){
 const p=state.players[index],box=$(id),bonus=[0,0,0,0,0,0];p.active.forEach(c=>bonus[cards[c].bonus_color]+=cards[c].bonus_value);
 box.replaceChildren();const title=document.createElement('h3');title.innerHTML=`${index?'电脑':'你'} <span class="score">${p.score}<small> / 18分</small></span>`;box.append(title);
 const inv=document.createElement('div');inv.className='inventory';
 names.forEach((name,c)=>{const el=document.createElement('div');el.innerHTML=`<img src="${sprite(c)}" alt="${name}"><strong>${p.tokens[c]}</strong><small>永久 ${bonus[c]}</small>`;inv.append(el);});box.append(inv);
 const cap=document.createElement('div');cap.className='caption';cap.textContent=`手持 ${p.tokens.reduce((a,b)=>a+b,0)} / 10 · 已捕获 ${p.active.length} · 已进化 ${p.tucked.length}`;box.append(cap);
 const active=document.createElement('div');active.className='mini-cards';p.active.forEach(c=>active.append(cardButton(c,'mini')));box.append(active);
 const reserve=document.createElement('div');reserve.className='mini-cards';p.reserved.forEach(r=>{if(cards[r.card])reserve.append(cardButton(r.card,'mini'));else{const t=document.createElement('span');t.className='mini';t.textContent='隐藏保留牌';reserve.append(t);}});box.append(reserve);
}
function render(){
 if(!state)return;
 clearTimeout(zoomTimer);$('#zoom').hidden=true;
 const terminal=state.terminal,phase=['主要行动','弃球','进化选择'][state.phase];
 $('#turn').textContent=terminal?'对局结束':`回合 ${state.turn_number+1} · ${state.current_player?'电脑':'你'} · ${phase}`;
 $('#thinking').hidden=!busy;$('#confirm').disabled=busy||!pending||terminal;
 $('#new').disabled=busy;
 $('#clear').disabled=busy;$('#difficulty').disabled=busy;$('#first').disabled=busy;
 const bank=$('#bank');bank.replaceChildren();names.forEach((name,c)=>{
   const b=document.createElement('button');b.className='ball-button'+(chosenBalls[c]?' selected':'');b.setAttribute('aria-label',`${name} 剩余${state.supply[c]}`);
   b.innerHTML=`<img src="${sprite(c)}" alt=""><span class="count">${state.supply[c]}</span><span class="color-label">${name}</span>${chosenBalls[c]?`<span class="selected-count">${state.phase===1?'−':'+'}${chosenBalls[c]}</span>`:''}`;
   b.disabled=busy||terminal||state.current_player!==0||state.phase===2||(state.phase===0&&(c===5||!state.supply[c]))||(state.phase===1&&!state.players[0].tokens[c]);
   b.onclick=()=>{selectedCard=null;selectedDeck=null;pending=null;const max=state.phase===1?state.players[0].tokens[c]:(state.supply[c]>=4?2:1);chosenBalls[c]=(chosenBalls[c]+1)%(max+1);render();};bank.append(b);
 });
 const market=$('#market');market.replaceChildren();
 // Rare and legendary share one row; the three standard tiers remain separate.
 const premium=document.createElement('div');premium.className='tier';premium.style.gridTemplateColumns='90px minmax(0,1fr) 90px minmax(0,1fr)';
 const deckButton=d=>{const b=document.createElement('button');b.className='deck';b.innerHTML=`<img src="assets/cards/back-${deckFiles[d]}.jpg" alt="${deckNames[d]}牌库"><span>余 ${state.deck_counts[d]}</span>`;b.onclick=()=>{if(busy)return;selectedDeck=d;selectedCard=null;chosenBalls.fill(0);pending=null;render();};return b;};
 [3,4].forEach(d=>{premium.append(deckButton(d));state.market[d].forEach(c=>premium.append(cardButton(c)));if(!state.market[d].length){const empty=document.createElement('span');empty.className='empty';empty.textContent='空';premium.append(empty);}});market.append(premium);
 [2,1,0].forEach(d=>{const row=document.createElement('div');row.className='tier';row.append(deckButton(d));state.market[d].forEach(c=>row.append(cardButton(c)));market.append(row);});
 renderPlayer(1,'#opponent');renderPlayer(0,'#human');
 $('#decision-title').textContent=terminal?'对局结束':`你的${phase}`;
 const aa=visibleActions(),container=$('#actions');container.replaceChildren();
 aa.forEach(a=>{const b=document.createElement('button');b.className='action'+(pending===a?' chosen':'');b.textContent=actionLabel(a);
   if(a.kind===3){const small=document.createElement('small');small.textContent='支付：'+countText(a.payment);b.append(small);}
   b.onclick=()=>{pending=a;render();};container.append(b);});
 if(!busy&&!terminal&&state.current_player===1){const retry=document.createElement('button');retry.className='action';retry.textContent='重试电脑行动';retry.onclick=aiTurns;container.append(retry);}
 if(terminal){const r=state.rewards[0];$('#selection').textContent=`${r>0?'你获胜了！':r<0?'电脑获胜。':'本局平局。'} 你 ${state.players[0].score} 分，电脑 ${state.players[1].score} 分。`;$('#hint').textContent='所有回合内行动均已结算，对局结束。';}
 else if(busy)$('#selection').textContent='AI计算在浏览器后台进行，不消耗服务器搜索算力。';
 else if(chosenBalls.some(Boolean))$('#selection').textContent=aa.length?'选择下方合法拿球 / 弃球行动后确认。':'当前组合不合法：拿不同色球，或公共库存至少4个时拿两个同色；弃球需恰好弃至10个。';
 else if(selectedCard!==null||selectedDeck!==null)$('#selection').textContent=aa.length?'选择捕获、保留或进化，并核对支付。':'当前没有针对该卡牌的合法行动。';
 else $('#selection').textContent=state.phase===1?'点击球选择要弃掉的数量。':state.phase===2?'点击可进化的目标牌，或选择跳过。':'点击公共球选择颜色，或点击卡牌选择捕获 / 保留。';
}
function addLog(actor,a,elapsed,search){log.push({actor,turn:state.turn_number,action:a,elapsed_ms:elapsed,search,score:state.players.map(p=>p.score)});const li=document.createElement('li');const span=document.createElement('span');span.textContent=`${log.length} · ${actor?'电脑':'你'}`;li.append(span,document.createTextNode(actionLabel(a)+(elapsed?` · ${(elapsed/1000).toFixed(1)}秒`:'')));$('#history').prepend(li);}
async function aiTurns(){
 busy=true;render();
 try{while(!state.terminal&&state.current_player===1){const difficulty=$('#difficulty').value;
   const config={simple:{simulations:128,worlds:0,full:false},medium:{simulations:2048,worlds:4,full:false},hard:{simulations:2048,worlds:0,full:true}}[difficulty];
   const m=await send({op:'ai',...config});state=m.result;addLog(1,state.chosen,m.elapsed,state.search);render();
 }}catch(e){toast('AI执行失败：'+e.message);$('#hint').textContent='计算失败，未自动跳过行动：'+e.message;}
 finally{busy=false;render();}
}
$('#new').onclick=async()=>{if(busy){toast('请等待当前搜索完成。');return;}if(state&&!state.terminal&&!confirm('结束当前对局并开始新游戏？'))return;
 busy=true;$('#new').disabled=true;
 try{gameSeed=crypto.getRandomValues(new Uint32Array(1))[0];const m=await send({op:'new',seed:gameSeed,starting_player:Number($('#first').value)});state=m.result;log=[];$('#history').replaceChildren();$('#hint').textContent='点击球选择颜色，点击卡牌选择行动；悬停卡牌可放大查看。';clearSelection();await aiTurns();}catch(e){busy=false;$('#new').disabled=false;toast(e.message);}};
$('#clear').onclick=clearSelection;
$('#confirm').onclick=async()=>{if(!pending||busy)return;const a=pending;busy=true;render();try{const m=await send({op:'apply',action:a});state=m.result;addLog(0,a,0);busy=false;clearSelection();await aiTurns();}catch(e){busy=false;toast(e.message);render();}};
$('#export').onclick=()=>{const blob=new Blob([JSON.stringify({schema:'pokemon-web-replay-v1',champion:'V32.9',seed:gameSeed,difficulty:$('#difficulty').value,actions:log},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`pokemon-web-${gameSeed}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('#scan-correction').onchange=e=>document.body.classList.toggle('original-scans',!e.target.checked);
