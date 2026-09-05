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
  const state = useApi<SettingsState>("/admin/site");
  const [message, setMessage] = useState("");
  if (state.loading) return <LoadingCards />;
  if (state.error || !state.data)
    return (
      <ErrorPanel
        message={state.error?.message ?? "تعذر تحميل الإعدادات."}
        retry={state.retry}
      />
    );
  const canGeneral = auth.hasPermission("settings.general.update");
  const canAppearance = auth.hasPermission("settings.appearance.update");
  const canNavigation = auth.hasPermission("settings.navigation.update");
  const canContent = auth.hasPermission("settings.content.update");
  const canWorkflow = auth.hasPermission("settings.workflow.manage");
  const knownTabs = [
    "general",
    "appearance",
    "navigation",
    "legislation",
    "workflow",
    "pages",
  ];
  if (!knownTabs.includes(tab) || (tab === "workflow" && !canWorkflow))
    return <Navigate to="/ar/admin/no-permission" replace />;
  const groups = state.data.settings.reduce<Record<string, Setting[]>>(
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
          ? canNavigation
          : canContent;
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
          { label: "عام", to: "/ar/admin/settings/general" },
          { label: "الهوية والمظهر", to: "/ar/admin/settings/appearance" },
          { label: "التنقل", to: "/ar/admin/settings/navigation" },
          { label: "صفحة التشريع", to: "/ar/admin/settings/legislation" },
          ...(canWorkflow
            ? [{ label: "سياسات سير العمل", to: "/ar/admin/settings/workflow" }]
            : []),
          {
            label: "الصفحات العامة",
            to: "/ar/admin/settings/pages",
            count: state.data.pages.length,
          },
        ]}
      />
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
      {tab === "workflow" && canWorkflow && <WorkflowPoliciesEditor />}
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
            {state.data.navigation.map((item) => (
              <NavigationEditor
                key={item.id}
                item={item}
                editable={canNavigation}
                done={(text) => {
                  setMessage(text);
                  state.retry();
                  void siteConfig.refresh();
                }}
              />
            ))}
          </div>
          {canNavigation && (
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
      {tab === "pages" && (
        <section className="admin-card">
          <h2>الصفحات العامة</h2>
          <p>
            الدستور والمنظومة والسياسات والأخبار والتعريف والتواصل والنصوص
            القانونية.
          </p>
          <div className="draft-articles">
            {state.data.pages.map((page) => (
              <PageEditor
                key={page.id}
                page={page}
                editable={canContent}
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
      {editable && (
        <label>
          سبب التغيير
          <input name="reason" required placeholder="سبب يظهر في سجل التدقيق" />
        </label>
      )}
      {editable && (
        <button className="button" disabled={!dirty || saving}>
          {saving ? "جار الحفظ…" : "حفظ هذا القسم"}
        </button>
      )}
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
  return (
    <details className="draft-article">
      <summary>
        {item.labelAr} — {item.location}
      </summary>
      {editable && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const f = new FormData(event.currentTarget);
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
              done("حُفظ رابط التنقل.");
            } catch (error) {
              done(error instanceof Error ? error.message : "تعذر الحفظ.");
            }
          }}
        >
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
          <button className="button secondary">حفظ الرابط</button>
        </form>
      )}
    </details>
  );
}

function NewNavigation({ done }: { done: (x: string) => void }) {
  return (
    <details className="draft-article">
      <summary>+ إضافة رابط جديد</summary>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const formElement = event.currentTarget;
          const f = new FormData(formElement);
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
            done("أضيف رابط التنقل.");
            formElement.reset();
          } catch (error) {
            done(error instanceof Error ? error.message : "تعذرت الإضافة.");
          }
        }}
      >
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
            <input name="sortOrder" type="number" min="0" defaultValue="50" />
          </label>
        </div>
        <label>
          سبب الإضافة
          <input name="reason" required />
        </label>
        <button className="button">إضافة الرابط</button>
      </form>
    </details>
  );
}

function PageEditor({
  page,
  editable,
  done,
}: {
  page: ContentPage;
  editable: boolean;
  done: (x: string) => void;
}) {
  const [sections, setSections] = useState(page.sections);
  if (!editable)
    return (
      <details className="draft-article">
        <summary>
          {page.titleAr} — /{page.slug}
        </summary>
        <p>{page.introAr || "لا توجد مقدمة."}</p>
        <span className="tag">{page.status}</span>
      </details>
    );
  return (
    <details className="draft-article">
      <summary>
        {page.titleAr} — /{page.slug}
      </summary>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const f = new FormData(event.currentTarget);
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
            done("حُفظت الصفحة العامة.");
          } catch (error) {
            done(error instanceof Error ? error.message : "تعذر حفظ الصفحة.");
          }
        }}
      >
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
              <option>DRAFT</option>
              <option>PUBLISHED</option>
              <option>ARCHIVED</option>
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
                onClick={() =>
                  setSections((old) => old.filter((_, i) => i !== index))
                }
              >
                حذف القسم
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="button secondary"
          onClick={() =>
            setSections((old) => [...old, { title: "قسم جديد", body: "" }])
          }
        >
          إضافة قسم
        </button>
        <label>
          سبب التغيير
          <input name="reason" required />
        </label>
        <button className="button">حفظ الصفحة</button>
      </form>
    </details>
  );
}
