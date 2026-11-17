import { NextResponse, type NextRequest } from 'next/server';

// Maintenance Mode switch
// Can be toggled via MAINTENANCE_MODE=true in .env / .env.local
const isMaintenanceMode = process.env.MAINTENANCE_MODE === 'true';

// Static asset regex pattern to allow logos, styling, and icons to render
const PUBLIC_FILE = /\.(.*)$/;

export function middleware(request: NextRequest) {
  if (!isMaintenanceMode) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // 1. Always allow Next.js internal files, static assets, and images
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/assets') ||
    pathname.startsWith('/branding') ||
    pathname.startsWith('/marketplaces') ||
    pathname === '/favicon.ico' ||
    pathname === '/icon.png' ||
    pathname === '/apple-icon.png' ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  // 2. Disable ALL API endpoints immediately with HTTP 503 Service Unavailable
  if (pathname.startsWith('/api')) {
    return NextResponse.json(
      {
        success: false,
        status: 503,
        error: 'Service Unavailable',
        message: 'All API endpoints are temporarily disabled for scheduled database maintenance and testing.',
        retryAfter: 3600,
      },
      {
        status: 503,
        headers: {
          'Retry-After': '3600',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  }

  // 3. For the maintenance route itself, return with status 503
  if (pathname === '/maintenance') {
    return NextResponse.next({
      headers: {
        'Retry-After': '3600',
      },
    });
  }

  // 4. Rewrite ALL incoming page routes to the maintenance page with HTTP 503
  const maintenanceUrl = new URL('/maintenance', request.url);
  return NextResponse.rewrite(maintenanceUrl, {
    status: 503,
    headers: {
      'Retry-After': '3600',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
