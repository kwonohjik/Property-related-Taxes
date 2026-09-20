"use client";

/**
 * ④ 1세대1주택 비과세 **판정 결과** (P4-2b-2)
 *
 * UI 설계 §3.4. 계획서 G-3(조건부·기한) · Q-4(기한은 날짜로).
 *
 * ## 🔑 이 화면은 **세액을 말하지 않는다**
 *
 * 판정까지가 전부다. 산식·세율·공제는 계산기의 몫이고, 여기서 흉내 내면 두 화면이 다른 답을 낸다.
 *
 * ## 🔑 날짜를 **다시 계산하지 않는다**
 *
 * `pending[].deadline`은 **엔진이 낸 값**을 그대로 포맷만 해서 보여준다. UI가 역산하면
 * dual truth가 된다(`feedback_aggregate_display_rederives_engine_value`).
 */
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { OneHouseExemptionResponse } from "@/app/api/calc/one-house-exemption/route";
import { oneHouseVerdictOf } from "@/lib/calc/one-house-judgment-verdict";

/** JSON을 거치며 Date가 ISO 문자열이 된다 — 그 형태를 그대로 받는다. */
type Serialized<T> = T extends Date ? string : T;
type PendingItem = {
  id: string;
  description: string;
  deadline: Serialized<Date>;
  legalBasis: string;
};

function formatDate(v: string): string {
  return String(v).slice(0, 10);
}

export function OneHouseJudgmentResultView({ result }: { result: OneHouseExemptionResponse }) {
  const { judgment, houseCount } = result;
  /**
   * 🔑 배지 술어는 **이력 카드와 공유**한다(P4-2b-3). 여기서만 따지면 결과 화면은 「조건부」인데
   *    이력 목록은 「과세」인 상태가 조용히 생긴다.
   */
  const verdict = oneHouseVerdictOf(judgment);
  const pending = judgment.pending as unknown as PendingItem[];

  /**
   * 🔑 섹션 번호는 **렌더되는 것만 세어** 순번을 매긴다.
   *    고정 번호를 박으면 조건부·판정보류가 없는 흔한 경우에 화면이 「1 · 2 · 5」로 건너뛴다
   *    (브라우저 확인에서 실제로 그렇게 보였다).
   */
  let sectionNo = 0;
  const nextNo = () => String(++sectionNo);

  return (
    <div className="space-y-6" data-testid="one-house-judgment-result">
      {/* ── 판정 배지 ── */}
      <ToneCard tone={verdict.tone} title="판정 결과">
        <p className="text-2xl font-bold" data-testid="one-house-verdict">
          {verdict.label}
        </p>
        <p className="text-sm leading-relaxed">{verdict.detail}</p>
        {judgment.exemptReason && (
          <p className="text-sm text-muted-foreground">{judgment.exemptReason}</p>
        )}
      </ToneCard>

      {/* ── 주택 수 산정 ── */}
      <ToneCard tone="sky" sectionNum={nextNo()} title="주택 수 산정">
        <p className="text-sm">
          세대 보유 주택 <b>{houseCount.total}채</b> 중 비과세 판정에 세는 주택은{" "}
          <b data-testid="one-house-counted">{houseCount.countedForExemption}채</b>입니다.
        </p>
        {houseCount.excluded.length > 0 && (
          <ul className="ml-4 list-disc space-y-1 text-sm">
            {houseCount.excluded.map((e, i) => (
              <li key={i}>
                {e.label}
                <span className="ml-2">
                  <LawArticleModal legalBasis={e.legalBasis} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </ToneCard>

      {/* ── 적용된 특례 ── */}
      {judgment.appliedExceptions.length > 0 && (
        <ToneCard tone="emerald" sectionNum={nextNo()} title="적용된 특례">
          <ul className="ml-4 list-disc space-y-1 text-sm">
            {judgment.appliedExceptions.map((e) => (
              <li key={e.id}>
                {e.label}
                <span className="ml-2">
                  <LawArticleModal legalBasis={e.legalBasis} />
                </span>
              </li>
            ))}
          </ul>
        </ToneCard>
      )}

      {/* ── 조건부·기한 (G-3) ── */}
      {pending.length > 0 && (
        <ToneCard tone="amber" sectionNum={nextNo()} title="조건부 — 기한 내에 갖추면 비과세">
          <ul className="space-y-3">
            {pending.map((p) => (
              <li key={p.id} className="text-sm" data-testid={`one-house-pending-${p.id}`}>
                <p>
                  <b className="font-mono tabular-nums">{formatDate(p.deadline)}</b>
                  {"까지 — "}
                  {p.description}
                </p>
                <LawArticleModal legalBasis={p.legalBasis} />
              </li>
            ))}
          </ul>
        </ToneCard>
      )}

      {/* ── 판정 보류 ── */}
      {judgment.undetermined.length > 0 && (
        <ToneCard tone="rose" sectionNum={nextNo()} title="판정하지 않은 부분">
          <p className="text-sm text-muted-foreground">
            아래는 입력만으로 결론을 낼 수 없어 판정을 보류했습니다. 억측으로 결론을 내지 않습니다.
          </p>
          <ul className="ml-4 list-disc space-y-1 text-sm">
            {judgment.undetermined.map((u) => (
              <li key={u.id} data-testid={`one-house-undetermined-${u.id}`}>
                {u.reason}
              </li>
            ))}
          </ul>
        </ToneCard>
      )}

      {/* ── 근거 조문 ── */}
      {judgment.legalBasis.length > 0 && (
        <ToneCard tone="slate" sectionNum={nextNo()} title="근거 조문">
          <div className="flex flex-wrap gap-2">
            {judgment.legalBasis.map((b) => (
              <LawArticleModal key={b} legalBasis={b} />
            ))}
          </div>
        </ToneCard>
      )}

      <p className="text-xs text-muted-foreground">
        이 화면은 비과세 <b>판정</b>까지만 다룹니다. 세액은 양도소득세 계산기에서 계산하세요.
      </p>
    </div>
  );
}
