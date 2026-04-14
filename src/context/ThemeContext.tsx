import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type Theme = 'light' | 'dark';
export type ThemePreference = Theme | 'system';

type ThemeContextValue = {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

const THEME_STORAGE_KEY = 'aerogap-theme';

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getStoredPreference(): ThemePreference {
  if (typeof window === 'undefined') {
    return 'system';
  }

  const savedPreference = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (savedPreference === 'light' || savedPreference === 'dark' || savedPreference === 'system') {
    return savedPreference;
  }

  return 'system';
}

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'dark';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyThemeToDocument(theme: Theme) {
  if (typeof document === 'undefined') return;

  const { documentElement, body } = document;
  documentElement.classList.toggle('theme-dark', theme === 'dark');
  documentElement.classList.toggle('theme-light', theme === 'light');
  documentElement.dataset.theme = theme;
  documentElement.style.colorScheme = theme;

  body.classList.toggle('theme-dark', theme === 'dark');
  body.classList.toggle('theme-light', theme === 'light');
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => getStoredPreference());
  const [systemTheme, setSystemTheme] = useState<Theme>(() => getSystemTheme());

  const theme = preference === 'system' ? systemTheme : preference;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      setSystemTheme(mediaQuery.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  }, [preference]);

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    setPreferenceState(nextPreference);
  }, []);

  const setTheme = useCallback((nextTheme: Theme) => {
    setPreferenceState(nextTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setPreferenceState((currentPreference) => {
      const resolvedTheme = currentPreference === 'system' ? systemTheme : currentPreference;
      return resolvedTheme === 'dark' ? 'light' : 'dark';
    });
  }, [systemTheme]);

  const value = useMemo(
    () => ({
      theme,
      preference,
      setPreference,
      setTheme,
      toggleTheme,
    }),
    [theme, preference, setPreference, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }

  return context;
}
