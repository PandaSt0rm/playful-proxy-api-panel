import { useRoutes, type Location } from 'react-router-dom';
import { mainRoutes } from './mainRouteDefinitions';

export function MainRoutes({ location }: { location?: Location }) {
  return useRoutes(mainRoutes, location);
}
