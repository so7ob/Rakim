import { useState, type FormEvent } from "react";
import { apiRequest } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { ErrorPanel, LoadingCards } from "../../components/StatePanel";
import { useApi } from "../../hooks/use-api";
import { useSiteConfig } from "../../site/SiteConfigContext";

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
};

export function AdminSettingsPage() {
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
  const isSystemAdmin = auth.hasRole("SYSTEM_ADMIN");
  const groups = state.data.settings.reduce<Record<string, Setting[]>>(
    (result, setting) => {
      (result[setting.groupCode] ??= []).push(setting);
      return result;
    },
    {},
  );
  return (
    <section>
      <header className="admin-title">
        <div>
          <span className="eyebrow dark">إعدادات ديناميكية مدققة</span>
          <h1>إعدادات المنصة</h1>
        </div>
      </header>
      <p className="admin-lead">
        تُحفظ الهوية والألوان والخلفيات والترويسة والتبويبات والصفحات في
        MariaDB، وتطبق على الواجهة دون تعديل الشفرة.
      </p>
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
      {isSystemAdmin &&
        Object.entries(groups).map(([group, settings]) => (
          <form
            className="admin-card settings-form"
            key={group}
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
              try {
                await apiRequest("/admin/site/settings", {
                  method: "PATCH",
                  body: { values, reason: form.get("reason") },
                });
                await siteConfig.refresh();
                setMessage(
                  `حُفظ قسم ${groupLabels[group] ?? group} وطُبق على الواجهة.`,
                );
                state.retry();
              } catch (error) {
                setMessage(
                  error instanceof Error
                    ? error.message
                    : "تعذر حفظ الإعدادات.",
                );
              }
            }}
          >
            <h2>{groupLabels[group] ?? group}</h2>
            <div className="settings-grid">
              {settings.map((setting) => (
                <SettingField key={setting.settingKey} setting={setting} />
              ))}
            </div>
            <label>
              سبب التغيير
              <input
                name="reason"
                required
                placeholder="سبب يظهر في سجل التدقيق"
              />
            </label>
            <button className="button">حفظ هذا القسم</button>
          </form>
        ))}
      <section className="admin-card">
        <h2>التبويبات وروابط الترويسة والتذييل</h2>
        <div className="draft-articles">
          {state.data.navigation.map((item) => (
            <NavigationEditor
              key={item.id}
              item={item}
              editable={isSystemAdmin}
              done={(text) => {
                setMessage(text);
                state.retry();
                void siteConfig.refresh();
              }}
            />
          ))}
        </div>
        {isSystemAdmin && (
          <NewNavigation
            done={(text) => {
              setMessage(text);
              state.retry();
              void siteConfig.refresh();
            }}
          />
        )}
      </section>
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
              done={(text) => {
                setMessage(text);
                state.retry();
              }}
            />
          ))}
        </div>
      </section>
    </section>
  );
}

function SettingField({ setting }: { setting: Setting }) {
  if (setting.inputType === "BOOLEAN")
    return (
      <label className="setting-toggle">
        <input
          type="checkbox"
          name={setting.settingKey}
          defaultChecked={Boolean(setting.value)}
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
  done,
}: {
  page: ContentPage;
  done: (x: string) => void;
}) {
  const [sections, setSections] = useState(page.sections);
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
