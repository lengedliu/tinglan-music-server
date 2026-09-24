import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ThemeProvider } from './context/ThemeContext';
import { PlaybackTimeProvider } from './context/PlaybackTimeContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <PlaybackTimeProvider>
        <App />
      </PlaybackTimeProvider>
    </ThemeProvider>
  </StrictMode>,
);

// Register PWA service worker
if (typeof window !== 'undefined' && 'serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.log('SW registration note:', err);
    });
  });
}


