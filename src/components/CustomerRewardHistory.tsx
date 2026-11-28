import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Gift, Share2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { rewardAccountPhone } from '@/lib/rewardAccountPhone';

type RewardOrder={id:string;package_name:string|null;data_amount:string|null;delivered_at:string|null;created_at:string};
type Paid={points:number;usd:number;gb:number};
const pageSize=20;
const number=(n:number)=>Number(n||0).toLocaleString('en-US',{maximumFractionDigits:4});
const rewardName=(r:RewardOrder)=>[r.package_name,r.data_amount].filter(Boolean).join(' · ')||'Xirmo internet';
const shareUrl='https://awdheegledata.com/';
async function shareReward(message:string){
  const text=message+'\nIibso xirmo, ururso Points, abaalmarin hel!\n'+shareUrl;
  if(navigator.share){
    try{await navigator.share({title:'Awdhegle Rewards',text});return;}
    catch(e){if(e instanceof Error&&e.name==='AbortError')return;}
  }
  window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank','noopener,noreferrer');
}

export function CustomerRewardHistory({phone}:{phone:string|null}){
  const account=rewardAccountPhone(phone);
  const [page,setPage]=useState(0);
  const totals=useQuery({queryKey:['customer-redeemed-totals',account],enabled:!!account,refetchInterval:30000,refetchOnMount:'always',queryFn:async()=>{
    const {data,error}=await (supabase as any).rpc('reward_paid_totals',{p_phone:account});
    if(error)throw error;
    return {points:Number(data?.points||0),usd:Number(data?.usd||0),gb:Number(data?.gb||0)} as Paid;
  }});
  // Use the existing customer order history access; do not expose the private payout ledger.
  const orders=useQuery({queryKey:['customer-reward-deliveries',account,page],enabled:!!account,refetchInterval:30000,refetchOnMount:'always',queryFn:async()=>{
    const {data,error,count}=await supabase.from('orders')
      .select('id,package_name,data_amount,delivered_at,created_at',{count:'exact'})
      .in('receiver_phone',[account!,'252'+account,'+252'+account])
      .in('sender_phone',[account!,'252'+account,'+252'+account])
      .eq('payment_source','reward').eq('status','completed').eq('delivery_status','delivered')
      .order('created_at',{ascending:false}).order('id',{ascending:false})
      .range(page*pageSize,(page+1)*pageSize-1);
    if(error)throw error;
    return {rows:(data??[]) as RewardOrder[],count:count??0};
  }});
  if(!account)return null;
  const paid=totals.data;
  const list=orders.data?.rows??[];
  return <section className="rounded-xl border border-border bg-card p-4 space-y-3">
    <div className="flex items-center justify-between">
      <h2 className="flex items-center gap-2 font-bold"><Gift className="w-5 h-5 text-amber-600"/> Rewards History</h2>
      <button type="button" aria-label="Refresh rewards history" onClick={()=>{void totals.refetch();void orders.refetch();}}><RefreshCw className={'w-4 h-4 '+(totals.isFetching||orders.isFetching?'animate-spin':'')}/></button>
    </div>
    {totals.isLoading||orders.isLoading?<p className="text-xs text-muted-foreground">Waa la soo qaadayaa...</p>:null}
    {totals.isError||orders.isError?<p className="text-xs text-destructive">Qaar ka mid ah xogta lama soo heli karin. Mar kale isku day.</p>:null}
    {paid&&paid.points>0&&<div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-3">
      <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Points-ka aad abaalmarin ku heshay</p>
      <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">{number(paid.points)} Points</p>
      <p className="text-xs text-muted-foreground">Qiimihii points-ka: ${paid.usd.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4})}{paid.gb>0?' · '+number(paid.gb)+' GB':''}</p>
      <button type="button" onClick={()=>void shareReward('🎉 Waxaan Awdhegle Rewards ku helay abaalmarin anigoo isticmaalay '+number(paid.points)+' Points.')} className="mt-3 flex items-center justify-center gap-2 w-full rounded-lg bg-[#1236C0] py-2 text-white text-xs font-bold"><Share2 className="h-4 w-4"/> La wadaag asxaabta</button>
    </div>}
    {list.map(r=><article key={r.id} className="rounded-xl border border-border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <div className="rounded-xl bg-amber-100 p-2"><Gift className="w-5 h-5 text-amber-700"/></div>
        <div className="min-w-0 flex-1"><div className="text-sm font-semibold break-words">{rewardName(r)}</div><div className="text-xs text-muted-foreground">{new Date(r.delivered_at||r.created_at).toLocaleDateString('en-GB')}</div></div>
        <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5"/> Received</span>
      </div>
      <button type="button" className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#1236C0]/25 text-[#1236C0] dark:text-blue-300 py-2 text-xs font-semibold" onClick={()=>void shareReward('🎁 Waxaan Awdhegle Data ka helay abaalmarin internet: '+rewardName(r)+'!')}><Share2 className="w-4 h-4"/> Share Reward</button>
    </article>)}
    {!totals.isLoading&&!orders.isLoading&&!totals.isError&&!orders.isError&&!paid?.points&&!list.length&&<p className="text-xs text-muted-foreground">Weli abaalmarin ma aadan helin.</p>}
    {!!orders.data&&orders.data.count>pageSize&&<div className="flex justify-between items-center text-xs"><button disabled={!page} onClick={()=>setPage(p=>p-1)} className="border rounded px-3 py-1 disabled:opacity-40">Hore</button><span>{page+1} / {Math.ceil(orders.data.count/pageSize)}</span><button disabled={(page+1)*pageSize>=orders.data.count} onClick={()=>setPage(p=>p+1)} className="border rounded px-3 py-1 disabled:opacity-40">Xiga</button></div>}
  </section>;
}
