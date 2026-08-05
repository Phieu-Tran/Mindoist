import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminPage } from './AdminPage';
import { apiFetch } from '@/lib/api-client';

vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn() }));

const mockedApiFetch = vi.mocked(apiFetch);

describe('AdminPage', () => {
  beforeEach(() => {
    mockedApiFetch.mockImplementation(async path => {
      if (path === '/admin/overview') return { users: 2, activeUsers: 2, suspendedUsers: 0, providers: 0, enabledProviders: 0, telegramConnections: 1 } as never;
      if (path === '/admin/providers') return [] as never;
      if (path.startsWith('/admin/users')) return { items: [], total: 0 } as never;
      if (path === '/admin/audit') return [] as never;
      return {} as never;
    });
  });

  it('renders the admin overview and provider management sections', async () => {
    render(<AdminPage />);
    expect(await screen.findByText('Admin Console')).toBeInTheDocument();
    expect((await screen.findAllByText('2')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'AI Providers' }));
    expect(await screen.findByRole('button', { name: 'Add provider' })).toBeInTheDocument();
  });

  it('never refills a stored provider API key while editing', async () => {
    mockedApiFetch.mockImplementation(async path => {
      if (path === '/admin/overview') return { users: 1, activeUsers: 1, suspendedUsers: 0, providers: 1, enabledProviders: 1, telegramConnections: 0 } as never;
      if (path === '/admin/providers') return [{ id: 'p1', label: 'Gemini', provider: 'GEMINI', model: 'gemini-2.5-flash', apiBase: null, enabled: true, priority: 10, requestTimeoutMs: 30000, hasApiKey: true, apiKeyHint: '••••1234', createdAt: '', updatedAt: '' }] as never;
      return [] as never;
    });
    render(<AdminPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'AI Providers' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Gemini' }));
    await waitFor(() => expect(screen.getByLabelText('API key')).toHaveValue(''));
    expect(screen.getByText('Stored key: ••••1234. Leave blank to keep it.')).toBeInTheDocument();
  });

  it('uses accessible visual choices for each provider type', async () => {
    render(<AdminPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'AI Providers' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add provider' }));

    const gemini = screen.getByTestId('provider-option-GEMINI');
    const openRouter = screen.getByTestId('provider-option-OPENROUTER');
    expect(gemini).toHaveAttribute('aria-pressed', 'true');
    expect(openRouter).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(openRouter);
    expect(gemini).toHaveAttribute('aria-pressed', 'false');
    expect(openRouter).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Many models')).toBeInTheDocument();
  });

  it('shows and refreshes a persisted provider health result', async () => {
    let tested = false;
    mockedApiFetch.mockImplementation(async path => {
      if (path === '/admin/overview') return { users: 1, activeUsers: 1, suspendedUsers: 0, providers: 1, enabledProviders: 1, telegramConnections: 0 } as never;
      if (path === '/admin/providers/p1/test') { tested = true; return { ok: true, status: 200, latencyMs: 12 } as never; }
      if (path === '/admin/providers') return [{
        id: 'p1', label: 'Gemini', provider: 'GEMINI', model: 'gemini-3.5-flash-lite', apiBase: null,
        enabled: true, priority: 10, requestTimeoutMs: 30000, hasApiKey: true, apiKeyHint: '••••1234',
        lastTestStatus: tested ? 'HEALTHY' : null, lastTestedAt: tested ? '2026-08-03T04:00:00.000Z' : null,
        lastTestLatencyMs: tested ? 12 : null, lastTestHttpStatus: tested ? 200 : null, lastTestError: null,
        createdAt: '', updatedAt: '',
      }] as never;
      return [] as never;
    });

    render(<AdminPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'AI Providers' }));
    expect(await screen.findByText('Not tested')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Test Gemini' }));

    expect(await screen.findByText('Working')).toBeInTheDocument();
    expect(screen.getByText('12 ms')).toBeInTheDocument();
    expect(screen.getByText('Not reported')).toBeInTheDocument();
    expect(mockedApiFetch).toHaveBeenCalledWith('/admin/providers/p1/test', { method: 'POST' });
  });
});
