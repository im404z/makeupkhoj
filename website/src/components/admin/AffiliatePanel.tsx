'use client';
import { useState } from 'react';
import useSWR from 'swr';
import MarketplaceLogo from '@/components/ui/MarketplaceLogo';
import { ArrowUpRight, Copy, Check, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

const stores = ['amazon', 'flipkart', 'myntra', 'nykaa'];

async function api(url: string, body?: unknown) {
  const r = await fetch(url, body ? {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  } : undefined);
  const data = await r.json();
  if (!r.ok) throw Error(data.error || 'Request failed');
  return data;
}

export default function AffiliatePanel() {
  const data = useSWR('/api/admin/affiliates', api, { refreshInterval: 30000 });
  const [draft, setDraft] = useState<any>(null);
  const [token, setToken] = useState('');
  const [clearToken, setClearToken] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  // EarnKaro test connection state
  const [ekaroTesting, setEkaroTesting] = useState(false);
  const [ekaroTestResult, setEkaroTestResult] = useState<{ ok: boolean; message: string; convertedUrl?: string } | null>(null);

  // Live URL converter state
  const [testUrlInput, setTestUrlInput] = useState('');
  const [testUrlTesting, setTestUrlTesting] = useState(false);
  const [testUrlResult, setTestUrlResult] = useState<any>(null);

  // Product selection & override state
  const [store, setStore] = useState('amazon');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('');
  const [mode, setMode] = useState('inherit');
  const [custom, setCustom] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const products = useSWR('/api/admin/products?store=' + store + '&q=' + encodeURIComponent(search), api);
  const detail = useSWR(selected ? '/api/admin/affiliates?store=' + store + '&id=' + selected : null, api, {
    onSuccess: result => {
      setMode(result.override?.mode || 'inherit');
      setCustom(result.override?.customUrl || '');
    }
  });

  const settings = draft || data.data?.settings;

  async function action(body: unknown) {
    setBusy(true);
    setMessage('');
    try {
      const res = await api('/api/admin/affiliates', body);
      await Promise.all([data.mutate(), detail.mutate()]);
      setMessage('Saved successfully. Changes apply to new buy-link requests.');
      return res;
    } catch (e: any) {
      setMessage(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  function edit(key: string, value: unknown) {
    setDraft({ ...settings, [key]: value });
  }

  async function copyToClipboard(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {}
  }

  async function handleTestEarnkaro() {
    setEkaroTesting(true);
    setEkaroTestResult(null);
    try {
      const res = await api('/api/admin/affiliates', { action: 'test-earnkaro', token: token || undefined });
      setEkaroTestResult({ ok: true, message: res.message, convertedUrl: res.convertedUrl });
    } catch (err: any) {
      setEkaroTestResult({ ok: false, message: err.message });
    } finally {
      setEkaroTesting(false);
    }
  }

  async function handleTestArbitraryUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!testUrlInput.trim()) return;
    setTestUrlTesting(true);
    setTestUrlResult(null);
    try {
      const res = await api('/api/admin/affiliates', { action: 'test-url', url: testUrlInput.trim() });
      setTestUrlResult(res);
    } catch (err: any) {
      setTestUrlResult({ error: err.message });
    } finally {
      setTestUrlTesting(false);
    }
  }

  const tokenActive = data.data?.tokenConfigured || !!token.trim();

  return (
    <div className="space-y-6">
      {message && <p role="status" className="admin-notice">{message}</p>}
      {data.error && <p role="alert" className="text-red-600 text-sm">{data.error.message}</p>}

      {/* 1. Global Controls & EarnKaro Token */}
      {settings && (
        <section className="admin-panel p-5 bg-white rounded-lg shadow-sm border border-neutral-200">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <h2 className="editorial text-2xl">Affiliate Controls</h2>
              <p className="text-xs text-neutral-500">
                Configure Amazon Associates tracking ID and EarnKaro API for automated conversion across marketplaces.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                tokenActive ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}>
                {tokenActive ? <CheckCircle2 size={13}/> : <AlertCircle size={13}/>}
                EarnKaro API: {tokenActive ? 'Active / Configured' : 'Token Not Configured'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-6 mb-5 pt-2 border-t border-neutral-100">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input
                type="checkbox"
                className="rounded"
                checked={settings.enabled}
                onChange={e => edit('enabled', e.target.checked)}
              />
              Enable Outbound Affiliate Links
            </label>
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input
                type="checkbox"
                className="rounded"
                checked={settings.tracking}
                onChange={e => edit('tracking', e.target.checked)}
              />
              Track Outbound Click Analytics
            </label>
          </div>

          <div className="grid sm:grid-cols-2 gap-5 mb-4">
            <div>
              <span className="admin-label block text-xs font-semibold mb-1">Amazon Associates Tracking ID</span>
              <input
                className="admin-input w-full"
                value={settings.amazonTag}
                onChange={e => edit('amazonTag', e.target.value)}
                placeholder="scentkhoj-21"
              />
              <p className="text-[11px] text-neutral-400 mt-1">Appended automatically as <code>?tag=...</code> on all Amazon links.</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="admin-label text-xs font-semibold">EarnKaro API Token</span>
                <button
                  type="button"
                  disabled={ekaroTesting || (!tokenActive && !token.trim())}
                  onClick={handleTestEarnkaro}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center gap-1 disabled:opacity-50"
                >
                  {ekaroTesting ? <RefreshCw size={11} className="animate-spin" /> : null}
                  Test API Connection
                </button>
              </div>
              <input
                type="password"
                autoComplete="new-password"
                className="admin-input w-full"
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder={data.data?.tokenConfigured ? '•••••••••••••••• (Leave blank to keep current token)' : 'Paste EarnKaro API token here'}
              />
              <p className="text-[11px] text-neutral-400 mt-1">
                Used to convert Flipkart, Myntra & Nykaa links into monetized <code>ekaro.in</code> links.
              </p>
            </div>
          </div>

          {/* EarnKaro Live Test Feedback Box */}
          {ekaroTestResult && (
            <div className={`p-3 rounded text-xs mb-4 border ${
              ekaroTestResult.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-900'
            }`}>
              <div className="flex items-center gap-2 font-semibold">
                {ekaroTestResult.ok ? <CheckCircle2 size={15} className="text-emerald-600" /> : <AlertCircle size={15} className="text-red-600" />}
                {ekaroTestResult.message}
              </div>
              {ekaroTestResult.convertedUrl && (
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="font-mono bg-white px-2 py-0.5 rounded border border-emerald-300 select-all">
                    {ekaroTestResult.convertedUrl}
                  </span>
                  <a
                    href={ekaroTestResult.convertedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-700 underline font-semibold inline-flex items-center gap-0.5"
                  >
                    Open test link <ArrowUpRight size={12}/>
                  </a>
                </div>
              )}
            </div>
          )}

          <label className="text-xs block mb-4 text-neutral-500">
            <input
              type="checkbox"
              className="mr-1.5"
              checked={clearToken}
              onChange={e => setClearToken(e.target.checked)}
            />
            Remove saved token (resets to unconfigured state)
          </label>

          {/* Marketplace Settings Table */}
          <div className="overflow-x-auto border border-neutral-200 rounded">
            <table className="admin-table w-full text-left text-xs">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="p-2.5 font-semibold">Marketplace</th>
                  <th className="p-2.5 font-semibold">Affiliate Active</th>
                  <th className="p-2.5 font-semibold">Conversion Mode</th>
                  <th className="p-2.5 font-semibold">All-Time Outbound Clicks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {stores.map(s => (
                  <tr key={s}>
                    <td className="p-2.5"><MarketplaceLogo store={s} /></td>
                    <td className="p-2.5">
                      <input
                        aria-label={'Enable ' + s + ' affiliates'}
                        type="checkbox"
                        checked={settings.stores[s]?.enabled}
                        onChange={e => edit('stores', {
                          ...settings.stores,
                          [s]: { ...settings.stores[s], enabled: e.target.checked }
                        })}
                      />
                    </td>
                    <td className="p-2.5">
                      <select
                        className="admin-input py-1 text-xs"
                        aria-label={s + ' link method'}
                        value={settings.stores[s]?.mode}
                        onChange={e => edit('stores', {
                          ...settings.stores,
                          [s]: { ...settings.stores[s], mode: e.target.value }
                        })}
                      >
                        <option value="direct">Original store link (Direct)</option>
                        {s === 'amazon' && <option value="amazon">Amazon Associates Tag</option>}
                        <option value="ekaro">EarnKaro converted link</option>
                      </select>
                    </td>
                    <td className="p-2.5 font-mono text-neutral-600">
                      {data.data?.totals.find((r: any) => r._id === s)?.clicks || 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            className="admin-button mt-4"
            disabled={busy}
            onClick={async () => {
              if (await action({ action: 'settings', settings, token, clearToken })) {
                setToken('');
                setClearToken(false);
                setDraft(null);
              }
            }}
          >
            Save Affiliate Settings
          </button>
        </section>
      )}

      {/* 2. Interactive Live Link Converter & Diagnostics */}
      <section className="admin-panel p-5 bg-white rounded-lg shadow-sm border border-neutral-200">
        <h2 className="editorial text-2xl mb-2">Live Affiliate Link Tester</h2>
        <p className="text-xs text-neutral-500 mb-4">
          Paste any product URL from Amazon, Flipkart, Myntra, or Nykaa to test how MakeupKhoj resolves and generates the final outbound affiliate link.
        </p>
        <form onSubmit={handleTestArbitraryUrl} className="flex gap-2 flex-wrap">
          <input
            className="admin-input flex-1 min-w-[280px]"
            placeholder="https://www.myntra.com/... or https://www.amazon.in/dp/..."
            value={testUrlInput}
            onChange={e => setTestUrlInput(e.target.value)}
          />
          <button type="submit" className="admin-button" disabled={testUrlTesting || !testUrlInput.trim()}>
            {testUrlTesting ? 'Generating Link...' : 'Generate & Test Link'}
          </button>
        </form>

        {testUrlResult && (
          <div className="mt-4 p-4 rounded-lg bg-neutral-50 border border-neutral-200 text-xs space-y-2.5">
            {testUrlResult.error ? (
              <p className="text-red-600 font-semibold flex items-center gap-1.5">
                <AlertCircle size={14}/> {testUrlResult.error}
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="font-semibold text-neutral-700 flex items-center gap-1.5">
                    <MarketplaceLogo store={testUrlResult.store} />
                    Method Applied: <span className="uppercase text-indigo-700 font-bold">{testUrlResult.kind}</span>
                  </span>
                  <span className="text-[11px] text-neutral-500 font-mono">
                    Status: {testUrlResult.reason}
                  </span>
                </div>

                <div>
                  <span className="text-neutral-500 block mb-0.5 font-medium">Generated Affiliate Destination:</span>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      className="admin-input flex-1 font-mono text-xs bg-white select-all text-neutral-800"
                      value={testUrlResult.outputUrl}
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(testUrlResult.outputUrl, 'test-output')}
                      className="admin-button admin-secondary py-1.5 px-3 flex items-center gap-1"
                    >
                      {copiedKey === 'test-output' ? <Check size={13} className="text-emerald-600"/> : <Copy size={13}/>}
                      {copiedKey === 'test-output' ? 'Copied' : 'Copy'}
                    </button>
                    <a
                      href={testUrlResult.outputUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="admin-button py-1.5 px-3 flex items-center gap-1 bg-neutral-900 text-white"
                    >
                      Open Link <ArrowUpRight size={13}/>
                    </a>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* 3. Product Affiliate Links Inspector */}
      <section className="admin-panel p-5 bg-white rounded-lg shadow-sm border border-neutral-200">
        <h2 className="editorial text-2xl mb-2">Product Affiliate Links & Generated Destination</h2>
        <p className="text-xs text-neutral-500 mb-4">
          Inspect any catalog product to see the exact generated outbound link that users are redirected to.
        </p>

        <form className="flex gap-3 mb-4 flex-wrap" onSubmit={e => { e.preventDefault(); setSearch(query); }}>
          <select
            className="admin-input w-auto font-medium"
            aria-label="Product marketplace"
            value={store}
            onChange={e => { setStore(e.target.value); setSelected(''); }}
          >
            {stores.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
          </select>
          <input
            className="admin-input flex-1"
            aria-label="Find product"
            placeholder="Search product by title, brand, or SKU..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <button className="admin-button">Search Products</button>
        </form>

        {products.error && <p role="alert" className="text-red-600 text-xs">{products.error.message}</p>}

        <div className="max-h-56 overflow-auto border border-neutral-200 rounded divide-y divide-neutral-100 bg-white">
          {products.data?.products?.map((p: any) => (
            <button
              key={p._id}
              className={`block w-full text-left p-2.5 text-xs transition-colors ${
                selected === p._id ? 'bg-indigo-50 text-indigo-900 font-semibold' : 'hover:bg-neutral-50'
              }`}
              aria-pressed={selected === p._id}
              onClick={() => { setSelected(p._id); setMode('inherit'); setCustom(''); }}
            >
              <div className="flex items-center justify-between">
                <span>{p.name || p.title}</span>
                <span className="text-[11px] text-neutral-400 font-mono">{p.brand || store}</span>
              </div>
            </button>
          ))}
          {products.data?.products?.length === 0 && (
            <p className="p-3 text-xs text-neutral-400 text-center">No products found matching your search.</p>
          )}
        </div>

        {/* Selected Product Generated Link Inspector */}
        {detail.error && <p role="alert" className="text-red-600 text-xs mt-3">{detail.error.message}</p>}

        {detail.data && (
          <div className="mt-6 pt-5 border-t border-neutral-200 space-y-4">
            <div className="flex items-start justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-base font-bold text-neutral-900">{detail.data.product.name}</h3>
                <p className="text-xs text-neutral-500 font-mono">Store: {detail.data.product.store} · ID: {detail.data.product._id}</p>
              </div>

              {/* Status Badge */}
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
                detail.data.resolved?.kind === 'ekaro' ? 'bg-purple-100 text-purple-800' :
                detail.data.resolved?.kind === 'amazon' ? 'bg-amber-100 text-amber-800' :
                detail.data.resolved?.kind === 'custom' ? 'bg-blue-100 text-blue-800' :
                'bg-neutral-100 text-neutral-700'
              }`}>
                Mode: {detail.data.resolved?.kind || 'Direct'}
              </span>
            </div>

            {/* GENERATED DESTINATION URL CARD */}
            <div className="p-4 rounded-lg bg-neutral-50 border border-neutral-200 space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                    Generated Outbound Destination (Visitor Target)
                  </span>
                  <span className="text-[11px] text-neutral-500">
                    {detail.data.resolved?.reason || 'Calculated destination'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    className="admin-input flex-1 font-mono text-xs bg-white select-all text-neutral-900 font-medium"
                    value={detail.data.resolved?.url || 'No valid destination'}
                  />
                  {detail.data.resolved?.url && (
                    <>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(detail.data.resolved.url, 'dest-url')}
                        className="admin-button admin-secondary py-1.5 px-3 flex items-center gap-1 text-xs"
                      >
                        {copiedKey === 'dest-url' ? <Check size={13} className="text-emerald-600"/> : <Copy size={13}/>}
                        {copiedKey === 'dest-url' ? 'Copied' : 'Copy'}
                      </button>
                      <a
                        href={detail.data.resolved.url}
                        target="_blank"
                        rel="noreferrer"
                        className="admin-button py-1.5 px-3 flex items-center gap-1 text-xs bg-neutral-900 text-white hover:bg-neutral-800"
                      >
                        Open / Test Link <ArrowUpRight size={13}/>
                      </a>
                    </>
                  )}
                </div>
              </div>

              {/* Tracked Buy URL */}
              <div>
                <span className="text-xs font-medium text-neutral-600 block mb-1">Internal Tracked Buy Route</span>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    className="admin-input flex-1 font-mono text-xs bg-neutral-100 text-neutral-600"
                    value={typeof window !== 'undefined' ? window.location.origin + detail.data.buyUrl : detail.data.buyUrl}
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard(window.location.origin + detail.data.buyUrl, 'buy-url')}
                    className="admin-button admin-secondary py-1.5 px-3 flex items-center gap-1 text-xs"
                  >
                    {copiedKey === 'buy-url' ? <Check size={13} className="text-emerald-600"/> : <Copy size={13}/>}
                    {copiedKey === 'buy-url' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* EarnKaro Token Missing Warning for Non-Amazon */}
              {detail.data.product.store !== 'amazon' && !detail.data.tokenConfigured && (
                <div className="p-2.5 rounded bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
                  <AlertCircle size={15} className="text-amber-600 flex-shrink-0" />
                  <span>
                    EarnKaro token is not configured. When visitors click buy for {detail.data.product.store}, they will be redirected to the original direct store URL. Add your EarnKaro token in Affiliate controls above to enable automated conversion.
                  </span>
                </div>
              )}
            </div>

            {/* Product Overrides & Actions */}
            <div className="grid sm:grid-cols-2 gap-4">
              <label>
                <span className="admin-label block text-xs font-semibold mb-1">Product Override Setting</span>
                <select className="admin-input w-full text-xs" value={mode} onChange={e => setMode(e.target.value)}>
                  <option value="inherit">Use Marketplace Default</option>
                  <option value="direct">Force Original Store Link (No Affiliate)</option>
                  <option value="custom">Custom Affiliate URL</option>
                </select>
              </label>

              <label>
                <span className="admin-label block text-xs font-semibold mb-1">Custom HTTPS Affiliate URL</span>
                <input
                  className="admin-input w-full text-xs"
                  type="url"
                  disabled={mode !== 'custom'}
                  value={custom}
                  onChange={e => setCustom(e.target.value)}
                  placeholder="https://..."
                />
              </label>
            </div>

            <div className="flex gap-2.5 flex-wrap pt-1">
              <button
                className="admin-button text-xs"
                disabled={busy}
                onClick={() => action({ action: 'product', store, id: selected, mode, customUrl: custom })}
              >
                Save Product Override
              </button>

              <button
                className="admin-button admin-secondary text-xs"
                disabled={busy}
                onClick={async () => {
                  const res = await action({ action: 'generate', store, id: selected });
                  if (res?.convertedUrl) {
                    setMessage(`EarnKaro link generated successfully: ${res.convertedUrl}`);
                  }
                }}
              >
                Generate EarnKaro Link Now
              </button>

              {detail.data.override?.convertedUrl && (
                <button
                  className="admin-button admin-secondary text-xs text-red-600 border-red-200 hover:bg-red-50"
                  disabled={busy}
                  onClick={() => action({ action: 'clear', store, id: selected })}
                >
                  Clear Converted Link
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* 4. Analytics Tables */}
      <section className="admin-panel p-5 bg-white rounded-lg shadow-sm border border-neutral-200">
        <h2 className="editorial text-2xl mb-2">Top Products · Last 30 Days</h2>
        <p className="text-xs text-neutral-500 mb-4">Outbound click requests across all stores.</p>
        <div className="overflow-x-auto">
          <table className="admin-table w-full text-left text-xs">
            <thead className="bg-neutral-50 border-b border-neutral-200">
              <tr>
                <th className="p-2.5 font-semibold">Product</th>
                <th className="p-2.5 font-semibold">Marketplace</th>
                <th className="p-2.5 font-semibold">Clicks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {data.data?.top?.map((r: any) => (
                <tr key={r._id.store + r._id.slug}>
                  <td className="p-2.5 font-medium">{r.name}</td>
                  <td className="p-2.5"><MarketplaceLogo store={r._id.store} /></td>
                  <td className="p-2.5 font-mono text-neutral-700 font-bold">{r.clicks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.data?.top?.length === 0 && <p className="text-xs text-neutral-400 p-2">No tracked clicks recorded yet.</p>}
      </section>

      <section className="admin-panel p-5 bg-white rounded-lg shadow-sm border border-neutral-200">
        <h2 className="editorial text-2xl mb-2">Daily Outbound Activity · Last 30 Days</h2>
        <div className="overflow-x-auto">
          <table className="admin-table w-full text-left text-xs">
            <thead className="bg-neutral-50 border-b border-neutral-200">
              <tr>
                <th className="p-2.5 font-semibold">Date (UTC)</th>
                <th className="p-2.5 font-semibold">Link Method</th>
                <th className="p-2.5 font-semibold">Clicks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {data.data?.daily?.map((r: any) => (
                <tr key={r._id.day + r._id.kind}>
                  <td className="p-2.5 font-mono">{r._id.day}</td>
                  <td className="p-2.5 uppercase font-semibold text-neutral-700">{r._id.kind}</td>
                  <td className="p-2.5 font-mono font-bold">{r.clicks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
