import { useEffect, useState, type ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { aiproxyApi } from '@/services/api/aiproxy';

export function ProtectedRoute({ children }: { children: ReactElement }) {
  const location = useLocation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const managementKey = useAuthStore((state) => state.managementKey);
  const apiBase = useAuthStore((state) => state.apiBase);
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const [checking, setChecking] = useState(false);
  const [readinessChecked, setReadinessChecked] = useState(false);
  const [readinessBlocked, setReadinessBlocked] = useState(false);

  useEffect(() => {
    const tryRestore = async () => {
      if (!isAuthenticated && managementKey && apiBase) {
        setChecking(true);
        try {
          await checkAuth();
        } finally {
          setChecking(false);
        }
      }
    };
    tryRestore();
  }, [apiBase, isAuthenticated, managementKey, checkAuth]);

  useEffect(() => {
    if (!isAuthenticated || readinessChecked) return;
    let active = true;
    aiproxyApi
      .readiness()
      .then((readiness) => {
        if (active) setReadinessBlocked(readiness.status === 'blocked');
      })
      .catch(() => {
        // Product control endpoints are optional for router-compatible deployments.
      })
      .finally(() => {
        if (active) setReadinessChecked(true);
      });
    return () => {
      active = false;
    };
  }, [isAuthenticated, readinessChecked]);

  if (checking) {
    return (
      <div className="main-content">
        <LoadingSpinner />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (readinessBlocked && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return children;
}
