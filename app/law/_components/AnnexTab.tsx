"use client";

import { useState } from "react";
import type { AnnexItem } from "@/lib/korean-law/types";

/**
 * 별표·서식 목록 탭
 *
 * Phase 1: 메타데이터 (annexNo, title, fileType, downloadUrl)
 * Phase 4 (PDF 경량): PDF 파일은 "본문 보기" 토글로 텍스트 추출 (pdfjs-dist)
 *                    그 외 형식(HWPX/HWP5/XLSX/DOCX)은 링크+배지만 표시
 */
export function AnnexTab() {
  const [lawName, setLawName] = useState("소득세법");
  const [items, setItems] = useState<AnnexItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    setItems([]);
    setSearched(true);
    try {
      const res = await fetch(`/api/law/annexes?lawName=${encodeURIComponent(lawName)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setItems(data.annexes ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900/40 dark:bg-blue-900/10 dark:text-blue-200">
        <p className="font-medium">ⓘ 별표·서식 조회 안내</p>
        <p className="mt-1">
          법제처 Open API는 현재 법령 기본 응답에 별표 메타데이터를 포함하지 않아 대부분 0건으로 반환됩니다.
          <strong className="font-medium"> PDF 형식의 별표는 &ldquo;본문 보기&rdquo; 버튼으로 텍스트를 확인</strong>할 수 있으며, HWPX/HWP5/XLSX/DOCX 는 다운로드 후 확인해야 합니다.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={lawName}
          onChange={(e) => setLawName(e.target.value)}
          placeholder="법령명 (예: 소득세법 시행규칙)"
          className="flex-1 min-w-48 rounded-md border bg-background px-3 py-2 text-sm"
        />
        <button
          onClick={load}
          disabled={loading || !lawName}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {loading ? "조회 중..." : "별표 목록 조회"}
        </button>
        {lawName && (
          <a
            href={`https://www.law.go.kr/법령/${encodeURIComponent(lawName)}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            법제처 원문 ↗
          </a>
        )}
      </div>

      {loading && !error && (
        <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
          법제처에 요청 중...
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
          {error}
        </div>
      )}

      {items.length > 0 ? (
        <ul className="divide-y rounded-md border">
          {items.map((a, idx) => (
            <AnnexRow key={`${a.annexNo}-${idx}`} item={a} />
          ))}
        </ul>
      ) : searched && !loading && !error ? (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          <p>별표 데이터가 반환되지 않았습니다. 위의 &quot;법제처 원문 ↗&quot; 링크에서 별표·서식을 직접 확인해 주세요.</p>
        </div>
      ) : (
        !loading && <p className="text-sm text-muted-foreground">법령명을 입력하고 조회해 주세요.</p>
      )}
    </div>
  );
}

function detectExt(url?: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\.([a-zA-Z0-9]+)$/);
    return m ? m[1].toLowerCase() : "";
  } catch {
    const m = url.match(/\.([a-zA-Z0-9]+)(?:$|[?#])/);
    return m ? m[1].toLowerCase() : "";
  }
}

function AnnexRow({ item }: { item: AnnexItem }) {
  const [text, setText] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [parseLoading, setParseLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const fileExt = detectExt(item.downloadUrl) || (item.fileType ?? "").toLowerCase();
  const isPdf = fileExt === "pdf";

  async function parsePdf() {
    if (!item.downloadUrl) return;
    setParseLoading(true);
    setParseError(null);
    try {
      const res = await fetch("/api/law/annexes/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          annexId: `${item.annexNo}-${(item.title ?? "").slice(0, 20)}`,
          fileUrl: item.downloadUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setText(data.text ?? "");
      setExpanded(true);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
    } finally {
      setParseLoading(false);
    }
  }

  return (
    <li className="p-3 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-medium">별표 {item.annexNo}</span>
          <span className="ml-2">{item.title || "(제목 없음)"}</span>
          {fileExt && (
            <span
              className={`ml-2 rounded px-1.5 py-0.5 text-xs ${
                isPdf
                  ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                  : "bg-muted text-muted-foreground"
              }`}
              title={isPdf ? "본문 보기 지원" : "다운로드만 지원"}
            >
              {fileExt.toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {isPdf && item.downloadUrl && (
            <button
              onClick={() => (text ? setExpanded(!expanded) : parsePdf())}
              disabled={parseLoading}
              className="rounded border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
            >
              {parseLoading
                ? "파싱 중..."
                : text
                  ? expanded ? "접기" : "본문 보기"
                  : "본문 보기"}
            </button>
          )}
          {item.downloadUrl && (
            <a
              href={item.downloadUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded border px-2 py-1 text-xs text-primary hover:bg-accent"
            >
              다운로드 ↗
            </a>
          )}
        </div>
      </div>
      {parseError && (
        <p className="mt-2 rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
          {parseError}
        </p>
      )}
      {expanded && text !== null && (
        <pre className="mt-2 max-h-96 overflow-auto rounded-md border bg-muted/20 p-3 text-xs whitespace-pre-wrap">
          {text || "(텍스트가 추출되지 않았습니다. 이미지 기반 PDF일 수 있습니다.)"}
        </pre>
      )}
    </li>
  );
}
