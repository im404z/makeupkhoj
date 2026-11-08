'use client';
import {useState} from 'react';
import useSWR from 'swr';
type Settings={enabled:boolean;windowHours:number;maxProducts:number;perPage:number};
export default function PriceDropSettings(){
  const [draft,setDraft]=useState<Settings|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const {data,error,mutate}=useSWR('/api/admin/price-drops',async url=>{const r=await fetch(url);const body=await r.json();if(!r.ok)throw Error(body.error);return body as {settings:Settings};});
  const values=draft||data?.settings;
  return <section id="price-drop-controls" className="admin-panel"><div className="admin-panel-title"><h2>Price drop display</h2><a href="/price-drops">View price drops</a></div><div className="p-5">
    <p className="text-xs text-neutral-500 mb-5">Only timestamped reductions from a previous recorded selling price qualify. MRP discounts alone do not count. Refreshes update this page automatically.</p>
    {error&&<p role="alert">{error.message}</p>}
    {values?<form onSubmit={async e=>{e.preventDefault();setBusy(true);setMessage('');try{const r=await fetch('/api/admin/price-drops',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)}),body=await r.json();if(!r.ok)throw Error(body.error);await mutate(body,false);setDraft(null);setMessage('Price drop settings saved.');}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}}>
      <label className="flex items-center gap-2 mb-4"><input type="checkbox" checked={values.enabled} onChange={e=>setDraft({...values,enabled:e.target.checked})}/>Show price drop products</label>
      <div className="flex gap-2 mb-4">{[24,48,72,168].map(hours=><button type="button" className="admin-button admin-secondary" key={hours} aria-pressed={values.windowHours===hours} onClick={()=>setDraft({...values,windowHours:hours})}>{hours===24?'24 hours':hours/24+' days'}</button>)}</div>
      <div className="grid sm:grid-cols-3 gap-4">{[{key:'windowHours',label:'Time window in hours',min:1,max:720},{key:'maxProducts',label:'Maximum products across all pages',min:1,max:10000},{key:'perPage',label:'Products per page',min:5,max:100}].map(field=><label key={field.key}><span className="admin-label">{field.label}</span><input className="admin-input" type="number" min={field.min} max={field.max} required value={values[field.key as keyof Omit<Settings,'enabled'>]} onChange={e=>setDraft({...values,[field.key]:Number(e.target.value)})}/></label>)}</div>
      <button className="admin-button mt-5" disabled={busy}>{busy?'Saving...':'Save price drop settings'}</button>
    </form>:!error&&<p>Loading settings...</p>}{message&&<p role="status" className="mt-3 text-sm">{message}</p>}
  </div></section>;
}
