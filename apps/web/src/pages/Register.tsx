import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { AuthLegalLinks } from '@/components/PublicSiteChrome';

interface Props {
  onRegister: (data: { email: string; password: string; name: string }) => Promise<string | null>;
  onGoogleLogin?: () => Promise<string | null>;
  onSwitchToLogin: () => void;
}

export function Register({ onRegister, onGoogleLogin, onSwitchToLogin }: Props) {
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const fieldRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = t('error_required');
    if (!email.trim()) errors.email = t('error_required');
    if (password.length < 6) errors.password = t('error_min_password');
    if (password !== confirmPassword) errors.confirmPassword = t('error_password_mismatch');
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validate()) {
      const firstInvalid = ['name', 'email', 'password', 'confirmPassword'].find(field => !({
        name: name.trim(), email: email.trim(), password: password.length >= 6, confirmPassword: password === confirmPassword,
      })[field]);
      if (firstInvalid) requestAnimationFrame(() => fieldRefs.current[firstInvalid]?.focus());
      return;
    }
    setSubmitting(true);
    const err = await onRegister({ email, password, name });
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
          <p className="text-3xl font-bold text-foreground mb-4">{t('app_title', { defaultValue: 'Mindoist' })}</p>
          <p className="text-muted-foreground text-lg leading-relaxed">
            {t('brand_tagline', { defaultValue: 'Start your calm productivity journey today.' })}
          </p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-[26rem]">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-bold m-0">{t('register')}</h1>
            <LanguageSwitcher />
          </div>

          {error && (
            <div
              ref={errorRef}
              role="alert"
              tabIndex={-1}
              className="mb-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4" data-testid="register-form">
            <div>
              <label htmlFor="register-name" className="text-sm font-medium text-foreground block mb-1.5">
                {t('name')}
              </label>
              <Input
                id="register-name"
                ref={node => { fieldRefs.current.name = node; }}
                type="text"
                name="name"
                autoComplete="name"
                value={name}
                onChange={e => { setName(e.target.value); setFieldErrors(pe => ({ ...pe, name: '' })); }}
                required
                aria-invalid={!!fieldErrors.name}
                aria-describedby={fieldErrors.name ? 'register-name-error' : undefined}
                className="h-[44px] text-base"
                data-testid="register-name"
              />
              {fieldErrors.name && <p id="register-name-error" className="text-xs text-destructive mt-1">{fieldErrors.name}</p>}
            </div>

            <div>
              <label htmlFor="register-email" className="text-sm font-medium text-foreground block mb-1.5">
                {t('email')}
              </label>
              <Input
                id="register-email"
                ref={node => { fieldRefs.current.email = node; }}
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setFieldErrors(pe => ({ ...pe, email: '' })); }}
                required
                aria-invalid={!!fieldErrors.email}
                aria-describedby={fieldErrors.email ? 'register-email-error' : undefined}
                className="h-[44px] text-base"
                data-testid="register-email"
              />
              {fieldErrors.email && <p id="register-email-error" className="text-xs text-destructive mt-1">{fieldErrors.email}</p>}
            </div>

            <div>
              <label htmlFor="register-password" className="text-sm font-medium text-foreground block mb-1.5">
                {t('password')}
              </label>
              <Input
                id="register-password"
                ref={node => { fieldRefs.current.password = node; }}
                type="password"
                name="password"
                autoComplete="new-password"
                minLength={6}
                value={password}
                onChange={e => { setPassword(e.target.value); setFieldErrors(pe => ({ ...pe, password: '' })); }}
                required
                aria-invalid={!!fieldErrors.password}
                aria-describedby={fieldErrors.password ? 'register-password-error' : undefined}
                className="h-[44px] text-base"
                data-testid="register-password"
              />
              {fieldErrors.password && <p id="register-password-error" className="text-xs text-destructive mt-1">{fieldErrors.password}</p>}
            </div>

            <div>
              <label htmlFor="register-confirm" className="text-sm font-medium text-foreground block mb-1.5">
                {t('confirm_password')}
              </label>
              <Input
                id="register-confirm"
                ref={node => { fieldRefs.current.confirmPassword = node; }}
                type="password"
                name="confirmPassword"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={e => { setConfirmPassword(e.target.value); setFieldErrors(pe => ({ ...pe, confirmPassword: '' })); }}
                required
                aria-invalid={!!fieldErrors.confirmPassword}
                aria-describedby={fieldErrors.confirmPassword ? 'register-confirm-error' : undefined}
                className="h-[44px] text-base"
                data-testid="register-confirm"
              />
              {fieldErrors.confirmPassword && <p id="register-confirm-error" className="text-xs text-destructive mt-1">{fieldErrors.confirmPassword}</p>}
            </div>

            <Button type="submit" disabled={submitting} className="mt-2 min-h-[44px] w-full" data-testid="register-submit">
              {submitting ? t('creating_account', { defaultValue: 'Creating account...' }) : t('register')}
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
            data-testid="register-google"
          >
            {googleSubmitting ? t('connecting_google') : t('continue_with_google')}
          </Button>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {t('has_account')}{' '}
            <button
              onClick={onSwitchToLogin}
              className="text-primary font-medium underline-offset-4 hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded bg-transparent border-none p-0"
            >
              {t('login')}
            </button>
          </p>
          <AuthLegalLinks className="mt-5 border-t border-border pt-5" />
        </div>
      </div>
    </div>
  );
}
