import { useEffect, useState } from 'react';
import { X, ChevronRight } from 'lucide-react';

const key='awdhegle-rewards-announcement-v1';
export default function RewardLaunchBanner({onOpen}:{onOpen:()=>void}) {
  const [visible,setVisible]=useState(()=>sessionStorage.getItem(key)!=='seen');
  const close=()=>{sessionStorage.setItem(key,'seen');setVisible(false);};
  useEffect(()=>{
    if(!visible)return;
    const timer=window.setTimeout(()=>{sessionStorage.setItem(key,'seen');setVisible(false);},10000);
    return ()=>window.clearTimeout(timer);
  },[visible]);
  if(!visible)return null;
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 px-5" onClick={close}>
    <aside role="dialog" aria-label="Awdhegle Rewards" aria-modal="true" onClick={e=>e.stopPropagation()} className="relative isolate w-full max-w-[350px] overflow-hidden rounded-2xl bg-gradient-to-br from-[#102B9B] via-[#1236C0] to-[#254FD1] px-5 py-5 shadow-2xl ring-1 ring-white/15 text-white animate-in fade-in zoom-in-95 duration-200">
      <div aria-hidden="true" className="absolute -right-12 -top-12 h-48 w-48 rounded-full border-[25px] border-white/5"/>
      <button type="button" aria-label="Xir banner-ka" autoFocus onClick={close} onKeyDown={e=>{if(e.key==='Escape')close();}} className="absolute z-10 top-2 right-2 rounded-full bg-white/15 p-2 text-white hover:bg-white/25"><X className="w-4 h-4"/></button>
      <div className="relative flex flex-col items-center text-center">
        <img src="/rewards-gift.svg" alt="" aria-hidden="true" className="w-24 h-auto select-none pointer-events-none"/>
        <div className="mt-1 inline-flex rounded-full bg-amber-300 px-2.5 py-1 text-[10px] font-extrabold tracking-wide text-[#172D80]">CUSUB · AWDHEGLE REWARDS</div>
        <h2 className="mt-2 text-lg font-extrabold">Iibso xirmo, hel Points!</h2>
        <p className="mt-1 text-sm leading-relaxed text-blue-50">Iibso Xirmo oo hel points kuu noqonaayo lacag ama internet</p>
        <button type="button" onClick={()=>{close();onOpen();}} className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-bold text-[#1236C0]">Eeg Points-kayga <ChevronRight className="w-4 h-4"/></button>
      </div>
    </aside>
  </div>;
}
