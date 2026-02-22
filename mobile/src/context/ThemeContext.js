import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkColors, lightColors, sepiaColors } from '../theme/colors';

const THEME_KEY = 'app_theme';

const ThemeContext = createContext(null);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const [themeMode, setThemeMode] = useState('dark');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark' || stored === 'sepia') {
        setThemeMode(stored);
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const changeTheme = useCallback(async (mode) => {
    setThemeMode(mode);
    await AsyncStorage.setItem(THEME_KEY, mode);
  }, []);

  const colors = useMemo(() => {
    if (themeMode === 'light') return lightColors;
    if (themeMode === 'sepia') return sepiaColors;
    return darkColors;
  }, [themeMode]);

  const isDark = themeMode === 'dark';

  const value = useMemo(() => ({
    colors,
    isDark,
    themeMode,
    changeTheme,
    toggleTheme: () => changeTheme(isDark ? 'light' : 'dark'),
  }), [colors, isDark, themeMode, changeTheme]);

  if (!loaded) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export default ThemeContext;
