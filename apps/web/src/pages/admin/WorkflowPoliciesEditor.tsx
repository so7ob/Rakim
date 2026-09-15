import { useSearchParams } from "react-router-dom";
import { AdminTabs } from "../../components/admin/AdminTabs";
import { useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "../../api";
import { ErrorPanel, LoadingCards } from "../../components/StatePanel";
import { useApi } from "../../hooks/use-api";
import { UnsavedChangesGuard } from "../../components/admin/UnsavedChangesGuard";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { useAuth } from "../../auth/AuthContext";

interface WorkflowPolicy {
  code: string;
  settingKey: string;
  permissionCode: string;
  labelAr: string;
  descriptionAr: string;
  requiredRole: string;
  requiredPermissions: string[];
  requiredPermissionLabels: string[];
  category: string;
  enabled: boolean;
  userIds: string[];
}

interface PolicyUser {
  id: string;
  username: string;
  displayName: string;
  roles: string[];
}

interface WorkflowPolicyState {
  policies: WorkflowPolicy[];
  categories: Array<{ code: string; labelAr: string }>;
  users: PolicyUser[];
}

const roleLabels: Record<string, string> = {
  READER: "قارئ/باحث",
  DATA_ENTRY: "مدخل بيانات",
  LEGAL_REVIEWER: "مراجع قانوني",
  CONTENT_MANAGER: "مدير محتوى",
  SYSTEM_ADMIN: "مدير نظام",
};

export function WorkflowPoliciesEditor() {
  const auth = useAuth();
  const [params, setParams] = useSearchParams();
  const canUpdate = auth.hasPermission("workflow_policy.update");
  const canManageOverrides = auth.hasPermission(
    "workflow_policy.overrides.manage",
  );
  const state = useApi<WorkflowPolicyState>("/admin/workflow-policies");
  const [selectedCode, setSelectedCode] = useState("");
  const [message, setMessage] = useState("");
  const [policyDirty, setPolicyDirty] = useState(false);
  const [overridesDirty, setOverridesDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingCode, setPendingCode] = useState("");
  useEffect(() => {
    setPolicyDirty(false);
    setOverridesDirty(false);
  }, [params.toString()]);

  if (state.loading) return <LoadingCards />;
  if (state.error || !state.data)
    return (
      <ErrorPanel
        message={state.error?.message ?? "تعذر تحميل سياسات سير العمل."}
        retry={state.retry}
      />
    );

  const linkedPolicy = state.data.policies.find(
    (p) => p.code === params.get("policy"),
  );
  const category =
    linkedPolicy?.category ?? params.get("category") ?? "PUBLICATION";
  const categoryPolicies = state.data.policies.filter(
    (p) => p.category === category,
  );
  const activeCode =
    linkedPolicy?.code ||
    (categoryPolicies.some((p) => p.code === selectedCode)
      ? selectedCode
      : categoryPolicies[0]?.code) ||
    state.data.policies[0]?.code ||
    "";
  const policy = state.data.policies.find((item) => item.code === activeCode);
  if (!policy) return null;

  const selectPolicy = (code: string) => {
    setSelectedCode(code);
    setParams({ policy: code });
    setPolicyDirty(false);
    setOverridesDirty(false);
    setMessage("");
    setPendingCode("");
  };

  const savePolicy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await apiRequest(`/admin/workflow-policies/${policy.code}`, {
        method: "PATCH",
        body: {
          enabled: form.get("enabled") === "true",
          reason: form.get("reason"),
        },
      });
      setMessage("حُفظ إعداد السياسة وسُجل سبب التغيير.");
      setPolicyDirty(false);
      state.retry();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "تعذر حفظ سياسة سير العمل.",
      );
    } finally {
      setSaving(false);
    }
  };

  const saveOverrides = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await apiRequest(`/admin/workflow-policies/${policy.code}/overrides`, {
        method: "PATCH",
        body: {
          userIds: form.getAll("userIds"),
          reason: form.get("reason"),
        },
      });
      setMessage(
        "حُفظ مستخدمو الاستثناء، وأُبطلت جلسات المتأثرين، وسُجل التغيير.",
      );
      setOverridesDirty(false);
      state.retry();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "تعذر حفظ الاستثناءات.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="admin-card workflow-policies-card">
      <header className="workflow-policies-heading">
        <div>
          <span className="eyebrow dark">ضوابط العمليات والاستثناءات</span>
          <h2>سياسات وضوابط سير العمل</h2>
        </div>
        <p>
          عطّل السياسة عالميًا أو اختر مستخدمين محددين لتجاوزها. الاستثناء لا
          يمنح صلاحيات تنفيذ العملية.
        </p>
      </header>

      <AdminTabs
        label="تصنيفات السياسات"
        secondary
        activeTo={`/ar/admin/settings/workflow?category=${category}`}
        items={state.data.categories.map((item) => ({
          label: item.labelAr,
          to: `/ar/admin/settings/workflow?category=${item.code}`,
        }))}
      />
      <div
        className="workflow-policy-tabs"
        role="tablist"
        aria-label="سياسات سير العمل"
      >
        {categoryPolicies.map((item, index) => (
          <button
            key={item.code}
            type="button"
            id={`policy-tab-${item.code}`}
            role="tab"
            aria-selected={item.code === policy.code}
            aria-controls={`policy-panel-${item.code}`}
            tabIndex={item.code === policy.code ? 0 : -1}
            onClick={() => {
              if (policyDirty || overridesDirty) {
                setPendingCode(item.code);
                return;
              }
              selectPolicy(item.code);
            }}
          >
            <span>{index + 1}</span>
            {item.labelAr}
          </button>
        ))}
      </div>

      <div
        key={`${policy.code}:${policy.enabled}:${policy.userIds.join(",")}`}
        id={`policy-panel-${policy.code}`}
        className="workflow-policy-form"
        role="tabpanel"
        aria-labelledby={`policy-tab-${policy.code}`}
      >
        <header>
          <div>
            <h3>{policy.labelAr}</h3>
            <p>{policy.descriptionAr}</p>
          </div>
          <span
            className={policy.enabled ? "status-enabled" : "status-disabled"}
          >
            {policy.enabled ? "مفعلة" : "معطلة بالكامل"}
          </span>
        </header>

        <form onSubmit={savePolicy} onInput={() => setPolicyDirty(true)}>
          <label className="policy-state-field">
            حالة السياسة
            <select
              name="enabled"
              defaultValue={String(policy.enabled)}
              disabled={!canUpdate}
            >
              <option value="true">مفعلة على جميع المستخدمين</option>
              <option value="false">معطلة بالكامل</option>
            </select>
          </label>
          {canUpdate && (
            <>
              <label className="policy-reason-field">
                سبب تغيير السياسة
                <input name="reason" required minLength={3} />
              </label>
              <button
                className="button"
                type="submit"
                disabled={!policyDirty || saving}
              >
                {saving ? "جار الحفظ…" : "حفظ إعداد السياسة"}
              </button>
            </>
          )}
        </form>

        {canManageOverrides && (
          <form
            className="workflow-policy-overrides-form"
            onSubmit={saveOverrides}
            onInput={() => setOverridesDirty(true)}
          >
            <fieldset className="policy-user-selector">
              <legend>المستخدمون الممنوحون استثناء تجاوز هذه السياسة</legend>
              <p>
                صلاحيات العملية (الاستثناء لا يمنحها):{" "}
                {policy.requiredPermissionLabels.join("، ")}
              </p>
              <div className="policy-user-options">
                {state.data.users.map((user) => (
                  <label key={user.id}>
                    <input
                      type="checkbox"
                      name="userIds"
                      value={user.id}
                      defaultChecked={policy.userIds.includes(user.id)}
                    />
                    <span>
                      <strong>{user.displayName}</strong>
                      <small>
                        {user.username} —{" "}
                        {user.roles
                          .map((role) => roleLabels[role] ?? role)
                          .join("، ") || "دون دور"}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="policy-reason-field">
              سبب تغيير الاستثناءات
              <input name="reason" required minLength={3} />
            </label>
            <button
              className="button"
              type="submit"
              disabled={!overridesDirty || saving}
            >
              {saving ? "جار الحفظ…" : "حفظ مستخدمي الاستثناء"}
            </button>
          </form>
        )}
      </div>
      <UnsavedChangesGuard
        active={(policyDirty || overridesDirty) && !saving}
      />
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
      {pendingCode && (
        <ConfirmDialog
          title="الانتقال دون حفظ؟"
          description="لديك تغييرات غير محفوظة في هذه السياسة. ستفقدها إذا انتقلت إلى سياسة أخرى."
          confirmLabel="انتقال دون حفظ"
          onClose={() => setPendingCode("")}
          onConfirm={() => selectPolicy(pendingCode)}
        />
      )}
    </section>
  );
}
