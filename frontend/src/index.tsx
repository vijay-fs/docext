import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import Dashboard from './components/Dashboard';
import { JobsProvider } from './hooks/JobsContext';
import { BrowserRouter, Route, Routes } from 'react-router';
import LoginPage from './pages/loginPage';
import PrivateRoute from './hooks/privateRoute';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  // <React.StrictMode>
  <JobsProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/extract"
          element={
            <PrivateRoute>
              <App />
            </PrivateRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  </JobsProvider>
  // </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
