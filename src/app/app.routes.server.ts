import { RenderMode, ServerRoute } from '@angular/ssr';

// The dashboard is a signed-in staff tool backed by live Firestore data, so
// it is rendered in the browser only (no server-side or build-time render).
export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Client
  }
];
