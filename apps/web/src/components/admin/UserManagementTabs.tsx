import { useAuth } from "../../auth/AuthContext";
import { AdminTabs } from "./AdminTabs";
export function UserManagementTabs() {
  const auth = useAuth();
  return (
    <AdminTabs
      label="إدارة المستخدمين"
      items={[
        ...(auth.hasPermission("user.view")
          ? [{ label: "المستخدمون", to: "/ar/admin/users", end: true }]
          : []),
        ...(auth.hasPermission("user.reset_password")
          ? [{ label: "طلبات استعادة الوصول", to: "/ar/admin/users/recovery" }]
          : []),
      ]}
    />
  );
}
