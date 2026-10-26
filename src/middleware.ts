import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isLoginRoute = path.startsWith('/login');
  // The employee time clock page is public: employees sign in there with their own phone + password
  const isClockRoute = path === '/clock' || path.startsWith('/clock/');
  // Legal pages must be readable without logging in (Intuit requires public privacy and terms links)
  const isLegalRoute = path === '/privacy' || path === '/terms';
  // The daily QuickBooks sync is called by Vercel's scheduler (no login); the route itself checks a secret
  // The password-reset page must open for someone who is not signed in
  const isResetRoute = path === '/auth/reset';
  const isCronRoute = path.startsWith('/api/cron/');

  if (!user && !isLoginRoute && !isClockRoute && !isLegalRoute && !isCronRoute && !isResetRoute) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  if (user && isLoginRoute) {
    return NextResponse.redirect(new URL('/admin', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
