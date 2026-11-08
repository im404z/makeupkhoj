import React from 'react';
import { FAQJsonLd } from './JsonLd';
import { Flame, ShieldCheck, Clock, Percent } from 'lucide-react';

interface DealsSeoSectionProps {
  pageType: 'deals' | 'price-drops';
}

export default function DealsSeoSection({ pageType }: DealsSeoSectionProps) {
  const isPriceDrop = pageType === 'price-drops';
  const heading = isPriceDrop ? 'Makeup Price Drops & Deal Guide' : 'Cosmetics Discounts & Sale Guide';

  const faqs = isPriceDrop
    ? [
        {
          question: 'How does MakeupKhoj detect a makeup price drop?',
          answer:
            'MakeupKhoj regularly monitors public retail listings across Nykaa, Amazon India, Flipkart, and Myntra. When a retailer lowers their price compared to our previously recorded observations, the product is flagged as a verified price drop.',
        },
        {
          question: 'How long do price drops usually last on Indian beauty stores?',
          answer:
            'The listing uses the time window configured by the site administrator. A recorded reduction is not a guarantee of how long the store will keep that price. Check the current store price before buying.',
        },
        {
          question: 'Are price-drop products new and authentic?',
          answer:
            'Yes. MakeupKhoj only indexes certified sellers and authorized brand storefronts. Price drops reflect retailer promotions, brand discount campaigns, or algorithmic price adjustments, not opened or expired inventory.',
        },
        {
          question: 'Can I track historical prices to see if a discount is genuine?',
          answer:
            'Yes. On every product detail page, MakeupKhoj maintains a recorded price history log showing previous observations and the highest/lowest recorded prices across stores.',
        },
      ]
    : [
        {
          question: 'How does MakeupKhoj find the best makeup deals across stores?',
          answer:
            'We index tens of thousands of cosmetics across Nykaa, Amazon, Flipkart, and Myntra, filtering for items with at least 15% discount. We rank offers so you can immediately see which store provides the lowest authentic price.',
        },
        {
          question: 'Which online retailer offers the steepest cosmetic discounts?',
          answer:
            'Different retailers lead in different categories. Amazon and Flipkart frequently discount everyday staples and drugstore foundations, while Nykaa and Myntra excel in prestige makeup bundles, complimentary gifts, and seasonal brand sales.',
        },
        {
          question: 'How do I avoid artificial discounts and fake MRP markups?',
          answer:
            'Always check the recorded historical price rather than just the discount badge. MakeupKhoj highlights genuine price drops by tracking actual observed prices over time.',
        },
        {
          question: 'Are sale items eligible for store returns?',
          answer:
            'Most unopened cosmetic products can be returned or replaced if received damaged or defective, subject to each marketplace’s official beauty return policy. Confirm return windows on the retailer page during checkout.',
        },
      ];

  return (
    <section className="mt-12 pt-8 border-t border-pink-100 space-y-8" aria-label={heading}>
      <FAQJsonLd faqs={faqs} />

      {/* Editorial Guide Card */}
      <div className="bg-white rounded-3xl border border-pink-100 p-6 sm:p-10 shadow-sm space-y-6">
        <div className="flex items-center gap-2 text-pink-600">
          <Flame size={18} strokeWidth={2} />
          <span className="text-xs font-bold uppercase tracking-wider">
            {isPriceDrop ? 'Price Drop Intelligence' : 'Deal Finder Guide'}
          </span>
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-neutral-900 tracking-tight">
          {heading}
        </h2>
        <p className="text-sm text-neutral-600 leading-relaxed">
          {isPriceDrop
            ? 'Compare timestamped reductions from previous recorded selling prices. Products appear only within the configured time window while their current recorded price remains at the reduced level or lower.'
            : 'Finding the biggest cosmetics savings requires comparing offers across stores. With prices shifting weekly, MakeupKhoj aggregates verified retailer discounts to bring you genuine deals on lipsticks, foundations, and eye makeup.'}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-pink-50">
          <div className="bg-pink-50/50 p-4 rounded-2xl border border-pink-100/60">
            <div className="flex items-center gap-2 text-pink-700 font-bold text-xs mb-1">
              <Percent size={15} />
              <span>Verified Reductions</span>
            </div>
            <p className="text-xs text-neutral-600">
              {isPriceDrop
                ? 'Only products with real price reductions compared to previous recorded checks are showcased.'
                : 'Curated discounts from 15% to 60%+ off verified retail prices across four leading marketplaces.'}
            </p>
          </div>
          <div className="bg-pink-50/50 p-4 rounded-2xl border border-pink-100/60">
            <div className="flex items-center gap-2 text-pink-700 font-bold text-xs mb-1">
              <ShieldCheck size={15} />
              <span>100% Genuine Retailers</span>
            </div>
            <p className="text-xs text-neutral-600">
              Every deal links to authorized brand stores and certified sellers on Nykaa, Amazon, Flipkart, and Myntra.
            </p>
          </div>
          <div className="bg-pink-50/50 p-4 rounded-2xl border border-pink-100/60">
            <div className="flex items-center gap-2 text-pink-700 font-bold text-xs mb-1">
              <Clock size={15} />
              <span>Frequent Recrawls</span>
            </div>
            <p className="text-xs text-neutral-600">
              Our automated crawlers continuously refresh prices and availability so you catch flash sales before they sell out.
            </p>
          </div>
        </div>
      </div>

      {/* FAQs */}
      <div className="bg-white rounded-3xl border border-pink-100 p-6 sm:p-10 shadow-sm space-y-4">
        <h3 className="text-xl sm:text-2xl font-black text-neutral-900 tracking-tight mb-4">
          Frequently Asked Questions
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

