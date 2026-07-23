import { Outlet, createHashRouter, type RouteObject } from 'react-router-dom';
import { LoginPage } from '@/pages/LoginPage';
import { NotificationContainer } from '@/components/common/NotificationContainer';
import { ConfirmationModal } from '@/components/common/ConfirmationModal';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/router/ProtectedRoute';

export const APP_ROUTES: RouteObject[] = [
  {
    element: (
      <>
        <NotificationContainer />
        <ConfirmationModal />
        <Outlet />
      </>
    ),
    children: [
      { path: '/login', element: <LoginPage /> },
      {
        path: '/*',
        element: (
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        ),
      },
    ],
  },
];

export function createConsoleRouter() {
  return createHashRouter(APP_ROUTES);
}
