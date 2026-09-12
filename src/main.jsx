import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './AuthContext.jsx';
import { AcademicProvider } from './AcademicContext.jsx';
import DialogProvider from './components/DialogProvider.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <AcademicProvider>
          <DialogProvider>
            <App />
          </DialogProvider>
        </AcademicProvider>
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>,
);
