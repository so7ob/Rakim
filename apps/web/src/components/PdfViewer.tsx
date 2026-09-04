import { useEffect, useRef, useState } from "react";
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

export function PdfViewer({
  url,
  fileName,
  reportedPages,
  initialPage = 1,
}: {
  url: string;
  fileName: string;
  reportedPages?: number | null;
  initialPage?: number;
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(initialPage);
  const [scale, setScale] = useState(1.15);
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<number[]>([]);
  const [matchIndex, setMatchIndex] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    const task = getDocument({ url, withCredentials: true });
    setLoading(true);
    setError("");
    task.promise
      .then((doc) => {
        if (active) {
          setPdf(doc);
          setPage(Math.min(Math.max(1, initialPage), doc.numPages));
        }
      })
      .catch(() => {
        if (active) setError("تعذر تحميل ملف PDF داخل العارض.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      void task.destroy();
    };
  }, [url, initialPage]);
  useEffect(() => {
    if (!pdf || !canvas.current) return;
    let cancelled = false;
    let renderTask:
      { cancel: () => void; promise: Promise<unknown> } | undefined;
    void pdf
      .getPage(page)
      .then((pdfPage) => {
        if (cancelled) return;
        const viewport = pdfPage.getViewport({ scale, rotation });
        const element = canvas.current!;
        const context = element.getContext("2d");
        if (!context) return;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        element.width = Math.floor(viewport.width * ratio);
        element.height = Math.floor(viewport.height * ratio);
        element.style.width = `${Math.floor(viewport.width)}px`;
        element.style.height = `${Math.floor(viewport.height)}px`;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        renderTask = pdfPage.render({
          canvas: element,
          canvasContext: context,
          viewport,
        });
        return renderTask.promise;
      })
      .catch((reason) => {
        if (reason?.name !== "RenderingCancelledException")
          setError("تعذر رسم الصفحة المطلوبة.");
      });
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdf, page, scale, rotation]);
  const search = async () => {
    if (!pdf || !query.trim()) {
      setMatches([]);
      return;
    }
    const found: number[] = [];
    for (let index = 1; index <= pdf.numPages; index++) {
      const content = await (await pdf.getPage(index)).getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
      if (text.includes(query.trim())) found.push(index);
    }
    setMatches(found);
    setMatchIndex(0);
    if (found[0]) setPage(found[0]);
  };
  const fit = async () => {
    if (!pdf || !shell.current) return;
    const pdfPage = await pdf.getPage(page);
    const viewport = pdfPage.getViewport({ scale: 1, rotation });
    setScale(
      Math.max(
        0.5,
        Math.min(3, (shell.current.clientWidth - 48) / viewport.width),
      ),
    );
  };
  const jump = (direction: number) => {
    if (!matches.length) return;
    const next = (matchIndex + direction + matches.length) % matches.length;
    setMatchIndex(next);
    setPage(matches[next]!);
  };
  if (error)
    return (
      <div className="pdf-fallback" role="alert">
        <h3>تعذر عرض الملف</h3>
        <p>{error}</p>
        <dl>
          <div>
            <dt>الملف</dt>
            <dd>{fileName}</dd>
          </div>
          <div>
            <dt>عدد الصفحات</dt>
            <dd>{reportedPages ?? "غير معروف"}</dd>
          </div>
        </dl>
        <a className="button" href={url} download>
          تنزيل الملف
        </a>
      </div>
    );
  return (
    <div
      className="pdfjs-viewer"
      ref={shell}
      aria-label={`عارض PDF: ${fileName}`}
    >
      <div className="pdf-toolbar">
        <button
          onClick={() => setPage((value) => Math.max(1, value - 1))}
          disabled={page <= 1}
          aria-label="الصفحة السابقة"
        >
          السابق
        </button>
        <label className="page-control">
          <span className="sr-only">رقم الصفحة</span>
          <input
            type="number"
            min="1"
            max={pdf?.numPages ?? reportedPages ?? 1}
            value={page}
            onChange={(e) =>
              setPage(
                Math.min(
                  pdf?.numPages ?? 1,
                  Math.max(1, Number(e.target.value)),
                ),
              )
            }
          />
          <span>من {pdf?.numPages ?? reportedPages ?? "…"}</span>
        </label>
        <span className="toolbar-separator" />
        <button
          onClick={() => setScale((value) => Math.max(0.5, value - 0.15))}
          aria-label="تصغير"
        >
          −
        </button>
        <strong>{Math.round(scale * 100)}%</strong>
        <button
          onClick={() => setScale((value) => Math.min(3, value + 0.15))}
          aria-label="تكبير"
        >
          +
        </button>
        <button onClick={fit}>ملاءمة العرض</button>
        <button onClick={() => setRotation((value) => (value + 90) % 360)}>
          تدوير
        </button>
        <span className="toolbar-separator" />
        <button onClick={() => shell.current?.requestFullscreen()}>
          شاشة كاملة
        </button>
        <a href={url} download>
          تنزيل
        </a>
        <button
          onClick={() => {
            const frame = document.createElement("iframe");
            frame.hidden = true;
            frame.src = url;
            frame.onload = () => {
              frame.contentWindow?.print();
              setTimeout(() => frame.remove(), 1000);
            };
            document.body.append(frame);
          }}
        >
          طباعة
        </button>
      </div>
      <form
        className="pdf-search"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <label>
          <span className="sr-only">بحث داخل الملف</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="بحث داخل الملف"
          />
        </label>
        <button>بحث</button>
        {matches.length > 0 && (
          <>
            <span>
              {matchIndex + 1} من {matches.length}
            </span>
            <button type="button" onClick={() => jump(-1)}>
              السابق
            </button>
            <button type="button" onClick={() => jump(1)}>
              التالي
            </button>
          </>
        )}
        {query && matches.length === 0 && !loading && (
          <span role="status">لا نتائج</span>
        )}
      </form>
      <div className="pdf-workspace">
        <aside className="pdf-thumbnails" aria-label="مصغرات الصفحات">
          {pdf &&
            Array.from({ length: pdf.numPages }, (_, index) => (
              <Thumbnail
                key={index + 1}
                pdf={pdf}
                page={index + 1}
                active={page === index + 1}
                select={setPage}
              />
            ))}
        </aside>
        <div className="pdf-canvas-wrap" aria-busy={loading}>
          {loading ? (
            <p>جار تحميل ملف PDF…</p>
          ) : (
            <>
              <canvas ref={canvas} aria-label={`الصفحة ${page}`} />
              {matches.includes(page) && (
                <p className="pdf-match-note" role="status">
                  تحتوي هذه الصفحة على العبارة المطلوبة: <mark>{query}</mark>
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Thumbnail({
  pdf,
  page,
  active,
  select,
}: {
  pdf: PDFDocumentProxy;
  page: number;
  active: boolean;
  select: (value: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let render: { cancel: () => void } | undefined;
    void pdf.getPage(page).then((p) => {
      const viewport = p.getViewport({ scale: 0.18 });
      const canvas = ref.current;
      if (!canvas) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext("2d");
      if (context)
        render = p.render({ canvas, canvasContext: context, viewport });
    });
    return () => render?.cancel();
  }, [pdf, page]);
  return (
    <button
      className={active ? "active" : ""}
      onClick={() => select(page)}
      aria-label={`فتح الصفحة ${page}`}
    >
      <canvas ref={ref} />
      <span>{page}</span>
    </button>
  );
}
