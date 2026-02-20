# Design Audit: AeroGap (aviationassessment.vercel.app)

**Audit date:** February 2025  
**Method:** Playwright automated checks + codebase review  
**Scope:** Sign-in experience, app shell, typography, color, layout, accessibility, and UX patterns.

---

## Executive summary

AeroGap uses a consistent navy/sky/accent-gold palette, Inter + Poppins, and glass-style cards. The audit found solid foundations (contrast notes, skip link, reduced motion) and several opportunities to improve visual hierarchy, sign-in branding, empty states, and consistency so the product feels more polished and on-brand.

---

## 1. What’s working well

- **Color system:** Tailwind theme with `navy`, `sky`, and `accent-gold` is coherent and appropriate for aviation/professional use.
- **Typography:** Inter (body) and Poppins (display) are loaded from Google Fonts; base font size and line height are reasonable.
- **Accessibility:** Skip link to `#main-content`, `focus-visible` rings, and `prefers-reduced-motion` are implemented.
- **Responsive:** Layout and sidebar adapt (e.g. mobile header with menu); viewport and `#root` behave as expected in Playwright at desktop and mobile.
- **Dark theme:** Single dark theme avoids mode-switch complexity and fits the product.

---

## 2. Recommendations (designer perspective)

### 2.1 Sign-in / first impression

- **Add skip link on sign-in view**  
  The skip link lives in the post-auth app shell. The sign-in view (AuthGate) is a full-screen experience with no `main` or skip link. Add a “Skip to sign-in form” (or similar) link on the auth screen so keyboard and screen-reader users can bypass the logo block and go straight to the form.

- **Strengthen sign-in branding**  
  The sign-in screen has a small icon, “AeroGap”, and “Aviation Quality Company”. Consider:
  - A clearer tagline (e.g. “Compliance assessment for aviation”).
  - Slightly larger logo/icon and more intentional spacing so the first fold feels like a clear product moment, not just a form wrapper.

- **Version line**  
  “v2.0.0 · Powered by Claude” is good for transparency. Keep it subtle (e.g. `text-white/50`) so it doesn’t compete with primary actions.

### 2.2 Visual hierarchy and density

- **Page titles**  
  Dashboard uses `text-3xl sm:text-4xl` and gradient text (`from-white to-sky-lighter`). Ensure every main view has a single clear `<h1>` and that other headings follow a logical order (h2 → h3) for both clarity and a11y.

- **Card hierarchy**  
  GlassCard is used for stats, quick actions, and content. Differentiate “primary” cards (e.g. Quick Actions, Latest Analysis) from “secondary” (e.g. stat blocks) via:
  - Slightly stronger border or background on primary cards, or
  - One level of elevation (e.g. a bit more blur or a soft inner highlight) so the eye lands on the right blocks first.

- **Whitespace**  
  Some views pack many actions into one card. Consider splitting “Import / Export / Manage Library” into two rows or giving the primary CTA (e.g. “Import Assessment”) more breathing room so it’s the obvious first action.

### 2.3 Color and contrast

- **Body text**  
  Comments in `index.css` correctly call out that `text-white/70` (and up) is needed for WCAG AA on navy. Audit any `text-white/50`, `text-white/60` used for body or long copy and bump to at least `text-white/70` where readability matters.

- **Accent gold**  
  `accent-gold` is defined but underused. Consider using it for:
  - Key metrics (e.g. compliance score),
  - One primary CTA on the dashboard, or
  - “Premium” or “highlight” badges so the palette feels more intentional.

- **Disabled and loading**  
  Buttons use `opacity-50` when disabled. Ensure disabled state is also clear from color (e.g. slightly muted) and that loading spinners have enough contrast on navy.

### 2.4 Components and consistency

- **Buttons**  
  Dashboard “Quick Actions” use raw `<button>` with gradient/glass classes, while other flows use the shared `<Button>` component. Prefer the shared Button (with an `icon` prop) everywhere so size, focus ring, and disabled/loading behavior stay consistent.

- **Icons**  
  react-icons (Fi*) are used throughout. Ensure icon size is consistent (e.g. `text-xl` for nav, `text-2xl` for feature icons) and that all icon-only buttons have `aria-label`.

- **Empty states**  
  “Select a Project” uses an emoji (📁) and a GlassCard. Consider a simple illustration or a more refined icon set for empty states (Library, Revisions, etc.) so they feel part of the same system and not ad-hoc.

### 2.5 Motion and feedback

- **Reduced motion**  
  `prefers-reduced-motion` is already respected. Avoid adding large motion elsewhere; if you do, keep it optional or behind a preference.

- **Micro-interactions**  
  Buttons and cards already use `transition-all` / `hover:scale-105`. Ensure:
  - Focus states are never removed or overridden by hover.
  - No layout shift when toggling loading state (e.g. use min-height or skeleton for buttons).

### 2.6 Responsive and touch

- **Mobile nav**  
  Sidebar becomes a drawer with a close button. Confirm the drawer is easy to close (tap overlay, Escape) and that the first focusable element inside is the project switcher or first nav item so keyboard flow is logical.

- **Touch targets**  
  Ensure primary actions and nav items meet ~44×44px (or equivalent) on mobile so they’re comfortable to tap.

### 2.7 Copy and clarity

- **Sidebar**  
  “Audit Sim” is abbreviated; “Audit Simulation” (or a tooltip) would help new users. Shortcuts (Ctrl+1–7) are surfaced in the nav—good.

- **Dashboard**  
  “Comprehensive aviation quality assessment analysis powered by Claude AI” is accurate but long. A shorter subline (e.g. “Assess compliance against Part 145, IS-BAO, EASA, AS9100”) could be more scannable.

---

## 3. Playwright audit results (summary)

Automated checks were run against **https://aviationassessment.vercel.app** (sign-in view and initial shell). All 10 tests passed:

| Check | Result |
|-------|--------|
| Title contains “AeroGap” | Pass |
| Typography (Inter, base size) | Pass |
| Color/theme (dark, rgb background) | Pass |
| Desktop layout (#root / main) | Pass |
| Mobile layout (#root / header) | Pass |
| Skip link / a11y (when in app shell) | Pass |
| Heading hierarchy | Pass |
| Screenshot desktop | Pass |
| Screenshot mobile | Pass |
| Interactive elements present | Pass |

Screenshots are written to `test-results/design-audit-desktop.png` and `test-results/design-audit-mobile.png` when the design audit spec is run.

---

## 4. How to re-run the audit

```bash
npx playwright test tests/design-audit.spec.ts --project=chromium
```

To run against the live site, do **not** rely on the dev server: the spec uses `page.goto('https://aviationassessment.vercel.app')` directly. To audit the authenticated app (Dashboard, Library, etc.), run the same spec with an authenticated context (e.g. storage state from a prior login).

---

## 5. Priority order (suggested)

1. **High:** Use shared `Button` for Quick Actions; add skip link (or equivalent) on sign-in view.
2. **High:** Audit body text contrast (white/50, white/60 → white/70 where needed).
3. **Medium:** Differentiate primary vs secondary cards; introduce accent-gold in 1–2 key places.
4. **Medium:** Unify empty states (icon/illustration + copy).
5. **Low:** Expand “Audit Sim” label; shorten dashboard subline; refine sign-in branding.

This audit reflects the current codebase and the live sign-in experience. Implementing the high-priority items will improve accessibility and consistency; the medium/low items will sharpen hierarchy and brand presence.

---

## Changelog (plan executed)

- **Sign-in (AuthGate):** Skip link added (“Skip to sign-in form” → `#clerk-sign-in`); larger logo (w-20 h-20); tagline “Compliance assessment for Part 145, IS-BAO, EASA & AS9100”; version line set to `text-white/50`; loading copy set to `text-white/70`.
- **Dashboard:** Quick Actions use shared `Button` (primary for Import, secondary for Export and Manage Library); primary cards use `border border-white/15`; Latest Analysis compliance score uses `text-accent-gold`; dashboard subline shortened to “Assess compliance against Part 145, IS-BAO, EASA & AS9100”; body/description text set to `text-white/70` where applicable.
- **Sidebar & GuidedAudit:** “Audit Sim” renamed to “Audit Simulation” in nav and related copy.
- **Contrast:** Page intro and description text set to `text-white/70` in Dashboard, LibraryManager, ProjectManager, Settings, ErrorBoundary, MigrationBanner, and AuthGate loading states.
