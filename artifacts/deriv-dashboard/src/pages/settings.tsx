import { useQueryClient } from '@tanstack/react-query';
import { 
  useGetDerivTokenStatus, 
  useDeleteDerivToken, 
  getGetDerivTokenStatusQueryKey,
  getGetDerivAccountsQueryKey,
  getGetDerivStatusQueryKey,
  getGetDerivHistoryQueryKey
} from '@workspace/api-client-react';
import { AppShell } from '@/components/layout/app-shell';
import { PatOnboarding } from '@/components/pat-onboarding';
import { KeyRound, ShieldAlert, CheckCircle2, Clock, Trash2, LogOut, Settings2, User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useClerk, useUser } from '@clerk/react';
import { useState } from 'react';
import { useLocation } from 'wouter';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { signOut } = useClerk();
  const { user } = useUser();
  const [, setLocation] = useLocation();
  const tokenStatusQuery = useGetDerivTokenStatus();
  const deleteTokenMutation = useDeleteDerivToken();
  const [isDeleting, setIsDeleting] = useState(false);
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const hasToken = tokenStatusQuery.data?.has_token;
  const expiresAt = tokenStatusQuery.data?.expires_at ? new Date(tokenStatusQuery.data.expires_at) : null;
  const lastVerifiedAt = tokenStatusQuery.data?.last_verified_at ? new Date(tokenStatusQuery.data.last_verified_at) : null;

  const handleDeleteToken = async () => {
    setIsDeleting(true);
    deleteTokenMutation.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "Token removed", description: "Your API access token was successfully removed." });
        queryClient.invalidateQueries({ queryKey: getGetDerivTokenStatusQueryKey() });
        queryClient.setQueryData(getGetDerivAccountsQueryKey(), []);
        queryClient.invalidateQueries({ queryKey: getGetDerivStatusQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDerivHistoryQueryKey() });
        setIsDeleting(false);
        setLocation('/app');
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Failed to remove token", description: err.message || "An error occurred." });
        setIsDeleting(false);
      }
    });
  };

  if (tokenStatusQuery.isLoading) {
    return (
      <AppShell title="SETTINGS">
        <div className="page-skeleton"><div className="skeleton-line wide" /><div className="skeleton-line medium" /></div>
      </AppShell>
    );
  }

  return (
    <AppShell title="SETTINGS">
      <div className="max-w-4xl space-y-8">
        <section>
          <div className="eyebrow mb-4"><span className="eyebrow-rule" />WORKSPACE / PROFILE</div>
          
          <div className="panel p-6 sm:p-8 flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-[var(--teal-soft)] dark:bg-[#123e3a] flex items-center justify-center text-[var(--teal-deep)] dark:text-[#8ce0ca]">
                <User size={28} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-[var(--ink-deep)] dark:text-[#d8ece9]">
                  {user?.fullName || 'User Profile'}
                </h3>
                <p className="text-sm text-[var(--ink-mid)] dark:text-[#7f9d9d] mt-1 font-mono">
                  {user?.primaryEmailAddress?.emailAddress}
                </p>
              </div>
            </div>
            
            <button 
              onClick={() => signOut({ redirectUrl: basePath || "/" })}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--line)] dark:border-[#31545a] text-[var(--coral)] hover:bg-[#fff4f2] dark:hover:bg-[#3c2426] transition-colors text-sm font-semibold"
              data-testid="button-sign-out"
            >
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </section>

        <section>
          <div className="eyebrow mb-4"><span className="eyebrow-rule" />WORKSPACE / SECURITY</div>

          {!hasToken ? (
            <PatOnboarding />
          ) : (
            <div className="panel overflow-hidden">
              <div className="p-6 sm:p-8 border-b border-[var(--line)] dark:border-[#31545a]">
                <div className="flex items-center gap-3 mb-6">
                  <KeyRound size={22} className="text-[var(--teal)]" />
                  <h3 className="text-xl font-bold text-[var(--ink-deep)] dark:text-[#d8ece9]">Deriv API Access</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono tracking-widest text-[#709092]">STATUS</span>
                    <div className="flex items-center gap-2 text-[var(--teal-deep)] dark:text-[#8ce0ca] font-semibold">
                      <CheckCircle2 size={16} /> Connected
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono tracking-widest text-[#709092]">LAST VERIFIED</span>
                    <div className="flex items-center gap-2 text-[var(--ink-deep)] dark:text-[#d8ece9]">
                      <Clock size={16} className="text-[#8ba1a2]" />
                      <span className="text-sm font-mono">{lastVerifiedAt ? lastVerifiedAt.toLocaleDateString() : 'Unknown'}</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] font-mono tracking-widest text-[#709092]">EXPIRATION</span>
                    <div className="flex items-center gap-2 text-[var(--ink-deep)] dark:text-[#d8ece9]">
                      {expiresAt ? (
                        <>
                          <Clock size={16} className="text-[#8ba1a2]" />
                          <span className="text-sm font-mono">{expiresAt.toLocaleDateString()}</span>
                        </>
                      ) : (
                        <span className="text-sm font-mono text-[#8ba1a2]">No expiry set</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 sm:p-8 bg-[#fdfefe] dark:bg-[#0c2026] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                <div className="max-w-xl">
                  <h4 className="text-sm font-bold text-[var(--ink-deep)] dark:text-[#d8ece9] mb-1 flex items-center gap-2">
                    <Settings2 size={16} /> Manage connection
                  </h4>
                  <p className="text-xs text-[var(--ink-mid)] dark:text-[#7f9d9d] leading-relaxed">
                    If you revoke this token, your active Deriv connection will be dropped and all related workspace data will be cleared from memory immediately.
                  </p>
                </div>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button 
                      className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-lg border border-[#e5aaa5] dark:border-[#8c4d4a] bg-[#fff4f2] dark:bg-[#3c2426] text-[var(--coral)] dark:text-[#e6b6b2] hover:bg-[#ffebeb] dark:hover:bg-[#4a2b2d] transition-colors text-sm font-bold shadow-sm"
                      disabled={isDeleting}
                      data-testid="button-revoke-pat"
                    >
                      <Trash2 size={16} /> Revoke Token
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="bg-[var(--paper)] dark:bg-[#102f38] border-[var(--line)] dark:border-[#31545a]">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-[var(--ink-deep)] dark:text-[#d8ece9] flex items-center gap-2">
                        <ShieldAlert className="text-[var(--coral)]" /> Revoke access token?
                      </AlertDialogTitle>
                      <AlertDialogDescription className="text-[var(--ink-mid)] dark:text-[#7f9d9d]">
                        This action will immediately drop your active Deriv connection and clear all workspace telemetry data. You will need to provide a new token to trade again.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="border-[var(--line)] dark:border-[#31545a] text-[var(--ink-deep)] dark:text-[#d8ece9] hover:bg-[var(--line)] dark:hover:bg-[#20404a]">Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeleteToken} className="bg-[var(--coral)] text-white hover:bg-red-700" data-testid="button-confirm-revoke-pat">Yes, revoke access</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}