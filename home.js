const grid=document.querySelector('#game-grid'),search=document.querySelector('#game-search');
let games=[],filter='all';
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;};
function showNotes(game){document.querySelector('#experiment-title').textContent=game.title;document.querySelector('#experiment-description').textContent=game.description;const notes=document.querySelector('#experiment-notes');notes.replaceChildren(...game.notes.map(t=>el('li','',t)));document.querySelector('#experiment-play').href=game.href;document.querySelector('#experiment-dialog').showModal();}
function gameCard(game){
 const card=el('article','game-card '+game.theme);card.dataset.game=game.id;
 const visual=el(game.href?'a':'div','game-art');if(game.href){visual.href=game.href;visual.setAttribute('aria-label',`开始${game.title}`);}visual.append(el('span','experiment-number',`EXPERIMENT / ${game.number}`));
 if(game.cover){const img=el('img','custom-cover');img.src=game.cover;img.alt=game.title;img.loading='lazy';visual.append(img);}
 else if(game.theme==='pokemon'){
  visual.append(el('span','art-circle'));[['assets/cards/pdf-t1-bulbasaur-01.jpg','妙蛙种子','art-card one'],['assets/cards/pdf-legendary-mewtwo.jpg','超梦','art-card two'],['assets/balls/ball-red.png','红球','art-ball']].forEach(([src,alt,cls])=>{const img=el('img',cls);img.src=src;img.alt=alt;img.loading='lazy';visual.append(img);});visual.append(el('span','art-caption','POKÉMON / SPLENDOR'),el('span','visual-arrow','↗'));
 }else{const dice=el('div','next-dice');dice.innerHTML='<i></i><i></i><i></i><i></i><i></i>';visual.append(dice,el('span','next-caption','WHAT’S NEXT?'));}
 const body=el('div','game-body'),meta=el('div','game-meta');meta.append(el('span','game-type',game.type),el('span','status '+game.status,game.status==='live'?'可以开玩':'预留展位'));body.append(meta,el('h3','',game.title),el('p','game-subtitle',game.subtitle));
 const tags=el('div','tags');game.tags.forEach(t=>tags.append(el('span','',t)));body.append(tags);const bottom=el('div','game-bottom');
 if(game.href){const play=el('a','play-link','进入桌游');play.href=game.href;play.append(el('span','','↗'));const notes=el('button','notes-link','实验说明');notes.onclick=()=>showNotes(game);bottom.append(play,notes);}else bottom.append(el('span','coming-note','先把椅子搬好，等下一次开局。'),el('span','next-plus','+'));
 body.append(bottom);card.append(visual,body);return card;
}
function render(){const query=search.value.trim().toLocaleLowerCase(),visible=games.filter(g=>(filter==='all'||g.status===filter)&&[g.title,g.subtitle,g.type,...g.tags].join(' ').toLocaleLowerCase().includes(query));grid.replaceChildren(...visible.map(gameCard));document.querySelector('#empty-state').hidden=visible.length!==0;document.querySelector('#results-note').textContent=`显示 ${visible.length} 个实验展位，其中 ${visible.filter(g=>g.status==='live').length} 个可试玩。`;document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===filter)));}
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;render();});search.addEventListener('input',render);document.querySelector('#reset-filter').onclick=()=>{filter='all';search.value='';render();search.focus();};
const dialog=document.querySelector('#experiment-dialog');document.querySelector('#close-experiment').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
try{const response=await fetch('./games.json');if(!response.ok)throw Error('load');games=await response.json();render();}catch{grid.append(el('p','load-error','展架暂时没有加载成功。可以刷新页面，或点击页面上方“开一局”直接进入对战。'));}
