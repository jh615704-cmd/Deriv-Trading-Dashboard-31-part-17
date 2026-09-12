import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListAccessKeysQueryKey,
  useCreateAccessKey,
  useListAccessKeys,
  useResetAccessKey,
  useUpdateAccessKey,
  type AccessFeature,
  type AccessKeySummary,
} from "@workspace/api-client-react";
import { AppShell } from "@/components/layout/app-shell";
import { useToast } from "@/hooks/use-toast";
import {
  Activity,
  Ban,
  Check,
  CirclePause,
  Copy,
  KeyRound,
  LockKeyhole,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  UserRound,
  Unlock,
  Users,
  X,
} from "lucide-react";

const featureOptions: Array<{ value: AccessFeature; label: string; description: string }> = [
  { value: "edge", label: "EDGE trading", description: "PAT connection, live telemetry, and trades" },
  { value: "settings", label: "Settings", description: "View and manage the Deriv connection" },
  { value: "history", label: "History", description: "Read recent trading activity" },
  { value: "admin", label: "Admin panel", description: "Create and manage access keys" },
];

function errorMessage(error: unknown) {
  const candidate = error as { data?: { error?: string }; message?: string };
  return candidate.data?.error ?? candidate.message ?? "The request could not be completed.";
}

function formatOffline(seconds: number, online: boolean) {
  if (online) return "Online now";
  if (!seconds) return "Never connected";
  if (seconds < 60) return `Offline ${seconds}s`;
  if (seconds < 3600) return `Offline ${Math.floor(seconds / 60)}m`;
  return `Offline ${Math.floor(seconds / 3600)}h`;
}

function StatusBadge({ item }: { item: AccessKeySummary }) {
  const label = item.status === "banned" ? "Banned" : item.status === "blocked" ? "Blocked" : item.status === "paused" ? "Paused" : item.online ? "Online" : "Offline";
  return <span className={`key-status key-status-${item.status} ${item.online ? "key-status-online" : ""}`}><i />{label}</span>;
}

function KeyRow({
  item,
  onStatus,
  onUpdate,
  onReset,
}: {
  item: AccessKeySummary;
  onStatus: (item: AccessKeySummary, status: "active" | "paused" | "blocked" | "banned") => void;
  onUpdate: (item: AccessKeySummary, data: { max_devices?: number; features?: AccessFeature[] }) => void;
  onReset: (item: AccessKeySummary) => void;
}) {
  const isBanned = item.status === "banned";
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [draftDevices, setDraftDevices] = useState(item.max_devices);
  const [draftFeatures, setDraftFeatures] = useState<AccessFeature[]>(item.features);

  const startEditing = () => {
    setDraftDevices(item.max_devices);
    setDraftFeatures(item.features);
    setEditing(true);
  };

  const toggleDraftFeature = (feature: AccessFeature) => {
    setDraftFeatures((current) => current.includes(feature)
      ? current.filter((value) => value !== feature)
      : [...current, feature]);
  };

  const copyAccessKey = async () => {
    if (!item.access_key) return;
    try {
      await navigator.clipboard.writeText(item.access_key);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      return;
    }
  };

  return (
    <div className="key-row">
      <div className="key-row-main">
        <div className="key-avatar">{item.kind === "admin" ? <ShieldCheck size={17} /> : <UserRound size={17} />}</div>
        {item.access_key ? (
          <button type="button" className="key-reissue-button" onClick={copyAccessKey} title="Copy access key" aria-label={`Copy access key for ${item.label}`}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
        ) : !item.is_admin && !isBanned ? (
          <button type="button" className="key-reissue-button" onClick={() => onReset(item)} title="Issue a replacement access key" aria-label={`Issue a replacement key for ${item.label}`}><KeyRound size={13} /></button>
        ) : null}
        <div>
          <div className="key-label">{item.label}</div>
          <div className="key-prefix">{item.access_key ?? `${item.key_prefix}••••••••`}</div>
        </div>
      </div>
      <div className="key-row-data"><span>{item.kind === "admin" ? "Administrator" : "User"}</span><strong>{item.device_count} / {item.max_devices}</strong><small>devices</small></div>
      <div className="key-row-data"><StatusBadge item={item} /><small>{formatOffline(item.offline_seconds, item.online)}</small></div>
      {editing ? (
        <div className="key-edit-panel">
          <label className="key-edit-limit">
            <span>DEVICES</span>
            <input
              type="number"
              min={1}
              max={50}
              value={draftDevices}
              onChange={(event) => setDraftDevices(Math.max(1, Math.min(50, Number(event.target.value) || 1)))}
            />
          </label>
          <div className="key-edit-features">
            {featureOptions.filter((feature) => feature.value !== "admin" || item.kind === "admin").map((feature) => (
              <label className={draftFeatures.includes(feature.value) || item.kind === "admin" ? "key-edit-feature selected" : "key-edit-feature"} key={feature.value}>
                <input
                  type="checkbox"
                  checked={item.kind === "admin" || draftFeatures.includes(feature.value)}
                  disabled={item.kind === "admin"}
                  onChange={() => toggleDraftFeature(feature.value)}
                />
                <span>{feature.label}</span>
              </label>
            ))}
          </div>
          <div className="key-edit-actions">
            <button type="button" className="key-action key-action-green" disabled={!draftFeatures.length} onClick={() => { onUpdate(item, { max_devices: draftDevices, features: draftFeatures }); setEditing(false); }}><Save size={13} /> Save</button>
            <button type="button" className="key-action" onClick={() => setEditing(false)}><X size={13} /> Cancel</button>
          </div>
        </div>
      ) : <div className="key-feature-list">{item.features.map((feature) => <span key={feature}>{feature}</span>)}</div>}
      <div className="key-row-actions">
        {!isBanned && !editing && <button type="button" className="key-action" onClick={startEditing} title="Edit device limit and features"><Pencil size={14} /> Edit access</button>}
        {item.status !== "active" && !isBanned && <button type="button" className="key-action key-action-green" onClick={() => onStatus(item, "active")} title="Resume or unblock"><Unlock size={14} /> Resume</button>}
        {item.status === "active" && <button type="button" className="key-action" onClick={() => onStatus(item, "paused")} title="Pause this key"><CirclePause size={14} /> Pause</button>}
        {item.status !== "blocked" && !isBanned && <button type="button" className="key-action" onClick={() => onStatus(item, "blocked")} title="Block this key"><LockKeyhole size={14} /> Block</button>}
        {!isBanned && <button type="button" className="key-action key-action-red" onClick={() => onStatus(item, "banned")} title="Permanently ban this key"><Ban size={14} /> Ban</button>}
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const keysQuery = useListAccessKeys({ query: { refetchInterval: 15_000, queryKey: getListAccessKeysQueryKey() } });
  const createKey = useCreateAccessKey();
  const resetKey = useResetAccessKey();
  const updateKey = useUpdateAccessKey();
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<"user" | "admin">("user");
  const [maxDevices, setMaxDevices] = useState(1);
  const [features, setFeatures] = useState<AccessFeature[]>(["edge"]);
  const [newKey, setNewKey] = useState<{ value: string; kind: "user" | "admin"; label: string } | null>(null);
  const [formError, setFormError] = useState("");
  const keys = keysQuery.data ?? [];
  const onlineCount = keys.filter((key) => key.online).length;
  const userCount = keys.filter((key) => key.kind === "user").length;
  const activeCount = keys.filter((key) => key.status === "active").length;
  const canCreate = Boolean(label.trim()) && features.length > 0 && !createKey.isPending;

  const toggleFeature = (feature: AccessFeature) => {
    setFeatures((current) => current.includes(feature) ? current.filter((item) => item !== feature) : [...current, feature]);
  };

  const handleCreate = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");
    createKey.mutate(
      { data: { label: label.trim(), kind, max_devices: maxDevices, features: kind === "admin" ? ["edge", "settings", "history", "admin"] : features } },
      {
        onSuccess: (created) => {
           setNewKey({ value: created.access_key, kind: created.kind, label: created.label });
          setLabel("");
          setKind("user");
          setMaxDevices(1);
          setFeatures(["edge"]);
          queryClient.invalidateQueries({ queryKey: getListAccessKeysQueryKey() });
          toast({ title: "Access key created", description: "Copy the key now. It is shown only once." });
        },
        onError: (error) => setFormError(errorMessage(error)),
      },
    );
  };

  const handleStatus = (item: AccessKeySummary, status: "active" | "paused" | "blocked" | "banned") => {
    if (status === "banned" && !window.confirm(`Permanently ban ${item.label}? This cannot be undone.`)) return;
    updateKey.mutate(
      { id: item.key_id, data: { status } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAccessKeysQueryKey() });
          toast({ title: status === "banned" ? "Key permanently banned" : `Key ${status === "active" ? "resumed" : status}` });
        },
        onError: (error) => toast({ variant: "destructive", title: "Update failed", description: errorMessage(error) }),
      },
    );
  };

  const handleUpdate = (item: AccessKeySummary, data: { max_devices?: number; features?: AccessFeature[] }) => {
    updateKey.mutate(
      { id: item.key_id, data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAccessKeysQueryKey() });
          toast({ title: "Access updated", description: `${item.label} now has the selected device limit and features.` });
        },
        onError: (error) => toast({ variant: "destructive", title: "Update failed", description: errorMessage(error) }),
      },
    );
  };

  const handleReset = (item: AccessKeySummary) => {
    if (!window.confirm(`Issue a replacement key for ${item.label}? The current key will stop working immediately.`)) return;
    resetKey.mutate(
      { id: item.key_id },
      {
        onSuccess: (created) => {
          setNewKey({ value: created.access_key, kind: created.kind, label: created.label });
          queryClient.invalidateQueries({ queryKey: getListAccessKeysQueryKey() });
          toast({ title: "Replacement key ready", description: "Copy the new key now. The old key has been revoked." });
        },
        onError: (error) => toast({ variant: "destructive", title: "Key replacement failed", description: errorMessage(error) }),
      },
    );
  };

  const copyKey = async () => {
    if (!newKey) return;
    await navigator.clipboard?.writeText(newKey.value);
    toast({ title: "Copied", description: "The access key is on your clipboard." });
  };

  const stats = useMemo(() => [
    { label: "TOTAL KEYS", value: keys.length, detail: `${userCount} user keys`, icon: KeyRound },
    { label: "ONLINE NOW", value: onlineCount, detail: "Presence within 90 seconds", icon: Activity },
    { label: "ACTIVE ACCESS", value: activeCount, detail: "Keys currently accepted", icon: Users },
  ], [activeCount, keys.length, onlineCount, userCount]);

  return (
    <AppShell title="ADMIN / ACCESS CONTROL">
      <div className="admin-console">
        <section className="admin-console-heading">
          <div>
            <div className="eyebrow"><span className="eyebrow-rule" />WORKSPACE / EDGE ADMIN</div>
            <h1>Access <em>control.</em></h1>
            <p>Provision keys, set device limits, grant features, and control who can enter the trading workspace.</p>
          </div>
          <button type="button" className="refresh-control" onClick={() => void keysQuery.refetch()} disabled={keysQuery.isFetching}><RefreshCw size={14} className={keysQuery.isFetching ? "spin" : ""} /> Refresh presence</button>
        </section>

        <section className="admin-stat-grid">
          {stats.map((stat) => <div className="admin-stat panel" key={stat.label}><div className="admin-stat-top"><span>{stat.label}</span><stat.icon size={16} /></div><strong>{stat.value}</strong><small>{stat.detail}</small></div>)}
        </section>

        {newKey && (
          <section className="new-key-callout">
            <div className="new-key-icon"><Check size={20} /></div>
             <div><span className="panel-overline">ONE-TIME KEY — COPY BEFORE CLOSING</span><h3>{newKey.label}: {newKey.kind === "admin" ? "administrator" : "user"} key is ready</h3><code>{newKey.value}</code></div>
            <button type="button" className="copy-key-button" onClick={copyKey}><Copy size={15} /> Copy key</button>
            <button type="button" className="dismiss-key" onClick={() => setNewKey(null)} aria-label="Hide new key">×</button>
          </section>
        )}

        <section className="admin-create-layout">
          <div className="panel admin-create-card">
            <div className="panel-header"><div><span className="panel-overline">PROVISION ACCESS</span><h3>Create a new key</h3></div><Plus size={19} className="panel-icon" /></div>
            {formError && <div className="admin-form-error">{formError}</div>}
            <form onSubmit={handleCreate} className="admin-key-form">
              <label className="admin-field"><span>LABEL</span><input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Alex — desktop" maxLength={120} /></label>
              <div className="admin-form-row">
                <label className="admin-field"><span>KEY TYPE</span><select value={kind} onChange={(event) => setKind(event.target.value as "user" | "admin")}><option value="user">User key</option><option value="admin">Administrator key</option></select></label>
                <label className="admin-field"><span>DEVICES ALLOWED</span><input type="number" min={1} max={50} value={maxDevices} onChange={(event) => setMaxDevices(Math.max(1, Math.min(50, Number(event.target.value) || 1)))} /></label>
              </div>
              <div className="admin-feature-picker"><span className="admin-field-label">FEATURE ACCESS</span>{featureOptions.map((feature) => <label className={`admin-feature-option ${kind === "admin" || features.includes(feature.value) ? "selected" : ""}`} key={feature.value}><input type="checkbox" checked={kind === "admin" || features.includes(feature.value)} disabled={kind === "admin"} onChange={() => toggleFeature(feature.value)} /><span><b>{feature.label}</b><small>{feature.description}</small></span></label>)}</div>
              <button type="submit" className="primary-button admin-create-submit" disabled={!canCreate}><KeyRound size={16} />{createKey.isPending ? "Generating…" : `Generate ${kind === "admin" ? "admin" : "user"} key`}</button>
            </form>
          </div>
          <div className="admin-safety-note"><div className="admin-safety-icon"><ShieldCheck size={20} /></div><h3>Built-in safety rules</h3><ul><li>New keys are locked to one device unless you change the limit.</li><li>Pausing can be resumed. Blocking can be undone.</li><li>Banning revokes all sessions permanently and cannot be undone.</li><li>Presence is refreshed every 15 seconds in this panel.</li></ul></div>
        </section>

        <section className="panel admin-directory">
          <div className="panel-header"><div><span className="panel-overline">LIVE DIRECTORY</span><h3>Access keys and presence</h3></div><span className="directory-note">{keys.length} records · {onlineCount} online</span></div>
          {keysQuery.isLoading ? <div className="admin-empty"><RefreshCw className="spin" size={20} /> Loading access keys…</div> : keysQuery.isError ? <div className="admin-empty admin-empty-error">Unable to load the access directory. Sign in again as an administrator.</div> : keys.length === 0 ? <div className="admin-empty">No keys created yet. Generate the first user key above.</div> : <div className="key-directory">{keys.map((item) => <KeyRow key={item.key_id} item={item} onStatus={handleStatus} onUpdate={handleUpdate} onReset={handleReset} />)}</div>}
        </section>
      </div>
    </AppShell>
  );
}