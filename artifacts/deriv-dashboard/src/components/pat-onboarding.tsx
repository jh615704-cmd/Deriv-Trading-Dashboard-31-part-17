import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTestDerivToken, getGetDerivTokenStatusQueryKey, getGetDerivAccountsQueryKey, getGetDerivStatusQueryKey } from '@workspace/api-client-react';
import { KeyRound, ShieldCheck, ArrowRight, RefreshCw, CircleAlert } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

import { useLocation } from 'wouter';

export function PatOnboarding() {
  const [token, setToken] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const queryClient = useQueryClient();
  const testTokenMutation = useTestDerivToken();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;

    testTokenMutation.mutate(
      { data: { token: token.trim(), expires_at: expiresAt || undefined } },
      {
        onSuccess: (result) => {
          if (result.success) {
            toast({
              title: "Token saved",
              description: result.message,
            });
            // Clear input
            setToken('');
            setExpiresAt('');
            // Invalidate to refresh app state
            queryClient.invalidateQueries({ queryKey: getGetDerivTokenStatusQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetDerivAccountsQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetDerivStatusQueryKey() });
            setLocation('/app');
          } else {
            toast({
              variant: "destructive",
              title: "Validation failed",
              description: result.message,
            });
          }
        },
        onError: (error: any) => {
          toast({
            variant: "destructive",
            title: "Connection error",
            description: error.message || "Failed to validate token.",
          });
        }
      }
    );
  };

  return (
    <div className="max-w-2xl mx-auto mt-12">
      <div className="panel p-8">
        <div className="flex items-center gap-4 mb-8 text-[var(--teal-deep)] dark:text-[#8ce0ca]">
          <div className="w-12 h-12 rounded-xl bg-[var(--teal-soft)] dark:bg-[#123e3a] flex items-center justify-center">
            <KeyRound size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-[var(--ink-deep)] dark:text-[#d8ece9]">Connect Deriv API</h2>
            <p className="text-sm text-[var(--ink-mid)] dark:text-[#7f9d9d] mt-1">Provide your Personal Access Token to access the trade desk.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <label className="block">
              <span className="block text-xs font-mono tracking-widest text-[#709092] mb-2">PERSONAL ACCESS TOKEN</span>
              <input 
                type="password" 
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Enter your Deriv PAT"
                className="w-full h-12 px-4 rounded-lg border border-[#cddfdf] dark:border-[#31545a] bg-[#f8fcfb] dark:bg-[#0c2026] text-[var(--ink-deep)] dark:text-[#dcebea] focus:border-[var(--teal)] focus:ring-1 focus:ring-[var(--teal)] transition-colors outline-none"
                required
                data-testid="input-pat-token"
              />
            </label>

            <label className="block">
              <span className="block text-xs font-mono tracking-widest text-[#709092] mb-2">EXPIRY DATE (OPTIONAL)</span>
              <input 
                type="date" 
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full h-12 px-4 rounded-lg border border-[#cddfdf] dark:border-[#31545a] bg-[#f8fcfb] dark:bg-[#0c2026] text-[var(--ink-deep)] dark:text-[#dcebea] focus:border-[var(--teal)] focus:ring-1 focus:ring-[var(--teal)] transition-colors outline-none"
                data-testid="input-pat-expiry"
              />
            </label>
          </div>

          <div className="bg-[#fff8e7] dark:bg-[#3d3420] border border-[#f0d69e] dark:border-[#80652d] rounded-lg p-4 flex gap-3 text-[13px] text-[#936c28] dark:text-[#d4ba7d]">
            <ShieldCheck size={18} className="shrink-0 text-[#d4a84d] dark:text-[#c4a14f]" />
            <div>
              <p className="font-semibold mb-1">Token permissions</p>
              <p>Use a Deriv token with the minimum read and trading permissions required for the accounts you want to access. Your token is encrypted server-side and never stored in this browser.</p>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={!token.trim() || testTokenMutation.isPending}
            className="w-full h-12 bg-[var(--teal)] hover:bg-[var(--teal-deep)] text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="button-save-pat"
          >
            {testTokenMutation.isPending ? (
              <><RefreshCw className="animate-spin" size={18} /> Connecting...</>
            ) : (
              <>Connect Workspace <ArrowRight size={18} /></>
            )}
          </button>
        </form>
        
        {testTokenMutation.isError && (
          <div className="mt-4 flex items-center gap-2 text-[#d75046] dark:text-[#e6b6b2] text-sm p-3 bg-[#fff4f2] dark:bg-[#3c2426] border border-[#e5aaa5] dark:border-[#8c4d4a] rounded-lg">
            <CircleAlert size={16} />
            <p>Token verification failed. Please check the scopes and try again.</p>
          </div>
        )}
      </div>
    </div>
  );
}