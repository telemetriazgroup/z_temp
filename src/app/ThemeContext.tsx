import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ThemeProvider as NextThemesProvider, useTheme as useNextTheme } from 'next-themes';

const STORAGE_KEY = 'ztrack_theme';

export type AppTheme = 'light' | 'dark';

type ThemeContextValue = {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function ThemeController({ children }: { children: React.ReactNode }) {
  const { theme, setTheme, resolvedTheme } = useNextTheme();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const current: AppTheme =
      (theme === 'dark' || theme === 'light'
        ? theme
        : resolvedTheme === 'dark'
          ? 'dark'
          : 'light');
    return {
      theme: current,
      setTheme: (next) => setTheme(next),
      toggleTheme: () => setTheme(current === 'dark' ? 'light' : 'dark'),
      ready,
    };
  }, [theme, resolvedTheme, setTheme, ready]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      storageKey={STORAGE_KEY}
      disableTransitionOnChange
    >
      <ThemeController>{children}</ThemeController>
    </NextThemesProvider>
  );
}

export function useAppTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useAppTheme must be used within ThemeProvider');
  }
  return ctx;
}
