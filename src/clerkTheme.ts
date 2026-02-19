export const clerkAppearance = {
  variables: {
    colorPrimary: '#0ea5e9',
    colorBackground: 'rgba(255, 255, 255, 0.05)',
    colorText: '#ffffff',
    colorTextSecondary: 'rgba(255, 255, 255, 0.6)',
    colorInputBackground: 'rgba(255, 255, 255, 0.05)',
    colorInputText: '#ffffff',
    borderRadius: '0.75rem',
    fontFamily: 'Inter, sans-serif',
  },
  elements: {
    card: 'bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl',
    headerTitle: 'text-white font-poppins',
    headerSubtitle: 'text-white/70',
    socialButtonsBlockButton:
      'bg-white text-gray-800 hover:bg-gray-50 rounded-xl',
    formButtonPrimary:
      'bg-gradient-to-r from-sky to-sky-light hover:opacity-90 rounded-xl',
    formFieldInput:
      'bg-white/5 border-white/10 text-white placeholder-white/20 focus:border-sky/50 rounded-lg',
    footerActionLink: 'text-sky-light hover:text-sky',
    dividerLine: 'bg-white/10',
    dividerText: 'text-white/70',
  },
};
