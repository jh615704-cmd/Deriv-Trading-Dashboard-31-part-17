import { type ReactNode, useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { dark } from '@clerk/themes';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Landing from '@/pages/landing';
import AppPage from '@/pages/app-page';
import SettingsPage from '@/pages/settings';
import { Route, Switch, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { ThemeProvider, useTheme } from '@/components/theme-provider';

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
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/app" />
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--paper)] dark:bg-[#0b1a20] px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--paper)] dark:bg-[#0b1a20] px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function ProtectedRoute({ component: Component, path }: { component: any, path: string }) {
  return (
    <Route path={path}>
      <Show when="signed-in">
        <Component />
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </Route>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={HomeRedirect} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <ProtectedRoute path="/app" component={AppPage} />
        <ProtectedRoute path="/settings" component={SettingsPage} />
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
  const { theme } = useTheme();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={{
        theme: theme === 'dark' ? dark : undefined,
        cssLayerName: "clerk",
        options: {
          logoPlacement: "inside",
          logoLinkUrl: basePath || "/",
          logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
        },
        variables: {
          colorPrimary: "#22b8a3",
          colorForeground: theme === 'dark' ? "#eaf7f5" : "#102f38",
          colorMutedForeground: theme === 'dark' ? "#a8c5c2" : "#587577",
          colorBackground: theme === 'dark' ? "#12343d" : "#f8fcfb",
          colorInput: theme === 'dark' ? "#0b252d" : "#ffffff",
          colorInputForeground: theme === 'dark' ? "#f4fffd" : "#102f38",
          colorDanger: "#ef6a5b",
          colorNeutral: theme === 'dark' ? "#d8ece9" : "#31545a",
          fontFamily: "var(--app-font-sans)",
        },
        elements: {
          rootBox: "w-full flex justify-center",
          cardBox: "rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl bg-[var(--paper)] dark:bg-[#102f38] border border-[var(--line)] dark:border-[#31545a]",
          card: "!shadow-none !border-0 !bg-transparent !rounded-none",
          footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
          headerTitle: "!text-[#eaf7f5]",
          headerSubtitle: "!text-[#a8c5c2]",
          formFieldLabel: "!text-[#d8ece9]",
          formFieldInput: "!bg-[#0b252d] !text-[#f4fffd] !border-[#41666d]",
          formButtonPrimary: "!bg-[#22b8a3] !text-[#061b20] hover:!bg-[#49d1bc]",
          socialButtonsBlockButton: "!border-[#41666d] !text-[#eaf7f5]",
          socialButtonsBlockButtonText: "!text-[#eaf7f5]",
          dividerText: "!text-[#a8c5c2]",
          dividerLine: "!bg-[#41666d]",
          footerActionText: "!text-[#a8c5c2]",
          footerActionLink: "!text-[#49d1bc]",
        },
      }}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
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