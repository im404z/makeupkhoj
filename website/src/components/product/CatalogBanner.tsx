import CampaignBanner from '@/components/ui/CampaignBanner';
export default function CatalogBanner({title='Discover your next beauty favourite',description='Compare makeup prices across Amazon, Flipkart, Myntra and Nykaa.',category=''}:{title?:string;description?:string;category?:string}){
 const image=category.includes('lip')?'editorial-lips.webp':category.includes('eye')?'editorial-eyes.webp':'marketplace-products.webp';
 return <CampaignBanner title={title} description={description} image={'/assets/banners/'+image}/>;
}
