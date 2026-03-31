import type { Theme } from './context/ThemeContext';

export function getClerkAppearance(theme: Theme) {
  const isDark = theme === 'dark';

  return {
    variables: {
      colorPrimary: '#0ea5e9',
      colorBackground: isDark ? 'rgba(255, 255, 255, 0.05)' : '#ffffff',
      colorText: isDark ? '#ffffff' : '#0f172a',
      colorTextSecondary: isDark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(30, 41, 59, 0.72)',
      colorInputBackground: isDark ? 'rgba(255, 255, 255, 0.05)' : '#f8fafc',
      colorInputText: isDark ? '#ffffff' : '#0f172a',
      borderRadius: '0.75rem',
      fontFamily: 'Inter, sans-serif',
    },
    elements: {
      card: isDark
        ? 'bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl'
        : 'bg-white border border-slate-200 shadow-xl',
      headerTitle: isDark ? 'text-white font-poppins' : 'text-gray-900 font-poppins',
      headerSubtitle: isDark ? 'text-white/70' : 'text-gray-500',
      socialButtonsBlockButton:
        'bg-white text-gray-800 hover:bg-gray-50 rounded-xl',
      formButtonPrimary:
        'bg-gradient-to-r from-sky to-sky-light hover:opacity-90 rounded-xl',
      formFieldInput: isDark
        ? 'bg-white/5 border-white/10 text-white placeholder-white/20 focus:border-sky/50 rounded-lg'
        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-sky/50 rounded-lg',
      footerActionLink: 'text-sky-light hover:text-sky',
      dividerLine: isDark ? 'bg-white/10' : 'bg-gray-200',
      dividerText: isDark ? 'text-white/70' : 'text-gray-500',
    },
  };
}
