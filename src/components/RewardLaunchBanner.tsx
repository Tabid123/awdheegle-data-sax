import { useEffect, useState } from 'react';
import { Gift, X, ChevronRight } from 'lucide-react';

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
  return <aside aria-label="Awdhegle Rewards announcement" className="relative isolate mx-4 mb-2 overflow-hidden rounded-2xl bg-gradient-to-br from-[#102B9B] via-[#1236C0] to-[#254FD1] p-3.5 shadow-lg text-white">
    <div aria-hidden="true" className="absolute -right-12 -top-16 h-48 w-48 rounded-full border-[24px] border-white/5"/>
    <div aria-hidden="true" className="absolute -right-6 -bottom-16 h-40 w-40 rounded-full bg-cyan-300/10"/>
    <button type="button" aria-label="Xir banner-ka" onClick={close} className="absolute z-10 top-2 right-2 rounded-full bg-white/15 p-1.5 text-white hover:bg-white/25"><X className="w-4 h-4"/></button>
    <div className="relative flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <div className="inline-flex rounded-full bg-amber-300 px-2 py-0.5 text-[9px] font-extrabold tracking-wide text-[#172D80]">CUSUB · AWDHEGLE REWARDS</div>
        <h2 className="mt-1.5 text-base leading-tight font-extrabold">Iibso xirmo, hel Points!</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-blue-50">Iibso Xirmo oo hel points kuu noqonaayo lacag ama internet</p>
        <button type="button" onClick={()=>{close();onOpen();}} className="mt-2.5 inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-[#1236C0]">Eeg Points-kayga <ChevronRight className="w-3 h-3"/></button>
      </div>
      <img src="/rewards-gift.svg" alt="" aria-hidden="true" className="w-[94px] sm:w-[130px] h-auto shrink-0 mr-1 mt-3 select-none pointer-events-none" />
    </div>
  </aside>;
}
