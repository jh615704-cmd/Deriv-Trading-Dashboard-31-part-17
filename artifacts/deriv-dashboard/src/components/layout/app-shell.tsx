import { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useClerk, useUser } from '@clerk/react';
import { useGetAuthAccess, getGetAuthAccessQueryKey } from '@workspace/api-client-react';
import {
  Gauge,
  LockKeyhole,
  Moon,
  Sun,
  LogOut,
  Settings,
  User as UserIcon,
} from 'lucide-react';
import { useTheme } from '@/components/theme-provider';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface AppShellProps {
  children: ReactNode;
  title: string;
  isReal?: boolean;
  onRefresh?: () => void;
  headerContent?: ReactNode;
}

export function AppShell({ children, title, isReal, onRefresh, headerContent }: AppShellProps) {
  const [location, setLocation] = useLocation();
  const { theme, setTheme } = useTheme();
  const { signOut } = useClerk();
  const { user } = useUser();
  const authAccess = useGetAuthAccess({ query: { enabled: !!user, retry: false, queryKey: getGetAuthAccessQueryKey() } });
  const isAdmin = authAccess.data?.role === 'admin';
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div>
          <div className="brand-lockup">
            <span className="brand-mark">J</span>
            <span>JDY <b>AI</b></span>
          </div>
          <p className="sidebar-kicker">Connection center</p>
          <nav className="sidebar-nav" aria-label="Primary navigation">
            <Link 
              href="/app" 
              className={`nav-item ${location === '/app' ? 'nav-item-active' : ''}`} 
              data-testid="link-nav-dashboard"
            >
              <Gauge size={17} />Dashboard
              {location === '/app' && <span className="nav-live" />}
            </Link>
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
            <Link 
              href="/settings" 
              className={`nav-item ${location === '/settings' ? 'nav-item-active' : ''}`} 
              data-testid="link-nav-settings"
            >
              <Settings size={17} />Settings
              {location === '/settings' && <span className="nav-live" />}
            </Link>
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
            <span className={`environment-pill ${isReal ? 'environment-pill-live' : ''}`}>
              <span className="environment-dot" />
              {isReal ? 'LIVE DERIV ACCOUNT CONNECTED' : 'DERIV DEMO ACCOUNT'}
            </span>
            
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
                  {user?.primaryEmailAddress?.emailAddress || 'User Profile'}
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-[var(--line)] dark:bg-[#31545a]" />
                <DropdownMenuItem 
                  onClick={() => setLocation('/settings')} 
                  className="cursor-pointer text-[var(--ink-deep)] dark:text-[#d8ece9]"
                >
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </DropdownMenuItem>
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