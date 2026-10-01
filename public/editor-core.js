(function(global){
'use strict';
function history(limit=60){
 let states=[],position=-1;
 return {reset(){states=[];position=-1;},push(value){if(states[position]===value)return false;states.splice(position+1);states.push(value);if(states.length>limit)states.shift();position=states.length-1;return true;},move(delta){const next=position+delta;if(next<0||next>=states.length)return null;position=next;return states[position];},get canUndo(){return position>0;},get canRedo(){return position<states.length-1;}};
}
function viewport(dialog){const update=()=>{if(!dialog.open)return;const v=global.visualViewport;dialog.style.setProperty('--editor-height',(v?.height||global.innerHeight)+'px');dialog.style.setProperty('--editor-top',(v?.offsetTop||0)+'px');};global.visualViewport?.addEventListener('resize',update);global.visualViewport?.addEventListener('scroll',update);global.addEventListener('resize',update);return update;}
global.EditorCore={history,viewport};
})(window);
