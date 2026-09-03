# منصة التشريعات اليمنية

تطبيق محلي عربي RTL لإدارة النص القانوني المنظم ونسخه الزمنية ومصادره. هذه النسخة تنجز أساس المرحلة 0 وشريحة عاملة من MariaDB إلى NestJS REST/OpenAPI ثم React: الرئيسية، القائمة والفلاتر، تفاصيل التشريع والهيكل والمواد، النص النافذ في تاريخ، نافذة النصوص السابقة، بحث عربي أولي، خط تعديلات، ملحق PDF، وعلاقات موجهة. بيانات البذر اصطناعية وغير رسمية.

## المتطلبات المسبقة على Debian 12

- Node.js LTS 24 موصى به (`>=20.19` مدعوم للتطوير الحالي؛ بعض تبعيات Nest الحالية تعلن Node 22 فأعلى).
- MariaDB 10.11 أو أحدث، Nginx، `mariadb-client`، وأدوات البناء الأساسية.
- للاستخراج: `poppler-utils`. للـOCR عند تنفيذ مرحلته: `tesseract-ocr tesseract-ocr-ara`.
- للاختبارات المرئية: متصفح Playwright عبر `npx playwright install chromium`.

## تشغيل التطوير المباشر

```bash
cp .env.example .env
# عيّن كلمة مرور محلية قوية ثم أنشئ القاعدة (يشغّل الأمر كجذر MariaDB المحلي)
bash scripts/dev/setup-database.sh
npm install
npm run db:migrate
npm run seed
npm run dev
```

العناوين: الواجهة `http://localhost:5173/ar`، API عند `http://localhost:4000/api/v1`، فحص الصحة `/api/v1/health`، ووثائق OpenAPI عند `http://localhost:4000/api/docs`. الإيقاف في التطوير بـ`Ctrl+C`.

يولد البذر 20 تشريعًا و30 مادة للتشريع الطويل، أربع نسخ للمادة 20، ست عمليات تعديل، ثلاثة ملحقات، PDF اصطناعي، علاقات موجهة، ومصدر OCR غير مراجع مخفي. كلمة المرور التطويرية الظاهرة عند البذر للاختبار المحلي فقط؛ المصادقة الإنتاجية لم تنفذ بعد.

## الأوامر

```bash
npm run dev              # API + web + worker
npm run build            # بناء التطبيقات الثلاثة
npm run start            # API المبني (الواجهة يقدمها Nginx إنتاجيًا)
npm run start:worker
npm run lint             # TypeScript صارم
npm test                 # وحدة + تكامل MariaDB
npm run test:e2e         # رحلة المتصفح، axe، ولقطات 1440/1024/390
npm run seed             # يعيد بيانات التطوير؛ لا تشغله على بيانات حقيقية
npm run reindex          # يعيد فهرس MariaDB المشتق
npm run backup
npm run restore:check
```

## تشغيل النظام على Debian 12

1. أنشئ حساب الخدمة والمجلدات:

   ```bash
   sudo useradd --system --home /var/lib/yemen-legislation --shell /usr/sbin/nologin yemen-legislation
   sudo install -d -o yemen-legislation -g yemen-legislation -m 0750 /var/lib/yemen-legislation/{sources,exports,backups} /opt/yemen-legislation/releases /etc/yemen-legislation
   ```

2. ضع إصدار التطبيق في `/opt/yemen-legislation/releases/<version>` واجعل `/opt/yemen-legislation/current` رابطًا إليه، ثم شغّل `npm ci && npm run build && npm run db:migrate` بمتغيرات الإنتاج.
3. انسخ `.env.example` إلى `/etc/yemen-legislation/platform.env` بصلاحية `0640` وملكية `root:yemen-legislation`. اجعل `DATA_ROOT=/var/lib/yemen-legislation`، واستخدم مستخدم MariaDB محدودًا وكلمة مرور مختلفة.
4. انسخ وحدتي [systemd](infra/systemd/) إلى `/etc/systemd/system/` وإعداد [Nginx](infra/nginx/yemen-legislation.conf) إلى `/etc/nginx/sites-available/`، فعّل الموقع ثم:

   ```bash
   sudo nginx -t
   sudo systemctl daemon-reload
   sudo systemctl enable --now yemen-legislation-api yemen-legislation-worker nginx
   systemctl status yemen-legislation-api yemen-legislation-worker
   journalctl -u yemen-legislation-api -f
   sudo systemctl restart yemen-legislation-api yemen-legislation-worker
   sudo systemctl stop yemen-legislation-worker yemen-legislation-api
   ```

استخدم HTTP على `localhost` فقط. عند فتح الخدمة للشبكة اضبط `server_name` وشهادة HTTPS، واقصر الجدار الناري على 80/443؛ لا تعرض 3306 أو 4000. التحديث القابل للتراجع: ابنِ إصدارًا جديدًا، خذ نسخة، طبق الترحيل، افحص `/health`، بدّل رابط `current` ذريًا ثم أعد الخدمات. عند فشل الصحة أعد الرابط إلى الإصدار السابق؛ ترحيلات قاعدة البيانات تحتاج خطة رجوع مدروسة ولا تعكس آليًا بعد كتابة بيانات جديدة.

## النسخ والاستعادة

`npm run backup` ينشئ مجلدًا مؤرخًا بصلاحيات مقيدة يحتوي dump متسقًا، المصادر، وSHA-256. انقل نسخة ثانية إلى وسيط مشفر منفصل. `npm run restore:check` يتحقق من البصمات ويستعيد في قاعدة مؤقتة منفصلة ثم يحذفها؛ يحتاج وصول root المحلي إلى MariaDB ولا يمس القاعدة الأصلية. البحث مشتق ويعاد بعد الاستعادة بـ`npm run reindex`.

## الاستيراد وOCR والإدارة

راجع [دليل الاستيراد](docs/import-guide.md) و[دليل الإدارة](docs/admin-guide.md). الواجهات الكاملة للاستيراد/OCR/النشر ليست ضمن بوابة هذه الشريحة ولم توسم مكتملة.

## استكشاف المشكلات

- `Access denied`: تحقق أن `.env` موجود في الجذر وشغّل `scripts/dev/setup-database.sh`.
- فشل العارض: جرّب رابط التنزيل؛ تحقق من `DATA_ROOT` وملكية حساب الخدمة.
- لا تظهر نتيجة جديدة: شغّل `npm run reindex`؛ لا تعدل `search_documents` يدويًا.
- OCR العربي غير متاح: ثبت Tesseract وحزمة `ara`، ولا تغيّر المصدر إلى `REVIEWED` دون مراجعة بشرية.
- راقب القرص لأن المصادر والنسخ الاحتياطية لا تدخل Git. الجهاز المرجعي 16GB RAM؛ MariaDB وAPI والواجهة لا تتطلب OpenSearch أو Redis.

## حالة التنفيذ والقيود

الحالة الدقيقة في [docs/progress.md](docs/progress.md) وسجل التطابق في [docs/reference-parity.md](docs/reference-parity.md). لم يكتمل بعد PDF.js بكامل أدواته، الاستيراد/OCR، المصادقة الإنتاجية ولوحة الإدارة والنشر، بحث القرب والتحليلات الكاملة، واختبارات الاستعادة على نسخة هذه الجلسة. لا تعتبر المراحل 2–4 مكتملة.

