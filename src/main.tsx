import React, { Suspense, lazy, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import Landing from './pages/Landing';
import PwaPrompt from './components/PwaPrompt';
import RouteLoading from './components/RouteLoading';
import DialogProvider from './components/DialogProvider';
import { initAnalytics, trackPageView } from './config/analytics';
import './styles.css';

const App = lazy(() => import('./App'));

const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

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
    <BrowserRouter basename={basename}>
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
    </BrowserRouter>
    {import.meta.env.PROD && <PwaPrompt />}
  </React.StrictMode>,
);
