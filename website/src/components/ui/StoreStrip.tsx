import MarketplaceLogo from './MarketplaceLogo';
export default function StoreStrip({compact=false}:{compact?:boolean}){return <div className={'store-strip'+(compact?' store-strip--compact':'')} aria-label="Compare prices across four marketplaces">{['amazon','flipkart','myntra','nykaa'].map(store=><div key={store}><MarketplaceLogo store={store}/></div>)}</div>;}
