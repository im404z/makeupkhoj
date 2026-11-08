import React from 'react';
import { FAQJsonLd } from './JsonLd';
import { HelpCircle, ShieldCheck, TrendingDown } from 'lucide-react';

interface CategorySeoSectionProps {
  categoryName: string;
  subCategoryName?: string;
  description?: string;
}

export default function CategorySeoSection({
  categoryName,
  subCategoryName,
  description,
}: CategorySeoSectionProps) {
  const currentTitle = subCategoryName || categoryName;

  const faqs = [
    {
      question: `How does MakeupKhoj compare ${currentTitle} prices across stores?`,
      answer: `MakeupKhoj continuously monitors authorized retail listings across Nykaa, Amazon India, Flipkart, and Myntra. We record current prices, promotional discounts, and verified stock availability so you can choose the lowest genuine offer without visiting multiple apps.`,
    },
    {
      question: `Are the ${currentTitle} products on these marketplaces 100% authentic?`,
      answer: `Yes. MakeupKhoj only indexes direct listings from authorized brand flagships and certified beauty sellers on Nykaa, Amazon, Flipkart, and Myntra. We advise verifying that the retailer is an authorized seller before completing checkout.`,
    },
    {
      question: `When is the best time to buy ${currentTitle} at the lowest price?`,
      answer: `Major shopping events such as the Nykaa Pink Friday Sale, Amazon Great Indian Festival, Myntra Big Fashion Festival, and Flipkart Big Billion Days offer the highest discounts (up to 40%–60% off). MakeupKhoj tracks historical prices so you can confirm whether a deal is a genuine all-time low.`,
    },
    {
      question: `How do I pick the right formula and finish for ${currentTitle}?`,
      answer: `Consider your skin type and preferred wear time. For oily or combination skin, matte and long-wear formulas provide oil control. For dry skin, hydrating, serum-infused or dewy finishes deliver a radiant glow. Always check swatch ratings and customer photo reviews before choosing shades.`,
    },
  ];

  return (
    <section className="mt-12 pt-8 border-t border-pink-100 space-y-8" aria-label={`${currentTitle} Buying Guide and FAQs`}>
      <FAQJsonLd faqs={faqs} />

      {/* Buying Guide Editorial Card */}
      <div className="bg-white rounded-3xl border border-pink-100 p-6 sm:p-10 shadow-sm space-y-6">
        <div className="flex items-center gap-2 text-pink-600">
          <span className="text-xs font-bold uppercase tracking-wider">Shopper's Guide</span>
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-neutral-900 tracking-tight">
          How to Find the Best Deals on {currentTitle} in India
        </h2>
        <p className="text-sm text-neutral-600 leading-relaxed">
          {description || `Discover authentic ${currentTitle} cosmetics at the best prices.`} With prices fluctuating weekly between retail sales, MakeupKhoj helps cosmetics shoppers compare prices, track verified discounts, and uncover exclusive store offers across India's leading beauty marketplaces.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-pink-50">
          <div className="bg-pink-50/50 p-4 rounded-2xl border border-pink-100/60">
            <div className="flex items-center gap-2 text-pink-700 font-bold text-xs mb-1">
              <TrendingDown size={15} />
              <span>Multi-Store Comparison</span>
            </div>
            <p className="text-xs text-neutral-600">
              Prices for the same shade and variant can differ by up to 30% across Nykaa, Amazon, and Myntra. Always verify lowest recorded offers before buying.
            </p>
          </div>
          <div className="bg-pink-50/50 p-4 rounded-2xl border border-pink-100/60">
            <div className="flex items-center gap-2 text-pink-700 font-bold text-xs mb-1">
              <ShieldCheck size={15} />
              <span>100% Genuine Retailers</span>
            </div>
            <p className="text-xs text-neutral-600">
              We exclusively index official brand storefronts and verified sellers, helping you steer clear of counterfeit beauty products.
            </p>
          </div>
          <div className="bg-pink-50/50 p-4 rounded-2xl border border-pink-100/60">
            <div className="flex items-center gap-2 text-pink-700 font-bold text-xs mb-1">
              <span>Real Customer Reviews</span>
            </div>
            <p className="text-xs text-neutral-600">
              Aggregated ratings and authentic customer photos show you real unretouched color swatches and formulation wear.
            </p>
          </div>
        </div>
      </div>

      {/* Frequently Asked Questions Accordion */}
      <div className="bg-white rounded-3xl border border-pink-100 p-6 sm:p-10 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-pink-600">
          <HelpCircle size={18} strokeWidth={2} />
          <span className="text-xs font-bold uppercase tracking-wider">Got Questions?</span>
        </div>
        <h3 className="text-xl sm:text-2xl font-black text-neutral-900 tracking-tight mb-4">
          Frequently Asked Questions About {currentTitle}
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

