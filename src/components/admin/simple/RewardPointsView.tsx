import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Gift, Users, Wallet, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { RewardAdminCard } from '@/components/RewardAdminCard';

type Customer = { phone:string; purchases:number; points:number; usd:number; gb:number; available:number };
type Order = { id:string; package_name:string; data_amount:string; amount:number; created_at:string; points:number; value:number; unit:string };
type Report = { total:number; points:number; usd:number; gb:number; customers:Customer[] };
type Detail = { total:number; orders:Order[] };
const num = (n:number) => Number(n||0).toLocaleString('en-US',{maximumFractionDigits:4});
const money = (n:number) => '$'+Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4});
async function report<T>(args:Record<string,unknown>):Promise<T> {
  const {data,error}=await (supabase as any).rpc('reward_admin_report',args);
  if(error) throw error;
  return data as T;
}
function PurchaseHistory({phone,isSo}:{phone:string;isSo:boolean}) {
  const [page,setPage]=useState(0);
  const q=useQuery({queryKey:['reward-purchases',phone,page],queryFn:()=>report<Detail>({p_phone:phone,p_offset:page*50}),retry:false,staleTime:15000});
  return <div className="space-y-2 border-t border-gray-200 dark:border-gray-700 pt-3">
    <h3 className="font-semibold text-sm">{isSo?'Xirmooyinka la iibsaday':'Purchase History'}</h3>
    {q.isLoading&&<p className="text-sm text-gray-500">Loading...</p>}
    {q.isError&&<button onClick={()=>q.refetch()} className="text-red-600 text-sm">{isSo?'Xogta lama helin. Mar kale isku day.':'Unable to load. Retry.'}</button>}
    {q.data?.orders.map(o=><div key={o.id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 dark:bg-gray-700 p-2 text-sm">
      <div className="min-w-0"><div className="font-medium break-words">{o.data_amount||o.package_name}</div><div className="text-xs text-gray-500 dark:text-gray-300">{o.package_name} · {money(o.amount)} · {new Date(o.created_at).toLocaleDateString()}</div></div>
      <div className="text-right shrink-0"><div className="font-semibold text-amber-600">+{num(o.points)} Points</div><div className="text-green-600">{o.unit==='GB'?num(o.value)+' GB':money(o.value)}</div></div>
    </div>)}
    {q.data&&q.data.total>50&&<div className="flex justify-between text-sm"><button disabled={page===0} onClick={()=>setPage(p=>p-1)}>Previous</button><span>{page+1} / {Math.ceil(q.data.total/50)}</span><button disabled={(page+1)*50>=q.data.total} onClick={()=>setPage(p=>p+1)}>Next</button></div>}
    <RewardAdminCard phone={phone} />
  </div>;
}
export default function RewardPointsView({isSo}:{isSo:boolean}) {
  const [search,setSearch]=useState('');
  const [page,setPage]=useState(0);
  const [expanded,setExpanded]=useState<string|null>(null);
  const q=useQuery({queryKey:['reward-admin-report',search,page],queryFn:()=>report<Report>({p_search:search,p_offset:page*50}),retry:false,staleTime:15000,refetchInterval:30000});
  const d=q.data;
  return <div className="space-y-3 text-gray-800 dark:text-gray-100">
    <div className="grid grid-cols-2 gap-2">
      <div className="rounded-xl bg-purple-100 text-purple-800 p-3"><Users className="w-5 h-5"/><div className="text-xs">Total Customers</div><div className="text-xl font-bold">{d?num(d.total):'—'}</div></div>
      <div className="rounded-xl bg-amber-100 text-amber-800 p-3"><Gift className="w-5 h-5"/><div className="text-xs">Total Points</div><div className="text-xl font-bold">{d?num(d.points):'—'}</div></div>
      <div className="col-span-2 rounded-xl bg-emerald-100 text-emerald-800 p-3"><Wallet className="w-5 h-5"/><div className="text-xs">Total Points Value</div><div className="text-2xl font-bold">{d?money(d.usd):'—'}</div>{!!d?.gb&&<div>{num(d.gb)} GB</div>}</div>
    </div>
    <div className="flex items-center gap-2 rounded-xl bg-white dark:bg-gray-800 p-3"><Search className="w-4 h-4 text-gray-400"/><input className="flex-1 min-w-0 bg-transparent outline-none text-sm" type="tel" placeholder={isSo?'Raadi lambarka macmiilka...':'Search customer phone...'} value={search} onChange={e=>{setSearch(e.target.value);setPage(0);setExpanded(null);}}/><button onClick={()=>q.refetch()} aria-label="Refresh" disabled={q.isFetching}><RefreshCw className={'w-4 h-4 '+(q.isFetching?'animate-spin':'')}/></button></div>
    {q.isLoading&&<p className="p-3 text-sm text-gray-500">Loading...</p>}
    {q.isError&&<p className="p-3 text-sm text-red-600">{isSo?'Xogta lama soo heli karin. Hubi inaad admin ahaan u gashay.':'Unable to load rewards. Sign in as an administrator.'}</p>}
    {d?.customers.length===0&&<p className="p-4 text-sm text-center text-gray-500">{isSo?'Weli macaamiil points helay lama helin.':'No customers with reward points yet.'}</p>}
    {d?.customers.map(c=><section key={c.phone} className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3 space-y-2">
      <button className="flex w-full items-center gap-2 text-left" onClick={()=>setExpanded(x=>x===c.phone?null:c.phone)}>
        <div className="flex-1 min-w-0"><div className="font-bold">+252{c.phone}</div><div className="text-xs text-gray-500 dark:text-gray-300">{num(c.purchases)} {isSo?'Iib points leh':'Reward purchases'}</div></div>
        <div className="text-right"><div className="font-bold text-amber-600">{num(c.points)} Points</div><div className="font-semibold text-green-600">{money(c.usd)}{!!c.gb&&' · '+num(c.gb)+' GB'}</div></div>
        {expanded===c.phone?<ChevronUp className="w-4 h-4"/>:<ChevronDown className="w-4 h-4"/>}
      </button>
      {expanded===c.phone&&<PurchaseHistory key={c.phone} phone={c.phone} isSo={isSo}/>}
    </section>)}
    {d&&d.total>50&&<div className="flex justify-between p-2 text-sm"><button disabled={page===0} onClick={()=>{setPage(p=>p-1);setExpanded(null);}}>Previous</button><span>{page+1} / {Math.ceil(d.total/50)}</span><button disabled={(page+1)*50>=d.total} onClick={()=>{setPage(p=>p+1);setExpanded(null);}}>Next</button></div>}
  </div>;
}
