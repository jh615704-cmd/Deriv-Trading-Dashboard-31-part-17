import { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useClerk, useUser } from '@clerk/react';
import { getGetAccessSessionQueryKey, useGetAccessSession, useLogoutAccessSession } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Gauge,
  LockKeyhole,
  ShieldCheck,
  Moon,
  Sun,
  LogOut,
  Settings,
  User as UserIcon,
} from 'lucide-react';
import { useTheme } from '@/components/theme-provider';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { DerivAccountSwitcher } from '@/components/deriv-account-switcher';

interface AppShellProps {
  children: ReactNode;
  title: string;
  onRefresh?: () => void;
  headerContent?: ReactNode;
}

export function AppShell({ children, title, onRefresh, headerContent }: AppShellProps) {
  const [location, setLocation] = useLocation();
  const { theme, setTheme } = useTheme();
  const { signOut } = useClerk();
  const queryClient = useQueryClient();
  const { user } = useUser();
  const accessSession = useGetAccessSession({ query: { retry: false, queryKey: getGetAccessSessionQueryKey() } });
  const logoutAccess = useLogoutAccessSession();
  const isAdmin = accessSession.data?.is_admin === true;
  const features = accessSession.data?.features ?? [];
  const canUseEdge = isAdmin || features.includes("edge");
  const canUseDigitFlip = isAdmin || features.includes("digit-flip");
  const canUseTradeX = isAdmin || features.includes("trade-x");
  const canUseBulkTrader = isAdmin || features.includes("bulk-trader");
  const canUseCashGrab = isAdmin || features.includes("cash-grab");
  const canUseMoneyBank = isAdmin || features.includes("money-bank");
  const canUseTrading = canUseEdge || canUseDigitFlip || canUseTradeX || canUseBulkTrader || canUseCashGrab || canUseMoneyBank;
  const canUseSettings = isAdmin || features.includes("settings");
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div>
          <div className="brand-lockup">
            <span className="brand-mark">S</span>
            <span>Shadow Ai Trading <b>AI Trading</b></span>
          </div>
          <p className="sidebar-kicker">Connection center</p>
          <nav className="sidebar-nav" aria-label="Primary navigation">
            {canUseTrading && <Link
              href="/app" 
              className={`nav-item ${location === '/app' ? 'nav-item-active' : ''}`} 
              data-testid="link-nav-dashboard"
            >
              <Gauge size={17} />Dashboard
              {location === '/app' && <span className="nav-live" />}
            </Link>}
            {isAdmin && (
              <Link 
                href="/admin/users" 
                className={`nav-item ${location === '/admin/users' ? 'nav-item-active' : ''}`} 
                data-testid="link-nav-users"
              >
                <UserIcon size={17} />Users
                {location === '/admin/users' && <span className="nav-live" />}
              </Link>
            )}
            {canUseSettings && <Link 
              href="/settings" 
              className={`nav-item ${location === '/settings' ? 'nav-item-active' : ''}`} 
              data-testid="link-nav-settings"
            >
              <Settings size={17} />Settings
              {location === '/settings' && <span className="nav-live" />}
            </Link>}
          </nav>
        </div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <div className="crumbs">
            <span>WORKSPACE</span><span className="crumb-slash">/</span>
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            <DerivAccountSwitcher className="deriv-account-switcher-shell" enabled={canUseTrading} />
            {isAdmin && (
              <Link href="/admin/users" className="admin-top-link">
                <ShieldCheck size={14} /> Admin panel
              </Link>
            )}
            
            {headerContent}

            <button 
              type="button" 
              className="icon-button theme-toggle" 
              title={theme === 'dark' ? 'Use light theme' : 'Use dark theme'} 
              aria-label={theme === 'dark' ? 'Use light theme' : 'Use dark theme'} 
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} 
              data-testid="button-toggle-theme"
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="icon-button" aria-label="User menu" data-testid="button-user-menu">
                  <UserIcon size={16} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-[var(--paper)] dark:bg-[#102f38] border-[var(--line)] dark:border-[#31545a]">
                <DropdownMenuLabel className="font-mono text-xs tracking-wider text-[var(--teal-deep)] dark:text-[#8ce0ca]">
                   {accessSession.data?.label || user?.primaryEmailAddress?.emailAddress || 'EDGE operator'}
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-[var(--line)] dark:bg-[#31545a]" />
                 <DropdownMenuItem 
                   onClick={() => setLocation('/settings')} 
                  className="cursor-pointer text-[var(--ink-deep)] dark:text-[#d8ece9]"
                >
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </DropdownMenuItem>
                {accessSession.data && (
                  <DropdownMenuItem
                    onClick={() => {
                      logoutAccess.mutate(undefined, {
                        onSettled: () => {
                          queryClient.clear();
                          setLocation('/');
                        },
                      });
                    }}
                    className="cursor-pointer text-[var(--ink-deep)] dark:text-[#d8ece9]"
                  >
                    <LockKeyhole className="mr-2 h-4 w-4" />
                    <span>Lock EDGE</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem 
                  onClick={() => signOut({ redirectUrl: basePath || "/" })}
                  className="cursor-pointer text-red-600 dark:text-red-400 focus:bg-red-50 dark:focus:bg-red-950/30"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <div className="content-wrap">
          {children}
        </div>
      </main>
    </div>
  );
}