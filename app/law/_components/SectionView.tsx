"use client";

import { MARKERS, findMarker, type MarkerMeta } from "@/lib/korean-law/markers";
import type { ChainSection } from "@/lib/korean-law/types";

/**
 * 체인 섹션 렌더러.
 *
 * `note` 에 담긴 마커(`[NOT_FOUND]` 등)를 찾아 아이콘·배경·LLM 경고 배너를 일관 표시.
 * 섹션 실패 시에도 제목은 유지하여 사용자가 어느 섹션에서 문제가 발생했는지 인지할 수 있게 한다.
 */
export function SectionView({ section }: { section: ChainSection }) {
  const marker: MarkerMeta | null = findMarker(section.note);
  const bgClass = marker?.bgClass ?? "border-border bg-card";
  const textClass = marker?.textClass ?? "";

  return (
    <section className={`rounded-md border p-4 ${bgClass}`}>
      <h3 className={`mb-2 text-sm font-semibold ${textClass}`}>
        {marker && <span className="mr-1">{marker.icon}</span>}
        {section.heading}
      </h3>

      {section.note && <MarkerNote note={section.note} marker={marker} />}

      {section.laws && section.laws.length > 0 && (
        <ul className="space-y-1 text-sm">
          {section.laws.map((l) => (
            <li key={l.mst} className="flex items-center justify-between">
              <span>
                {l.lawName}
                <span className="ml-2 text-xs text-muted-foreground">
                  공포 {l.promulgationDate}
                </span>
              </span>
              <a
                href={`https://www.law.go.kr/법령/${encodeURIComponent(l.lawName)}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary hover:underline"
              >
                원문 ↗
              </a>
            </li>
          ))}
        </ul>
      )}

      {section.decisions && section.decisions.length > 0 && (
        <ul className="space-y-1 text-sm">
          {section.decisions.map((d, i) => (
            <li key={d.id || i} className="truncate">
              <span className="truncate">{d.title}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {d.court} · {d.caseNo} · {d.date}
              </span>
            </li>
          ))}
        </ul>
      )}

      {section.annexes && section.annexes.length > 0 && (
        <ul className="space-y-1 text-sm">
          {section.annexes.map((a, i) => (
            <li key={`${a.annexNo}-${i}`}>
              별표 {a.annexNo} · {a.title || "(제목 없음)"}
              {a.downloadUrl && (
                <a
                  href={a.downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-2 text-xs text-primary hover:underline"
                >
                  다운로드 ↗
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      {section.citations && section.citations.length > 0 && (
        <ul className="space-y-1 text-sm">
          {section.citations.map((c, i) => (
            <li
              key={i}
              className={`rounded border-l-2 pl-2 ${
                c.valid
                  ? "border-green-500 text-green-800 dark:text-green-300"
                  : "border-red-500 text-red-800 dark:text-red-300"
              }`}
            >
              <span className="font-medium">{c.raw}</span>
              <span className="ml-2 text-xs">
                {c.valid ? "✓ 실존 확인" : `✗ ${c.reason ?? "검증 실패"}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * 마커가 붙은 note는 경고 배너 + 원문 두 줄로 분리 렌더.
 * 마커가 없는 일반 안내는 whitespace-pre-wrap 으로 단순 출력.
 */
function MarkerNote({
  note,
  marker,
}: {
  note: string;
  marker: MarkerMeta | null;
}) {
  if (!marker) {
    return (
      <p className="whitespace-pre-wrap text-sm text-muted-foreground">{note}</p>
    );
  }
  // 마커 태그 제거 후 잔여 메시지만 표시
  const clean = note.replace(marker.tag, "").trimStart();
  return (
    <div className="space-y-1 text-sm">
      <p className={`font-medium ${marker.textClass}`}>
        {marker.banner}
      </p>
      <p className={`text-xs ${marker.textClass} opacity-80`}>
        ⚠️ {marker.llmWarning}
      </p>
      {clean && (
        <p className="whitespace-pre-wrap text-xs text-muted-foreground">
          {clean}
        </p>
      )}
    </div>
  );
}

export { MARKERS };
