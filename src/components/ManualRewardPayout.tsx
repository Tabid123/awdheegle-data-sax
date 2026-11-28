import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function ManualRewardPayout({phone,available}:{phone:string;available:number}) {
 const client=useQueryClient();
 const [open,setOpen]=useState(false);
 const [kind,setKind]=useState<'cash'|'internet'>('cash');
 const [points,setPoints]=useState('');
 const [amount,setAmount]=useState('');
 const [reference,setReference]=useState('');
 const [note,setNote]=useState('');
 const [confirmed,setConfirmed]=useState(false);
 const [busy,setBusy]=useState(false);
 const request=useRef<string|null>(null);
 const locked=useRef(false);
 const n=Number(points), a=Number(amount);
 const valid=Number.isSafeInteger(n)&&n>0&&n<=available&&n<=1000000&&Number.isFinite(a)&&a>0&&a<=9999999999&&Math.abs(a*10000-Math.round(a*10000))<0.000001&&reference.trim().length>=3&&note.trim().length>=5&&confirmed;
 const reset=()=>{setOpen(false);setPoints('');setAmount('');setReference('');setNote('');setConfirmed(false);request.current=null;};
 const submit=async()=>{
  if(!valid||locked.current)return;
  locked.current=true;setBusy(true);request.current??=crypto.randomUUID();
  try {
   const {error}=await (supabase as any).rpc('reward_confirm_manual_payout',{p_phone:phone,p_request:request.current,p_kind:kind,p_points:n,p_amount:a,p_reference:reference.trim(),p_note:note.trim()});
   if(error)throw error;
   toast.success('Abaalmarinta waa la xaqiijiyay, points-kana waa laga jaray.');
   reset();
   await Promise.all([client.invalidateQueries({queryKey:['reward-admin',phone]}),client.invalidateQueries({queryKey:['reward-admin-report']}),client.invalidateQueries({queryKey:['reward-preview',phone]}),client.invalidateQueries({queryKey:['reward-payout-history',phone]})]);
  } catch(e:any){toast.error(e?.message||'Bixinta lama xaqiijin.');}finally{locked.current=false;setBusy(false);}
 };
 return <div className="space-y-2">
  <button type="button" disabled={available<=0||busy} onClick={()=>{setOpen(true);setPoints(String(available));}} className="w-full rounded-lg bg-blue-600 py-2 text-white font-semibold disabled:opacity-50">Bixi Abaalmarin</button>
  {available<=0&&<p className="text-xs text-muted-foreground">Marka hore xaqiiji points-ka iibka.</p>}
  {open&&<div className="border rounded-lg p-3 space-y-3">
   <p className="text-sm font-semibold">Dooro abaalmarinta · {available} confirmed points</p>
   <fieldset disabled={busy||!!request.current} className="space-y-2">
    <div className="grid grid-cols-2 gap-2">{(['cash','internet'] as const).map(k=><button key={k} type="button" onClick={()=>{setKind(k);setAmount('');setConfirmed(false);}} className={'rounded-lg border p-2 '+(kind===k?'bg-blue-600 text-white':'')}>{k==='cash'?'Lacag':'Internet'}</button>)}</div>
    <label className="block text-xs">Points laga jarayo<input className="border rounded w-full p-2 bg-background" type="number" min="1" max={available} step="1" value={points} onChange={e=>{setPoints(e.target.value);setConfirmed(false);}}/></label>
    <label className="block text-xs">{kind==='cash'?'Lacagta la bixiyay ($)':'Internet-ka la bixiyay (GB)'}<input className="border rounded w-full p-2 bg-background" type="number" min="0.0001" step="0.0001" value={amount} onChange={e=>{setAmount(e.target.value);setConfirmed(false);}}/></label>
    <label className="block text-xs">Transaction reference<input className="border rounded w-full p-2 bg-background" maxLength={200} value={reference} onChange={e=>{setReference(e.target.value);setConfirmed(false);}}/></label>
    <label className="block text-xs">Faahfaahinta caddeynta bixinta<textarea className="border rounded w-full p-2 bg-background" maxLength={500} value={note} onChange={e=>{setNote(e.target.value);setConfirmed(false);}}/></label>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> Waxaan xaqiijinayaa in abaalmarinta la bixiyay.</label>
   </fieldset>
   <div className="flex gap-2"><button type="button" disabled={busy||!valid} onClick={()=>void submit()} className="flex-1 rounded-lg bg-green-600 py-2 text-white font-bold disabled:opacity-50">{busy?'Xaqiijin...':'Xaqiiji Bixinta'}</button><button type="button" disabled={busy} onClick={reset} className="border rounded-lg px-3">Xir</button></div>
   {!!request.current&&!busy&&<p className="text-xs text-muted-foreground">Haddii jawaabtu go'day, isla codsigan dib u xaqiiji; ha bixin abaalmarin cusub.</p>}
  </div>}
 </div>;
}
