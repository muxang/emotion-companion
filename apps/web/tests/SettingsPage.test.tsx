import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../src/api/settings.js', () => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
}));

import { SettingsPage } from '../src/pages/Settings/SettingsPage.js';
import { getSettings, updateSettings } from '../src/api/settings.js';
import { useAuthStore } from '../src/stores/authStore.js';
import { useSettingsStore } from '../src/stores/settingsStore.js';

const mockedGet = vi.mocked(getSettings);
const mockedUpdate = vi.mocked(updateSettings);

function renderPage(): void {
  render(
    <MemoryRouter initialEntries={['/settings']}>
      <SettingsPage />
    </MemoryRouter>
  );
}

describe('<SettingsPage />', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedUpdate.mockReset();
    useAuthStore.setState({
      status: 'authed',
      userId: 'u-1',
      anonymousId: 'anon-1',
      error: null,
    });
    useSettingsStore.setState({
      memoryEnabled: true,
      tonePreference: 'warm',
      status: 'idle',
      error: null,
    });
  });

  it('挂载后拉取设置并渲染开关与语气', async () => {
    mockedGet.mockResolvedValueOnce({
      memory_enabled: true,
      tone_preference: 'rational',
    });

    renderPage();

    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalledTimes(1);
    });

    const sw = screen.getByRole('switch', { name: '长期记忆开关' });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(
      screen.getByTestId('tone-rational').getAttribute('aria-pressed')
    ).toBe('true');
  });

  it('切换记忆开关时调用 updateSettings 并显示关闭提示', async () => {
    mockedGet.mockResolvedValueOnce({
      memory_enabled: true,
      tone_preference: 'warm',
    });
    mockedUpdate.mockResolvedValueOnce({
      memory_enabled: false,
      tone_preference: 'warm',
    });

    renderPage();

    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalled();
    });

    const sw = screen.getByRole('switch', { name: '长期记忆开关' });
    fireEvent.click(sw);

    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalledWith({ memory_enabled: false });
    });

    await waitFor(() => {
      expect(screen.getByTestId('memory-off-hint')).toBeInTheDocument();
    });
    expect(
      screen.getByText('关闭后新对话不再记录长期记忆')
    ).toBeInTheDocument();
  });

  it('选择语气偏好时调用 updateSettings', async () => {
    mockedGet.mockResolvedValueOnce({
      memory_enabled: true,
      tone_preference: 'warm',
    });
    mockedUpdate.mockResolvedValueOnce({
      memory_enabled: true,
      tone_preference: 'direct',
    });

    renderPage();

    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByTestId('tone-direct'));

    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalledWith({ tone_preference: 'direct' });
    });
    await waitFor(() => {
      expect(
        screen.getByTestId('tone-direct').getAttribute('aria-pressed')
      ).toBe('true');
    });
  });

  it('点击当前已选语气不会触发更新', async () => {
    mockedGet.mockResolvedValueOnce({
      memory_enabled: true,
      tone_preference: 'warm',
    });

    renderPage();

    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByTestId('tone-warm'));
    expect(mockedUpdate).not.toHaveBeenCalled();
  });
});
