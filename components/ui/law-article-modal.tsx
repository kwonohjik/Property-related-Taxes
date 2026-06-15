"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { parseLawRef, buildLawUrl, extractClauseMarkers } from "@/lib/utils/law-url";

interface Props {
  legalBasis: string;
  /** 버튼에 표시할 짧은 레이블. 없으면 legalBasis 전체를 표시. */
  label?: string;
  className?: string;
}

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; content: string }
  | { status: "error"; message: string };

/** 항(項) 번호 동그라미 숫자 — 본문을 항 단위로 분할해 인용 항을 강조(G-5) */
const CLAUSE_MARKERS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮";

// 법령 원문에 포함된 <img> 태그를 실제 이미지로 렌더링
// law.go.kr API는 <img src="...">ASCII표 텍스트</img> 형태로 반환하므로
// 개구 태그~닫힘 태그 사이 텍스트 표현은 이미지로 대체
export function LawContent({
  content,
  highlight,
}: {
  content: string;
  /** 강조할 항(項) 마커 집합 (예: new Set(["③"])) — 인용 항을 본문에서 시각 강조 */
  highlight?: Set<string>;
}) {
  // <img ...>...</img> (텍스트 내용 포함) 또는 단독 <img ...> 기준으로 분리
  const parts = content.split(/(<img\b[^>]*>[\s\S]*?<\/img>|<img\b[^>]*>)/gi);
  const hi = highlight && highlight.size > 0 ? highlight : null;

  return (
    <div className="text-xs leading-relaxed font-sans bg-muted/50 rounded-md p-3 max-h-[70vh] overflow-y-auto space-y-2">
      {parts.map((part, i) => {
        // <img ...>...</img> 또는 <img ...> — 여는 태그에서 src 추출
        const imgMatch = part.match(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/i);
        if (imgMatch) {
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={imgMatch[1].replace(/^http:/, "https:")}
              alt="법령 표"
              className="max-w-full rounded border border-border/40"
            />
          );
        }
        const text = part.trim();
        if (!text) return null;
        // 강조 대상 없으면 기존 단일 <pre> (회귀 보존)
        if (!hi) {
          return (
            <pre key={i} className="whitespace-pre-wrap break-words font-sans">
              {text}
            </pre>
          );
        }
        // 항(①~⑮) 경계로 분할 후 인용 항만 강조 (해당 항 안의 호도 함께 강조됨)
        const clauses = text.split(new RegExp(`(?=[${CLAUSE_MARKERS}])`));
        return (
          <div key={i} className="space-y-1">
            {clauses.map((clause, j) => {
              const t = clause.trim();
              if (!t) return null;
              const marker = [...t][0];
              const isHighlighted =
                CLAUSE_MARKERS.includes(marker) && hi.has(marker);
              return (
                <pre
                  key={j}
                  data-clause={CLAUSE_MARKERS.includes(marker) ? marker : undefined}
                  data-highlighted={isHighlighted || undefined}
                  className={
                    isHighlighted
                      ? "whitespace-pre-wrap break-words font-sans rounded border-l-2 border-amber-400 bg-amber-100 py-0.5 pl-2 dark:border-amber-600 dark:bg-amber-900/40"
                      : "whitespace-pre-wrap break-words font-sans"
                  }
                >
                  {clause}
                </pre>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/** "168의14" → "제168조의14", "89" → "제89조" */
function formatArticleTitle(articleNum: string): string {
  if (articleNum.includes("의")) {
    const idx = articleNum.indexOf("의");
    return `제${articleNum.slice(0, idx)}조의${articleNum.slice(idx + 1)}`;
  }
  return `제${articleNum}조`;
}

export function LawArticleModal({ legalBasis, label, className }: Props) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FetchState>({ status: "idle" });

  const ref = parseLawRef(legalBasis);
  // 인용 항(項) 마커 — 본문 하이라이트용 (label 우선, 없으면 legalBasis). G-5.
  const highlightMarkers = useMemo(
    () => new Set(extractClauseMarkers(label ?? legalBasis)),
    [label, legalBasis],
  );

  async function handleOpen() {
    setOpen(true);
    if (state.status !== "idle") return;
    if (!ref) {
      setState({ status: "error", message: "조문 정보를 파싱할 수 없습니다." });
      return;
    }
    setState({ status: "loading" });
    try {
      const params = new URLSearchParams({ law: ref.lawName, articleNum: ref.articleNum });
      const res = await fetch(`/api/law/article?${params}`);
      const json = await res.json();
      if (!res.ok) {
        setState({ status: "error", message: json?.error?.message ?? "조회 실패" });
      } else {
        setState({ status: "ok", content: json.content });
      }
    } catch {
      setState({ status: "error", message: "네트워크 오류로 조회에 실패했습니다." });
    }
  }

  const title = ref
    ? `${ref.lawName} ${formatArticleTitle(ref.articleNum)}`
    : legalBasis;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={handleOpen}
        className={
          className ??
          "inline-block mt-1 text-[10px] text-muted-foreground/70 border border-border/60 rounded px-1.5 py-0.5 hover:text-primary hover:border-primary/50 transition-colors cursor-pointer"
        }
      >
        {label ?? legalBasis} ↗
      </button>

      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="mt-2 min-h-[120px]">
          {state.status === "loading" && (
            <p className="text-sm text-muted-foreground animate-pulse">조문 조회 중...</p>
          )}

          {state.status === "ok" && (
            <LawContent content={state.content} highlight={highlightMarkers} />
          )}

          {state.status === "error" && (
            <div className="space-y-2 text-sm">
              <p className="text-destructive text-xs">{state.message}</p>
              <p className="text-muted-foreground text-xs">
                국가법령정보센터에서 직접 확인하세요.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="border-t-0 bg-transparent pt-2">
          <a
            href={buildLawUrl(legalBasis)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline"
          >
            국가법령정보센터에서 보기 ↗
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
