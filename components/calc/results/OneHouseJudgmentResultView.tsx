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
import { CtaButton } from "@/components/calc/shared/WizardNav";
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

type Props = {
  result: OneHouseExemptionResponse;
  /**
   * 「이 결과로 세액 계산」 (P5-a). 없으면 그 카드를 **렌더하지 않는다** — 이력 상세처럼
   * 마법사 폼이 살아 있지 않은 화면에서는 넘길 사실이 없다.
   *
   * 🔑 이 뷰는 `result`만 받는다 — 전달할 **사실**은 폼에 있고 그것을 아는 것은 오케스트레이터다.
   *    여기서 store를 직접 읽으면 판정 화면이 폼 store에 묶여 이력 상세에서 재사용할 수 없다.
   */
  onCalculateTax?: () => void;
};

export function OneHouseJudgmentResultView({ result, onCalculateTax }: Props) {
  const { judgment, houseCount, rentalHousingException: rental, oneRightExemption: oneRight } = result;
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

      {/*
        ── §155⑳ 장기임대주택 특례 (P4-3a) ──
        🔑 **선언한 경우에만** 렌더한다. 선언하지 않은 특례를 「해당 없음」으로 나열하면
           화면이 안 쓰는 조문으로 길어지고, 읽는 사람은 그것이 판정에 영향을 줬다고 읽는다.
      */}
      {rental && (
        <ToneCard
          tone={rental.passed ? "emerald" : "rose"}
          sectionNum={nextNo()}
          title="장기임대주택 보유자 거주주택 특례"
        >
          <p className="text-sm font-semibold" data-testid="one-house-rental-verdict">
            {rental.passed ? "요건 충족" : "요건 미충족 — 특례가 적용되지 않습니다"}
          </p>
          <p className="text-sm text-muted-foreground">
            {rental.scenario === "A"
              ? "거주주택을 양도하고 임대주택은 계속 보유하는 경우입니다."
              : "임대주택을 거주주택으로 전환한 뒤 양도하는 경우입니다."}
          </p>
          {!rental.passed && (
            <ul className="ml-4 list-disc space-y-1 text-sm">
              {rental.residenceFailReasons.map((r, i) => (
                <li key={`res-${i}`}>{r}</li>
              ))}
              {rental.unitFailReasons.map((u, i) => (
                <li key={`unit-${i}`}>
                  임대주택 {u.unitIndex + 1}호 — {u.message}
                </li>
              ))}
            </ul>
          )}
          {/* §155㉑로 통과한 호 — ㉒ 사후 추징 대상임을 반드시 알린다(충족이라고 끝이 아니다). */}
          {rental.periodPendingUnitIndexes.length > 0 && (
            <p className="text-sm" data-testid="one-house-rental-period-pending">
              임대주택{" "}
              <b>
                {rental.periodPendingUnitIndexes.map((i) => `${i + 1}호`).join("·")}
              </b>
              는 의무임대기간을 채우기 전이라 <b>소득세법 시행령 §155㉑</b>로 통과했습니다. 이후
              요건을 충족하지 못하면 <b>§155㉒</b>에 따라 차액을 신고·납부해야 합니다.
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <LawArticleModal legalBasis={rental.legalBasis} />
          </div>
          <p className="text-xs text-muted-foreground">
            B 시나리오의 §161① 안분(과세 범위)은 <b>세액 계산</b>에서 다룹니다.
          </p>
        </ToneCard>
      )}

      {/*
        ── §89①4호 1세대1입주권 (P4-3b) ──
        🔑 **입주권을 양도할 때만** 렌더한다. 주택 양도에는 물을 일이 아닌 조문이다.
      */}
      {oneRight && (
        <ToneCard
          tone={oneRight.clause ? "emerald" : "rose"}
          sectionNum={nextNo()}
          title="1세대1입주권 비과세 (§89①4호)"
        >
          <p className="text-sm font-semibold" data-testid="one-house-one-right-verdict">
            {oneRight.clause === "ga"
              ? "가목 성립 — 다른 주택·분양권을 보유하지 않습니다"
              : oneRight.clause === "na"
                ? "나목 성립 — 1주택 취득일부터 3년 이내 양도입니다"
                : "요건 미충족 — 비과세가 적용되지 않습니다"}
          </p>
          {oneRight.isPartialExempt && (
            <p className="text-sm">
              양도가액이 12억원을 초과하므로 <b>초과분만 과세</b>됩니다 (각 목 외의 부분 단서 · §95③).
            </p>
          )}
          {oneRight.reasons.length > 0 && (
            <ul className="ml-4 list-disc space-y-1 text-sm">
              {oneRight.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <LawArticleModal legalBasis={oneRight.legalBasis} />
          </div>
        </ToneCard>
      )}

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

      {/*
        ── 선언했으나 적용되지 않은 특례 ──
        🔑 「조건부」(amber)와 **다른 것**이다. 저쪽은 「이 날까지 하면 비과세」이고 여기는
           「이 입력으로는 적용되지 않았다」다. 기한 축은 `pending`이 이미 날짜와 함께 안내하므로
           엔진이 여기에 담지 않는다 — 두 카드가 같은 사실을 말하지 않는다.
        🔑 §155⑳ 임대주택 미충족 카드와 **같은 톤(rose)·같은 모양**을 쓴다.
      */}
      {judgment.unmetExceptions.length > 0 && (
        <ToneCard
          tone="rose"
          sectionNum={nextNo()}
          title="선언했으나 적용되지 않은 특례"
        >
          <p className="text-sm text-muted-foreground">
            입력하신 특례가 아래 사유로 요건을 충족하지 않아 판정에 반영되지 않았습니다.
          </p>
          <ul className="space-y-3">
            {judgment.unmetExceptions.map((u) => (
              <li key={u.id} className="text-sm" data-testid={`one-house-unmet-${u.id}`}>
                <p className="font-semibold">{u.label} — 요건 미충족</p>
                <ul className="ml-4 list-disc space-y-1">
                  {u.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
                <span className="mt-1 inline-block">
                  <LawArticleModal legalBasis={u.legalBasis} />
                </span>
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

      {/* ── 세액 계산으로 넘기기 (P5-a) ── */}
      {onCalculateTax && (
        <ToneCard tone="emerald" sectionNum={nextNo()} title="이 결과로 세액 계산">
          <p className="text-sm leading-relaxed">
            여기서 입력한 <b>판정 사실</b>을 양도소득세 계산기로 그대로 넘깁니다. 계산기는 판정
            결과를 복사하지 않고 <b>같은 엔진으로 다시 판정</b>하므로, 계산기에서 양도일·양도가액을
            바꾸면 판정도 그에 맞게 바뀝니다.
          </p>
          <p className="text-sm text-muted-foreground">
            세액을 내려면 계산기에서 <b>취득가액·필요경비</b>를 추가로 입력해야 합니다 — 이 화면은
            그 값을 묻지 않습니다.
          </p>
          <CtaButton data-testid="one-house-to-calculator" onClick={onCalculateTax}>
            이 결과로 세액 계산
          </CtaButton>
        </ToneCard>
      )}

      <p className="text-xs text-muted-foreground">
        이 화면은 비과세 <b>판정</b>까지만 다룹니다. 세액은 양도소득세 계산기에서 계산하세요.
      </p>
    </div>
  );
}
