import { StatusBadge } from "../../components/StatusBadge";
import { RecordFormDialog } from "../../components/admin/RecordFormDialog";
import { LifecycleActions } from "../../components/admin/LifecycleActions";
import { useState, type FormEvent } from "react";
import { Navigate, useParams } from "react-router-dom";
import { apiRequest } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { ErrorPanel, LoadingCards } from "../../components/StatePanel";
import { useApi } from "../../hooks/use-api";
import { useSiteConfig } from "../../site/SiteConfigContext";
import { WorkflowPoliciesEditor } from "./WorkflowPoliciesEditor";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { AdminTabs } from "../../components/admin/AdminTabs";
import { UnsavedChangesGuard } from "../../components/admin/UnsavedChangesGuard";
import { AdminDialog } from "../../components/admin/AdminDialog";
import { EntityDetails } from "../../components/admin/EntityDetails";

interface Setting {
  settingKey: string;
  groupCode: string;
  labelAr: string;
  inputType: "TEXT" | "TEXTAREA" | "COLOR" | "URL" | "BOOLEAN";
  value: string | boolean;
}
interface NavigationItem {
  id: string;
  location: "HEADER" | "FOOTER";
  labelAr: string;
  path: string;
  sortOrder: number;
  isVisible: boolean;
}
interface ContentPage {
  id: string;
  slug: string;
  eyebrowAr: string;
  titleAr: string;
  introAr: string;
  sections: Array<{ title: string; body: string }>;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
}
interface SettingsState {
  settings: Setting[];
  navigation: NavigationItem[];
  pages: ContentPage[];
}

const groupLabels: Record<string, string> = {
  BRANDING: "الهوية والشعار",
  COLORS: "الألوان والتدرجات",
  HEADER: "الترويسة والأدوات",
  BACKGROUND: "الخلفيات والزخارف",
  FOOTER: "التذييل",
  TYPOGRAPHY: "الخط وحجم النص القانوني",
  TABS: "تبويبات صفحة التشريع",
  WORKFLOW: "ضوابط سير العمل",
};

export function AdminSettingsPage() {
  const { tab = "general" } = useParams();
  const auth = useAuth();
  const siteConfig = useSiteConfig();
  const isWorkflow = tab === "workflow";
  const state = useApi<SettingsState>(isWorkflow ? null : "/admin/site");
  const [creatingPage, setCreatingPage] = useState(false);
  const [message, setMessage] = useState("");
  const canViewSettings = auth.hasPermission("settings.view");
  const canViewWorkflow = auth.hasPermission("workflow_policy.view");
  const canGeneral = auth.hasPermission("settings.general.update");
  const canAppearance = auth.hasPermission("settings.appearance.update");
  const canHeader = auth.hasPermission("settings.header.update");
  const canFooter = auth.hasPermission("settings.footer.update");
  const canLegislationPage = auth.hasPermission(
    "settings.legislation_page.update",
  );
  const canNavigationCreate = auth.hasPermission("navigation.create");
  const canNavigationUpdate = auth.hasPermission("navigation.update");
  const canPublicPageUpdate = auth.hasPermission("public_page.update");
  const canPublicPagePublish = auth.hasPermission("public_page.publish");
  const canPublicPageArchive = auth.hasPermission("public_page.archive");
  const knownTabs = [
    "general",
    "appearance",
    "navigation",
    "legislation",
    "workflow",
    "pages",
  ];
  if (
    !knownTabs.includes(tab) ||
    (isWorkflow ? !canViewWorkflow : !canViewSettings)
  )
    return <Navigate to="/ar/admin/no-permission" replace />;
  if (!isWorkflow && state.loading) return <LoadingCards />;
  if (!isWorkflow && (state.error || !state.data))
    return (
      <ErrorPanel
        message={state.error?.message ?? "تعذر تحميل الإعدادات."}
        retry={state.retry}
      />
    );
  const settingsState = state.data ?? {
    settings: [],
    navigation: [],
    pages: [],
  };
  const groups = settingsState.settings.reduce<Record<string, Setting[]>>(
    (result, setting) => {
      if (setting.groupCode === "WORKFLOW") return result;
      (result[setting.groupCode] ??= []).push(setting);
      return result;
    },
    {},
  );
  const tabGroups: Record<string, string[]> = {
    general: ["BRANDING"],
    appearance: ["COLORS", "BACKGROUND", "TYPOGRAPHY"],
    navigation: ["HEADER", "FOOTER"],
    legislation: ["TABS"],
  };
  const editableForGroup = (group: string) =>
    group === "BRANDING"
      ? canGeneral
      : ["COLORS", "BACKGROUND", "TYPOGRAPHY"].includes(group)
        ? canAppearance
        : ["HEADER", "FOOTER"].includes(group)
          ? group === "HEADER"
            ? canHeader
            : canFooter
          : canLegislationPage;
  const currentGroups = tabGroups[tab] ?? [];
  return (
    <section>
      <AdminPageHeader
        eyebrow="إعدادات ديناميكية مدققة"
        title="إعدادات المنصة"
        description="كل تبويب يحفظ نطاقه بصورة مستقلة في MariaDB ويحتفظ بعنوان URL مباشر."
        breadcrumbs={[
          { label: "لوحة الإدارة", to: "/ar/admin" },
          { label: "إعدادات المنصة" },
        ]}
      />
      <AdminTabs
        label="أقسام إعدادات المنصة"
        items={[
          ...(canViewSettings
            ? [
                { label: "عام", to: "/ar/admin/settings/general" },
                {
                  label: "الهوية والمظهر",
                  to: "/ar/admin/settings/appearance",
                },
                { label: "التنقل", to: "/ar/admin/settings/navigation" },
                {
                  label: "صفحة التشريع",
                  to: "/ar/admin/settings/legislation",
                },
              ]
            : []),
          ...(canViewWorkflow
            ? [{ label: "سياسات سير العمل", to: "/ar/admin/settings/workflow" }]
            : []),
          ...(canViewSettings
            ? [
                {
                  label: "الصفحات العامة",
                  to: "/ar/admin/settings/pages",
                  count: settingsState.pages.length,
                },
              ]
            : []),
        ]}
      />
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
      {isWorkflow && canViewWorkflow && <WorkflowPoliciesEditor />}
      {currentGroups.map((group) => {
        const settings = groups[group] ?? [];
        const editable = editableForGroup(group);
        return (
          <SettingsGroupForm
            key={group}
            group={group}
            settings={settings}
            editable={editable}
            saved={async () => {
              await siteConfig.refresh();
              setMessage(
                `حُفظ قسم ${groupLabels[group] ?? group} وطُبق على الواجهة.`,
              );
              state.retry();
            }}
            failed={setMessage}
          />
        );
      })}
      {tab === "navigation" && (
        <section className="admin-card">
          <h2>التبويبات وروابط الترويسة والتذييل</h2>
          <div className="draft-articles">
            {settingsState.navigation.map((item) => (
              <NavigationEditor
                key={item.id}
                item={item}
                editable={canNavigationUpdate}
                done={(text) => {
                  setMessage(text);
                  state.retry();
                  void siteConfig.refresh();
                }}
              />
            ))}
          </div>
          {canNavigationCreate && (
            <NewNavigation
              done={(text) => {
                setMessage(text);
                state.retry();
                void siteConfig.refresh();
              }}
            />
          )}
        </section>
      )}
      {tab === "pages" && auth.hasPermission("public_page.create") && (
        <button className="button" onClick={() => setCreatingPage(true)}>
          + إضافة صفحة عامة
        </button>
      )}
      {creatingPage && (
        <RecordFormDialog
          title="إضافة صفحة عامة"
          path="/admin/site/pages"
          fields={[
            {
              name: "slug",
              label: "الرابط بعد /ar/pages/",
              required: true,
              maxLength: 120,
            },
            {
              name: "titleAr",
              label: "عنوان الصفحة",
              required: true,
              maxLength: 500,
            },
            { name: "introAr", label: "المقدمة", type: "textarea" },
            {
              name: "sectionTitle",
              label: "عنوان القسم الأول",
              required: true,
              maxLength: 500,
            },
            {
              name: "sectionBody",
              label: "محتوى القسم الأول",
              type: "textarea",
              required: true,
            },
            { name: "reason", label: "سبب الإضافة", required: true },
          ]}
          onClose={() => setCreatingPage(false)}
          onDone={() => {
            setCreatingPage(false);
            state.retry();
          }}
        />
      )}
      {tab === "pages" && (
        <section className="admin-card">
          <h2>الصفحات العامة</h2>
          <p>
            الدستور والمنظومة والسياسات والأخبار والتعريف والتواصل والنصوص
            القانونية.
          </p>
          <div className="draft-articles">
            {settingsState.pages.map((page) => (
              <PageEditor
                key={page.id}
                page={page}
                canUpdate={canPublicPageUpdate}
                canPublish={canPublicPagePublish}
                canArchive={canPublicPageArchive}
                done={(text) => {
                  setMessage(text);
                  state.retry();
                }}
              />
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

function SettingsGroupForm({
  group,
  settings,
  editable,
  saved,
  failed,
}: {
  group: string;
  settings: Setting[];
  editable: boolean;
  saved: () => Promise<void>;
  failed: (message: string) => void;
}) {
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  if (!editable)
    return (
      <section className="admin-card">
        <h2>{groupLabels[group] ?? group}</h2>
        <p className="form-warning">
          هذه الإعدادات متاحة للعرض فقط وفق صلاحيات حسابك.
        </p>
        <EntityDetails
          items={settings.map((setting) => ({
            label: setting.labelAr,
            value:
              setting.inputType === "BOOLEAN"
                ? Boolean(setting.value)
                  ? "مفعّل"
                  : "غير مفعّل"
                : String(setting.value) || "—",
          }))}
        />
      </section>
    );
  return (
    <form
      className="admin-card settings-form"
      onInput={() => setDirty(true)}
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const values = Object.fromEntries(
          settings.map((setting) => [
            setting.settingKey,
            setting.inputType === "BOOLEAN"
              ? form.has(setting.settingKey)
              : String(form.get(setting.settingKey) ?? ""),
          ]),
        );
        setSaving(true);
        try {
          await apiRequest("/admin/site/settings", {
            method: "PATCH",
            body: { values, reason: form.get("reason") },
          });
          setDirty(false);
          await saved();
        } catch (error) {
          failed(
            error instanceof Error ? error.message : "تعذر حفظ الإعدادات.",
          );
        } finally {
          setSaving(false);
        }
      }}
    >
      <h2>{groupLabels[group] ?? group}</h2>
      <div className="settings-grid">
        {settings.map((setting) => (
          <SettingField
            key={setting.settingKey}
            setting={setting}
            editable={editable}
          />
        ))}
      </div>
      <label>
        سبب التغيير
        <input name="reason" required placeholder="سبب يظهر في سجل التدقيق" />
      </label>
      <button className="button" disabled={!dirty || saving}>
        {saving ? "جار الحفظ…" : "حفظ هذا القسم"}
      </button>
      <UnsavedChangesGuard active={dirty && !saving} />
    </form>
  );
}

function SettingField({
  setting,
  editable,
}: {
  setting: Setting;
  editable: boolean;
}) {
  if (setting.inputType === "BOOLEAN")
    return (
      <label className="setting-toggle">
        <input
          type="checkbox"
          name={setting.settingKey}
          defaultChecked={Boolean(setting.value)}
          disabled={!editable}
        />
        {setting.labelAr}
      </label>
    );
  if (setting.inputType === "TEXTAREA")
    return (
      <label>
        {setting.labelAr}
        <textarea
          name={setting.settingKey}
          defaultValue={String(setting.value)}
          disabled={!editable}
        />
      </label>
    );
  return (
    <label>
      {setting.labelAr}
      <span className="setting-input-row">
        <input
          type={
            setting.inputType === "COLOR"
              ? "color"
              : setting.inputType === "URL"
                ? "url"
                : "text"
          }
          name={setting.settingKey}
          defaultValue={String(setting.value)}
          disabled={!editable}
        />
        {setting.inputType === "COLOR" && <code>{String(setting.value)}</code>}
      </span>
    </label>
  );
}

function NavigationEditor({
  item,
  editable,
  done,
}: {
  item: NavigationItem;
  editable: boolean;
  done: (x: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return (
    <article className="admin-list-card">
      <header>
        <div>
          <h3>{item.labelAr}</h3>
          <p dir="ltr">{item.path}</p>
        </div>
        <span className="tag">{item.isVisible ? "ظاهر" : "مخفي"}</span>
      </header>
      <EntityDetails
        items={[
          {
            label: "الموضع",
            value: item.location === "HEADER" ? "الترويسة" : "التذييل",
          },
          { label: "الترتيب", value: item.sortOrder },
        ]}
      />
      <div className="admin-entity-actions">
        <LifecycleActions
          kind="navigation"
          id={item.id}
          label={item.labelAr}
          onDone={() => done("حُدّث رابط التنقل.")}
        />
      </div>
      {editable && (
        <div className="admin-entity-actions">
          <button
            type="button"
            className="button secondary"
            onClick={() => setEditing(true)}
          >
            تعديل الرابط
          </button>
        </div>
      )}
      {editing && (
        <AdminDialog
          title={`تعديل رابط ${item.labelAr}`}
          onClose={() => setEditing(false)}
        >
          <form
            className="edit-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const f = new FormData(event.currentTarget);
              setSaving(true);
              setError("");
              try {
                await apiRequest(`/admin/site/navigation/${item.id}`, {
                  method: "PATCH",
                  body: {
                    location: f.get("location"),
                    labelAr: f.get("labelAr"),
                    path: f.get("path"),
                    sortOrder: Number(f.get("sortOrder")),
                    isVisible: f.has("isVisible"),
                    reason: f.get("reason"),
                  },
                });
                setEditing(false);
                done("حُفظ رابط التنقل.");
              } catch (error) {
                setError(
                  error instanceof Error ? error.message : "تعذر الحفظ.",
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="form-columns">
              <label>
                الموضع
                <select name="location" defaultValue={item.location}>
                  <option>HEADER</option>
                  <option>FOOTER</option>
                </select>
              </label>
              <label>
                النص
                <input name="labelAr" defaultValue={item.labelAr} required />
              </label>
              <label>
                المسار
                <input name="path" defaultValue={item.path} required />
              </label>
              <label>
                الترتيب
                <input
                  name="sortOrder"
                  type="number"
                  min="0"
                  defaultValue={item.sortOrder}
                />
              </label>
              <label className="setting-toggle">
                <input
                  name="isVisible"
                  type="checkbox"
                  defaultChecked={item.isVisible}
                />
                ظاهر
              </label>
            </div>
            <label>
              سبب التغيير
              <input name="reason" required />
            </label>
            <div className="admin-entity-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setEditing(false)}
                disabled={saving}
              >
                إلغاء
              </button>
              <button className="button" disabled={saving}>
                {saving ? "جار الحفظ…" : "حفظ الرابط"}
              </button>
            </div>
          </form>
        </AdminDialog>
      )}
    </article>
  );
}

function NewNavigation({ done }: { done: (x: string) => void }) {
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="admin-entity-actions">
      <button
        type="button"
        className="button"
        onClick={() => setCreating(true)}
      >
        + إضافة رابط جديد
      </button>
      {creating && (
        <AdminDialog title="إضافة رابط تنقل" onClose={() => setCreating(false)}>
          <form
            className="edit-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const formElement = event.currentTarget;
              const f = new FormData(formElement);
              setSaving(true);
              setError("");
              try {
                await apiRequest("/admin/site/navigation", {
                  body: {
                    location: f.get("location"),
                    labelAr: f.get("labelAr"),
                    path: f.get("path"),
                    sortOrder: Number(f.get("sortOrder")),
                    isVisible: true,
                    reason: f.get("reason"),
                  },
                });
                setCreating(false);
                done("أضيف رابط التنقل.");
              } catch (error) {
                setError(
                  error instanceof Error ? error.message : "تعذرت الإضافة.",
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="form-columns">
              <label>
                الموضع
                <select name="location">
                  <option>HEADER</option>
                  <option>FOOTER</option>
                </select>
              </label>
              <label>
                النص
                <input name="labelAr" required />
              </label>
              <label>
                المسار
                <input name="path" placeholder="/ar/..." required />
              </label>
              <label>
                الترتيب
                <input
                  name="sortOrder"
                  type="number"
                  min="0"
                  defaultValue="50"
                />
              </label>
            </div>
            <label>
              سبب الإضافة
              <input name="reason" required />
            </label>
            <div className="admin-entity-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setCreating(false)}
                disabled={saving}
              >
                إلغاء
              </button>
              <button className="button" disabled={saving}>
                {saving ? "جار الإضافة…" : "إضافة الرابط"}
              </button>
            </div>
          </form>
        </AdminDialog>
      )}
    </div>
  );
}

function PageEditor({
  page,
  canUpdate,
  canPublish,
  canArchive,
  done,
}: {
  page: ContentPage;
  canUpdate: boolean;
  canPublish: boolean;
  canArchive: boolean;
  done: (x: string) => void;
}) {
  const [sections, setSections] = useState(page.sections);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const canSaveCurrentStatus =
    page.status === "DRAFT"
      ? canUpdate
      : page.status === "PUBLISHED"
        ? canUpdate && canPublish
        : canUpdate && canArchive;
  return (
    <article className="admin-list-card">
      <header>
        <div>
          <h3>{page.titleAr}</h3>
          <p dir="ltr">/{page.slug}</p>
        </div>
        <span>
          حالة النشر: <StatusBadge status={page.status} />
        </span>
      </header>
      <EntityDetails
        items={[
          { label: "العنوان الأعلى", value: page.eyebrowAr || "—" },
          { label: "عدد الأقسام", value: page.sections.length },
          {
            label: "المقدمة",
            value: page.introAr || "لا توجد مقدمة.",
            wide: true,
          },
        ]}
      />
      <div className="admin-entity-actions">
        <LifecycleActions
          kind="pages"
          id={page.id}
          label={page.titleAr}
          onDone={() => done("حُدّثت حالة الصفحة.")}
        />
      </div>
      {canSaveCurrentStatus && (
        <div className="admin-entity-actions">
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              setSections(page.sections);
              setDirty(false);
              setEditing(true);
            }}
          >
            تعديل الصفحة
          </button>
        </div>
      )}
      {editing && (
        <AdminDialog
          title={`تعديل ${page.titleAr}`}
          description="محرر موسع لمحتوى الصفحة العامة وأقسامها."
          size="large"
          dirty={dirty}
          onClose={() => setEditing(false)}
        >
          <form
            className="edit-form"
            onInput={() => setDirty(true)}
            onSubmit={async (event) => {
              event.preventDefault();
              const f = new FormData(event.currentTarget);
              setSaving(true);
              setError("");
              try {
                await apiRequest(`/admin/site/pages/${page.id}`, {
                  method: "PATCH",
                  body: {
                    eyebrowAr: f.get("eyebrowAr"),
                    titleAr: f.get("titleAr"),
                    introAr: f.get("introAr"),
                    sections,
                    status: f.get("status"),
                    reason: f.get("reason"),
                  },
                });
                setDirty(false);
                setEditing(false);
                done("حُفظت الصفحة العامة.");
              } catch (error) {
                setError(
                  error instanceof Error ? error.message : "تعذر حفظ الصفحة.",
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="form-columns">
              <label>
                العنوان الأعلى
                <input name="eyebrowAr" defaultValue={page.eyebrowAr} />
              </label>
              <label>
                عنوان الصفحة
                <input name="titleAr" defaultValue={page.titleAr} required />
              </label>
              <label>
                الحالة
                <select name="status" defaultValue={page.status}>
                  {page.status === "DRAFT" && <option>DRAFT</option>}
                  {(page.status === "PUBLISHED" || canPublish) && (
                    <option>PUBLISHED</option>
                  )}
                  {(page.status === "ARCHIVED" || canArchive) && (
                    <option>ARCHIVED</option>
                  )}
                </select>
              </label>
            </div>
            <label>
              المقدمة
              <textarea name="introAr" defaultValue={page.introAr} />
            </label>
            <div className="page-section-editor">
              {sections.map((section, index) => (
                <div key={index}>
                  <label>
                    عنوان القسم
                    <input
                      value={section.title}
                      onChange={(e) =>
                        setSections((old) =>
                          old.map((x, i) =>
                            i === index ? { ...x, title: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    النص
                    <textarea
                      value={section.body}
                      onChange={(e) =>
                        setSections((old) =>
                          old.map((x, i) =>
                            i === index ? { ...x, body: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="link-button danger"
                    disabled={sections.length === 1}
                    onClick={() => {
                      setDirty(true);
                      setSections((old) => old.filter((_, i) => i !== index));
                    }}
                  >
                    حذف القسم
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setDirty(true);
                setSections((old) => [...old, { title: "قسم جديد", body: "" }]);
              }}
            >
              إضافة قسم
            </button>
            <label>
              سبب التغيير
              <input name="reason" required />
            </label>
            <div className="admin-entity-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setEditing(false)}
                disabled={saving}
              >
                إلغاء
              </button>
              <button className="button" disabled={saving}>
                {saving ? "جار الحفظ…" : "حفظ الصفحة"}
              </button>
            </div>
          </form>
        </AdminDialog>
      )}
    </article>
  );
}
