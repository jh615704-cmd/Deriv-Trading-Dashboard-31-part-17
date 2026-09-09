import { type ReactNode, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, useClerk, useAuth } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Landing from '@/pages/landing';
import AppPage from '@/pages/app-page';
import SettingsPage from '@/pages/settings';
import SignInPage from '@/pages/sign-in';
import AdminUsersPage from '@/pages/admin-users';
import { Route, Switch, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { ThemeProvider } from '@/components/theme-provider';
import { useGetAuthAccess, getGetAuthAccessQueryKey } from '@workspace/api-client-react';
import { RefreshCw, CircleAlert } from 'lucide-react';

const queryClient = new QueryClient();

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function HomeRedirect() {
  const { isSignedIn } = useAuth();
  return isSignedIn ? <Redirect to="/app" /> : <Landing />;
}

function ProtectedGuard({ children, requireAdmin = false }: { children: ReactNode, requireAdmin?: boolean }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const [authError, setAuthError] = useState<string | null>(null);

  const authAccess = useGetAuthAccess({
    query: {
      enabled: isLoaded && !!isSignedIn,
      retry: false,
      queryKey: getGetAuthAccessQueryKey(),
    }
  });

  useEffect(() => {
    if (isLoaded && isSignedIn && authAccess.isError) {
      signOut().then(() => {
        setAuthError('Access not approved. Contact the administrator.');
      });
    }
  }, [isLoaded, isSignedIn, authAccess.isError, signOut]);

  if (!isLoaded) {
    return <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--paper)] dark:bg-[#0b1a20]"><RefreshCw className="spin text-[var(--teal)]" size={24} /></div>;
  }

  if (authError) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--paper)] dark:bg-[#0b1a20] px-4">
        <div className="panel p-8 text-center max-w-sm w-full border border-[var(--line)] shadow-xl bg-[var(--paper)] dark:bg-[#102f38] dark:border-[#31545a]">
           <CircleAlert size={32} className="text-[var(--coral)] mx-auto mb-4" />
           <h2 className="text-lg font-bold text-[var(--ink-deep)] dark:text-[#d8ece9] mb-2">Access Denied</h2>
           <p className="text-sm text-[var(--ink-mid)] dark:text-[#7f9d9d] mb-6">{authError}</p>
           <button onClick={() => setAuthError(null)} className="text-[var(--teal)] hover:underline font-bold bg-transparent border-0 cursor-pointer">Return to Login</button>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return <Redirect to="/sign-in" />;
  }

  if (authAccess.isPending) {
    return <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--paper)] dark:bg-[#0b1a20]"><RefreshCw className="spin text-[var(--teal)]" size={24} /></div>;
  }

  if (authAccess.isSuccess) {
    if (requireAdmin && authAccess.data.role !== 'admin') {
      return <Redirect to="/app" />;
    }
    return <>{children}</>;
  }

  return null;
}

function ProtectedRoute({ component: Component, path, requireAdmin = false }: { component: any, path: string, requireAdmin?: boolean }) {
  return (
    <Route path={path}>
      <ProtectedGuard requireAdmin={requireAdmin}>
        <Component />
      </ProtectedGuard>
    </Route>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={HomeRedirect} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <ProtectedRoute path="/app" component={AppPage} />
        <ProtectedRoute path="/settings" component={SettingsPage} />
        <ProtectedRoute path="/admin/users" component={AdminUsersPage} requireAdmin={true} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      signInUrl={`${basePath}/sign-in`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Router />
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <WouterRouter base={basePath}>
          <ClerkProviderWithRoutes />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;