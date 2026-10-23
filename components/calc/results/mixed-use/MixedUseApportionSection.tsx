"use client";

/**
 * 겸용주택 결과 — **① 양도가액 안분** 섹션 (`MixedUseCalculationSections`에서 분리 · 800줄 정책).
 *
 * - 기준시가 모드(현행): 주택:상가를 개별주택가격 : 상가부분 기준시가로 나눈다 — 종전 표시 그대로.
 * - 계약서 구분·감정가액 모드(`breakdown.saleSplit`): 1차 토지:건물 → 2차 각 축 안에서 주택:상가(양도시 기준시가).
 *   값은 엔진 echo를 **그대로 읽는다**(재계산 금지). 계획서 `docs/00-pm/mixed-use-sale-split-basis.plan.md` §4.2.
 * - 입력은 있었으나 기준시가로 넘어간 경우(`saleSplitFallback`)는 그 사유를 밝힌다(침묵 후퇴 금지).
 */
import type { MixedUseGainBreakdown } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { MixedDeemedUnclear } from "@/lib/tax-engine/types/transfer-mixed-use-sale-split.types";
import { fmt, fmtPlain, fmtPct, ResultSection, Row, DivRow, Frac, FLine } from "./MixedUseResultCardParts";

interface Props {
  breakdown: MixedUseGainBreakdown;
  open: boolean;
  onToggle: () => void;
}

const EXEMPTION_TEXT = {
  other_law: "다른 법령에서 가액을 구분한 경우",
  demolished_land_only: "건물을 철거하고 토지만 사용하는 경우",
} as const;

/**
 * 공유지분 — §100③ 판정에 쓴 계약서(물건 전체) 금액을 밝힌다. 아래 행은 지분 몫이라 그 숫자로는 30% 판정을 검산할 수 없다
 * (계획서 `sale-split-100-3-share-scale-judgment.plan.md` Q-3 a).
 */
function ContractJudgmentNote({ du }: { du?: MixedDeemedUnclear }) {
  const c = du?.contract;
  if (!c) return null;
  return (
    <p className="text-caption leading-snug text-muted-foreground" data-testid="mixed-sale-split-contract">
      30% 판정은 계약서 금액(물건 전체)으로 했습니다 — 구분 기재 토지 {fmtPlain(c.declared.land)} · 건물 {fmtPlain(c.declared.building)}
      {c.apportioned ? `, 안분가액 토지 ${fmtPlain(c.apportioned.land)} · 건물 ${fmtPlain(c.apportioned.building)}` : ""}. 아래 금액은 지분{" "}
      {fmtPct(c.ownershipRatio)} 몫입니다 (소득세법 §100③).
    </p>
  );
}

export function MixedUseApportionSection({ breakdown, open, onToggle }: Props) {
  const a = breakdown.apportionment;
  const totalTransfer = a.housingTransferPrice + a.commercialTransferPrice;
  const ss = breakdown.saleSplit;

  if (ss) {
    const { landBuilding: lb, parts: p, transferStd: std } = ss;
    const contract = ss.deemedUnclear?.contract;
    const exemption = ss.deemedUnclear?.detail.exemptionApplied;
    const deemedToAppraisal = ss.basis === "appraisal" && ss.deemedUnclear?.deemed === true;
    return (
      <ResultSection
        title="① 양도가액 안분"
        basis={
          ss.basis === "declared"
            ? "소득세법 §100②·③ + 시행령 §166⑥"
            : "부가가치세법 시행령 §64①1호 단서 + 소득세법 시행령 §166⑥"
        }
        open={open}
        onToggle={onToggle}
      >
        <div data-testid="mixed-sale-split-result">
          {deemedToAppraisal && (
            <p className="text-caption leading-snug text-amber-800 dark:text-amber-200" data-testid="mixed-sale-split-deemed">
              계약서에 구분 기재한 가액이 안분가액과 30% 이상 차이 나 「구분이 불분명한 때」로 보아 감정평가가액 비율로
              안분했습니다 (소득세법 §100③).
            </p>
          )}
          {exemption && (
            <p className="text-caption leading-snug text-muted-foreground" data-testid="mixed-sale-split-exemption">
              구분 기재 가액이 안분가액과 30% 이상 차이 나지만 「{EXEMPTION_TEXT[exemption]}」에 해당해 구분 기재 가액을
              그대로 적용했습니다 (소득세법 시행령 §166⑧).
            </p>
          )}
          <ContractJudgmentNote du={ss.deemedUnclear} />
          <Row
            label="토지 양도가액"
            value={fmt(lb.land)}
            formula={
              ss.basis === "declared" ? (
                contract ? (
                  `계약서 토지 ${fmtPlain(contract.declared.land)} × 지분 ${fmtPct(contract.ownershipRatio)} → 내림`
                ) : (
                  "계약서에 구분 기재된 금액"
                )
              ) : (
                <Frac top={`총 양도가액 ${fmtPlain(totalTransfer)} × 토지 감정평가가액`} bottom="토지 감정평가가액 + 건물 감정평가가액" />
              )
            }
          />
          <Row
            label="건물 양도가액"
            value={fmt(lb.building)}
            formula={
              ss.basis === "declared" && !contract
                ? "계약서에 구분 기재된 금액"
                : `총 양도가액 - 토지 양도가액 = ${fmtPlain(totalTransfer)} - ${fmtPlain(lb.land)}`
            }
          />
          <DivRow />
          <Row
            label="주택부수토지 양도가액"
            value={fmt(p.housingLand)}
            formula={
              <Frac
                top={`토지 양도가액 ${fmtPlain(lb.land)} × 주택부수토지 기준시가 ${fmtPlain(std.housingLand)}`}
                bottom={`주택부수토지 ${fmtPlain(std.housingLand)} + 상가부수토지 ${fmtPlain(std.commercialLand)}`}
              />
            }
          />
          <Row
            label="상가부수토지 양도가액"
            value={fmt(p.commercialLand)}
            formula={`토지 양도가액 - 주택부수토지 양도가액 = ${fmtPlain(lb.land)} - ${fmtPlain(p.housingLand)}`}
          />
          <Row
            label="주택건물 양도가액"
            value={fmt(p.housingBuilding)}
            formula={
              <Frac
                top={`건물 양도가액 ${fmtPlain(lb.building)} × 주택건물 기준시가 ${fmtPlain(std.housingBuilding)}`}
                bottom={`주택건물 ${fmtPlain(std.housingBuilding)} + 상가건물 ${fmtPlain(std.commercialBuilding)}`}
              />
            }
          />
          <Row
            label="상가건물 양도가액"
            value={fmt(p.commercialBuilding)}
            formula={`건물 양도가액 - 주택건물 양도가액 = ${fmtPlain(lb.building)} - ${fmtPlain(p.housingBuilding)}`}
          />
          <DivRow />
          <Row
            label="주택 양도가액"
            value={fmt(a.housingTransferPrice)}
            highlight
            formula={`주택부수토지 + 주택건물 = ${fmtPlain(p.housingLand)} + ${fmtPlain(p.housingBuilding)}`}
          />
          <Row
            label="상가 양도가액"
            value={fmt(a.commercialTransferPrice)}
            highlight
            formula={`상가부수토지 + 상가건물 = ${fmtPlain(p.commercialLand)} + ${fmtPlain(p.commercialBuilding)}`}
          />
          <p className="text-caption leading-snug text-muted-foreground">
            주택 기준시가는 양도시 개별주택가격을 토지분(개별공시지가 × 주택부수토지 면적)과 건물분(주택건물 기준시가) 비율로 나눈
            금액입니다.
          </p>
        </div>
      </ResultSection>
    );
  }

  const fallback = breakdown.saleSplitFallback;
  return (
    <ResultSection
      title="① 양도가액 안분"
      basis="소득세법 §99 + 시행령 §164"
      open={open}
      onToggle={onToggle}
    >
      {fallback && (
        <p className="text-caption leading-snug text-amber-800 dark:text-amber-200" data-testid="mixed-sale-split-fallback">
          {fallback.reason === "deemed_to_std"
            ? "계약서에 구분 기재한 가액이 안분가액과 30% 이상 차이 나 「구분이 불분명한 때」로 보아 양도시 기준시가 비율로 안분했습니다 (소득세법 §100③)."
            : "감정평가가액이 토지·건물 중 한쪽만 있어 양도시 기준시가 비율로 안분했습니다 (부가가치세법 시행령 §64①1호)."}
        </p>
      )}
      <ContractJudgmentNote du={fallback?.deemedUnclear} />
      <Row
        label="양도시 개별주택공시가격"
        value={fmt(a.housingStandardPrice)}
        formula="입력값 — 주택건물+주택부수토지 일괄"
      />
      <Row
        label="양도시 상가부분 기준시가 합계"
        value={fmt(a.commercialStandardPrice)}
        formula="(공시지가/㎡ × 상가부수토지 면적) + 상가건물 기준시가"
      />
      <DivRow />
      <Row
        label={`주택비율`}
        value={fmtPct(a.housingRatio)}
        formula={
          <Frac
            top={`주택부분 기준시가 ${fmtPlain(a.housingStandardPrice)}`}
            bottom={`주택부분 ${fmtPlain(a.housingStandardPrice)} + 상가부분 ${fmtPlain(a.commercialStandardPrice)}`}
          />
        }
      />
      <Row
        label="주택 양도가액"
        value={fmt(a.housingTransferPrice)}
        highlight
        formula={`${fmtPlain(totalTransfer)} × ${fmtPct(a.housingRatio)} → 내림`}
      />
      <Row
        label="상가 양도가액"
        value={fmt(a.commercialTransferPrice)}
        highlight
        formula={`총 양도가액 - 주택 양도가액 = ${fmtPlain(totalTransfer)} - ${fmtPlain(a.housingTransferPrice)}`}
      />
    </ResultSection>
  );
}

/** ③ 상가부분 건물분 아래 — 감가상각비·건물 귀속 양도비가 어디에 반영됐는지 밝힌다(값은 각 파트 행이 정본). */
export function MixedBuildingExtrasNote({
  extras,
}: {
  extras: NonNullable<MixedUseGainBreakdown["buildingExtras"]>;
}) {
  const dep = extras.commercialBuildingDepreciation;
  const bd = extras.buildingDirectTransferExpense;
  return (
    <div className="space-y-1 pl-4" data-testid="mixed-building-extras">
      {dep > 0 && (
        <p className="text-caption leading-snug text-muted-foreground">
          사업소득 필요경비에 산입한 감가상각비 {fmtPlain(dep)}를 상가건물 취득가액에서 공제합니다(취득가액 한도 · 소득세법 §97③). §97②2호
          단서로 자본적지출·양도비를 필요경비로 고른 경우에는 취득가액 자체를 쓰지 않으므로 공제할 대상이 없습니다.
        </p>
      )}
      {bd > 0 && (
        <p className="text-caption leading-snug text-muted-foreground">
          건물에 직접 귀속되는 양도비 {fmtPlain(bd)}는 토지로 나누지 않고 주택건물·상가건물 양도가액 비율로 나눠 건물분 실제 필요경비에
          넣습니다(소득세법 §100② 후단). 환산취득가액의 개산공제를 쓰는 경우에는 §97②2호 단서 비교에만 들어갑니다.
        </p>
      )}
    </div>
  );
}

/**
 * ②·③ 환산취득가액 산식 — 새 안분(계약서 구분·감정가액)이면 엔진은 **토지·건물 파트별로 환산해 합한다**(계획서 Q-8).
 * 합계 기준 산식(「분 양도가액 × 취득시 합계 / 양도시 합계」)을 그대로 두면 표시값과 산식이 어긋난다(동기화 점검 M-2).
 */
export function PerPartConversionFormula({
  side,
  saleSplit,
  landStdAtAcq,
  buildingStdAtAcq,
}: {
  side: "housing" | "commercial";
  saleSplit: NonNullable<MixedUseGainBreakdown["saleSplit"]>;
  landStdAtAcq: number | undefined;
  buildingStdAtAcq: number | undefined;
}) {
  const p = saleSplit.parts;
  const std = saleSplit.transferStd;
  const land = side === "housing" ? p.housingLand : p.commercialLand;
  const building = side === "housing" ? p.housingBuilding : p.commercialBuilding;
  const tLand = side === "housing" ? std.housingLand : std.commercialLand;
  const tBuilding = side === "housing" ? std.housingBuilding : std.commercialBuilding;
  const name = side === "housing" ? "주택" : "상가";
  return (
    <FLine>
      §97 토지·건물 파트별 환산의 합: {name}토지 {fmtPlain(land)} ×{" "}
      <Frac top={`취득시 토지 기준시가 ${fmtPlain(landStdAtAcq ?? 0)}`} bottom={`양도시 토지 기준시가 ${fmtPlain(tLand)}`} /> + {name}건물{" "}
      {fmtPlain(building)} ×{" "}
      <Frac top={`취득시 건물 기준시가 ${fmtPlain(buildingStdAtAcq ?? 0)}`} bottom={`양도시 건물 기준시가 ${fmtPlain(tBuilding)}`} />
    </FLine>
  );
}

