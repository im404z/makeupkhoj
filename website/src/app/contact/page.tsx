import React from 'react';
import type { Metadata } from 'next';
import Breadcrumb from '@/components/layout/Breadcrumb';
import { Mail, MessageCircle, MapPin } from 'lucide-react';
import { constructMetadata } from '@/lib/utils/seo';

export const metadata: Metadata = constructMetadata({
  title: 'Contact Us - MakeupKhoj Support',
  description: 'Have a question or feedback about MakeupKhoj? Get in touch with our team.',
  canonical: '/contact',
});

export default function ContactPage() {
  return (
    <div className="max-w-4xl mx-auto py-4">
      <Breadcrumb items={[{ label: 'Contact Us' }]} />

      <div className="bg-white rounded-3xl border border-pink-100 p-8 sm:p-12 shadow-sm space-y-8">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-pink-600 bg-pink-50 px-2.5 py-1 rounded-full border border-pink-100 inline-block mb-3">
            Get In Touch
          </span>
          <h1 className="text-3xl sm:text-4xl font-black text-neutral-900 tracking-tight mb-4">
            Contact Us
          </h1>
          <p className="text-base text-neutral-600 leading-relaxed">
            We’d love to hear from you. Whether you have questions regarding pricing data, brand suggestions, or partnership inquiries, our team is here to assist.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
          <div className="p-5 rounded-2xl bg-pink-50/50 border border-pink-100">
            <Mail className="w-5 h-5 text-pink-600 mb-2" />
            <h3 className="text-sm font-bold text-neutral-800">Email Us</h3>
            <p className="text-xs text-neutral-500 mt-1">support@makeupkhoj.com</p>
          </div>
          <div className="p-5 rounded-2xl bg-pink-50/50 border border-pink-100">
            <MessageCircle className="w-5 h-5 text-pink-600 mb-2" />
            <h3 className="text-sm font-bold text-neutral-800">Support Hours</h3>
            <p className="text-xs text-neutral-500 mt-1">Mon - Sat: 9:00 AM - 7:00 PM IST</p>
          </div>
          <div className="p-5 rounded-2xl bg-pink-50/50 border border-pink-100">
            <MapPin className="w-5 h-5 text-pink-600 mb-2" />
            <h3 className="text-sm font-bold text-neutral-800">Headquarters</h3>
            <p className="text-xs text-neutral-500 mt-1">Bengaluru, Karnataka, India</p>
          </div>
        </div>
      </div>
    </div>
  );
}

