import { useEffect, useState } from 'react'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'

const money = n => '₦' + Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 })
const today = new Date().toISOString().slice(0,10)
const addMonthsClamped = (date, months) => { const result = new Date(date); const day = result.getDate(); result.setDate(1); result.setMonth(result.getMonth() + months); const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate(); result.setDate(Math.min(day, lastDay)); return result }
const blank = { full_name:'', phone:'', email:'' }
const terms = { investor_id:'', principal:'', monthly_rate:'', start_date:today, term_months:'6', payout_schedule:'monthly', custom_interval_months:'1', note:'' }
export default function Investors() {
 const [investors,setInvestors]=useState([]), [investments,setInvestments]=useState([]), [accruals,setAccruals]=useState([]), [payments,setPayments]=useState([])
 const [form,setForm]=useState(blank), [deal,setDeal]=useState(terms), [payment,setPayment]=useState({investment_id:'',payment_type:'interest',amount:'',payment_date:today,note:''})
 const [showInvestor,setShowInvestor]=useState(false),[showDeal,setShowDeal]=useState(false),[showPayment,setShowPayment]=useState(false)
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('')
 async function load(){
  setLoading(true); setError('')
  const [a,b,c,d]=await Promise.all([
   supabase.from('investors').select('*').order('created_at',{ascending:false}),
   supabase.from('investments').select('*, investors(full_name,phone)').order('created_at',{ascending:false}),
   supabase.from('investor_accruals').select('*').order('period_start',{ascending:false}),
   supabase.from('investor_payments').select('*, investments(investor_id, investors(full_name))').order('payment_date',{ascending:false})
  ])
  const fail=[a,b,c,d].find(x=>x.error); if(fail)setError(fail.error.message)
  setInvestors(a.data||[]);setInvestments(b.data||[]);setAccruals(c.data||[]);setPayments(d.data||[]);setLoading(false)
 }
 useEffect(()=>{load()},[])
 async function addInvestor(e){e.preventDefault();setBusy(true);setError('')
  const {error}=await supabase.from('investors').insert(form)
  if(error)setError(error.message);else{setForm(blank);setShowInvestor(false);setMessage('Investor profile created');await load()}
  setBusy(false)
 }
 async function addInvestment(e){e.preventDefault();setBusy(true);setError('')
  const principal=Number(deal.principal), rate=Number(deal.monthly_rate), months=Number(deal.term_months)
  if(!deal.investor_id||!(principal>0&&rate>=0&&months>0)){setError('Select an investor and enter valid principal, rate and term.');setBusy(false);return}
  const start=new Date(deal.start_date+'T12:00:00');const maturity=addMonthsClamped(start,months)
  const {error}=await supabase.from('investments').insert({investor_id:deal.investor_id,principal,monthly_rate:rate,start_date:deal.start_date,maturity_date:maturity.toISOString().slice(0,10),term_months:months,payout_schedule:deal.payout_schedule,custom_interval_months:Number(deal.custom_interval_months||1),note:deal.note,status:'pending_funding',funded_at:null})
  if(error)setError(error.message);else{setDeal(terms);setShowDeal(false);setMessage('Agreement saved as awaiting funds. Confirm receipt only after the money arrives.');await load()}
  setBusy(false)
 }
 async function confirmFunding(id){
  if(!window.confirm('Confirm that the full investment amount has actually been received?')) return
  setBusy(true);setError('')
  const fundedAt=new Date()
  const effectiveStart=fundedAt.toISOString().slice(0,10)
  const maturity=addMonthsClamped(fundedAt,Number(investments.find(item=>item.id===id)?.term_months||0))
  const {error}=await supabase.from('investments').update({status:'active',funded_at:fundedAt.toISOString(),start_date:effectiveStart,maturity_date:maturity.toISOString().slice(0,10)}).eq('id',id).eq('status','pending_funding')
  if(error)setError(error.message);else setMessage('Funds received confirmed; the investment term and interest clock start today.')
  await load();setBusy(false)
 }
 async function accrue(){setBusy(true);setError('');const {data,error}=await supabase.rpc('accrue_investor_interest')
  if(error)setError(error.message);else setMessage((data?.periods_updated??0)+' interest period(s) updated.');await load();setBusy(false)
 }
 async function pay(e){e.preventDefault();setBusy(true);setError('')
  const amount=Number(payment.amount)
  if(!payment.investment_id||!(amount>0)){setError('Select an investment and enter a valid payment amount.');setBusy(false);return}
  const {error}=await supabase.from('investor_payments').insert({...payment,amount})
  if(error)setError(error.message);else{setPayment({investment_id:'',payment_type:'interest',amount:'',payment_date:today,note:''});setShowPayment(false);setMessage('Investor payment recorded');await load()}
  setBusy(false)
 }
 const totalPrincipalFunded=investments.filter(i=>i.funded_at&&i.status!=='cancelled').reduce((s,i)=>s+Number(i.principal),0)
 const totalPrincipalPaid=payments.filter(p=>p.payment_type==='principal').reduce((s,p)=>s+Number(p.amount),0)
 const totalPrincipal=Math.max(0,totalPrincipalFunded-totalPrincipalPaid)
 const totalAccrued=accruals.reduce((s,a)=>s+Number(a.amount),0)
 const totalInterestPaid=payments.filter(p=>p.payment_type==='interest').reduce((s,p)=>s+Number(p.amount),0)
 const totalInterestOutstanding=Math.max(0,totalAccrued-totalInterestPaid)
 if(loading)return <MainLayout><p className="text-gray-500">Loading investor records…</p></MainLayout>
 return <MainLayout><div className="max-w-6xl mx-auto space-y-5">
  <div className="flex flex-wrap justify-between items-end gap-3"><div><h1 className="text-2xl font-black text-gray-800">Investors</h1><p className="text-sm text-gray-500 mt-1">Investor agreements, simple monthly returns and settlements</p></div><div className="flex flex-wrap gap-2"><button onClick={()=>setShowInvestor(!showInvestor)} className="px-3 py-2 rounded-xl bg-slate-800 text-white text-sm">+ Investor</button><button onClick={()=>setShowDeal(!showDeal)} className="px-3 py-2 rounded-xl bg-blue-700 text-white text-sm">+ Investment</button><button onClick={()=>setShowPayment(!showPayment)} className="px-3 py-2 rounded-xl bg-emerald-700 text-white text-sm">Record payment</button></div></div>
  {message&&<p className="p-3 rounded-xl bg-green-50 text-green-700 text-sm">{message}</p>}{error&&<p className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">{error}</p>}
  <div className="grid sm:grid-cols-3 gap-3">{[['Investor principal outstanding',money(totalPrincipal)],['Accrued interest outstanding',money(totalInterestOutstanding)],['Interest paid',money(totalInterestPaid)]].map(([l,v])=><div className="bg-white border rounded-2xl p-4" key={l}><p className="text-xs text-gray-500">{l}</p><p className="text-xl font-black mt-2">{v}</p></div>)}</div>
  {showInvestor&&<form onSubmit={addInvestor} className="bg-white border rounded-2xl p-5 grid sm:grid-cols-3 gap-3"><h2 className="sm:col-span-3 font-bold">New investor profile</h2><input required placeholder="Full name" className="border rounded-lg p-2" value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})}/><input placeholder="Phone" className="border rounded-lg p-2" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/><input type="email" placeholder="Email" className="border rounded-lg p-2" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/><button disabled={busy} className="bg-slate-800 text-white rounded-lg p-2">Save investor</button></form>}
  {showDeal&&<form onSubmit={addInvestment} className="bg-white border rounded-2xl p-5 grid sm:grid-cols-3 gap-3"><h2 className="sm:col-span-3 font-bold">Create investment agreement</h2><select required className="border rounded-lg p-2" value={deal.investor_id} onChange={e=>setDeal({...deal,investor_id:e.target.value})}><option value="">Select investor</option>{investors.map(i=><option key={i.id} value={i.id}>{i.full_name}</option>)}</select><input required type="number" min="1" placeholder="Principal (₦)" className="border rounded-lg p-2" value={deal.principal} onChange={e=>setDeal({...deal,principal:e.target.value})}/><input required type="number" min="0" step="0.01" placeholder="Monthly interest (%)" className="border rounded-lg p-2" value={deal.monthly_rate} onChange={e=>setDeal({...deal,monthly_rate:e.target.value})}/><label className="text-sm">Start date<input required type="date" className="block w-full border rounded-lg p-2" value={deal.start_date} onChange={e=>setDeal({...deal,start_date:e.target.value})}/></label><label className="text-sm">Term (months)<input required type="number" min="1" className="block w-full border rounded-lg p-2" value={deal.term_months} onChange={e=>setDeal({...deal,term_months:e.target.value})}/></label><label className="text-sm">Interest payout schedule<select className="block w-full border rounded-lg p-2" value={deal.payout_schedule} onChange={e=>setDeal({...deal,payout_schedule:e.target.value})}><option value="monthly">Monthly</option><option value="maturity">At maturity</option><option value="custom">Custom interval</option></select></label>{deal.payout_schedule==='custom'&&<label className="text-sm">Pay every (months)<input type="number" min="1" className="block w-full border rounded-lg p-2" value={deal.custom_interval_months} onChange={e=>setDeal({...deal,custom_interval_months:e.target.value})}/></label>}<input placeholder="Agreement note (optional)" className="border rounded-lg p-2 sm:col-span-2" value={deal.note} onChange={e=>setDeal({...deal,note:e.target.value})}/><p className="sm:col-span-3 text-xs text-gray-500">Simple interest: original principal × monthly rate. Saving creates an agreement only. Interest starts only after you separately confirm that funds have arrived.</p><button disabled={busy||!investors.length} className="bg-blue-700 text-white rounded-lg p-2">Save investment</button></form>}
  {showPayment&&<form onSubmit={pay} className="bg-white border rounded-2xl p-5 grid sm:grid-cols-4 gap-3"><h2 className="sm:col-span-4 font-bold">Record investor payment</h2><select required className="border rounded-lg p-2 sm:col-span-2" value={payment.investment_id} onChange={e=>setPayment({...payment,investment_id:e.target.value})}><option value="">Select investment</option>{investments.map(i=><option key={i.id} value={i.id}>{i.investors?.full_name} — {money(i.principal)}</option>)}</select><select className="border rounded-lg p-2" value={payment.payment_type} onChange={e=>setPayment({...payment,payment_type:e.target.value})}><option value="interest">Interest</option><option value="principal">Principal</option></select><input required type="number" min="0.01" step="0.01" placeholder="Amount" className="border rounded-lg p-2" value={payment.amount} onChange={e=>setPayment({...payment,amount:e.target.value})}/><input type="date" className="border rounded-lg p-2" value={payment.payment_date} onChange={e=>setPayment({...payment,payment_date:e.target.value})}/><input placeholder="Note" className="border rounded-lg p-2 sm:col-span-2" value={payment.note} onChange={e=>setPayment({...payment,note:e.target.value})}/><button disabled={busy} className="bg-emerald-700 text-white rounded-lg p-2">Save payment</button></form>}
  <section className="bg-white border rounded-2xl p-5"><div className="flex flex-wrap justify-between gap-3 mb-3"><h2 className="font-bold">Investment agreements</h2><button onClick={accrue} disabled={busy} className="text-sm rounded-lg bg-slate-800 text-white px-3 py-2">{busy?'Working…':'Generate due monthly accruals'}</button></div><p className="text-xs text-gray-500 mb-4">Accrual generation is idempotent: running it again will not duplicate a month already recorded. It does not make a payment.</p><div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr className="text-gray-500 border-b"><th className="py-2">Investor</th><th>Principal</th><th>Rate/month</th><th>Term</th><th>Maturity</th><th>Schedule</th><th>Status / action</th></tr></thead><tbody>{investments.map(i=><tr key={i.id} className="border-b last:border-0"><td className="py-3 font-semibold">{i.investors?.full_name}</td><td>{money(i.principal)}</td><td>{i.monthly_rate}%</td><td>{i.term_months} months</td><td>{i.maturity_date}</td><td>{i.payout_schedule}</td><td>{i.status==='pending_funding'?<button disabled={busy} onClick={()=>confirmFunding(i.id)} className="text-xs bg-emerald-700 text-white rounded-lg px-2 py-1">Confirm funds received</button>:i.status}</td></tr>)}</tbody></table>{!investments.length&&<p className="py-5 text-center text-gray-400">No investment agreements yet.</p>}</div></section>
  <section className="bg-white border rounded-2xl p-5"><h2 className="font-bold mb-3">Recent interest accruals</h2>{accruals.slice(0,15).map(a=><div key={a.id} className="flex justify-between border-b py-2 text-sm"><span>{a.period_start} · {a.period_end}</span><strong>{money(a.amount)}</strong></div>)}{!accruals.length&&<p className="text-sm text-gray-400">No accruals generated.</p>}</section>
  <section className="bg-white border rounded-2xl p-5"><h2 className="font-bold mb-3">Payment history</h2>{payments.slice(0,15).map(p=><div key={p.id} className="flex justify-between border-b py-2 text-sm"><span>{p.investments?.investors?.full_name} · {p.payment_type} · {p.payment_date}</span><strong>{money(p.amount)}</strong></div>)}{!payments.length&&<p className="text-sm text-gray-400">No investor payments recorded.</p>}</section>
 </div></MainLayout>
}
