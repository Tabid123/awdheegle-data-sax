import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { rewardAccountPhone } from '@/lib/rewardAccountPhone';
import { toast } from 'sonner';

type Summary = {earned:number;used:number;available:number;candidates:{id:string;package_name:string;points:number;tx_id:string;amount:number;sender_phone:string;receiver_phone:string}[];redemptions:{id:string;package_name:string;points:number;status:string}[]};
export function RewardAdminCard({phone}:{phone:string}) {
 const account=rewardAccountPhone(phone);
 const client=useQueryClient();
 const [busy,setBusy]=useState(false);
 const [packageId,setPackageId]=useState('');
 const [requestId,setRequestId]=useState('');
 const call=async(action:string,args:Record<string,unknown>={})=>{
   const {data,error}=await (supabase as any).rpc('reward_admin_action',{p_action:action,p_phone:account,...args});
   if(error)throw error;
   return data as Summary;
 };
 const summary=useQuery({queryKey:['reward-admin',account],queryFn:()=>call('summary'),enabled:!!account,retry:false});
 const packages=useQuery({queryKey:['reward-catalog'],queryFn:async()=>{
   const {data,error}=await supabase.from('data_packages_config').select('id,package_name,data_amount,redemption_points').eq('is_active',true).eq('is_discovery_root',false).gt('redemption_points',0).order('redemption_points').order('id');
   if(error)throw error; return data??[];
 },enabled:!!account,retry:false});
 const run=async(action:string,args:Record<string,unknown>)=>{
   setBusy(true);try{const result=await call(action,args);client.setQueryData(['reward-admin',account],result);toast.success('Waa la kaydiyay');return true;}catch(e:any){toast.error(e?.message||'Reward action failed');return false;}finally{setBusy(false);}
 };
 if(!account)return null;
 if(summary.isLoading)return <p className="text-xs">Loading rewards…</p>;
 if(summary.isError)return <button type="button" onClick={()=>summary.refetch()}>Rewards unavailable — retry</button>;
 const data=summary.data;if(!data)return null;
 return <section className="border rounded-lg p-3 space-y-3">
  <div className="font-semibold">Confirmed Rewards</div>
  <div className="grid grid-cols-3 gap-2 text-xs"><div>Earned <b className="block">{data.earned}</b></div><div>Used / held <b className="block">{data.used}</b></div><div>Available <b className="block">{data.available}</b></div></div>
  <div className="font-medium text-sm">Orders awaiting review</div>
  {data.candidates.map(o=><div key={o.id} className="border rounded p-2 text-xs space-y-1"><div>{o.package_name} · +{o.points} points · ${o.amount}</div><div>Sender {o.sender_phone} / Receiver {o.receiver_phone}</div><div className="break-all">Reference: {o.tx_id}</div><button type="button" disabled={busy} className="border rounded px-2 py-1" onClick={()=>{const ref=prompt('Enter transaction reference from independently verified payment evidence');if(!ref)return;const note=prompt('Confirm payment AND successful delivery independently; enter verification note');if(note&&confirm('Approve confirmed points?'))void run('approve',{p_order:o.id,p_reference:ref,p_note:note});}}>Approve points</button></div>)}
  <div className="font-medium text-sm">Reserve reward</div>
  <select className="border rounded w-full p-2 bg-background" value={packageId} disabled={busy} onChange={e=>{setPackageId(e.target.value);setRequestId('');}}><option value="">Select package</option>{packages.data?.map(p=><option key={p.id} value={p.id}>{p.package_name} — {p.redemption_points} points</option>)}</select>
  <button type="button" disabled={busy||!packageId} className="border rounded px-2 py-1" onClick={async()=>{const note=prompt('Verify account owner requested reward; enter evidence note');if(!note||!confirm('Reserve points? This does not send a package.'))return;const id=requestId||crypto.randomUUID();setRequestId(id);if(await run('reserve',{p_package:packageId,p_request:id,p_note:note})){setRequestId('');setPackageId('');}}}>Reserve points</button>
  {data.redemptions.map(r=><div key={r.id} className="border rounded p-2 text-xs space-y-1"><div>{r.package_name} · {r.points} · {r.status}</div>{r.status==='reserved'&&<div className="flex gap-2"><button type="button" disabled={busy} onClick={()=>{const note=prompt('Enter evidence of completed manual delivery');if(note&&confirm('Confirm package was successfully delivered?'))void run('fulfill',{p_request:r.id,p_note:note});}}>Mark delivered</button><button type="button" disabled={busy} onClick={()=>{const note=prompt('Enter evidence that no package was delivered');if(note&&confirm('Cancel only if no package was delivered. Restore points?'))void run('cancel',{p_request:r.id,p_note:note});}}>Cancel / restore</button></div>}</div>)}
 </section>;
}
