import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import XTraderPage from '@/pages/x-trader-page';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ThemeProvider } from '@/components/theme-provider';

const queryClient = new QueryClient();

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={XTraderPage} />
        <Route path="/app" component={XTraderPage} />
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
  return (
    <ThemeProvider>
      <TooltipProvider>
        <WouterRouter base={basePath}>
          <QueryClientProvider client={queryClient}><Router /></QueryClientProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;