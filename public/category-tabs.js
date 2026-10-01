(function(){
  'use strict';
  // One selection controller for list filters and editor categories.
  function mount(container,{items,value,onChange}){
    container.replaceChildren();
    container.classList.add('category-tabs');
    container.setAttribute('role','radiogroup');
    const buttons=items.map(item=>{
      const button=document.createElement('button');
      button.type='button';button.className='category-tab';
      button.textContent=item.label;button.dataset.value=item.value;
      button.setAttribute('role','radio');container.append(button);
      button.addEventListener('click',()=>choose(item.value));
      return button;
    });
    function update(next){
      value=items.some(item=>item.value===next)?next:items[0]?.value;
      buttons.forEach(button=>{
        const selected=button.dataset.value===value;
        button.setAttribute('aria-checked',String(selected));
        button.tabIndex=selected?0:-1;
      });
    }
    function choose(next){if(next===value)return;update(next);onChange?.(next);}
    container.onkeydown=event=>{
      const index=buttons.indexOf(event.target);if(index<0)return;
      let next;
      if(event.key==='ArrowRight'||event.key==='ArrowDown')next=(index+1)%buttons.length;
      else if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=(index+buttons.length-1)%buttons.length;
      else if(event.key==='Home')next=0;
      else if(event.key==='End')next=buttons.length-1;
      else return;
      event.preventDefault();buttons[next].focus({preventScroll:true});
      const target=buttons[next],left=target.offsetLeft;
      if(left<container.scrollLeft)container.scrollLeft=left;
      else if(left+target.offsetWidth>container.scrollLeft+container.clientWidth)container.scrollLeft=left+target.offsetWidth-container.clientWidth;
      choose(target.dataset.value);
    };
    update(value);return {update};
  }
  window.CategoryTabs={mount};
})();
