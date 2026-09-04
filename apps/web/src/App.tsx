import { Navigate, Route, Routes } from "react-router-dom";
import { useEffect } from "react";
import { Layout } from "./components/Layout";
import { HomePage } from "./pages/HomePage";
import { LegislationDetailPage } from "./pages/LegislationDetailPage";
import { LegislationsPage } from "./pages/LegislationsPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ModificationsPage } from "./pages/ModificationsPage";
import { RegulationsPage } from "./pages/RegulationsPage";
import { RelatedLegislationsPage } from "./pages/RelatedLegislationsPage";
import { SearchPage } from "./pages/SearchPage";
import { RequireAuth } from "./auth/RequireAuth";
import { AdminLayout } from "./components/AdminLayout";
import { LoginPage } from "./pages/LoginPage";
import { AdminDashboardPage } from "./pages/admin/AdminDashboardPage";
import { AdminImportsPage } from "./pages/admin/AdminImportsPage";
import { AdminContentPage } from "./pages/admin/AdminContentPage";
import { AdminContentDetailPage } from "./pages/admin/AdminContentDetailPage";
import { AdminAuditPage } from "./pages/admin/AdminAuditPage";
import { AdminUsersPage } from "./pages/admin/AdminUsersPage";
import { AdminSynonymsPage } from "./pages/admin/AdminSynonymsPage";
import { AdminQualityPage } from "./pages/admin/AdminQualityPage";
import { AccountPage } from "./pages/AccountPage";
import { AdminReportsPage } from "./pages/admin/AdminReportsPage";
import { AdminAmendmentsPage } from "./pages/admin/AdminAmendmentsPage";

export function App() {
  useEffect(() => {
    document.documentElement.lang = "ar";
    document.documentElement.dir = "rtl";
  }, []);
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/ar" replace />} />
      <Route path="/ar" element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="legislations" element={<LegislationsPage />} />
        <Route path="legislations/:id" element={<LegislationDetailPage />} />
        <Route
          path="legislations/:id/modifications"
          element={<ModificationsPage />}
        />
        <Route
          path="legislations/:id/regulations"
          element={<RegulationsPage />}
        />
        <Route
          path="legislations/:id/related-legislations"
          element={<RelatedLegislationsPage />}
        />
        <Route path="search" element={<SearchPage />} />
        <Route element={<RequireAuth />}>
          <Route path="account" element={<AccountPage />} />
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="imports" element={<AdminImportsPage />} />
            <Route path="content" element={<AdminContentPage />} />
            <Route path="content/:id" element={<AdminContentDetailPage />} />
            <Route path="amendments" element={<AdminAmendmentsPage />} />
            <Route path="audit" element={<AdminAuditPage />} />
            <Route path="reports" element={<AdminReportsPage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="synonyms" element={<AdminSynonymsPage />} />
            <Route path="quality" element={<AdminQualityPage />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
