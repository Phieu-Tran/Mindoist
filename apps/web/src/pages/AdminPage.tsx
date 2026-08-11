import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity, Asterisk, Bot, BrainCircuit, Check, CircleCheck, CircleHelp, KeyRound,
  LoaderCircle, Pencil, PlugZap, Plus, Route, ShieldCheck, Sparkles,
  TestTubeDiagonal, Trash2, TriangleAlert, Users,
  type LucideIcon,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

type Tab = 'overview' | 'users' | 'providers' | 'audit';
type ProviderType = 'GEMINI' | 'ANTHROPIC' | 'OPENAI' | 'OPENROUTER' | 'OPENAI_COMPATIBLE';

interface Overview { users: number; activeUsers: number; suspendedUsers: number; providers: number; enabledProviders: number; telegramConnections: number }
interface AdminUser { id: string; email: string; name: string; role: 'USER' | 'ADMIN'; status: 'ACTIVE' | 'SUSPENDED'; timeZone: string | null; onboardingRequired: boolean; createdAt: string; telegramConnection: { telegramUsername: string | null; linkedAt: string } | null }
interface Provider { id: string; label: string; provider: ProviderType; model: string; apiBase: string | null; enabled: boolean; priority: number; requestTimeoutMs: number; hasApiKey: boolean; apiKeyHint: string; lastTestStatus: 'HEALTHY' | 'FAILED' | null; lastTestedAt: string | null; lastTestLatencyMs: number | null; lastTestHttpStatus: number | null; lastTestError: string | null; createdAt: string; updatedAt: string }
interface Audit { id: string; action: string; entityType: string; entityId: string | null; createdAt: string; actor: { name: string; email: string } | null }

const emptyForm = { label: '', provider: 'GEMINI' as ProviderType, model: '', apiBase: '', apiKey: '', enabled: true, priority: 100, requestTimeoutMs: 30000 };

const providerCatalog: { type: ProviderType; name: string; icon: LucideIcon }[] = [
  { type: 'GEMINI', name: 'Gemini', icon: Sparkles },
  { type: 'ANTHROPIC', name: 'Anthropic / Claude', icon: Asterisk },
  { type: 'OPENAI', name: 'OpenAI', icon: BrainCircuit },
  { type: 'OPENROUTER', name: 'OpenRouter', icon: Route },
  { type: 'OPENAI_COMPATIBLE', name: 'OpenAI compatible', icon: PlugZap },
];

function providerDetails(type: ProviderType) {
  return providerCatalog.find(provider => provider.type === type) ?? providerCatalog[0];
}

function ProviderMark({ type, active = false, size = 'md' }: { type: ProviderType; active?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  const { icon: Icon } = providerDetails(type);
  return (
    <span className={cn(
      'inline-flex shrink-0 items-center justify-center rounded-control border transition-colors',
      size === 'sm' && 'h-8 w-8', size === 'md' && 'h-10 w-10', size === 'lg' && 'h-12 w-12',
      active ? 'border-primary/25 bg-primary/10 text-primary' : 'border-border bg-muted/60 text-muted-foreground',
    )} aria-hidden="true">
      <Icon className={cn(size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-6 w-6' : 'h-5 w-5')} strokeWidth={1.8} />
    </span>
  );
}

export function AdminPage() {
  const { t } = useTranslation('admin');
  const [tab, setTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadOverview = useCallback(async () => setOverview(await apiFetch<Overview>('/admin/overview')), []);
  const loadProviders = useCallback(async () => setProviders(await apiFetch<Provider[]>('/admin/providers')), []);
  const loadUsers = useCallback(async (search = query) => {
    const data = await apiFetch<{ items: AdminUser[]; total: number }>(`/admin/users?q=${encodeURIComponent(search)}`);
    setUsers(data.items);
  }, [query]);
  const loadAudit = useCallback(async () => setAudit(await apiFetch<Audit[]>('/admin/audit')), []);

  const loadTab = useCallback(async (nextTab: Tab) => {
    setLoading(true); setError(null);
    try {
      if (nextTab === 'overview') await loadOverview();
      if (nextTab === 'users') await loadUsers();
      if (nextTab === 'providers') await loadProviders();
      if (nextTab === 'audit') await loadAudit();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('error'));
    } finally { setLoading(false); }
  }, [loadAudit, loadOverview, loadProviders, loadUsers, t]);

  useEffect(() => { void loadTab(tab); }, [tab, loadTab]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setFormOpen(true); setNotice(null); };
  const openEdit = (provider: Provider) => {
    setEditing(provider);
    setForm({ label: provider.label, provider: provider.provider, model: provider.model, apiBase: provider.apiBase || '', apiKey: '', enabled: provider.enabled, priority: provider.priority, requestTimeoutMs: provider.requestTimeoutMs });
    setFormOpen(true); setNotice(null);
  };

  const submitProvider = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(null);
    try {
      const payload = { ...form, apiBase: form.apiBase.trim() || null, ...(editing && !form.apiKey ? { apiKey: undefined } : {}) };
      await apiFetch(editing ? `/admin/providers/${editing.id}` : '/admin/providers', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      setFormOpen(false); setNotice(t('providers.saved')); await Promise.all([loadProviders(), loadOverview()]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('error')); }
    finally { setSaving(false); }
  };

  const updateUser = async (id: string, patch: { role?: AdminUser['role']; status?: AdminUser['status'] }) => {
    try {
      await apiFetch(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      await Promise.all([loadUsers(), loadOverview()]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('error')); }
  };

  const testProvider = async (provider: Provider) => {
    setTestingProviderId(provider.id); setError(null); setNotice(null);
    try {
      await apiFetch(`/admin/providers/${provider.id}/test`, { method: 'POST' });
      setNotice(t('providers.tested'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('providers.testFailed'));
    } finally {
      try { await loadProviders(); } catch (cause) {
        setError(cause instanceof Error ? cause.message : t('error'));
      }
      setTestingProviderId(null);
    }
  };

  const cards = overview ? [
    [t('overview.users'), overview.users, Users], [t('overview.active'), overview.activeUsers, ShieldCheck],
    [t('overview.suspended'), overview.suspendedUsers, Activity], [t('overview.providers'), overview.enabledProviders, Bot],
    [t('overview.telegram'), overview.telegramConnections, KeyRound],
  ] as const : [];

  return (
    <section className="mx-auto w-full max-w-7xl px-1 py-4 sm:px-4 sm:py-6" aria-labelledby="admin-title">
      <header className="mb-6">
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">Mindoist</p>
        <h1 id="admin-title" className="m-0 text-2xl font-semibold tracking-tight sm:text-3xl">{t('title')}</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      <nav className="mb-6 flex gap-1 overflow-x-auto rounded-control border border-border bg-card p-1" aria-label={t('title')}>
        {(['overview', 'users', 'providers', 'audit'] as Tab[]).map(item => (
          <button key={item} type="button" onClick={() => setTab(item)} aria-current={tab === item ? 'page' : undefined}
            className={cn('min-h-10 whitespace-nowrap rounded-control px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', tab === item ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground')}>
            {t(`tabs.${item}`)}
          </button>
        ))}
      </nav>

      {notice && <p role="status" className="mb-4 rounded-control border border-primary/20 bg-primary/10 px-3 py-2 text-sm">{notice}</p>}
      {error && <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-control border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"><span>{error}</span><Button variant="outline" size="sm" onClick={() => void loadTab(tab)}>{t('retry')}</Button></div>}
      {loading ? <p role="status" className="py-12 text-center text-sm text-muted-foreground">{t('loading')}</p> : null}

      {!loading && tab === 'overview' && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {cards.map(([label, value, Icon]) => <article key={label} className="rounded-panel border border-border bg-card p-4 shadow-sm"><Icon className="mb-5 h-5 w-5 text-primary" aria-hidden="true" /><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p></article>)}
        </div>
      )}

      {!loading && tab === 'users' && (
        <div className="space-y-4">
          <form className="flex max-w-md gap-2" onSubmit={event => { event.preventDefault(); void loadUsers(query); }}><Input value={query} onChange={event => setQuery(event.target.value)} aria-label={t('users.search')} placeholder={t('users.search')} /><Button type="submit" variant="outline">{t('users.search')}</Button></form>
          {users.length === 0 ? <p className="rounded-panel border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{t('users.empty')}</p> : (
            <div className="grid gap-3">
              {users.map(user => <article key={user.id} className="grid gap-3 rounded-panel border border-border bg-card p-4 md:grid-cols-[minmax(0,1.5fr)_auto_auto_auto] md:items-center">
                <div className="min-w-0"><p className="truncate font-medium">{user.name}</p><p className="truncate text-sm text-muted-foreground">{user.email}</p><p className="mt-1 text-xs text-muted-foreground">{user.telegramConnection?.telegramUsername ? `@${user.telegramConnection.telegramUsername}` : t('users.notConnected')}</p></div>
                <label className="grid gap-1 text-xs text-muted-foreground">{t('users.role')}<select value={user.role} onChange={event => void updateUser(user.id, { role: event.target.value as AdminUser['role'] })} className="min-h-10 rounded-control border border-input bg-background px-2 text-sm text-foreground"><option value="USER">USER</option><option value="ADMIN">ADMIN</option></select></label>
                <label className="grid gap-1 text-xs text-muted-foreground">{t('users.status')}<select value={user.status} onChange={event => void updateUser(user.id, { status: event.target.value as AdminUser['status'] })} className="min-h-10 rounded-control border border-input bg-background px-2 text-sm text-foreground"><option value="ACTIVE">ACTIVE</option><option value="SUSPENDED">SUSPENDED</option></select></label>
                <Button variant="outline" size="sm" onClick={() => void apiFetch(`/admin/users/${user.id}/revoke-sessions`, { method: 'POST' }).catch(cause => setError(cause.message))}>{t('users.sessions')}</Button>
              </article>)}
            </div>
          )}
        </div>
      )}

      {!loading && tab === 'providers' && (
        <div className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="m-0 text-lg font-semibold">{t('providers.heading')}</h2>
              <p className="m-0 mt-1 max-w-2xl text-sm text-muted-foreground">{t('providers.intro')}</p>
            </div>
            <Button onClick={openCreate} className="min-h-11 shrink-0 self-start sm:min-h-9 sm:self-auto">
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('providers.add')}
            </Button>
          </div>

          {formOpen && (
            <form onSubmit={submitProvider} className="grid gap-5 rounded-panel border border-border bg-card p-4 sm:p-5 lg:grid-cols-2" aria-label={editing ? t('providers.edit', { label: editing.label }) : t('providers.add')}>
              <header className="flex items-start gap-3 border-b border-border pb-4 lg:col-span-2">
                <ProviderMark type={form.provider} active size="lg" />
                <div className="min-w-0 flex-1">
                  <h3 className="m-0 text-base font-semibold">{editing ? t('providers.formEditTitle', { label: editing.label }) : t('providers.formCreateTitle')}</h3>
                  <p className="m-0 mt-1 text-xs leading-5 text-muted-foreground">{t('providers.formHint')}</p>
                </div>
              </header>

              <fieldset className="lg:col-span-2">
                <legend className="mb-2 text-xs font-semibold text-muted-foreground">{t('providers.choose')}</legend>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                  {providerCatalog.map(option => {
                    const selected = form.provider === option.type;
                    return (
                      <button
                        key={option.type}
                        type="button"
                        aria-pressed={selected}
                        data-testid={`provider-option-${option.type}`}
                        onClick={() => setForm(current => ({ ...current, provider: option.type }))}
                        className={cn(
                          'relative flex min-h-20 items-center gap-3 rounded-control border px-3 py-3 text-left transition-colors',
                          'hover:border-muted-foreground/50 hover:bg-accent/60 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                          selected ? 'border-primary bg-primary/5' : 'border-border bg-background',
                        )}
                      >
                        <ProviderMark type={option.type} active={selected} />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{option.name}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">{t(`providers.catalog.${option.type}`)}</span>
                        </span>
                        {selected && <Check className="absolute right-2 top-2 h-3.5 w-3.5 text-primary" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                {t('providers.label')}
                <Input required value={form.label} placeholder={t('providers.labelPlaceholder')} onChange={event => setForm(current => ({ ...current, label: event.target.value }))} />
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                {t('providers.model')}
                <Input required value={form.model} placeholder={t('providers.modelPlaceholder')} onChange={event => setForm(current => ({ ...current, model: event.target.value }))} />
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                {t('providers.apiKey')}
                <Input aria-label={t('providers.apiKey')} type="password" required={!editing} autoComplete="new-password" value={form.apiKey} onChange={event => setForm(current => ({ ...current, apiKey: event.target.value }))} />
                <span className="font-normal leading-5">{editing ? t('providers.storedKey', { hint: editing.apiKeyHint }) : t('providers.apiKeyHint')}</span>
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                {t('providers.apiBase')}
                <Input type="url" value={form.apiBase} placeholder={t('providers.apiBasePlaceholder')} onChange={event => setForm(current => ({ ...current, apiBase: event.target.value }))} />
                <span className="font-normal leading-5">{t('providers.apiBaseHint')}</span>
              </label>

              <div className="grid gap-4 rounded-control border border-border bg-muted/30 p-3 sm:grid-cols-2 lg:col-span-2">
                <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                  {t('providers.priority')}
                  <Input type="number" min={1} max={10000} value={form.priority} onChange={event => setForm(current => ({ ...current, priority: Number(event.target.value) }))} />
                  <span className="font-normal leading-5">{t('providers.priorityHint')}</span>
                </label>
                <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                  {t('providers.timeout')}
                  <Input type="number" min={1000} max={120000} value={form.requestTimeoutMs} onChange={event => setForm(current => ({ ...current, requestTimeoutMs: Number(event.target.value) }))} />
                  <span className="font-normal leading-5">{t('providers.timeoutHint')}</span>
                </label>
              </div>

              <div className="flex flex-col gap-4 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between lg:col-span-2">
                <div className="flex items-center justify-between gap-4 sm:justify-start">
                  <Switch checked={form.enabled} onCheckedChange={enabled => setForm(current => ({ ...current, enabled }))} aria-label={t('providers.enabled')} />
                  <div>
                    <p className="m-0 text-sm font-medium">{t('providers.enabled')}</p>
                    <p className="m-0 mt-0.5 text-xs text-muted-foreground">{t('providers.enabledHint')}</p>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => setFormOpen(false)}>{t('providers.cancel')}</Button>
                  <Button type="submit" className="min-h-11 sm:min-h-9" disabled={saving}>{saving ? t('providers.saving') : t('providers.save')}</Button>
                </div>
              </div>
            </form>
          )}

          {providers.length === 0 ? (
            <div className="flex flex-col items-center rounded-panel border border-dashed border-border px-5 py-14 text-center">
              <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-control border border-border bg-card text-muted-foreground">
                <Bot className="h-6 w-6" aria-hidden="true" />
              </span>
              <h3 className="m-0 text-sm font-semibold">{t('providers.empty')}</h3>
              <p className="m-0 mt-1 max-w-md text-xs leading-5 text-muted-foreground">{t('providers.emptyHint')}</p>
              {!formOpen && <Button className="mt-4 min-h-11 sm:min-h-9" size="sm" onClick={openCreate}><Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />{t('providers.addFirst')}</Button>}
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {providers.map(provider => {
                const details = providerDetails(provider.provider);
                const health = provider.lastTestStatus === 'HEALTHY'
                  ? { Icon: CircleCheck, label: t('providers.health.healthy'), tone: 'text-primary', surface: 'border-primary/20 bg-primary/5' }
                  : provider.lastTestStatus === 'FAILED'
                    ? { Icon: TriangleAlert, label: t('providers.health.failed'), tone: 'text-destructive', surface: 'border-destructive/25 bg-destructive/5' }
                    : { Icon: CircleHelp, label: t('providers.health.untested'), tone: 'text-muted-foreground', surface: 'border-border bg-muted/20' };
                const HealthIcon = health.Icon;
                const isTesting = testingProviderId === provider.id;
                return (
                  <article key={provider.id} className="overflow-hidden rounded-panel border border-border bg-card">
                    <div className="p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <ProviderMark type={provider.provider} active={provider.enabled} size="lg" />
                          <div className="min-w-0">
                            <h3 className="m-0 truncate text-base font-semibold">{provider.label}</h3>
                            <p className="m-0 mt-0.5 text-xs text-muted-foreground">{details.name}</p>
                          </div>
                        </div>
                        <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-chip px-2 py-1 text-xs font-medium', provider.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                          <span className={cn('h-1.5 w-1.5 rounded-full', provider.enabled ? 'bg-primary' : 'bg-muted-foreground/60')} aria-hidden="true" />
                          {provider.enabled ? t('providers.enabled') : t('providers.off')}
                        </span>
                      </div>

                      <div className="mt-4 rounded-control border border-border bg-background px-3 py-2">
                        <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t('providers.model')}</p>
                        <p className="m-0 mt-1 truncate text-sm font-medium" title={provider.model}>{provider.model}</p>
                      </div>

                      <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
                        <div><dt className="text-muted-foreground">{t('providers.apiKey')}</dt><dd className="m-0 mt-1 truncate font-medium">{provider.hasApiKey ? provider.apiKeyHint : t('providers.noKey')}</dd></div>
                        <div><dt className="text-muted-foreground">{t('providers.priority')}</dt><dd className="m-0 mt-1 font-medium tabular-nums">#{provider.priority}</dd></div>
                        <div><dt className="text-muted-foreground">{t('providers.timeoutShort')}</dt><dd className="m-0 mt-1 font-medium tabular-nums">{provider.requestTimeoutMs / 1000}s</dd></div>
                      </dl>

                      <section className={cn('mt-4 rounded-control border p-3', health.surface)} aria-label={t('providers.health.title')}>
                        <div className="flex items-start gap-2.5">
                          <HealthIcon className={cn('mt-0.5 h-4 w-4 shrink-0', health.tone)} aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className={cn('m-0 text-sm font-semibold', health.tone)}>{health.label}</p>
                              {provider.lastTestedAt && <time className="text-xs text-muted-foreground" dateTime={provider.lastTestedAt}>{t('providers.health.checkedAt', { time: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(provider.lastTestedAt)) })}</time>}
                            </div>
                            {!provider.lastTestedAt && <p className="m-0 mt-1 text-xs leading-5 text-muted-foreground">{t('providers.health.untestedHint')}</p>}
                            {provider.lastTestStatus === 'FAILED' && provider.lastTestError && <p className="m-0 mt-1 text-xs leading-5 text-destructive">{provider.lastTestError}</p>}
                          </div>
                        </div>
                        <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-border/70 pt-3 text-xs sm:grid-cols-3">
                          <div><dt className="text-muted-foreground">{t('providers.health.latency')}</dt><dd className="m-0 mt-1 font-medium tabular-nums">{provider.lastTestLatencyMs === null ? '—' : `${provider.lastTestLatencyMs} ms`}</dd></div>
                          <div><dt className="text-muted-foreground">{t('providers.health.httpStatus')}</dt><dd className="m-0 mt-1 font-medium tabular-nums">{provider.lastTestHttpStatus ?? '—'}</dd></div>
                          <div className="col-span-2 sm:col-span-1"><dt className="text-muted-foreground">{t('providers.health.quota')}</dt><dd className="m-0 mt-1 font-medium">{t('providers.health.quotaUnavailable')}</dd></div>
                        </dl>
                      </section>
                    </div>

                    <div className="flex flex-wrap gap-2 border-t border-border bg-muted/20 p-3">
                      <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" aria-label={t('providers.edit', { label: provider.label })} onClick={() => openEdit(provider)}><Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />{t('providers.editAction')}</Button>
                      <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" disabled={testingProviderId !== null} aria-label={t('providers.test', { label: provider.label })} onClick={() => void testProvider(provider)}>{isTesting ? <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <TestTubeDiagonal className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />}{isTesting ? t('providers.testing') : t('providers.testAction')}</Button>
                      <Button variant="ghost" size="sm" className="ml-auto min-h-11 text-destructive hover:bg-destructive/10 hover:text-destructive sm:min-h-9" aria-label={t('providers.delete', { label: provider.label })} onClick={() => { if (window.confirm(t('providers.confirmDelete'))) void apiFetch(`/admin/providers/${provider.id}`, { method: 'DELETE' }).then(loadProviders).catch(cause => setError(cause.message)); }}><Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />{t('providers.deleteAction')}</Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!loading && tab === 'audit' && (audit.length === 0 ? <p className="rounded-panel border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{t('audit.empty')}</p> : <div className="overflow-x-auto rounded-panel border border-border"><table className="w-full min-w-[42rem] text-left text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr><th className="p-3">{t('audit.time')}</th><th className="p-3">{t('audit.actor')}</th><th className="p-3">{t('audit.action')}</th><th className="p-3">{t('audit.target')}</th></tr></thead><tbody>{audit.map(item => <tr key={item.id} className="border-t border-border"><td className="p-3">{new Date(item.createdAt).toLocaleString()}</td><td className="p-3">{item.actor?.email || 'System'}</td><td className="p-3 font-medium">{item.action}</td><td className="p-3 text-muted-foreground">{item.entityType}{item.entityId ? ` · ${item.entityId}` : ''}</td></tr>)}</tbody></table></div>)}
    </section>
  );
}
