// Selection resolution is deliberately pure so the exact UI path is regression tested.
export function resolveSelection(actions, pending, {card=null,deck=null,balls=[]}={}) {
 let visible;
 if(balls.some(Boolean))visible=actions.filter(a=>[0,1,4].includes(a.kind)&&a.tokens.every((n,i)=>n===balls[i]));
 else if(card!==null)visible=actions.filter(a=>a.card===card);
 else if(deck!==null)visible=actions.filter(a=>a.source===3&&a.deck===deck);
 else visible=actions.filter(a=>[6,7].includes(a.kind));
 if(!visible.includes(pending))pending=null;
 if(!pending&&visible.length===1)pending=visible[0];
 if(!pending&&card!==null){
   // A card click previews its primary legal use; nothing is executed until confirmation.
   const captures=visible.filter(a=>a.kind===3);
   if(captures.length)pending=captures.reduce((a,b)=>(b.payment[5]<a.payment[5]?b:a));
   else pending=visible.find(a=>a.kind===5)??null;
 }
 return {visible,pending};
}
