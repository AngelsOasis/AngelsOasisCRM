import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import ProtectedRoute from "./components/ProtectedRoute";
import AppLayout from "./components/AppLayout";

import Login from "./pages/app/Login";
import Dashboard from "./pages/app/Dashboard";
import Leads from "./pages/app/Leads";
import HospitalsMap from "./pages/app/HospitalsMap";
import BedSpaceAvailability from "./pages/app/BedSpaceAvailability";
import Campaigns from "./pages/app/Campaigns";
import CampaignWriter from "./pages/app/CampaignWriter";
import EmailAnalytics from "./pages/app/EmailAnalytics";
import Facilities from "./pages/app/Facilities";
import Contacts from "./pages/app/Contacts";
import Settings from "./pages/app/Settings";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* This is a CRM only — no public marketing site. "/" goes straight
            into the app (ProtectedRoute bounces to /app/login if signed out). */}
        <Route path="/" element={<Navigate to="/app" replace />} />

        <Route path="/app/login" element={<Login />} />
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Dashboard />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/leads"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Leads />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/hospitals-map"
          element={
            <ProtectedRoute>
              <AppLayout>
                <HospitalsMap />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/bed-space-availability"
          element={
            <ProtectedRoute>
              <AppLayout>
                <BedSpaceAvailability />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/campaigns"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Campaigns />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/campaign-writer"
          element={
            <ProtectedRoute>
              <AppLayout>
                <CampaignWriter />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route path="/app/ai-writer" element={<Navigate to="/app/campaign-writer" replace />} />
        <Route
          path="/app/email-analytics"
          element={
            <ProtectedRoute>
              <AppLayout>
                <EmailAnalytics />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/facilities"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Facilities />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/contacts"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Contacts />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/settings"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Settings />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        {/* Anything unrecognized also lands on the app root */}
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </AuthProvider>
  );
}
