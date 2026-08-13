import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CircleCheck,
  Eye,
  EyeOff,
  Inbox,
} from 'lucide-react';
import type { User } from '@mindoist/shared/types';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { AuthLegalLinks } from '../components/PublicSiteChrome';
import { cn } from '../lib/utils';

type OnboardingData = {
  name: string;
  timeZone: string;
  password?: string;
};

interface Props {
  user: User;
  onComplete: (data: OnboardingData) => Promise<string | null>;
}

function detectedTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function availableTimeZones(current: string) {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: 'timeZone') => string[];
  };
  const supported = intl.supportedValuesOf?.('timeZone') ?? [];
  return Array.from(new Set([current, 'UTC', ...supported])).sort((a, b) =>
    a.localeCompare(b),
  );
}

export function Onboarding({ user, onComplete }: Props) {
  const { t } = useTranslation('auth');
  const initialTimeZone = user.timeZone || detectedTimeZone();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(user.name);
  const [timeZone, setTimeZone] = useState(initialTimeZone);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const timeZones = useMemo(() => availableTimeZones(initialTimeZone), [initialTimeZone]);

  const steps = [
    t('onboarding.steps.profile'),
    t('onboarding.steps.intro'),
    t('onboarding.steps.password'),
  ];

  const goToStep = (nextStep: number) => {
    setError('');
    setFieldErrors({});
    setStep(nextStep);
    window.scrollTo({ top: 0 });
  };

  const continueFromProfile = (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) nextErrors.name = t('error_required');
    if (!timeZone) nextErrors.timeZone = t('error_required');
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      requestAnimationFrame(() => nameRef.current?.focus());
      return;
    }
    goToStep(1);
  };

  const validatePassword = () => {
    const nextErrors: Record<string, string> = {};
    if (!password) nextErrors.password = t('error_required');
    else if (password.length < 6) nextErrors.password = t('error_min_password');
    if (!confirmPassword) nextErrors.confirmPassword = t('error_required');
    else if (password !== confirmPassword) {
      nextErrors.confirmPassword = t('error_password_mismatch');
    }
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const finish = async (nextPassword?: string) => {
    setError('');
    setSubmitting(true);
    const result = await onComplete({
      name: name.trim(),
      timeZone,
      ...(nextPassword ? { password: nextPassword } : {}),
    });
    if (result) {
      setError(t('onboarding.error'));
      setSubmitting(false);
      requestAnimationFrame(() => errorRef.current?.focus());
    }
  };

  const createPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validatePassword()) return;
    await finish(password);
  };

  return (
    <main className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[minmax(18rem,0.8fr)_minmax(32rem,1.2fr)]">
      <aside className="border-b border-border bg-sidebar px-6 py-6 lg:flex lg:min-h-screen lg:flex-col lg:justify-between lg:border-b-0 lg:border-r lg:px-10 lg:py-10">
        <div>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img
                src="/favicon.svg"
                alt=""
                aria-hidden="true"
                className="h-10 w-10 rounded-panel shadow-sm"
              />
              <span className="text-lg font-semibold">Mindoist</span>
            </div>
            <div className="lg:hidden">
              <LanguageSwitcher />
            </div>
          </div>

          <div className="mt-8 hidden max-w-sm lg:block">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              {t('onboarding.eyebrow')}
            </p>
            <p className="mt-3 text-3xl font-semibold leading-tight">
              {t('onboarding.sideTitle')}
            </p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {t('onboarding.sideDescription')}
            </p>
          </div>
        </div>

        <nav className="mt-6 lg:mt-12" aria-label={t('onboarding.progressLabel')}>
          <ol className="grid grid-cols-3 gap-2 lg:grid-cols-1 lg:gap-3">
            {steps.map((label, index) => {
              const complete = index < step;
              const current = index === step;
              return (
                <li
                  key={label}
                  aria-current={current ? 'step' : undefined}
                  className={cn(
                    'flex min-w-0 items-center gap-3 rounded-control px-2 py-2 text-sm transition-colors lg:px-3',
                    current && 'bg-sidebar-accent text-foreground',
                    !current && 'text-muted-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums',
                      complete && 'border-primary bg-primary text-primary-foreground',
                      current && 'border-primary text-primary',
                      !complete && !current && 'border-border',
                    )}
                    aria-hidden="true"
                  >
                    {complete ? <Check size={16} strokeWidth={2.2} /> : index + 1}
                  </span>
                  <span className="hidden truncate font-medium sm:block">{label}</span>
                </li>
              );
            })}
          </ol>
        </nav>

        <p className="mt-6 hidden text-xs leading-5 text-muted-foreground lg:block">
          {t('onboarding.privateNote')}
        </p>
      </aside>

      <section className="flex min-h-[calc(100vh-9rem)] items-center justify-center px-5 py-10 sm:px-8 lg:min-h-screen lg:px-12">
        <div className="w-full max-w-[34rem]">
          <div className="mb-8 hidden justify-end lg:flex">
            <LanguageSwitcher />
          </div>

          {error && (
            <div
              ref={errorRef}
              role="alert"
              tabIndex={-1}
              className="mb-5 rounded-control bg-destructive/10 px-4 py-3 text-sm text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {error}
            </div>
          )}

          {step === 0 && (
            <form noValidate onSubmit={continueFromProfile}>
              <p className="text-sm font-medium text-primary">{t('onboarding.stepCount', { current: 1 })}</p>
              <h1 id="onboarding-title" className="mt-2 text-3xl font-semibold tracking-tight">
                {t('onboarding.profile.title')}
              </h1>
              <p className="mt-3 text-base leading-6 text-muted-foreground">
                {t('onboarding.profile.description')}
              </p>

              <div className="mt-8 space-y-5">
                <div>
                  <label htmlFor="onboarding-name" className="mb-1.5 block text-sm font-medium">
                    {t('name')}
                  </label>
                  <Input
                    ref={nameRef}
                    id="onboarding-name"
                    name="name"
                    autoComplete="name"
                    value={name}
                    onChange={event => {
                      setName(event.target.value);
                      setFieldErrors(current => ({ ...current, name: '' }));
                    }}
                    aria-invalid={Boolean(fieldErrors.name)}
                    aria-describedby={fieldErrors.name ? 'onboarding-name-error' : undefined}
                    className="h-11 text-base"
                    required
                    autoFocus
                  />
                  {fieldErrors.name && (
                    <p id="onboarding-name-error" className="mt-1 text-xs text-destructive">
                      {fieldErrors.name}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="onboarding-timezone" className="mb-1.5 block text-sm font-medium">
                    {t('onboarding.profile.timeZone')}
                  </label>
                  <select
                    id="onboarding-timezone"
                    value={timeZone}
                    onChange={event => {
                      setTimeZone(event.target.value);
                      setFieldErrors(current => ({ ...current, timeZone: '' }));
                    }}
                    aria-invalid={Boolean(fieldErrors.timeZone)}
                    aria-describedby="onboarding-timezone-help"
                    className="h-11 w-full cursor-pointer rounded-control border border-input bg-background px-3 text-base transition-colors hover:border-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    required
                  >
                    {timeZones.map(zone => (
                      <option key={zone} value={zone}>
                        {zone.replaceAll('_', ' ')}
                      </option>
                    ))}
                  </select>
                  <p id="onboarding-timezone-help" className="mt-1.5 text-xs leading-5 text-muted-foreground">
                    {t('onboarding.profile.timeZoneHelp')}
                  </p>
                </div>
              </div>

              <Button type="submit" className="mt-8 min-h-11 w-full sm:w-auto sm:min-w-40">
                {t('onboarding.continue')}
                <ArrowRight size={17} aria-hidden="true" />
              </Button>
            </form>
          )}

          {step === 1 && (
            <div>
              <p className="text-sm font-medium text-primary">{t('onboarding.stepCount', { current: 2 })}</p>
              <h1 id="onboarding-title" className="mt-2 text-3xl font-semibold tracking-tight">
                {t('onboarding.intro.title')}
              </h1>
              <p className="mt-3 text-base leading-6 text-muted-foreground">
                {t('onboarding.intro.description')}
              </p>

              <div className="mt-8 divide-y divide-border rounded-panel border border-border bg-card">
                {[
                  { icon: Inbox, title: t('onboarding.intro.captureTitle'), body: t('onboarding.intro.captureBody') },
                  { icon: CalendarDays, title: t('onboarding.intro.planTitle'), body: t('onboarding.intro.planBody') },
                  { icon: CircleCheck, title: t('onboarding.intro.focusTitle'), body: t('onboarding.intro.focusBody') },
                ].map(item => (
                  <div key={item.title} className="flex gap-4 px-4 py-4 sm:px-5">
                    <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary">
                      <item.icon size={20} aria-hidden="true" />
                    </span>
                    <div>
                      <h2 className="text-base font-semibold">{item.title}</h2>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.body}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <Button type="button" variant="ghost" onClick={() => goToStep(0)} className="min-h-11">
                  <ArrowLeft size={17} aria-hidden="true" />
                  {t('onboarding.back')}
                </Button>
                <Button type="button" onClick={() => goToStep(2)} className="min-h-11 sm:min-w-40">
                  {t('onboarding.continue')}
                  <ArrowRight size={17} aria-hidden="true" />
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <form noValidate onSubmit={createPassword}>
              <p className="text-sm font-medium text-primary">{t('onboarding.stepCount', { current: 3 })}</p>
              <h1 id="onboarding-title" className="mt-2 text-3xl font-semibold tracking-tight">
                {t('onboarding.password.title')}
              </h1>
              <p className="mt-3 text-base leading-6 text-muted-foreground">
                {t('onboarding.password.description')}
              </p>

              <div className="mt-8 space-y-5">
                <div>
                  <label htmlFor="onboarding-password" className="mb-1.5 block text-sm font-medium">
                    {t('onboarding.password.newPassword')}
                  </label>
                  <div className="relative">
                    <Input
                      id="onboarding-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={password}
                      onChange={event => {
                        setPassword(event.target.value);
                        setFieldErrors(current => ({ ...current, password: '' }));
                      }}
                      onBlur={() => {
                        if (password && password.length < 6) {
                          setFieldErrors(current => ({ ...current, password: t('error_min_password') }));
                        }
                      }}
                      aria-invalid={Boolean(fieldErrors.password)}
                      aria-describedby="onboarding-password-help"
                      className="h-11 pr-12 text-base"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(current => !current)}
                      className="absolute right-0 top-0 flex h-11 w-11 cursor-pointer items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={showPassword ? t('onboarding.password.hide') : t('onboarding.password.show')}
                    >
                      {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                    </button>
                  </div>
                  <p
                    id="onboarding-password-help"
                    className={cn('mt-1 text-xs', fieldErrors.password ? 'text-destructive' : 'text-muted-foreground')}
                  >
                    {fieldErrors.password || t('onboarding.password.help')}
                  </p>
                </div>

                <div>
                  <label htmlFor="onboarding-confirm-password" className="mb-1.5 block text-sm font-medium">
                    {t('confirm_password')}
                  </label>
                  <Input
                    id="onboarding-confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={event => {
                      setConfirmPassword(event.target.value);
                      setFieldErrors(current => ({ ...current, confirmPassword: '' }));
                    }}
                    onBlur={() => {
                      if (confirmPassword && password !== confirmPassword) {
                        setFieldErrors(current => ({
                          ...current,
                          confirmPassword: t('error_password_mismatch'),
                        }));
                      }
                    }}
                    aria-invalid={Boolean(fieldErrors.confirmPassword)}
                    aria-describedby={fieldErrors.confirmPassword ? 'onboarding-confirm-error' : undefined}
                    className="h-11 text-base"
                  />
                  {fieldErrors.confirmPassword && (
                    <p id="onboarding-confirm-error" className="mt-1 text-xs text-destructive">
                      {fieldErrors.confirmPassword}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => goToStep(1)}
                  disabled={submitting}
                  className="min-h-11"
                >
                  <ArrowLeft size={17} aria-hidden="true" />
                  {t('onboarding.back')}
                </Button>
                <div className="flex flex-col-reverse gap-3 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void finish()}
                    disabled={submitting}
                    className="min-h-11"
                  >
                    {submitting ? t('onboarding.finishing') : t('onboarding.password.skip')}
                  </Button>
                  <Button type="submit" disabled={submitting} className="min-h-11">
                    {submitting ? t('onboarding.finishing') : t('onboarding.password.create')}
                  </Button>
                </div>
              </div>
            </form>
          )}
          <AuthLegalLinks className="mt-10 border-t border-border pt-5" />
        </div>
      </section>
    </main>
  );
}
