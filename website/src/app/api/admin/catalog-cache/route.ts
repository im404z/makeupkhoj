import { isAdmin, privateJson, sameOrigin } from '@/lib/admin/auth';
import { catalogCacheStatus, saveCatalogCacheSettings } from '@/lib/catalog-cache';

export const runtime = 'nodejs';

export async function GET() {
  if (!await isAdmin()) return privateJson({ error: 'Unauthorized' }, 401);
  return privateJson(await catalogCacheStatus());
}

export async function POST(request: Request) {
  if (!await isAdmin()) return privateJson({ error: 'Unauthorized' }, 401);
  if (!sameOrigin(request)) return privateJson({ error: 'Invalid origin' }, 403);
  try {
    await saveCatalogCacheSettings(await request.json());
    return privateJson(await catalogCacheStatus());
  } catch (error) {
    return privateJson({ error: error instanceof Error ? error.message : 'Could not update catalog cache' }, 400);
  }
}
