import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type Candidate = {id:string; package_name:string; points:number; tx_id:string; amount:number; sender_phone:string; receiver_phone:string};
export function ManualRewardPayout({phone,available,order,onClose}:{phone:string;available:number;order:Candidate|null;onClose:()=>void}) {
 const client=useQueryClient();
 const [kind,setKind]=useState<'cash'|'internet'>('cash');
 const [points,setPoints]=useState(String(order?.points??available));
 const [amount,setAmount]=useState('');
 const [provider,setProvider]=useState('');
 const [category,setCategory]=useState('');
 const [packageId,setPackageId]=useState('');
 const [review,setReview]=useState(false);
 const [verified,setVerified]=useState(false);
 const [busy,setBusy]=useState(false);
 const request=useRef<string|null>(null);
 const locked=useRef(false);
 const max=order?.points??available;
 const providers=useQuery({queryKey:['reward-payout-providers'],enabled:kind==='internet',queryFn:async()=>{const {data,error}=await supabase.from('providers_config').select('id,display_name,provider_name').eq('is_active',true).order('sort_order');if(error)throw error;return data??[];}});
 const categories=useQuery({queryKey:['reward-payout-categories',provider],enabled:kind==='internet'&&!!provider,queryFn:async()=>{const {data,error}=await supabase.from('package_categories').select('id,category_name').eq('provider_id',provider).eq('is_active',true).order('sort_order');if(error)throw error;return data??[];}});
 const packages=useQuery({queryKey:['reward-payout-packages',provider,category],enabled:kind==='internet'&&!!provider&&!!category,queryFn:async()=>{const {data,error}=await supabase.from('data_packages_config').select('id,package_name,data_amount,price,selling_price').eq('provider_id',provider).eq('category_id',category).eq('is_active',true).eq('is_discovery_root',false).order('sort_order');if(error)throw error;return data??[];}});
 const selected=packages.data?.find(p=>p.id===packageId);
 const providerName=providers.data?.find(p=>p.id===provider)?.display_name||'';
 const categoryName=categories.data?.find(c=>c.id===category)?.category_name||'';
 const n=Number(points), a=kind==='cash'?Number(amount):Number(selected?.selling_price??selected?.price??0);
 const description=kind==='cash'?'Lacag $'+a:[providerName,categoryName,selected?.data_amount||selected?.package_name].join(' · ');
 const valid=Number.isSafeInteger(n)&&n>0&&n<=max&&n<=1000000&&Number.isFinite(a)&&a>0&&a<=9999999999&&Math.abs(a*10000-Math.round(a*10000))<0.00001&&(kind==='cash'||!!selected)&&(!order||verified);
 const submit=async()=>{
  if(!valid||!review||locked.current)return;
  locked.current=true;setBusy(true);request.current??=crypto.randomUUID();
  const id=request.current;
  try{
   if(kind==='internet'){
    const {error}=await (supabase as any).rpc('reward_queue_delivery',{p_phone:phone,p_request:id,p_package:packageId,p_points:n,p_order:order?.id??null});
    if(error)throw error;
    toast.success('Xirmada waa la dirayaa. Marka ay gaarto macmiilka, points-ka si automatic ah ayaa looga jarayaa.');
   }else{
   if(order){
    const {error}=await (supabase as any).rpc('reward_admin_action',{p_action:'approve',p_phone:phone,p_order:order.id,p_reference:order.tx_id,p_note:'Admin confirmed independent payment and delivery review before reward payout.'});
    if(error)throw error;
   }
   const note=('Admin confirmed manual reward delivered: '+description+(selected?' | package '+selected.id:'')).slice(0,500);
   const {error}=await (supabase as any).rpc('reward_confirm_manual_payout',{p_phone:phone,p_request:id,p_kind:kind,p_points:n,p_amount:a,p_reference:order?'reward-order:'+order.id:'reward-payout:'+id,p_note:note});
   if(error)throw error;
   toast.success('Abaalmarinta waa la xaqiijiyay, points-kana waa laga jaray.');
   }
   await Promise.all([client.invalidateQueries({queryKey:['reward-admin',phone]}),client.invalidateQueries({queryKey:['reward-admin-report']}),client.invalidateQueries({queryKey:['reward-preview',phone]}),client.invalidateQueries({queryKey:['reward-payout-history',phone]}),client.invalidateQueries({queryKey:['reward-auto-deliveries',phone]})]);
   onClose();
  }catch(e:any){toast.error(e?.message||'Bixinta lama xaqiijin.');}finally{locked.current=false;setBusy(false);}
 };
 const inputClass='w-full rounded-lg border bg-background p-2.5 text-sm';
 return <Dialog open onOpenChange={v=>{if(!v&&!busy&&!request.current)onClose();}}>
 <DialogContent className="rounded-2xl max-w-sm">
  <DialogTitle>{review?'Ma hubtaa?':'Bixi Abaalmarin'}</DialogTitle>
  <DialogDescription>+252{phone} · {max} Points</DialogDescription>
  {review?<div className="space-y-3">
    <div className="rounded-xl bg-muted p-3 text-sm space-y-1"><div className="font-bold">{description}</div><div>Points laga jarayo: <b>{n}</b></div>{kind==='internet'&&<div>Qiimaha xirmada: ${a}</div>}</div>
    <p className="text-sm">{kind==='internet'?'Ma hubtaa inaad xirmadan u dirto macmiilka? Points-ka si automatic ah ayaa loo jarayaa marka delivery-gu guuleysto.':'Ma hubtaa inaad macmiilkan siisay lacagtaan? Marka aad OK dhahdo points-ka ayaa laga jarayaa.'}</p>
    {request.current&&<p className="text-xs text-muted-foreground">Haddii xaqiijintu fashilantay, isla codsigan ku celi OK; mar kale ha bixin.</p>}
    <div className="grid grid-cols-2 gap-2"><button disabled={busy||!!request.current} onClick={()=>setReview(false)} className="border rounded-lg p-2">Ka noqo</button><button disabled={busy||!valid} onClick={()=>void submit()} className="bg-green-600 text-white rounded-lg p-2 font-bold disabled:opacity-50">{busy?'Sugaya...':kind==='internet'?'OK, Dir Xirmada':'OK, Xaqiiji'}</button></div>
  </div>:<div className="space-y-3">
    <div className="grid grid-cols-2 gap-2">{(['cash','internet'] as const).map(k=><button key={k} onClick={()=>setKind(k)} className={'rounded-xl border p-3 font-semibold '+(kind===k?'bg-blue-600 text-white':'')}>{k==='cash'?'Lacag':'Internet'}</button>)}</div>
    <label className="block text-sm">Points laga jarayo<input className={inputClass} type="number" min="1" max={max} step="1" value={points} onChange={e=>setPoints(e.target.value)}/></label>
    {kind==='cash'?<label className="block text-sm">Lacagta aad siisay ($)<input className={inputClass} type="number" min="0.0001" step="0.0001" value={amount} onChange={e=>setAmount(e.target.value)}/></label>:<>
      <label className="block text-sm">Shirkada<select className={inputClass} value={provider} onChange={e=>{setProvider(e.target.value);setCategory('');setPackageId('');}}><option value="">Dooro shirkada</option>{providers.data?.map(p=><option key={p.id} value={p.id}>{p.display_name||p.provider_name}</option>)}</select></label>
      {provider&&<label className="block text-sm">Category<select className={inputClass} value={category} onChange={e=>{setCategory(e.target.value);setPackageId('');}}><option value="">Dooro category</option>{categories.data?.map(c=><option key={c.id} value={c.id}>{c.category_name}</option>)}</select></label>}
      {category&&<label className="block text-sm">Package<select className={inputClass} value={packageId} onChange={e=>setPackageId(e.target.value)}><option value="">Dooro xirmada</option>{packages.data?.map(p=><option key={p.id} value={p.id}>{p.data_amount||p.package_name} · ${p.selling_price??p.price}</option>)}</select></label>}
      {(providers.isError||categories.isError||packages.isError)&&<p className="text-sm text-red-600">Xogta xirmooyinka lama helin.</p>}
      <p className="text-xs text-muted-foreground">Xirmada si automatic ah ayaa loo dirayaa lambarka kore. Points-ka si automatic ah ayaa loo jarayaa marka delivery-gu guuleysto.</p>
    </>}
    {order&&<label className="flex gap-2 text-xs"><input type="checkbox" checked={verified} onChange={e=>setVerified(e.target.checked)}/> Waxaan hubiyay lacagtii iibka iyo in xirmadii hore si sax ah loo gaarsiiyay.</label>}
    <button disabled={!valid} onClick={()=>setReview(true)} className="w-full bg-blue-600 text-white rounded-xl p-3 font-semibold disabled:opacity-50">{kind==='internet'?'Dir Xirmada':'Xaqiiji Bixinta'}</button>
  </div>}
 </DialogContent></Dialog>;
}
