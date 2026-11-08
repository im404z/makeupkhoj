'use client';

import { useState } from 'react';
import useSWR from 'swr';

const endpoint = '/api/admin/catalog-cache';
type Settings = { enabled: boolean; ttlSeconds: number };
type Status = Settings & { configured: boolean; connected: boolean };

async function readStatus(response: Response): Promise<Status> {
  const body = await response.json();
  if (!response.ok) throw Error(body.error || 'Could not load cache settings');
  return body;
}

export default function CatalogCacheSettings() {
  const { data, error, mutate } = useSWR(endpoint, async url => readStatus(await fetch(url)));
  const [draft, setDraft] = useState<Settings>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const values = draft ?? data;

  async function update(body: Settings | { clear: true }) {
    setBusy(true);
    setMessage('');
    try {
      const status = await readStatus(await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }));
      await mutate(status, false);
      if (!('clear' in body)) setDraft(undefined);
      setMessage('clear' in body ? 'Cached catalog results invalidated.' : 'Cache settings saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update catalog cache');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-panel" id="catalog-cache-controls">
      <div className="admin-panel-title"><h2>Catalog cache</h2></div>
      <div className="p-5">
        {data && <p className="mb-4 text-sm">{!data.configured
          ? 'Set REDIS_URL in website/.env.local and restart the website.'
          : data.connected ? 'Redis connected' : 'Redis unavailable. Catalog reads are using MongoDB.'}</p>}
        {error && <p role="alert">{error.message}</p>}
        {values && <form onSubmit={event => {
          event.preventDefault();
          void update({ enabled: values.enabled, ttlSeconds: values.ttlSeconds });
        }}>
          <label className="mb-4 flex items-center gap-2">
            <input type="checkbox" checked={values.enabled}
              onChange={event => setDraft({ ...values, enabled: event.target.checked })} />
            Enable Redis caching for catalog listings
          </label>
          <label className="admin-label block max-w-xs">
            Cache lifetime (seconds)
            <input className="admin-input" type="number" min={15} max={900} required value={values.ttlSeconds}
              onChange={event => setDraft({ ...values, ttlSeconds: Number(event.target.value) })} />
          </label>
          <div className="mt-4 flex gap-2">
            <button className="admin-button" disabled={busy}>Save cache settings</button>
            <button type="button" className="admin-button admin-secondary" disabled={busy || !data?.configured}
              onClick={() => void update({ clear: true })}>Clear catalog cache</button>
          </div>
        </form>}
        {message && <p className="mt-3 text-sm" role="status">{message}</p>}
      </div>
    </section>
  );
}
