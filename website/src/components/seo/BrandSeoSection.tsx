import React from 'react';
import { FAQJsonLd } from './JsonLd';
import { Award, ShieldCheck, Tag, HelpCircle } from 'lucide-react';

interface BrandSeoSectionProps {
  brandName: string;
}

export default function BrandSeoSection({ brandName }: BrandSeoSectionProps) {
  const faqs = [
    {
      question: `Where can I buy authentic ${brandName} makeup online in India?`,
      answer: `Authentic ${brandName} cosmetics can be safely purchased from authorized brand storefronts on Nykaa, Amazon India, Myntra, and Flipkart. MakeupKhoj monitors these certified retailers to ensure you only purchase 100% genuine products.`,
    },
    {
      question: `Which online store has the lowest prices for ${brandName}?`,
      answer: `Prices for ${brandName} fluctuate based on retailer promotions and seasonal events. While Nykaa often offers exclusive brand gifts and bundles, Amazon and Myntra frequently provide steep flash discounts. MakeupKhoj displays the lowest recorded offer in real-time so you never overpay.`,
    },
    {
      question: `How does MakeupKhoj track ${brandName} price drops and discounts?`,
      answer: `We continuously scan verified catalog listings for ${brandName}. When retailer prices drop or promotional codes apply, our index captures the update. You can filter by maximum discount or sort by lowest price to catch top deals.`,
    },
    {
      question: `Are all ${brandName} shades and sizes matched accurately?`,
      answer: `Yes. Our catalog comparison engine matches identical product variants, ensuring the shade name, formulation, and pack size are the exact same before comparing store prices.`,
    },
  ];

  return (
    <section className="mt-12 pt-8 border-t border-pink-100 space-y-8" aria-label={`About ${brandName} and FAQs`}>
      <FAQJsonLd faqs={faqs} />

      {/* Brand Overview & Shopping Guide */}
      <div className="bg-white rounded-3xl border border-pink-100 p-6 sm:p-10 shadow-sm space-y-6">
        <div className="flex items-center gap-2 text-pink-600">
          <Award size={18} strokeWidth={2} />
          <span className="text-xs font-bold uppercase tracking-wider">Brand Price Guide</span>
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-neutral-900 tracking-tight">
          How to Compare & Save on {brandName} Cosmetics in India
        </h2>
        <p className="text-sm text-neutral-600 leading-relaxed">
          {brandName} is one of the most sought-after cosmetics brands in India. Whether you are looking for everyday staples, signature shades, or newly launched formulations, comparing prices across major retailers like Nykaa, Amazon, Flipkart, and Myntra ensures you receive authentic products at the best available rate.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-pink-50">
          <div className="bg-pink-50/50 p-4 rounded-2xl border border-pink-100/60">
            <div className="flex items-center gap-2 text-pink-700 font-bold text-xs mb-1">
              <ShieldCheck size={15} />
              <span>Authorized Sellers Only</span>
            </div>
            <p className="text-xs text-neutral-600">
              Only authorized retail storefronts and brand-certified sellers are indexed to protect you from unverified marketplace third parties.
            </p>
          </div>
          <div className="bg-pink-50/50 p-4 rounded-2xl border border-pink-100/60">
            <div className="flex items-center gap-2 text-pink-700 font-bold text-xs mb-1">
              <Tag size={15} />
              <span>Real-Time Deal Tracking</span>
            </div>
            <p className="text-xs text-neutral-600">
              Check recorded price history and price-drop percentages to know if a sale price is truly the lowest offer recorded.
            </p>
          </div>
          <div className="bg-pink-50/50 p-4 rounded-2xl border border-pink-100/60">
            <div className="flex items-center gap-2 text-pink-700 font-bold text-xs mb-1">
              <Award size={15} />
              <span>Identical Variant Matching</span>
            </div>
            <p className="text-xs text-neutral-600">
              Every comparison confirms shade codes, volume (ml/g), and formulation type so you are always comparing identical products.
            </p>
          </div>
        </div>
      </div>

      {/* Brand FAQs */}
      <div className="bg-white rounded-3xl border border-pink-100 p-6 sm:p-10 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-pink-600">
          <HelpCircle size={18} strokeWidth={2} />
          <span className="text-xs font-bold uppercase tracking-wider">Frequently Asked</span>
        </div>
        <h3 className="text-xl sm:text-2xl font-black text-neutral-900 tracking-tight mb-4">
          Common Questions About {brandName} Products
        </h3>

        <div className="space-y-3">
          {faqs.map((faq, index) => (
            <details
              key={index}
              className="group border border-pink-100 rounded-2xl p-4 sm:p-5 transition-colors hover:border-pink-300 open:bg-pink-50/30"
              {...(index === 0 ? { open: true } : {})}
            >
              <summary className="font-bold text-sm sm:text-base text-neutral-900 cursor-pointer list-none flex items-center justify-between select-none">
                <span>{faq.question}</span>
                <span className="text-pink-600 text-lg group-open:rotate-45 transition-transform">
                  +
                </span>
              </summary>
              <p className="mt-3 text-xs sm:text-sm text-neutral-600 leading-relaxed border-t border-pink-100/50 pt-3">
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

