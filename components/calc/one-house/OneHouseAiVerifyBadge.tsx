/**
 * 1세대1주택 AI 원문 검증 — 쟁점별 배지와 펼치면 보이는 원문 발췌(계획 §3.5-3 · 설계 §4).
 *
 * 「원문과 다름」은 숨기지 않고 경고로 보여 준다(판단은 사용자). `tones.ts`의 rose는 「지역·지정」 의미라 쓰지 않고,
 * 같은 컴포넌트군의 `role="alert"` 경고 문구 색을 따른다.
 */
import { TONE } from "@/components/calc/shared/tones";
import { docKey } from "@/lib/korean-law/doc-key";
import type { OneHouseAiVerifyData, PointCheck } from "@/lib/one-house-ai/verify/verify-schema";

const BADGE: Record<PointCheck["support"], { label: string; className: string }> = {
  supported: { label: "원문 일치", className: TONE.emerald.badge },
  partial: { label: "일부 일치", className: TONE.amber.badge },
  not_supported: {
    label: "원문과 다름",
    className: "border border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
  },
  cannot_verify: { label: "확인 불가", className: TONE.slate.badge },
};

const STATUTE_STATUS = { verified: "확인됨", not_found: "시행본에 없음", failed: "조회 실패" } as const;
const DOC_STATUS = { fetched: "원문 받음", mismatch: "문서 불일치", failed: "조회 실패" } as const;

export function OneHouseAiVerifyBadge({ index, verify }: { index: number; verify: OneHouseAiVerifyData }) {
  const point = verify.points.find((p) => p.index === index);
  if (!point) return null;
  const b = BADGE[point.support];
  const statutes = point.statuteKeys.map((k) => verify.statutes.find((s) => s.key === k)).filter((s) => s !== undefined);
  const docs = point.docNos.map((d) => verify.docs.find((x) => docKey(x.docNo) === docKey(d))).filter((d) => d !== undefined);
  return (
    <div className="mt-1 space-y-1">
      <span data-testid={`one-house-ai-verify-badge-${index}`} className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${b.className}`}>
        {b.label}
      </span>
      {(point.reason || point.unsupportedClaims.length > 0 || statutes.length > 0 || docs.length > 0) && (
        <details data-testid={`one-house-ai-verify-excerpt-${index}`} className="text-caption">
          <summary className="cursor-pointer text-muted-foreground">원문 대조 보기</summary>
          <div className="mt-1 space-y-1 break-words">
            {point.reason && <p>{point.reason}</p>}
            {point.unsupportedClaims.length > 0 && (
              <ul className="list-disc pl-4 text-rose-700 dark:text-rose-400">
                {point.unsupportedClaims.map((c, i) => (
                  <li key={i}>원문에 없음: {c}</li>
                ))}
              </ul>
            )}
            {statutes.map((s) => (
              <div key={s.key}>
                <p className="font-medium">
                  {s.key} — {STATUTE_STATUS[s.status]}
                  {s.baseDate ? ` (${s.baseDate} 시행본${s.versionEfYd ? `, 시행일 ${s.versionEfYd}` : ""})` : " (현행 기준)"}
                  {s.reason ? ` · ${s.reason}` : ""}
                </p>
                {s.excerpt && <p className="whitespace-pre-line text-muted-foreground">{s.excerpt}</p>}
              </div>
            ))}
            {docs.map((d) => (
              <div key={d.docNo}>
                <p className="font-medium">
                  {d.url ? (
                    <a href={d.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                      {d.docNo}
                    </a>
                  ) : (
                    d.docNo
                  )}{" "}
                  — {DOC_STATUS[d.status]}
                  {d.reason ? ` · ${d.reason}` : ""}
                </p>
                {d.excerpt && <p className="whitespace-pre-line text-muted-foreground">{d.excerpt}</p>}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
