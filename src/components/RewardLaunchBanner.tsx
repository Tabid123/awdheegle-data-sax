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
  return <aside aria-label="Awdhegle Rewards announcement" className="absolute z-30 left-0 right-0 top-1/2 -translate-y-1/2 isolate overflow-hidden rounded-xl bg-gradient-to-br from-[#102B9B] via-[#1236C0] to-[#254FD1] px-3 py-2 shadow-xl ring-1 ring-white/15 text-white">
    <div aria-hidden="true" className="absolute -right-8 -top-12 h-32 w-32 rounded-full border-[18px] border-white/5"/>
    <button type="button" aria-label="Xir banner-ka" onClick={close} className="absolute z-10 top-1 right-1 rounded-full bg-white/15 p-1 text-white hover:bg-white/25"><X className="w-4 h-4"/></button>
    <div className="relative flex items-center gap-2 pr-4">
      <div className="min-w-0 flex-1">
        <div className="text-[9px] leading-tight font-extrabold tracking-wide text-amber-300">CUSUB · AWDHEGLE REWARDS</div>
        <p className="mt-1 text-[11px] leading-tight font-medium text-blue-50">Iibso Xirmo oo hel points kuu noqonaayo lacag ama internet</p>
        <button type="button" onClick={()=>{close();onOpen();}} className="mt-1 inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[10px] leading-tight font-bold text-[#1236C0]">Eeg Points-kayga <ChevronRight className="w-3 h-3"/></button>
      </div>
      <img src="/rewards-gift.svg" alt="" aria-hidden="true" className="w-14 sm:w-[72px] h-auto shrink-0 select-none pointer-events-none" />
    </div>
  </aside>;
}
