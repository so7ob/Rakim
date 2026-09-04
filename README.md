# منصة التشريعات اليمنية

تطبيق ويب محلي عربي RTL لإدارة التشريعات ومصادرها ونسخ المواد الزمنية والتعديلات والملحقات والعلاقات القانونية. MariaDB هو مصدر الحقيقة، ويقدم NestJS واجهة REST/JSON موثقة، وتستهلكها واجهة React/Vite وعامل مهام Node مستقل. كل بيانات البذر اصطناعية وغير رسمية.

## المتطلبات المسبقة — Debian 12

- Node.js LTS حديث يدعم `>=22.13` وnpm 10 أو أحدث؛ يوصى بـNode 24 LTS عند النشر.
- MariaDB 10.11، و`mariadb-client`، وNginx، و`build-essential`.
- للاستخراج وOCR: `poppler-utils tesseract-ocr tesseract-ocr-ara`.
- لا يحتاج التشغيل إلى Docker أو Redis أو OpenSearch.

```bash
sudo apt update
sudo apt install mariadb-server mariadb-client nginx build-essential poppler-utils tesseract-ocr tesseract-ocr-ara
```

## الإعداد والتشغيل في التطوير

```bash
cp .env.example .env
# غيّر DATABASE_PASSWORD وDATA_ROOT بما يناسب الجهاز
sudo bash scripts/dev/setup-database.sh
npm install
npm run db:migrate
npm run seed
npm run dev
```

العناوين الافتراضية:

- الواجهة: `http://localhost:5173/ar`
- تسجيل الدخول: `http://localhost:5173/ar/login`
- لوحة الإدارة: `http://localhost:5173/ar/admin`
- API: `http://localhost:4000/api/v1`
- OpenAPI/Swagger: `http://localhost:4000/api/docs`
- الصحة: `http://localhost:4000/api/v1/health`

أوقف خدمات التطوير بـ`Ctrl+C`. عند ظهور رسالة اتصال في أول تحميل، تأكد من أن API يعمل على المنفذ 4000؛ إلغاء طلب React أثناء StrictMode لا يعامل خطأً في التطبيق.

### الحسابات التطويرية

كلمة المرور المشتركة بعد `npm run seed` هي `DevOnly!ChangeMe2026`، وأسماء الدخول: `reader` و`data_entry` و`legal_reviewer` و`content_manager` و`system_admin`. هذه بيانات محلية معلنة للاختبار فقط؛ غيّرها أو احذفها قبل أي نشر شبكي.

## الأوامر الموحدة

```bash
npm run dev                 # API + React + worker
npm run build               # بناء التطبيقات الثلاثة
npm run start               # تشغيل API المبني
npm run start:worker        # تشغيل العامل المبني
npm run lint                # فحص TypeScript الصارم
npm test                    # اختبارات الوحدة والتكامل والاستخراج
npm run test:e2e            # Playwright + axe + لقطات 1440/1024/390/320
npm run test:performance    # p95 للبحث؛ يفترض أن API يعمل
npm run test:infra          # تحقق صياغة Nginx ووحدات systemd
npm run db:migrate
npm run seed                # يعيد بيانات التطوير بالكامل
npm run reindex             # يبني فهرس MariaDB المشتق من المصدر
npm run backup
npm run restore:check
```

## الاستيراد وOCR ودورة النشر

من `/ar/admin/imports` يرفع مدخل البيانات TXT وMarkdown وDOCX وPDF والصور وCSV وXLSX. يتحقق API من النوع والحجم والبصمة SHA-256 والتكرار، ثم يخزن المصدر خارج الشفرة ويضع مهمة MariaDB. يستخرج العامل النص والجداول ومعلومات الصفحات، ويشغّل Tesseract العربي للصور وPDF الممسوح. لا يظهر OCR غير المراجع للعامة.

الدورة هي `INBOX → DRAFT → IN_REVIEW → APPROVED_FOR_PUBLISHING → PUBLISHED → ARCHIVED`. مدخل البيانات لا يراجع أو ينشر، والمراجع القانوني لا ينشر، ومدير المحتوى لا يعتمد عملًا شارك في إدخاله أو مراجعته، ومدير النظام التقني لا يملك النشر تلقائيًا. راجع [دليل الاستيراد](docs/import-guide.md) و[دليل الإدارة](docs/admin-guide.md).

## تشغيل الإنتاج المحلي عبر systemd وNginx

1. أنشئ مستخدمًا ومجلدات محدودة الصلاحية:

   ```bash
   sudo useradd --system --home /var/lib/yemen-legislation --shell /usr/sbin/nologin yemen-legislation
   sudo install -d -o yemen-legislation -g yemen-legislation -m 0750 /var/lib/yemen-legislation/{sources,exports,backups} /opt/yemen-legislation/releases /etc/yemen-legislation
   ```

2. ضع الإصدار في `/opt/yemen-legislation/releases/<version>`، نفّذ `npm ci && npm run build && npm run db:migrate`، ثم اجعل `/opt/yemen-legislation/current` رابطًا رمزيًا إلى الإصدار.
3. انسخ `.env.example` إلى `/etc/yemen-legislation/platform.env`، اضبط `NODE_ENV=production` و`DATA_ROOT=/var/lib/yemen-legislation` وبيانات MariaDB محدودة الصلاحية، ثم `chmod 0640` وملكية `root:yemen-legislation`.
4. انسخ وحدتي [systemd](infra/systemd/) إلى `/etc/systemd/system/` وملف [Nginx](infra/nginx/yemen-legislation.conf) إلى `/etc/nginx/sites-available/yemen-legislation` وفعّل الرابط في `sites-enabled`.

```bash
sudo nginx -t
sudo systemctl daemon-reload
sudo systemctl enable --now mariadb nginx yemen-legislation-api yemen-legislation-worker
systemctl status yemen-legislation-api yemen-legislation-worker
journalctl -u yemen-legislation-api -f
journalctl -u yemen-legislation-worker -f
sudo systemctl restart yemen-legislation-api yemen-legislation-worker
sudo systemctl stop yemen-legislation-worker yemen-legislation-api
```

استخدم HTTP على `localhost` فقط. عند إتاحته على شبكة، فعّل HTTPS في Nginx، اسمح بـ80/443 فقط، ولا تعرض 3306 أو 4000. للنشر القابل للتراجع: خذ نسخة، ابنِ مجلد إصدار جديدًا، طبّق الترحيل، افحص الصحة، بدّل رابط `current` ذريًا، ثم أعد تشغيل الخدمتين. أعد الرابط السابق إذا فشل فحص الصحة؛ لا تعكس ترحيلًا كتب بيانات بلا خطة بيانات صريحة.

## النسخ والاستعادة

`npm run backup` ينشئ dump متسقًا مع المشغلات والروتينات، وأرشيف المصادر، وmanifest، وبصمات SHA-256 داخل `DATA_ROOT/backups`. احفظ نسخة ثانية على وسيط مشفر منفصل. `npm run restore:check` يتحقق من البصمات ويستعيد إلى قاعدة مؤقتة مستقلة ثم يحذفها، ولا يمس قاعدة العمل. بعد استعادة فعلية شغّل `npm run reindex` لأن فهرس البحث مشتق.

## الأمن والمراقبة

- جلسة إدارية عشوائية في cookie من نوع HttpOnly وSameSite=Strict، وCSRF للطلبات المغيّرة، وCORS مقيّد بـ`WEB_ORIGIN`.
- قفل مؤقت بعد محاولات دخول فاشلة، scrypt لكلمات المرور، وإبطال الجلسات عند تغيير الدور أو كلمة المرور أو تعطيل الحساب.
- سجل تدقيق قبل/بعد مع السبب والفاعل والوقت، ولا توجد واجهة لتعديله.
- `/health` يفحص MariaDB ونبض العامل والطابور ومساحة التخزين. السجلات منظمة ويمكن متابعتها بـ`journalctl`.
- لا تودع `.env` أو `data/sources` أو النسخ الاحتياطية في Git.

## استكشاف المشكلات

- `Access denied`: راجع `.env` ثم أعد تشغيل `scripts/dev/setup-database.sh` بصلاحية MariaDB المناسبة.
- فشل ملف داخل العارض: استخدم زر التنزيل وتحقق من `DATA_ROOT` وملكية مستخدم الخدمة.
- لا تظهر نتيجة جديدة: تأكد من نبض العامل ثم شغّل `npm run reindex`؛ لا تعدل `search_documents` يدويًا.
- OCR العربي يفشل: تحقق بـ`tesseract --list-langs` من وجود `ara`، ومن توفر `pdftoppm` و`pdfinfo`.
- امتلاء القرص: راقب `storage.freeBytes` في الصحة، وانقل النسخ القديمة وفق سياسة احتفاظ معتمدة.

التصميم والقيود المعروفة موثقة في [سجل التقدم](docs/progress.md)، و[سجل المطابقة](docs/reference-parity.md)، و[تقرير التحقق](docs/verification-report.md).
