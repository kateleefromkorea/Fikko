import React from "react";
import ReactDOM from "react-dom/client";
import { AuthProvider } from "@/auth/AuthProvider";
import { PlanProvider } from "@/hooks/usePlan";
import ErrorBoundary from "@/components/ErrorBoundary";
import { routeApiCalls } from "@mobile/lib/api";
import { setupAuthLinks } from "@mobile/lib/authLinks";
import { setupSwipeToDismiss } from "@mobile/lib/swipeToDismiss";
import MobileApp from "@mobile/MobileApp";
import { ToastProvider } from "@mobile/components/Toast";
import "./mobile.css";

routeApiCalls();
setupAuthLinks();
setupSwipeToDismiss();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <PlanProvider>
          <ToastProvider>
            <MobileApp />
          </ToastProvider>
        </PlanProvider>
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
