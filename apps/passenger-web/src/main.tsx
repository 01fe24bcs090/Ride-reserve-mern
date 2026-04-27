import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";

const App = lazy(() => import("./App"));
const StaffLogin = lazy(() => import("./StaffLogin"));

const root = ReactDOM.createRoot(document.getElementById("root")!);

function Router() {
  const path = window.location.pathname;
  
  return (
    <Suspense fallback={<div className="loading-screen">Loading Ride Reserve...</div>}>
      {path === "/staff-login" ? <StaffLogin /> : <App />}
    </Suspense>
  );
}

root.render(
  <React.StrictMode>
    <Router />
  </React.StrictMode>,
);
