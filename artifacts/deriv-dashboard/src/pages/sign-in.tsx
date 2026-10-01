import { useState } from 'react';
import { useSignIn, useAuth } from '@clerk/react';
import { useLocation } from 'wouter';
import { RefreshCw, LockKeyhole, Mail, KeyRound } from 'lucide-react';

export default function SignInPage() {
  const { signIn } = useSignIn();
  const { isLoaded } = useAuth();
  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [, setLocation] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const result = await signIn.password({
        identifier: emailAddress,
        password,
      });

      if (result.error) {
        setError(result.error.longMessage || result.error.message || 'Sign in failed.');
        setIsLoading(false);
        return;
      }

      if (signIn.status === 'complete' && signIn.createdSessionId) {
        await signIn.finalize();
        setPassword('');
         setSuccess('Administrator session ready. Opening the control panel…');
         window.setTimeout(() => setLocation('/admin/users'), 350);
      } else {
        setError('Sign in requires further verification.');
      }
    } catch (err: unknown) {
      const clerkError = err as { errors?: Array<{ longMessage?: string; message?: string }> };
      setError(clerkError.errors?.[0]?.longMessage || clerkError.errors?.[0]?.message || 'Sign in failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--paper)] dark:bg-[#0b1a20] px-4 font-sans text-[var(--ink-deep)] dark:text-[#d8ece9]">
      <div className="w-full max-w-md panel p-8 rounded-2xl border border-[var(--line)] shadow-xl bg-[var(--paper)] dark:bg-[#102f38] dark:border-[#31545a]">
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl rounded-tr-sm bg-[#1bb59f] flex items-center justify-center text-[#0d2a32] text-xl font-black tracking-tighter">
              S
            </div>
            <span className="font-bold tracking-wide text-sm text-[#102f38] dark:text-[#f3fbf9]">
              Shadow Ai Trading <span className="text-[#18a894] dark:text-[#35d6b6]">AI Trading</span>
            </span>
          </div>
        </div>
        
         <h1 className="text-2xl font-bold text-center mb-2">Administrator sign-in</h1>
         <p className="mb-6 text-center text-sm text-[#709092] dark:text-[#9ab9b6]">Use the administrator account to provision EDGE access keys.</p>
        
        {error && (
          <div className="mb-6 p-3 bg-[#fff4f2] dark:bg-[#3c2426] border border-[#e5aaa5] dark:border-[#8c4d4a] rounded-lg text-[var(--coral)] dark:text-[#e6b6b2] text-sm text-center">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-6 p-3 bg-[#e8fbf5] dark:bg-[#123d35] border border-[#7dd8c2] dark:border-[#2b846f] rounded-lg text-[#126a59] dark:text-[#9aead8] text-sm text-center" role="status">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1">
            <label htmlFor="email" className="block text-xs font-mono tracking-widest text-[#709092]">EMAIL</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail size={16} className="text-[#8ba1a2]" />
              </div>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-[#f8fcfb] dark:bg-[#0b252d] border border-[#cddfdf] dark:border-[#41666d] rounded-lg focus:outline-none focus:border-[var(--teal)] focus:ring-1 focus:ring-[var(--teal)] transition-colors text-sm dark:text-[#f4fffd]"
                placeholder="you@example.com"
                disabled={isLoading}
              />
            </div>
          </div>
          
          <div className="space-y-1">
            <label htmlFor="password" className="block text-xs font-mono tracking-widest text-[#709092]">PASSWORD</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <KeyRound size={16} className="text-[#8ba1a2]" />
              </div>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-[#f8fcfb] dark:bg-[#0b252d] border border-[#cddfdf] dark:border-[#41666d] rounded-lg focus:outline-none focus:border-[var(--teal)] focus:ring-1 focus:ring-[var(--teal)] transition-colors text-sm dark:text-[#f4fffd]"
                placeholder="••••••••"
                disabled={isLoading}
              />
            </div>
          </div>
          
          <button
            type="submit"
            disabled={isLoading || Boolean(success) || !emailAddress || !password}
            className="w-full flex items-center justify-center gap-2 bg-[var(--teal)] text-[#f7fffd] py-2.5 rounded-lg font-bold text-sm shadow-[0_4px_14px_rgba(24,168,148,0.25)] hover:bg-[var(--teal-deep)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            {isLoading ? <RefreshCw className="spin" size={16} /> : <LockKeyhole size={16} />}
            {success ? 'Success' : isLoading ? 'Authenticating...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}