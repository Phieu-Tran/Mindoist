import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { AuthLegalLinks } from '@/components/PublicSiteChrome';

interface Props {
  onLogin: (data: { email: string; password: string }) => Promise<string | null>;
  onGoogleLogin?: () => Promise<string | null>;
  onSwitchToRegister: () => void;
}

export function Login({ onLogin, onGoogleLogin, onSwitchToRegister }: Props) {
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const fieldRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const nextErrors: Record<string, string> = {};
    if (!email.trim()) nextErrors.email = t('error_required');
    else if (!/^\S+@\S+\.\S+$/.test(email)) nextErrors.email = t('error_invalid_email');
    if (!password) nextErrors.password = t('error_required');
    setFieldErrors(nextErrors);
    const firstInvalid = ['email', 'password'].find(field => nextErrors[field]);
    if (firstInvalid) {
      requestAnimationFrame(() => fieldRefs.current[firstInvalid]?.focus());
      return;
    }
    setSubmitting(true);
    const err = await onLogin({ email, password });
    if (err) setError(err);
    setSubmitting(false);
  };

  const handleGoogleLogin = async () => {
    if (!onGoogleLogin) return;
    setError('');
    setGoogleSubmitting(true);
    const err = await onGoogleLogin();
    if (err) {
      setError(err);
      setGoogleSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Brand panel - desktop only */}
      <div className="hidden lg:flex lg:w-1/2 bg-sidebar items-center justify-center p-12">
        <div className="max-w-md">
          <img src="/favicon.svg" alt="" className="mb-6 h-14 w-14 rounded-panel shadow-lg" aria-hidden="true" />
          <p className="text-3xl font-bold text-foreground mb-4">{t('app_title', { defaultValue: 'Mindoist' })}</p>
          <p className="text-muted-foreground text-lg leading-relaxed">
            {t('brand_tagline', { defaultValue: 'Calm productivity. Capture fast, focus on what matters.' })}
          </p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-[26rem]">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-bold m-0">{t('login')}</h1>
            <LanguageSwitcher />
          </div>

          {error && (
            <div
              ref={errorRef}
              id="login-error"
              role="alert"
              tabIndex={-1}
              className="mb-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {error}
            </div>
          )}

          <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4" data-testid="login-form">
            <div>
              <label htmlFor="login-email" className="text-sm font-medium text-foreground block mb-1.5">
                {t('email')}
              </label>
              <Input
                id="login-email"
                ref={node => { fieldRefs.current.email = node; }}
                type="email"
                name="email"
                autoComplete="email"
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? 'login-email-error' : error ? 'login-error' : undefined}
                value={email}
                onChange={e => { setEmail(e.target.value); setFieldErrors(current => ({ ...current, email: '' })); }}
                required
                data-testid="login-email"
                className="h-[44px] text-base"
              />
              {fieldErrors.email && <p id="login-email-error" className="mt-1 text-xs text-destructive">{fieldErrors.email}</p>}
            </div>

            <div>
              <label htmlFor="login-password" className="text-sm font-medium text-foreground block mb-1.5">
                {t('password')}
              </label>
              <Input
                id="login-password"
                ref={node => { fieldRefs.current.password = node; }}
                type="password"
                name="password"
                autoComplete="current-password"
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? 'login-password-error' : error ? 'login-error' : undefined}
                value={password}
                onChange={e => { setPassword(e.target.value); setFieldErrors(current => ({ ...current, password: '' })); }}
                required
                data-testid="login-password"
                className="h-[44px] text-base"
              />
              {fieldErrors.password && <p id="login-password-error" className="mt-1 text-xs text-destructive">{fieldErrors.password}</p>}
            </div>

            <Button type="submit" disabled={submitting} className="mt-2 min-h-[44px] w-full" data-testid="login-submit">
              {submitting ? t('logging_in', { defaultValue: 'Logging in...' }) : t('login')}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            <span>{t('or')}</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={googleSubmitting}
            onClick={handleGoogleLogin}
            className="min-h-[44px] w-full"
            data-testid="login-google"
          >
            {googleSubmitting ? t('connecting_google') : t('continue_with_google')}
          </Button>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {t('no_account')}{' '}
            <button
              onClick={onSwitchToRegister}
              className="text-primary font-medium underline-offset-4 hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded bg-transparent border-none p-0"
            >
              {t('register')}
            </button>
          </p>
          <AuthLegalLinks className="mt-5 border-t border-border pt-5" />
        </div>
      </div>
    </div>
  );
}
