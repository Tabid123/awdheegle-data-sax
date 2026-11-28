import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Gift } from 'lucide-react';
import { RewardPreviewCard } from '@/components/RewardPreviewCard';
import { BottomNavigation } from '@/components/BottomNavigation';
import whatsappIcon from '@/assets/whatsapp-icon.png';

export default function Rewards() {
  const navigate=useNavigate();
  const phone=localStorage.getItem('verifiedPhone');
  const contact='https://wa.me/252615555495?text='+encodeURIComponent('Salaan Awdhegle Data, waxaan rabaa inaan wax ka ogaado abaalmarinta points-kayga.');
  return <div className="min-h-screen bg-background pb-28">
    <header className="bg-[#1236C0] text-white px-4 pb-4" style={{paddingTop:'calc(1rem + var(--effective-safe-area-top, 0px))'}}>
      <div className="flex items-center gap-3"><button type="button" aria-label="Back" onClick={()=>navigate('/providers')} className="p-2 rounded-full bg-white/10"><ArrowLeft className="w-5 h-5"/></button><Gift className="w-5 h-5 text-amber-300"/><h1 className="text-lg font-bold">Awdhegle Rewards</h1></div>
    </header>
    <main className="max-w-lg mx-auto px-4 py-5 space-y-4">
      <section className="rounded-2xl bg-gradient-to-br from-[#1236C0] to-blue-700 text-white p-5">
        <div className="flex items-center gap-2 text-amber-300 font-bold"><Gift className="w-6 h-6"/> Awdhegle Rewards</div>
        <h2 className="text-xl font-bold mt-2">Iibso, ururso, abaalmarin hel!</h2>
        <p className="text-sm text-white/85 mt-1">Markaad iibsato xirmo points leh, waxaad urursanaysaa points. Maamulka ayaa abaalmarinta kuu bixinaya kadib xaqiijinta.</p>
      </section>
      <RewardPreviewCard phone={phone}/>
      <a href={contact} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-[#128C4A] text-white font-semibold py-3 px-4"><img src={whatsappIcon} alt="" className="w-5 h-5 object-contain"/> Nala soo xiriir WhatsApp</a>
    </main>
    <BottomNavigation/>
  </div>;
}
