(function(){
  // One scroll viewport for the whole menu, including menus containing several lists.
  function mount(viewport){
    if(!viewport)return null;
    viewport.classList.add('ui-list-viewport');
    const positions=new Map();let current=null,frame=0;
    function activate(key,restore){
      if(key===current&&restore===undefined)return;
      current=key;cancelAnimationFrame(frame);
      const top=Number.isFinite(restore)?restore:positions.get(key)||0;
      viewport.scrollTop=top;
      frame=requestAnimationFrame(()=>{viewport.scrollTop=top;});
    }
    function capture(){if(current!==null)positions.set(current,viewport.scrollTop);}
    function reset(){cancelAnimationFrame(frame);positions.clear();current=null;viewport.scrollTop=0;}
    return {activate,capture,reset,get top(){return viewport.scrollTop;},scrollBy(delta){viewport.scrollBy({top:delta,behavior:'instant'});}};
  }
  window.ListScroll={mount};
})();
