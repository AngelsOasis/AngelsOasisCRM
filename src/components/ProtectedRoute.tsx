import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import LoadingScreen from "./LoadingScreen";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return <LoadingScreen message="Checking your session…" />;
  }

  if (!session) {
    return <Navigate to="/app/login" replace />;
  }

  return <>{children}</>;
}
