import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './AuthContext.jsx';
import { AcademicProvider } from './AcademicContext.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <AcademicProvider>
          <App />
        </AcademicProvider>
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>,
);
