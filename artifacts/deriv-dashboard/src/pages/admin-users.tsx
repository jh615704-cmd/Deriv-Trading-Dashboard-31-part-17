import { useState } from 'react';
import { useListAdminUsers, useCreateAdminUser, getListAdminUsersQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/app-shell';
import { RefreshCw, UserPlus, Mail, KeyRound, CheckCircle2, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const usersQuery = useListAdminUsers();
  const createUserMutation = useCreateAdminUser();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setIsCreating(true);

    createUserMutation.mutate(
      { data: { email, password } },
      {
        onSuccess: (newUser) => {
          setEmail('');
          setPassword('');
          toast({ title: 'User created', description: `${newUser.email} has been approved and added.` });
          queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
        },
        onError: (err: any) => {
          setCreateError(err.error || err.message || 'Failed to create user');
        },
        onSettled: () => {
          setIsCreating(false);
        }
      }
    );
  };

  return (
    <AppShell title="ADMIN / USERS">
      <div className="max-w-5xl space-y-8">
        <section>
          <div className="eyebrow mb-4"><span className="eyebrow-rule" />WORKSPACE / ACCESS</div>
          
          <div className="panel overflow-hidden mb-8">
             <div className="p-6 sm:p-8 border-b border-[var(--line)] dark:border-[#31545a] flex items-center gap-3">
               <UserPlus size={22} className="text-[var(--teal)]" />
               <h3 className="text-xl font-bold text-[var(--ink-deep)] dark:text-[#d8ece9]">Add Approved User</h3>
             </div>
             <div className="p-6 sm:p-8 bg-[#fdfefe] dark:bg-[#0c2026]">
                {createError && (
                  <div className="mb-6 p-3 bg-[#fff4f2] dark:bg-[#3c2426] border border-[#e5aaa5] dark:border-[#8c4d4a] rounded-lg text-[var(--coral)] dark:text-[#e6b6b2] text-sm flex items-center gap-2">
                    <XCircle size={16} />
                    {createError}
                  </div>
                )}
                <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-12 gap-6 items-end">
                  <div className="md:col-span-5 space-y-1">
                    <label htmlFor="new_email" className="block text-xs font-mono tracking-widest text-[#709092]">EMAIL</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Mail size={16} className="text-[#8ba1a2]" />
                      </div>
                      <input
                        id="new_email"
                        type="email"
                        autoComplete="off"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-[#f8fcfb] dark:bg-[#0b252d] border border-[#cddfdf] dark:border-[#41666d] rounded-lg focus:outline-none focus:border-[var(--teal)] focus:ring-1 focus:ring-[var(--teal)] transition-colors text-sm dark:text-[#f4fffd]"
                        placeholder="user@example.com"
                        disabled={isCreating}
                      />
                    </div>
                  </div>
                  <div className="md:col-span-5 space-y-1">
                    <label htmlFor="new_password" className="block text-xs font-mono tracking-widest text-[#709092]">INITIAL PASSWORD</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <KeyRound size={16} className="text-[#8ba1a2]" />
                      </div>
                      <input
                        id="new_password"
                        type="password"
                        autoComplete="new-password"
                        required
                        minLength={8}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-[#f8fcfb] dark:bg-[#0b252d] border border-[#cddfdf] dark:border-[#41666d] rounded-lg focus:outline-none focus:border-[var(--teal)] focus:ring-1 focus:ring-[var(--teal)] transition-colors text-sm dark:text-[#f4fffd]"
                        placeholder="••••••••"
                        disabled={isCreating}
                      />
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <button
                      type="submit"
                      disabled={isCreating || !email || !password}
                      className="w-full flex items-center justify-center gap-2 bg-[var(--teal)] text-[#f7fffd] py-2.5 rounded-lg font-bold text-sm shadow-sm hover:bg-[var(--teal-deep)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                    >
                      {isCreating ? <RefreshCw className="spin" size={16} /> : 'Create'}
                    </button>
                  </div>
                </form>
             </div>
          </div>

          <div className="panel overflow-hidden">
            <div className="p-6 sm:p-8 border-b border-[var(--line)] dark:border-[#31545a]">
              <h3 className="text-xl font-bold text-[var(--ink-deep)] dark:text-[#d8ece9]">Approved Directory</h3>
            </div>
            
            {usersQuery.isLoading ? (
               <div className="p-8 flex justify-center"><RefreshCw className="spin text-[var(--teal)]" size={24} /></div>
            ) : usersQuery.isError ? (
               <div className="p-8 text-[var(--coral)]">Failed to load users</div>
            ) : !usersQuery.data?.length ? (
               <div className="p-8 text-center text-[#7f9d9d]">No users found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--line)] dark:border-[#31545a] bg-[#f8fcfb] dark:bg-[#0b252d]">
                      <th className="px-6 py-3 text-xs font-mono tracking-widest text-[#709092]">USER ID</th>
                      <th className="px-6 py-3 text-xs font-mono tracking-widest text-[#709092]">EMAIL</th>
                      <th className="px-6 py-3 text-xs font-mono tracking-widest text-[#709092]">ROLE</th>
                      <th className="px-6 py-3 text-xs font-mono tracking-widest text-[#709092]">STATUS</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {usersQuery.data.map(u => (
                      <tr key={u.user_id} className="border-b border-[var(--line)] dark:border-[#31545a] hover:bg-[#f0faf8] dark:hover:bg-[#12343d] transition-colors">
                        <td className="px-6 py-4 font-mono text-xs text-[#8ba1a2]">{u.user_id}</td>
                        <td className="px-6 py-4 font-medium text-[var(--ink-deep)] dark:text-[#d8ece9]">{u.email}</td>
                        <td className="px-6 py-4"><span className="inline-block px-2 py-1 rounded bg-[var(--teal-soft)] text-[var(--teal-deep)] dark:bg-[#123e3a] dark:text-[#35d6b6] font-mono text-[10px] tracking-wider uppercase">{u.role}</span></td>
                        <td className="px-6 py-4">
                          {u.active ? (
                            <span className="flex items-center gap-1.5 text-[var(--teal)] dark:text-[#35d6b6] text-xs font-medium"><CheckCircle2 size={14} /> Active</span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-[var(--coral)] text-xs font-medium"><XCircle size={14} /> Inactive</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}