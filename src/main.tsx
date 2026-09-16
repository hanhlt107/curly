import React, { Suspense, lazy, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import Landing from './pages/Landing';
import PwaPrompt from './components/PwaPrompt';
import RouteLoading from './components/RouteLoading';
import DialogProvider from './components/DialogProvider';
import { initAnalytics, trackPageView } from './config/analytics';
import './styles.css';

const App = lazy(() => import('./App'));

const isExtension = window.location.protocol === 'chrome-extension:';
const Router = isExtension ? HashRouter : BrowserRouter;
const basename = isExtension ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '');

function AnalyticsTracker() {
  const location = useLocation();
  useEffect(() => {
    initAnalytics();
    trackPageView(location.pathname);
  }, [location.pathname]);
  return null;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router basename={basename}>
      <AnalyticsTracker />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/app"
          element={
            <Suspense fallback={<RouteLoading />}>
              <DialogProvider>
                <App />
              </DialogProvider>
            </Suspense>
          }
        />
      </Routes>
    </Router>
    {import.meta.env.PROD && !isExtension && <PwaPrompt />}
  </React.StrictMode>,
);
