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
  return <aside aria-label="Awdhegle Rewards announcement" className="relative mx-4 mb-2 rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/60 dark:border-amber-800 p-3 pr-9 shadow-sm">
    <button type="button" aria-label="Xir banner-ka" onClick={close} className="absolute top-2 right-2 rounded-full p-1 text-amber-900 dark:text-amber-100 hover:bg-amber-200/60"><X className="w-4 h-4"/></button>
    <div className="flex gap-3 items-start"><div className="shrink-0 bg-amber-200 dark:bg-amber-800 rounded-xl p-2"><Gift className="w-6 h-6 text-amber-800 dark:text-amber-100"/></div><div className="min-w-0"><div className="text-xs font-bold text-amber-700 dark:text-amber-300">CUSUB • AWDHEGLE REWARDS</div><h2 className="font-bold text-sm text-amber-950 dark:text-amber-50">Iibso xirmo, hel Points!</h2><p className="text-xs text-amber-900 dark:text-amber-100 mt-1">Ururso points oo ka hel abaalmarin. Ka eeg Gift-ka kore.</p><button type="button" onClick={()=>{close();onOpen();}} className="flex items-center gap-1 mt-2 text-xs font-bold text-amber-800 dark:text-amber-200">Eeg Points-kayga <ChevronRight className="w-3 h-3"/></button></div></div>
  </aside>;
}
