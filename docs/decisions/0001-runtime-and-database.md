# ADR-0001: Debian 12 وMariaDB هما مسار التشغيل الحاكم

- الحالة: مقبول
- التاريخ: 2026-09-04

## السياق

تقترح وثيقة V2.0 القديمة Windows/WSL2 وPostgreSQL وOpenSearch وDjango. يطلب تكليف التنفيذ الأحدث بصورة صريحة Debian 12 وNode.js/NestJS وMariaDB، مع جعل OpenSearch اختياريًا مستقبلًا.

## القرار

يُبنى التطبيق بـTypeScript: React/Vite للواجهة، NestJS للـREST API، TypeORM مع MariaDB كمصدر الحقيقة، وعامل Node مستقل بطابور MariaDB. التشغيل المباشر عبر systemd وNginx هو المسار الأساسي؛ Docker Compose مساعد فقط. البحث الأولي داخل MariaDB خلف واجهة `SearchProvider`.

## النتائج

هذا يحل التعارض لصالح الطلب الأحدث والأكثر تحديدًا، ويخفض استهلاك الجهاز المحلي. لا يمنع إضافة OpenSearch لاحقًا لأن فهرس البحث مشتق وقابل لإعادة البناء.
