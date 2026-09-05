import { useMemo, useState } from "react";

export interface PermissionItem {
  code: string;
  domain: string;
  resource: string;
  action: string;
  labelAr: string;
  descriptionAr: string;
  sensitivity: "NORMAL" | "ELEVATED" | "CRITICAL";
  supportedScopes?: string[];
  allowed?: boolean;
  scope?: string | null;
  source?: "ROLE" | "DIRECT_ALLOW" | "DIRECT_DENY" | "NONE";
  roles?: Array<{ code: string; nameAr: string }>;
}

const domainLabels: Record<string, string> = {
  OVERVIEW: "لوحة الإدارة",
  CONTENT: "إدارة المحتوى",
  SOURCES: "المصادر والاستيراد",
  AMENDMENTS: "التعديلات",
  SEARCH: "البحث والفهرسة",
  GOVERNANCE: "الحوكمة والجودة",
  SETTINGS: "إعدادات المنصة",
  ACCESS: "المستخدمون والوصول",
};
const resourceLabels: Record<string, string> = {
  dashboard: "لوحة المؤشرات",
  legislation: "التشريعات",
  article: "المواد القانونية",
  structure: "بنية التشريع",
  annex: "الملاحق والجداول",
  relation: "العلاقات القانونية",
  reference: "القوائم المرجعية",
  source: "المصادر",
  amendment: "التعديلات",
  quality: "جودة البيانات",
  report: "البلاغات",
  audit: "سجل التدقيق",
  synonym: "قاموس البحث",
  index: "فهرس البحث",
  settings: "الإعدادات",
  navigation: "التنقل",
  public_page: "الصفحات العامة",
  workflow_policy: "سياسات سير العمل",
  user: "المستخدمون",
  user_activity: "نشاط المستخدم",
  user_session: "جلسات المستخدمين",
  role: "الأدوار",
  role_permission: "صلاحيات الأدوار",
  permission: "نموذج الصلاحيات",
};

export function PermissionExplorer({
  permissions,
  mode,
  roleSelection = new Map(),
  userOverrides = new Map(),
  onRoleChange,
  onUserOverrideChange,
}: {
  permissions: PermissionItem[];
  mode: "catalog" | "role" | "user" | "effective";
  roleSelection?: Map<string, string>;
  userOverrides?: Map<string, { effect: "ALLOW" | "DENY"; scope: string }>;
  onRoleChange?: (selection: Map<string, string>) => void;
  onUserOverrideChange?: (
    overrides: Map<string, { effect: "ALLOW" | "DENY"; scope: string }>,
  ) => void;
}) {
  const [query, setQuery] = useState("");
  const [sensitivity, setSensitivity] = useState("");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const filtered = useMemo(
    () =>
      permissions.filter((item) => {
        const text =
          `${item.code} ${item.labelAr} ${item.descriptionAr}`.toLowerCase();
        return (
          (!query || text.includes(query.toLowerCase())) &&
          (!sensitivity || item.sensitivity === sensitivity)
        );
      }),
    [permissions, query, sensitivity],
  );
  const grouped = useMemo(() => {
    const result = new Map<string, Map<string, PermissionItem[]>>();
    for (const item of filtered) {
      if (!result.has(item.domain)) result.set(item.domain, new Map());
      const resources = result.get(item.domain)!;
      if (!resources.has(item.resource)) resources.set(item.resource, []);
      resources.get(item.resource)!.push(item);
    }
    return result;
  }, [filtered]);

  const toggleRoleGroup = (items: PermissionItem[], selected: boolean) => {
    if (
      selected &&
      items.some((item) => item.sensitivity === "CRITICAL") &&
      !window.confirm("تتضمن المجموعة صلاحيات حرجة. هل تريد منحها؟")
    )
      return;
    const next = new Map(roleSelection);
    for (const item of items)
      if (selected) next.set(item.code, "ALL");
      else next.delete(item.code);
    onRoleChange?.(next);
  };

  return (
    <section className="permission-explorer">
      <div className="permission-filterbar">
        <label>
          <span className="sr-only">البحث في الصلاحيات</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ابحث بالاسم أو الرمز…"
          />
        </label>
        <label>
          <span className="sr-only">فلترة مستوى الحساسية</span>
          <select
            value={sensitivity}
            onChange={(event) => setSensitivity(event.target.value)}
          >
            <option value="">كل مستويات الحساسية</option>
            <option value="NORMAL">عادية</option>
            <option value="ELEVATED">مرتفعة</option>
            <option value="CRITICAL">حرجة</option>
          </select>
        </label>
        <span>{filtered.length} صلاحية</span>
      </div>
      {grouped.size === 0 ? (
        <div className="admin-empty-inline">لا توجد صلاحيات تطابق البحث.</div>
      ) : (
        [...grouped.entries()].map(([domain, resources]) => {
          const domainItems = [...resources.values()].flat();
          const isClosed = closed.has(domain);
          return (
            <section className="permission-domain" key={domain}>
              <header>
                <button
                  type="button"
                  aria-expanded={!isClosed}
                  onClick={() =>
                    setClosed((value) => {
                      const next = new Set(value);
                      if (next.has(domain)) next.delete(domain);
                      else next.add(domain);
                      return next;
                    })
                  }
                >
                  <span aria-hidden="true">{isClosed ? "◀" : "⌄"}</span>
                  {domainLabels[domain] ?? domain}
                </button>
                {mode === "role" && onRoleChange && (
                  <div>
                    <button
                      type="button"
                      onClick={() => toggleRoleGroup(domainItems, true)}
                    >
                      تحديد المجموعة
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleRoleGroup(domainItems, false)}
                    >
                      مسح المجموعة
                    </button>
                  </div>
                )}
              </header>
              {!isClosed &&
                [...resources.entries()].map(([resource, items]) => (
                  <div className="permission-resource" key={resource}>
                    <h3>{resourceLabels[resource] ?? resource}</h3>
                    <div className="permission-items">
                      {items.map((item) => (
                        <PermissionRow
                          key={item.code}
                          item={item}
                          mode={mode}
                          roleValue={roleSelection.get(item.code)}
                          override={userOverrides.get(item.code)}
                          setRole={(checked) => {
                            const next = new Map(roleSelection);
                            if (checked) next.set(item.code, "ALL");
                            else next.delete(item.code);
                            onRoleChange?.(next);
                          }}
                          setOverride={(effect) => {
                            const next = new Map(userOverrides);
                            if (!effect) next.delete(item.code);
                            else next.set(item.code, { effect, scope: "ALL" });
                            onUserOverrideChange?.(next);
                          }}
                          editable={
                            mode === "role"
                              ? Boolean(onRoleChange)
                              : mode === "user"
                                ? Boolean(onUserOverrideChange)
                                : false
                          }
                        />
                      ))}
                    </div>
                  </div>
                ))}
            </section>
          );
        })
      )}
    </section>
  );
}

function PermissionRow({
  item,
  mode,
  roleValue,
  override,
  setRole,
  setOverride,
  editable,
}: {
  item: PermissionItem;
  mode: "catalog" | "role" | "user" | "effective";
  roleValue?: string;
  override?: { effect: "ALLOW" | "DENY"; scope: string };
  setRole: (checked: boolean) => void;
  setOverride: (effect: "ALLOW" | "DENY" | "") => void;
  editable: boolean;
}) {
  const sourceText =
    item.source === "ROLE"
      ? `موروثة من ${item.roles?.map((role) => role.nameAr).join("، ")}`
      : item.source === "DIRECT_ALLOW"
        ? "منح مباشر"
        : item.source === "DIRECT_DENY"
          ? "رفض مباشر"
          : "غير ممنوحة";
  return (
    <article
      className={`permission-item sensitivity-${item.sensitivity.toLowerCase()}`}
    >
      {mode === "role" && (
        <input
          type="checkbox"
          checked={Boolean(roleValue)}
          disabled={!editable}
          onChange={(event) => setRole(event.target.checked)}
          aria-label={`منح ${item.labelAr}`}
        />
      )}
      <div>
        <strong>{item.labelAr}</strong>
        <code dir="ltr">{item.code}</code>
        <p>{item.descriptionAr}</p>
      </div>
      <span className={`permission-risk ${item.sensitivity.toLowerCase()}`}>
        {item.sensitivity === "CRITICAL"
          ? "حرجة"
          : item.sensitivity === "ELEVATED"
            ? "مرتفعة"
            : "عادية"}
      </span>
      {mode === "user" && (
        <label>
          <span className="sr-only">حالة {item.labelAr}</span>
          <select
            value={override?.effect ?? ""}
            disabled={!editable}
            onChange={(event) =>
              setOverride(event.target.value as "" | "ALLOW" | "DENY")
            }
          >
            <option value="">من الأدوار</option>
            <option value="ALLOW">منح مباشر</option>
            <option value="DENY">رفض مباشر</option>
          </select>
        </label>
      )}
      {mode === "effective" && (
        <div className="effective-permission-state">
          <strong className={item.allowed ? "allowed" : "denied"}>
            {item.allowed ? "مسموح" : "غير مسموح"}
          </strong>
          <small>{sourceText}</small>
          {item.allowed && (
            <small>النطاق: {item.scope === "ALL" ? "الكل" : item.scope}</small>
          )}
        </div>
      )}
    </article>
  );
}
