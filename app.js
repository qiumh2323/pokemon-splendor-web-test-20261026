import {resolveSelection,toggleMainBall,adjustDiscard} from './selection.js?v=4';
const $=s=>document.querySelector(s),names=['红球','蓝球','黑球','粉球','黄球','大师球'];
const colors=['red','blue','black','pink','yellow','master'],deckNames=['初级','进阶','高级','稀有','传说'];
const deckFiles=['tier-1','tier-2','tier-3','rare','legendary'];
let cards=[],state=null,boardState=null,busy=false,pending=null,selectedCard=null,selectedDeck=null;
let chosenBalls=[0,0,0,0,0,0],requestId=0,log=[],gameSeed=0,activeDifficulty='simple';
let zoomTimer,touchTimer,touchOrigin,lastAction=null,lastActor=null,thinkTimer,thinkStart=0,searchProgress=null;
const worker=new Worker('./worker.js?v=4',{type:'module'}),waiting=new Map(),ballViews=[];
const glareProfiles={'pdf-t3-alakazam-01':'top-right','pdf-t2-haunter-01':'right','pdf-t1-charmander-01':'right','pdf-legendary-mewtwo':'top-right'};
const sprite=c=>`assets/balls/ball-${colors[c]}.png`,art=c=>`assets/cards/${cards[c].id}.jpg`;
const total=v=>v.reduce((a,b)=>a+b,0),countText=v=>v.map((n,i)=>n?`${names[i]}×${n}`:'').filter(Boolean).join('、')||'无需支付';
const difficultyName=()=>({simple:'简单电脑',medium:'中等电脑',hard:'困难电脑'}[activeDifficulty]);
function showDeck(d,modal){
 hideZoom();const full=activeDifficulty==='hard'&&state.decks;
 const known=new Set(state.market.flat());state.players.forEach(p=>{p.active.forEach(c=>known.add(c));p.tucked.forEach(c=>known.add(c));p.reserved.forEach(r=>{if(cards[r.card])known.add(r.card);});});
 const remaining=full?[...state.decks[d]].reverse():cards.map((c,i)=>i).filter(i=>cards[i].deck===d&&!known.has(i));
 const content=document.createElement('div');content.className='deck-preview';
 const title=document.createElement('h3');title.textContent=`${deckNames[d]}牌库 · 剩余 ${state.deck_counts[d]} 张`;content.append(title);
 const note=document.createElement('p');note.className='fine';note.textContent=(full?'实际顺序：从左到右、从上到下，第一张为牌库顶。':'以下为尚未公开的候选牌，不代表顺序；可能包含对手从牌库顶取得的隐藏保留牌。')+' 右键或长按牌库可打开完整列表。';content.append(note);
 const grid=document.createElement('div');grid.className='deck-preview-grid';remaining.forEach((c,i)=>{const el=document.createElement('div');el.append(cardSurface(c));const caption=document.createElement('small');caption.textContent=(full?`${i+1} · `:'')+cards[c].name;el.append(caption);grid.append(el);});content.append(grid);
 if(!remaining.length)grid.textContent='暂无剩余牌';
 if(modal){$('#detail-title').textContent='牌库信息';$('#detail-art').replaceChildren(content);if(!$('#card-dialog').open)$('#card-dialog').showModal();}
 else{$('#zoom').replaceChildren(content);$('#zoom').hidden=false;}
}
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,4000);}
function send(req){return new Promise((resolve,reject)=>{req.id=++requestId;waiting.set(req.id,{resolve,reject});worker.postMessage(req);});}
worker.onmessage=({data:m})=>{
 if(m.type==='ready'){cards=m.data.cards;$('#version').textContent=m.data.version;$('#new').disabled=false;$('#open-setup').disabled=false;$('#new').textContent='开始对战';$('#hint').textContent='本地AI已准备好，开始一场对战吧。';$('#load-state').textContent='本地AI已就绪';}
 if(m.type==='loading'){$('#hint').textContent=m.message;$('#load-state').textContent=m.message;}
 if(m.type==='search-progress'&&waiting.has(m.id)){searchProgress=m;updateThinking();}
 if(m.type==='result'){const task=waiting.get(m.id);waiting.delete(m.id);task?.resolve(m);}
 if(m.type==='error'){const task=waiting.get(m.id);waiting.delete(m.id);task?.reject(Error(m.message));if(!task){toast('加载失败：'+m.message);$('#load-state').textContent='加载失败：'+m.message;}}
};
worker.onerror=e=>{const error=Error('浏览器引擎错误：'+e.message);waiting.forEach(p=>p.reject(error));waiting.clear();toast(error.message);};
function cardSurface(c){
 const surface=document.createElement('span');surface.className='card-surface';surface.dataset.glare=glareProfiles[cards[c].id]??'gentle';
 const image=document.createElement('img');image.src=art(c);image.alt=cards[c].name;image.draggable=false;surface.append(image);
 const correction=image.cloneNode();correction.alt='';correction.setAttribute('aria-hidden','true');correction.className='glare-correction';surface.append(correction);return surface;
}
function hideZoom(){clearTimeout(zoomTimer);$('#zoom').hidden=true;}
function showCardDetail(c){hideZoom();$('#detail-art').replaceChildren(cardSurface(c));$('#detail-title').textContent=cards[c].name;$('#card-dialog').showModal();}
function chooseCard(c){if(busy||state?.terminal||state?.current_player!==0)return;selectedCard=selectedCard===c?null:c;selectedDeck=null;chosenBalls.fill(0);pending=null;render();}
function cardButton(c,cls='card'){
 const b=document.createElement('button');b.className=cls;b.dataset.card=c;b.title=cards[c].name+' · 长按查看';b.setAttribute('aria-label',cards[c].name);
 if(cls==='card')b.append(cardSurface(c));else b.textContent=cards[c].name;
 b.onclick=()=>{if(b.dataset.suppressClick){delete b.dataset.suppressClick;return;}chooseCard(c);};
 b.onmouseenter=()=>{if(!matchMedia('(hover:hover)').matches)return;zoomTimer=setTimeout(()=>{$('#zoom').replaceChildren(cardSurface(c));$('#zoom').hidden=false;},550);};
 b.onmouseleave=hideZoom;b.onblur=hideZoom;
 b.onpointerdown=e=>{if(e.pointerType!=='touch')return;touchOrigin=[e.clientX,e.clientY];clearTimeout(touchTimer);touchTimer=setTimeout(()=>{b.dataset.suppressClick='1';showCardDetail(c);},500);};
 b.onpointermove=e=>{if(touchOrigin&&Math.hypot(e.clientX-touchOrigin[0],e.clientY-touchOrigin[1])>10)clearTimeout(touchTimer);};
 b.onpointerup=b.onpointercancel=()=>{clearTimeout(touchTimer);touchOrigin=null;};
 b.oncontextmenu=e=>{e.preventDefault();showCardDetail(c);};return b;
}
function clearSelection(){pending=null;selectedCard=null;selectedDeck=null;chosenBalls.fill(0);render();}
function setBalls(next){if(!next){toast('最多选择三种颜色，点已选球可取消。');return;}selectedCard=null;selectedDeck=null;pending=null;chosenBalls=next;render();}
function discardNeed(){return Math.max(0,total(state.players[0].tokens)-10);}
function clickBall(c){
 if(state.phase===1)setBalls(adjustDiscard(chosenBalls,c,1,state.players[0].tokens,discardNeed()));
 else setBalls(toggleMainBall(chosenBalls,c));
}
function chooseDouble(c){const a=state?.actions.find(a=>a.kind===1&&a.tokens[c]===2);if(!busy&&a)setBalls(a.tokens.slice());}
function buildBank(){
 const bank=$('#bank');names.forEach((name,c)=>{
   const slot=document.createElement('div');slot.className='ball-slot';
   const b=document.createElement('button');b.className='ball-button';b.disabled=true;b.innerHTML=`<img src="${sprite(c)}" alt=""><span class="count"></span><span class="color-label">${name}</span><span class="selected-count" hidden></span>`;
   b.onclick=()=>clickBall(c);b.ondblclick=()=>{if(state.phase===0)chooseDouble(c);};
   const steps=document.createElement('div');steps.className='ball-steps';steps.hidden=true;
   const minus=document.createElement('button'),plus=document.createElement('button'),n=document.createElement('span');
   minus.textContent='−';plus.textContent='+';minus.setAttribute('aria-label',`少弃一个${name}`);plus.setAttribute('aria-label',`多弃一个${name}`);
   minus.onclick=()=>setBalls(adjustDiscard(chosenBalls,c,-1,state.players[0].tokens,discardNeed()));
   plus.onclick=()=>setBalls(adjustDiscard(chosenBalls,c,1,state.players[0].tokens,discardNeed()));
   steps.append(minus,n,plus);slot.append(b,steps);bank.append(slot);ballViews.push({b,steps,minus,plus,n});
 });
}
function renderBank(){
 const discard=state.phase===1&&state.current_player===0,held=state.players[0].tokens;
 $('#bank-label').textContent=discard?'选择要弃掉的手持球':'公共精灵球';
 $('#bank-tip').textContent=discard?`需弃 ${discardNeed()} 个 · 已选 ${total(chosenBalls)} 个`:'点选 / 取消 · 同色拿两个使用下方快捷选项';
 $('#bank').setAttribute('aria-label',discard?'弃球选择':'公共精灵球');
 ballViews.forEach(({b,steps,minus,plus,n},c)=>{
   const amount=discard?held[c]:state.supply[c];b.querySelector('.count').textContent=amount;
   b.setAttribute('aria-label',`${names[c]} ${discard?'手持':'剩余'}${amount}`);
   b.classList.toggle('selected',chosenBalls[c]>0);b.classList.toggle('last-taken',!discard&&lastActor===1&&lastAction?.tokens[c]>0&&lastAction.kind<=1);
   const mark=b.querySelector('.selected-count');mark.hidden=!chosenBalls[c];mark.textContent=`${discard?'−':'+'}${chosenBalls[c]}`;
   b.disabled=busy||state.terminal||state.current_player!==0||state.phase===2||(discard?!held[c]:c===5||!amount);
   b.setAttribute('aria-pressed',String(chosenBalls[c]>0));
   steps.hidden=!discard;n.textContent=chosenBalls[c];minus.disabled=busy||chosenBalls[c]===0;plus.disabled=busy||chosenBalls[c]>=held[c]||total(chosenBalls)>=discardNeed();
 });
 const quick=$('#ball-quick-actions');quick.replaceChildren();
 if(!busy&&!discard&&chosenBalls.filter(Boolean).length===1){const c=chosenBalls.findIndex(Boolean);
   if(chosenBalls[c]===1&&state.actions.some(a=>a.kind===1&&a.tokens[c]===2)){
     const b=document.createElement('button');b.className='double-choice';b.textContent=`改拿2个${names[c]}`;b.onclick=()=>chooseDouble(c);quick.append(b);
   }
 }
}
function actionLabel(a){
 const name=cards[a.card]?.name??'牌库顶';
 if(a.kind<=1)return `拿球 · ${countText(a.tokens)}`;
 if(a.kind===2)return `保留 · ${a.source===3?deckNames[a.deck]+'牌库顶':name}`;
 if(a.kind===3)return `捕获 · ${name}`;
 if(a.kind===4)return `弃球 · ${countText(a.tokens)}`;
 if(a.kind===5)return `进化 · ${cards[a.evolves_from]?.name} → ${name}`;
 return a.kind===6?'跳过本回合进化':'无其他合法行动 · 让过';
}
function renderPlayer(index,id){
 const p=state.players[index],box=$(id),bonus=[0,0,0,0,0];
 p.active.forEach(c=>bonus[cards[c].bonus_color]+=cards[c].bonus_value);box.replaceChildren();
 const title=document.createElement('h3');title.innerHTML=`${index?'电脑':'你'} <span class="score">${p.score}<small> / 18分</small></span>`;box.append(title);
 const scorebar=document.createElement('progress');scorebar.className='score-progress';scorebar.max=18;scorebar.value=Math.min(18,p.score);scorebar.setAttribute('aria-label',`${index?'电脑':'你'}的得分进度`);box.append(scorebar);
 const inv=document.createElement('div');inv.className='inventory';
 names.forEach((name,c)=>{const el=document.createElement('div');el.className='owned-column';el.innerHTML=`<img src="${sprite(c)}" alt="${name}"><strong>${p.tokens[c]}</strong>${c<5?`<small>永久 ${bonus[c]}</small>`:'<small>万能球</small>'}`;
   if(c<5)p.active.filter(n=>cards[n].bonus_color===c).forEach(n=>{const b=cardButton(n,'mini owned-card');b.style.setProperty('--owned-color',['#da4d49','#437fce','#42454c','#df78aa','#d4aa23'][c]);b.classList.toggle('double-bonus',cards[n].bonus_value===2);
     const evolution=document.createElement('span');evolution.className='evolution-cost';
     const targets=cards.filter(t=>t.identity===cards[n].evolves_to_identity);
     if(targets.length){const label=document.createElement('span');label.textContent='进化';evolution.append(label);cards[n].evolution_requirement.forEach((v,k)=>{if(v){const cost=document.createElement('span');cost.innerHTML=`<img src="${sprite(k)}" alt="${names[k]}">×${v}`;evolution.append(cost);}});}else evolution.textContent='—';
     b.append(evolution);el.append(b);});inv.append(el);});box.append(inv);
 const cap=document.createElement('div');cap.className='caption';cap.textContent=`手持 ${total(p.tokens)} / 10 · 已进化 ${p.tucked.length}`;box.append(cap);
 const summary=document.createElement('div');summary.className='caption';summary.textContent=`已捕获 ${p.active.length} 张 · 按永久球颜色排列`;box.append(summary);
 const label=document.createElement('div');label.className='caption';label.textContent=`保留牌 ${p.reserved.length} / 3`;box.append(label);
 const reserve=document.createElement('div');reserve.className='mini-cards';p.reserved.forEach(r=>{if(cards[r.card])reserve.append(cardButton(r.card,'mini'));else{const t=document.createElement('span');t.className='mini';t.textContent='隐藏保留牌';reserve.append(t);}});box.append(reserve);
}
function renderBoard(){
 if(boardState!==state){
   const market=$('#market');market.replaceChildren();
   const deckButton=d=>{const b=document.createElement('button');b.className='deck';b.innerHTML=`<span class="deck-surface"><img src="assets/cards/back-${deckFiles[d]}.jpg" alt="${deckNames[d]}牌库"></span><span>余 ${state.deck_counts[d]}</span>`;
     b.title='悬浮查看牌库 · 长按打开';b.onmouseenter=()=>{if(matchMedia('(hover:hover)').matches)zoomTimer=setTimeout(()=>showDeck(d,false),550);};b.onmouseleave=hideZoom;b.onfocus=()=>{};
     b.oncontextmenu=e=>{e.preventDefault();showDeck(d,true);};b.onpointerdown=e=>{if(e.pointerType==='touch')touchTimer=setTimeout(()=>{b.dataset.suppressClick='1';showDeck(d,true);},500);};b.onpointerup=b.onpointercancel=()=>clearTimeout(touchTimer);b.onpointermove=()=>clearTimeout(touchTimer);
     b.onclick=()=>{if(b.dataset.suppressClick){delete b.dataset.suppressClick;return;}if(busy||state.terminal||state.current_player!==0)return;selectedDeck=selectedDeck===d?null:d;selectedCard=null;chosenBalls.fill(0);pending=null;render();};return b;};
   const premium=document.createElement('div');premium.className='tier premium';
   [3,4].forEach(d=>{premium.append(deckButton(d));if(state.market[d].length)state.market[d].forEach(c=>premium.append(cardButton(c)));else{const e=document.createElement('span');e.className='empty';e.textContent='空';premium.append(e);}});market.append(premium);
   [2,1,0].forEach(d=>{const row=document.createElement('div');row.className='tier';row.append(deckButton(d));state.market[d].forEach(c=>row.append(cardButton(c)));market.append(row);});
   renderPlayer(1,'#opponent');renderPlayer(0,'#human');boardState=state;
 }
 document.querySelectorAll('[data-card]').forEach(b=>{const c=Number(b.dataset.card);b.classList.toggle('selected',selectedCard===c);
   b.classList.toggle('affordable',state.actions.some(a=>a.card===c&&a.kind===3));b.classList.toggle('evolvable',state.actions.some(a=>a.card===c&&a.kind===5));
   b.classList.toggle('last-move',lastActor===1&&lastAction?.card===c);b.setAttribute('aria-pressed',String(selectedCard===c));});
}
function showSelection(a){
 const box=$('#selection');box.replaceChildren();
 if(!a)return;
 const title=document.createElement('strong');title.textContent=actionLabel(a);box.append(title);
 if(a.kind===3){const row=document.createElement('div');row.className='payment-preview';
   const label=document.createElement('span');label.textContent='支付';row.append(label);
   a.payment.forEach((n,c)=>{if(!n)return;const token=document.createElement('span');token.className='payment-token';token.innerHTML=`<img src="${sprite(c)}" alt="${names[c]}">×${n}`;row.append(token);});
   if(!a.payment.some(Boolean))row.append(document.createTextNode('无需支付'));box.append(row);
 }
}
function updateThinking(){
 if(!thinkStart)return;
 $('#thinking-time').textContent=`${((performance.now()-thinkStart)/1000).toFixed(1)} 秒`;
 const p=searchProgress;$('#search-progress').max=p?.total??1;$('#search-progress').value=p?.completed??0;
 $('#search-count').textContent=p?`搜索 ${p.completed} / ${p.total}`:'正在评估当前局面…';
}
function render(){
 if(!state)return;hideZoom();
 const terminal=state.terminal,human=state.current_player===0,phase=['主要行动','弃球','进化选择'][state.phase];
 document.body.classList.add('has-game');document.body.classList.toggle('ai-busy',busy&&!human);
 $('#turn').textContent=terminal?'对局结束':`回合 ${state.turn_number+1} · ${human?'你':'电脑'} · ${phase}`;
 $('#score-strip').textContent=`你 ${state.players[0].score} : ${state.players[1].score} 电脑`;
 $('#thinking').hidden=!(busy&&!human);$('#new').disabled=busy;$('#open-setup').disabled=busy;
 $('#open-setup').textContent=terminal?'再来一局':'新对局';$('#difficulty-label').textContent=difficultyName();
 $('#new').textContent='开始新对局';$('#setup-warning').hidden=terminal;$('#clear').disabled=busy;
 $('#difficulty').disabled=busy;$('#first').disabled=busy;
 renderBank();renderBoard();
 const resolved=(!busy&&human&&!terminal)?resolveSelection(state.actions,pending,{card:selectedCard,deck:selectedDeck,balls:chosenBalls}):{visible:[],pending:null};
 pending=resolved.pending;
 $('#decision-title').textContent=terminal?'对局结束':!human?'电脑回合':`你的${phase}`;
 $('#confirm').disabled=busy||!human||!pending||terminal;
 $('#confirm').textContent=busy?(!human?'电脑思考中…':'正在执行…'):pending?({0:'确认拿球',1:'确认拿球',2:'确认保留',3:'确认捕获',4:'确认弃球',5:'确认进化',6:'跳过本回合进化',7:'确认让过'}[pending.kind]):'请先选择行动';
 const options=$('#actions'),oldScroll=options.scrollTop;options.replaceChildren();
 if(resolved.visible.length>1)resolved.visible.forEach(a=>{const b=document.createElement('button');b.className='action'+(pending===a?' chosen':'');b.textContent=actionLabel(a);
   if(a.kind===3){const small=document.createElement('small');small.textContent='支付：'+countText(a.payment);b.append(small);}
   b.onclick=()=>{pending=a;render();};options.append(b);});options.scrollTop=oldScroll;
 if(!busy&&!terminal&&!human){const retry=document.createElement('button');retry.className='action';retry.textContent='重试电脑行动';retry.onclick=aiTurns;options.append(retry);}
 if(terminal){const r=state.rewards[0];$('#selection').textContent=`${r>0?'你获胜了！':r<0?'电脑获胜。':'本局平局。'} 你 ${state.players[0].score} 分，电脑 ${state.players[1].score} 分。`;$('#hint').textContent='本回合所有行动已结算，对局结束。';}
 else if(busy&&!human)$('#selection').textContent='电脑正在你的设备上思考，你仍可查看卡牌。';
 else if(pending)showSelection(pending);
 else if(state.phase===1)$('#selection').textContent=`请选择要弃掉的球：${total(chosenBalls)} / ${discardNeed()}。使用球下方的加减按钮调整。`;
 else if(chosenBalls.some(Boolean))$('#selection').textContent='继续选择不同颜色凑成合法组合，或使用“拿两个同色”。点已选球可取消。';
 else if(selectedCard!==null||selectedDeck!==null)$('#selection').textContent='这张牌当前不能捕获、保留或进化。可长按查看卡面。';
 else $('#selection').textContent=state.phase===2?'选择可进化的目标牌，或跳过本回合进化。':'点选精灵球或卡牌，下方确认后执行。';
 $('#last-action').hidden=!lastAction;if(lastAction)$('#last-action').textContent=`${lastActor?'电脑刚刚':'你刚刚'}：${actionLabel(lastAction)}`;
 updateThinking();
}
function addLog(actor,a,elapsed,search){
 lastAction=a;lastActor=actor;log.push({actor,turn:state.turn_number,action:a,elapsed_ms:elapsed,search,score:state.players.map(p=>p.score)});
 const li=document.createElement('li'),span=document.createElement('span');span.textContent=`${log.length} · ${actor?'电脑':'你'}`;li.append(span,document.createTextNode(actionLabel(a)+(elapsed?` · ${(elapsed/1000).toFixed(1)}秒`:'')));$('#history').prepend(li);
}
async function aiTurns(){
 busy=true;render();
 try{while(!state.terminal&&state.current_player===1){
   thinkStart=performance.now();searchProgress=null;clearInterval(thinkTimer);thinkTimer=setInterval(updateThinking,200);updateThinking();
   const config={simple:{simulations:128,worlds:0,full:false},medium:{simulations:2048,worlds:4,full:false},hard:{simulations:2048,worlds:0,full:true}}[activeDifficulty];
   const m=await send({op:'ai',...config});clearInterval(thinkTimer);state=m.result;addLog(1,state.chosen,m.elapsed,state.search);render();
 }}catch(e){toast('AI执行失败：'+e.message);$('#hint').textContent='计算失败，未跳过行动：'+e.message;}
 finally{clearInterval(thinkTimer);thinkStart=0;busy=false;render();}
}
$('#new').onclick=async()=>{
 if(busy)return;busy=true;$('#new').disabled=true;
 try{const nextDifficulty=$('#difficulty').value;gameSeed=crypto.getRandomValues(new Uint32Array(1))[0];
   const first=$('#first').value==='random'?crypto.getRandomValues(new Uint32Array(1))[0]%2:Number($('#first').value);
   const m=await send({op:'new',seed:gameSeed,starting_player:first,full:nextDifficulty==='hard'});state=m.result;activeDifficulty=nextDifficulty;
   log=[];lastAction=null;lastActor=null;$('#history').replaceChildren();$('#setup-dialog').close();$('#hint').textContent='点选球，或选择一张卡牌。电脑回合仍可长按查看卡牌。';clearSelection();await aiTurns();
 }catch(e){busy=false;$('#new').disabled=false;toast(e.message);}
};
$('#clear').onclick=clearSelection;
$('#confirm').onclick=async()=>{
 if(!pending||busy)return;const a=pending;busy=true;render();
 try{const m=await send({op:'apply',action:a});state=m.result;addLog(0,a,0);busy=false;clearSelection();await aiTurns();}
 catch(e){busy=false;toast(e.message);render();}
};
$('#export').onclick=()=>{const blob=new Blob([JSON.stringify({schema:'pokemon-web-replay-v1',champion:'V32.9',seed:gameSeed,difficulty:activeDifficulty,actions:log},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`pokemon-web-${gameSeed}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('#open-setup').onclick=()=>$('#setup-dialog').showModal();$('#close-setup').onclick=()=>$('#setup-dialog').close();
$('#close-card').onclick=()=>$('#card-dialog').close();
$('#card-dialog').addEventListener('close',()=>document.querySelectorAll('[data-suppress-click]').forEach(b=>delete b.dataset.suppressClick));
document.addEventListener('keydown',e=>{if(document.querySelector('dialog[open]'))return;if(e.key==='Escape')clearSelection();if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)&&!$('#confirm').disabled){e.preventDefault();$('#confirm').click();}});
buildBank();$('#setup-dialog').showModal();
