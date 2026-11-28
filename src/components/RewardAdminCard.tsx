import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { rewardAccountPhone } from '@/lib/rewardAccountPhone';
import { ManualRewardPayout, type Candidate } from '@/components/ManualRewardPayout';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';

type Redemption={id:string;package_name:string;points:number;status:string};
type Summary={earned:number;used:number;available:number;candidates:Candidate[];redemptions:Redemption[]};
type Delivery={id:string;delivery_order_id:string;status:string;package_name:string;points:number};
type Payout={id:string;payout_kind:string;payout_amount:number;points:number;finished_at:string;finished_by:string;finish_note:string};
export function RewardAdminCard({phone}:{phone:string}) {
 const account=rewardAccountPhone(phone);
 const client=useQueryClient();
 const [selected,setSelected]=useState<Candidate|null>(null);
 const [open,setOpen]=useState(false);
 const [legacy,setLegacy]=useState<{r:Redemption;action:'fulfill'|'cancel'}|null>(null);
 const [busy,setBusy]=useState(false);
 const summary=useQuery({queryKey:['reward-admin',account],enabled:!!account,retry:false,queryFn:async()=>{const {data,error}=await (supabase as any).rpc('reward_admin_action',{p_action:'summary',p_phone:account});if(error)throw error;return data as Summary;}});
 const deliveries=useQuery({queryKey:['reward-auto-deliveries',account],enabled:!!account,refetchInterval:5000,queryFn:async()=>{const {data,error}=await (supabase as any).from('reward_redemptions').select('id,delivery_order_id,status,package_name,points').eq('customer_phone',account).eq('status','reserved').not('delivery_order_id','is',null);if(error)throw error;const rows=(data??[]) as Delivery[];return await Promise.all(rows.map(async r=>{const {data:q,error:e}=await supabase.from('delivery_queue').select('status').eq('order_id',r.delivery_order_id);if(e)throw e;return {...r,queueStatuses:(q??[]).map(x=>x.status)};}));}});
 const payouts=useQuery({queryKey:['reward-payout-history',account],enabled:!!account,retry:false,queryFn:async()=>{const {data,error}=await (supabase as any).from('reward_redemptions').select('id,payout_kind,payout_amount,points,finished_at,finished_by,finish_note').eq('customer_phone',account).eq('status','fulfilled').not('payout_kind','is',null).order('finished_at',{ascending:false}).limit(100);if(error)throw error;return (data??[]) as Payout[];}});
 if(!account)return null;
 if(summary.isLoading)return <p className="text-xs">Loading rewards…</p>;
 if(summary.isError)return <button onClick={()=>summary.refetch()}>Rewards unavailable — retry</button>;
 const d=summary.data;if(!d)return null;
 const reserved=d.redemptions.filter(r=>r.status==='reserved');
 const finalizeLegacy=async()=>{if(!legacy||busy)return;setBusy(true);try{const auto=deliveries.data?.some(r=>r.id===legacy.r.id);const {error}=auto?await (supabase as any).rpc('reward_finish_delivery',{p_phone:account,p_request:legacy.r.id,p_delivered:legacy.action==='fulfill'}):await (supabase as any).rpc('reward_admin_action',{p_action:legacy.action,p_phone:account,p_request:legacy.r.id,p_note:legacy.action==='fulfill'?'Admin confirmed manual package delivery.':'Admin confirmed no package was delivered.'});if(error)throw error;setLegacy(null);await Promise.all([summary.refetch(),deliveries.refetch(),payouts.refetch(),client.invalidateQueries({queryKey:['reward-admin-report']}),client.invalidateQueries({queryKey:['reward-preview',account]})]);toast.success('Waa la kaydiyay');}catch(e:any){toast.error(e?.message||'Unable to confirm');}finally{setBusy(false);}};
 return <section className="border rounded-xl p-3 space-y-3">
  <h3 className="font-bold">Abaalmarinta</h3>
  <div className="grid grid-cols-3 gap-2 text-xs"><div>Earned <b className="block">{d.earned}</b></div><div>Used / held <b className="block">{d.used}</b></div><div>Available <b className="block">{d.available}</b></div></div>
  {d.candidates.map(o=><div key={o.id} className="border rounded-lg p-2 text-sm space-y-1"><div className="font-medium">{o.package_name} · +{o.points} Points</div><div className="text-xs text-muted-foreground">Iibka: ${o.amount} · {o.sender_phone} → {o.receiver_phone}</div><button type="button" disabled={!!reserved.length} onClick={()=>{setSelected(o);setOpen(true);}} className="bg-blue-600 text-white rounded-lg px-3 py-2 font-semibold disabled:opacity-50">Approve points / Bixi</button></div>)}
  {d.available>0&&<button disabled={!!reserved.length} onClick={()=>{setSelected(null);setOpen(true);}} className="w-full bg-blue-600 text-white rounded-lg py-2 font-semibold disabled:opacity-50">Bixi Abaalmarin</button>}
  {reserved.map(r=>{const delivery=deliveries.data?.find(x=>x.id===r.id);const states=delivery?.queueStatuses??[];const done=states.length>0&&states.every(x=>x==='completed');const failed=states.length>0&&states.every(x=>x==='failed'||x==='cancelled');return <div key={r.id} className="border rounded-lg p-3 text-sm space-y-2"><div className="font-semibold">{r.package_name} · {r.points} Points (Reserved)</div>{delivery&&<div className="text-xs text-muted-foreground">Delivery: {states.join(', ')||'Waiting'}</div>}<div className="flex gap-2"><button disabled={!!delivery&&!done||deliveries.isLoading||deliveries.isError} className="rounded bg-green-600 text-white px-2 py-1 disabled:opacity-40" onClick={()=>setLegacy({r,action:'fulfill'})}>Xaqiiji delivery</button><button disabled={!!delivery&&!failed||deliveries.isLoading||deliveries.isError} className="border rounded px-2 py-1 disabled:opacity-40" onClick={()=>setLegacy({r,action:'cancel'})}>Cancel / restore</button></div></div>;})}
  <div className="font-semibold text-sm">Reward History</div>
  {payouts.isError&&<p className="text-xs text-red-600">History unavailable.</p>}
  {!payouts.isError&&!payouts.data?.length&&<p className="text-xs text-muted-foreground">Weli abaalmarin lama bixin.</p>}
  {payouts.data?.map(p=><div key={p.id} className="border rounded-lg p-2 text-xs space-y-1"><div className="font-bold">{p.payout_kind==='cash'?'Lacag $'+p.payout_amount:'Internet · $'+p.payout_amount} · -{p.points} Points</div><div>{p.finish_note?.replace('Admin confirmed manual reward delivered: ','').split(' | package ')[0]}</div><div>{new Date(p.finished_at).toLocaleString()}</div><div className="break-all text-muted-foreground">Admin: {p.finished_by}</div></div>)}
  {open&&<ManualRewardPayout phone={account} available={d.available} order={selected} onClose={()=>setOpen(false)}/>}
  {legacy&&<Dialog open onOpenChange={v=>{if(!v&&!busy)setLegacy(null);}}><DialogContent><DialogTitle>Ma hubtaa?</DialogTitle><DialogDescription>{legacy.action==='fulfill'?'Xirmada ma la gaarsiiyay?':'Ma hubtaa inaan xirmada la dirin?'}</DialogDescription><button disabled={busy} onClick={()=>void finalizeLegacy()} className="bg-blue-600 text-white rounded-lg py-2">OK</button></DialogContent></Dialog>}
 </section>;
}
