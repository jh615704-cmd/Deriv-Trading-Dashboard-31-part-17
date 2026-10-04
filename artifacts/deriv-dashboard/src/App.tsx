import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import XTraderPage from '@/pages/x-trader-page';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ThemeProvider } from '@/components/theme-provider';
import { ClerkProvider } from '@clerk/react';
import AdminUsersPage from '@/pages/admin-users';
import AppPage from '@/pages/app-page';
import SettingsPage from '@/pages/settings';
import { AccessGate } from '@/components/access-gate';
import SignInPage from '@/pages/sign-in';
import { DerivCredentialWarning } from '@/components/deriv-credential-warning';

const queryClient = new QueryClient();

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={XTraderPage} />
        <Route path="/app" component={XTraderPage} />
        <Route path="/dashboard" component={AppPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/sign-in" component={SignInPage} />
        <Route path="/admin" component={AdminUsersPage} />
        <Route path="/admin/users" component={AdminUsersPage} />
        <Route component={XTraderPage} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

  if (!publishableKey) {
    return (
      <ThemeProvider>
        <TooltipProvider>
          <WouterRouter base={basePath}>
             <QueryClientProvider client={queryClient}><AccessGate><DerivCredentialWarning /><Router /></AccessGate></QueryClientProvider>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    );
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <ThemeProvider>
        <TooltipProvider>
          <WouterRouter base={basePath}>
             <QueryClientProvider client={queryClient}><AccessGate><DerivCredentialWarning /><Router /></AccessGate></QueryClientProvider>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </ClerkProvider>
  );
}

export default App;