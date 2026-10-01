(function (scope) {
  'use strict';
  const variants = [
    {id:'windows',name:'윈도우 순환',dots:6},
    {id:'breath',name:'물방울 호흡',dots:4},
    {id:'comet',name:'흐르는 혜성',dots:5},
    {id:'infinity',name:'인피니티 루프',dots:5},
    {id:'drops',name:'말랑 낙하',dots:4},
    {id:'duet',name:'쌍방울 공전',dots:2},
    {id:'petal',name:'꽃잎 순환',dots:8},
    {id:'wave',name:'물결 릴레이',dots:7},
    {id:'ripple',name:'로고 파동',dots:3},
    {id:'satellite',name:'유기적 궤도',dots:5}
  ];
  const defaultId='petal';
  const normalize=value=>variants.some(item=>item.id===value)?value:defaultId;
  function render(element,value) {
    const variant=variants.find(item=>item.id===normalize(value));
    element.className='dn-motion '+variant.id;
    element.dataset.loadingMotion=variant.id;
    element.setAttribute('aria-hidden','true');
    const logo=document.createElement('img');
    logo.className='dn-mark';logo.src='/brand/logo.svg';logo.alt='';logo.width=74;logo.height=52;
    element.replaceChildren(logo);
    for(let i=0;i<variant.dots;i++){
      const dot=document.createElement('span');dot.className='dn-dot';
      dot.style.setProperty('--i',i);element.appendChild(dot);
    }
  }
  function apply(value) {
    const id=normalize(value);
    document.querySelectorAll('[data-loading-motion]').forEach(element=>render(element,id));
  }
  const api={variants,defaultId,normalize,render,apply};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(typeof document==='undefined')return;
  scope.LoadingMotion=api;
  document.querySelectorAll('.loading-overlay .orbit-spinner').forEach(element=>{
    element.closest('.loading-panel').classList.add('dn-loading');render(element,defaultId);
  });
  const select=document.getElementById('loading-motion');
  if(select)variants.forEach((variant,index)=>{
    const option=document.createElement('option');option.value=variant.id;
    option.textContent=(index+1)+'. '+variant.name+(variant.id===defaultId?' · 기본':'');select.appendChild(option);
  });
})(typeof window==='undefined'?globalThis:window);
