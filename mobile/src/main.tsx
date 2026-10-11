import React from "react";
import ReactDOM from "react-dom/client";
import { AuthProvider } from "@/auth/AuthProvider";
import { PlanProvider } from "@/hooks/usePlan";
import ErrorBoundary from "@/components/ErrorBoundary";
import { routeApiCalls } from "@mobile/lib/api";
import { setupAuthLinks } from "@mobile/lib/authLinks";
import { setupNativeHaptics } from "@mobile/lib/haptics";
import MobileApp from "@mobile/MobileApp";
import "./mobile.css";

routeApiCalls();
setupAuthLinks();
setupNativeHaptics();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <PlanProvider>
          <MobileApp />
        </PlanProvider>
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
