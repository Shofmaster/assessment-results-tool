import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useIsFeatureEnabled, useIsQualityCommandHubAvailable } from '../hooks/useConvexData';
import type { FeatureKey } from '../config/featureKeys';

type Props =
  | { mode: 'qualityHub'; children: ReactNode }
  | { mode: 'feature'; feature: FeatureKey; children: ReactNode };

/**
 * Redirects to home when a feature is disabled for the current user (allowlist semantics).
 * Matches sidebar / splash gating; Convex mutations should still enforce for defense in depth.
 */
export default function FeatureRouteGuard(props: Props) {
  if (props.mode === 'qualityHub') {
    const ok = useIsQualityCommandHubAvailable();
    if (!ok) return <Navigate to="/splash" replace />;
    return <>{props.children}</>;
  }
  const ok = useIsFeatureEnabled(props.feature);
  if (!ok) return <Navigate to="/splash" replace />;
  return <>{props.children}</>;
}
