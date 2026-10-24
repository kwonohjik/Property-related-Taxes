"use client";

/**
 * 겸용주택 × 부담부증여 — 결과 본문의 **부담부증여 전용 조각** (UI 설계 §6.5 R-4 · R-10).
 *
 * `MixedUseCalculationSections`는 일반 겸용(양도가액을 기준시가 비율로 안분)을 그린다. 부담부증여는
 * 양도가액이 «양도로 보는 채무액»이고 취득가액·개산공제에 부분별 채무비율이 곱해지므로 문구가 다르다.
 * 그 분기를 이 파일이 소유해 본문 파일을 늘리지 않는다(800줄 정책).
 *
 * 🔑 엔진 echo(`breakdown.burdenedGift`)만 읽는다 — 채무액·비율·양도가액을 화면에서 재계산하지 않는다.
 *    (비율의 분자·분모는 echo에 있는 값을 그대로 `Frac`에 적는다.)
 * 🔑 «양도 없음»은 `perPart[*].transferred`로 게이트한다. 양도가 없는 부분을 「비과세」로 그리지 않는다 —
 *    비과세는 양도는 있으나 과세하지 않는 것이고, 이것은 과세대상 양도 자체가 없는 것이다.
 *
 * 표기 규칙: 한국어 풀어쓰기 · 각 숫자 옆 변수명 라벨 · `floor` 묵시 · 화면 리터럴 `÷` 금지(`Frac`).
 */
import type { ReactNode } from "react";
import type {
  MixedUseBurdenedGiftBreakdown,
  MixedUseBurdenedGiftPart,
  MixedUsePartKey,
} from "@/lib/tax-engine/types/mixed-use-burdened-gift.types";
import {
  MIXED_BG_PART_LABEL,
  mixedBgValueLabel,
} from "@/components/calc/results/transfer/DetailedStatementBgMixedFormulas";
import {
  DivRow,
  FLine,
  Frac,
  ResultSection,
  Row,
  fmt,
  fmtPct,
  fmtPlain,
} from "@/components/calc/results/mixed-use/MixedUseResultCardParts";

export type MixedBgSide = "housing" | "commercial";

const SIDE_LABEL: Record<MixedBgSide, string> = { housing: "주택", commercial: "상가" };
const PARTS: Record<MixedBgSide, readonly [MixedUsePartKey, MixedUsePartKey]> = {
  housing: ["housingLand", "housingBuilding"],
  commercial: ["commercialLand", "commercialBuilding"],
};

/** 그 쪽(주택/상가)이 양도로 보는 채무액을 가졌는가 — 엔진 `transferred` echo 그대로. 토지·건물 한쪽만 true일 수는 없다. */
export function mixedBgSideTransferred(bg: MixedUseBurdenedGiftBreakdown, side: MixedBgSide): boolean {
  return PARTS[side].some((k) => bg.perPart[k].transferred);
}

/** 「양도 없음」 회색 배지 + 사유 한 줄 — 비과세 emerald 톤을 쓰지 않는다. */
export function MixedBgNotTransferred({ side }: { side: MixedBgSide }) {
  const other = side === "housing" ? "상가" : "주택";
  return (
    <div className="space-y-1" data-testid={`bg-result-not-transferred-${side}`}>
      <span className="inline-flex items-center rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 text-caption font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
        양도 없음
      </span>
      <p className="text-caption text-muted-foreground">
        {side === "housing"
          ? `주택분: 양도 없음 — 1세대1주택 비과세·12억 판정의 대상이 아닙니다. 인수 채무가 ${other}에 귀속되어 이 부분은 양도로 보지 않습니다`
          : `상가분: 양도 없음 — 채무가 ${other}에 귀속되어 상가의 양도소득이 없습니다`}
        (소득세법 제88조 제1호 후단 — 채무액에 해당하는 부분만 양도). 이 부분의 무상 이전분은 수증자의 증여세 대상입니다.
      </p>
    </div>
  );
}

/** 1세대1주택 줄 자리 — 양도 없는 쪽만 그린다(둘 다 양도하면 null → 본문의 기존 줄이 그려진다). */
export function MixedBgNoTransferBanner({ bg }: { bg: MixedUseBurdenedGiftBreakdown }) {
  const sides = (["housing", "commercial"] as const).filter((s) => !mixedBgSideTransferred(bg, s));
  if (sides.length === 0) return null;
  return (
    <div className="space-y-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/20 px-3 py-2 text-xs" data-testid="bg-result-no-transfer-banner">
      {sides.map((s) => (
        <MixedBgNotTransferred key={s} side={s} />
      ))}
    </div>
  );
}

/** 부분별 채무비율 분수 — 분자·분모 모두 숫자로 적는다. */
function ratioFrac(bg: MixedUseBurdenedGiftBreakdown, side: MixedBgSide): ReactNode {
  const d = bg.debtAttribution;
  const debt = side === "housing" ? d.housingDebt : d.commercialDebt;
  const value = side === "housing" ? d.housingGiftValue : d.commercialGiftValue;
  const label = SIDE_LABEL[side];
  return <Frac top={`${label}분 양도로 보는 채무액 ${fmtPlain(debt)}`} bottom={`${label}분 증여가액 ${fmtPlain(value)}`} />;
}

const sumOf = (bg: MixedUseBurdenedGiftBreakdown, side: MixedBgSide, f: (p: MixedUseBurdenedGiftPart) => number) =>
  PARTS[side].reduce((n, k) => n + f(bg.perPart[k]), 0);

/**
 * ① 부담부증여 — 채무 귀속과 양도가액 (일반 겸용의 「① 양도가액 안분」을 대체).
 * 채무 귀속 → 부분별 채무비율 → 양도가액(= 양도로 보는 채무액).
 */
export function MixedUseBgApportionSection({
  bg,
  open,
  onToggle,
}: {
  bg: MixedUseBurdenedGiftBreakdown;
  open: boolean;
  onToggle: () => void;
}) {
  const d = bg.debtAttribution;
  const whole = d.housingGiftValue + d.commercialGiftValue;
  return (
    <ResultSection
      title="① 부담부증여 — 채무 귀속과 양도가액"
      basis="소득세법 §88 1호 후단 + 시행령 §159"
      open={open}
      onToggle={onToggle}
    >
      <div data-testid="bg-result-apportion" className="space-y-2">
        <Row label="주택 귀속 채무" value={fmt(d.housing)} small formula="입력한 사실 선언 — 임차 대상·근저당 설정 대상이 주택인 채무" />
        <Row label="상가 귀속 채무" value={fmt(d.commercial)} small formula="입력한 사실 선언 — 임차 대상·근저당 설정 대상이 상가인 채무" />
        <Row label="구분 불분명 채무" value={fmt(d.unallocated)} small />
        {d.unallocated > 0 && (
          <>
            <Row
              label="  ▸ 구분 불분명 채무의 주택 몫"
              value={fmt(d.unallocatedToHousing)}
              small
              formula={
                <FLine>
                  구분 불분명 채무 {fmtPlain(d.unallocated)} ×{" "}
                  <Frac top={`주택분 증여가액 ${fmtPlain(d.housingGiftValue)}`} bottom={`증여가액 ${fmtPlain(whole)}`} />
                  {" "}— 이 안분은 국세청 해석례가 직접 답하지 않아 확인이 필요합니다
                </FLine>
              }
            />
            <Row
              label="  ▸ 구분 불분명 채무의 상가 몫"
              value={fmt(d.unallocatedToCommercial)}
              small
              formula={`구분 불분명 채무 ${fmtPlain(d.unallocated)} - 주택 몫 ${fmtPlain(d.unallocatedToHousing)}`}
            />
          </>
        )}
        <DivRow />
        <Row
          label="주택분 양도로 보는 채무액"
          value={fmt(d.housingDebt)}
          formula={`주택 귀속 채무 ${fmtPlain(d.housing)} + 구분 불분명 채무의 주택 몫 ${fmtPlain(d.unallocatedToHousing)}`}
        />
        <Row
          label="상가분 양도로 보는 채무액"
          value={fmt(d.commercialDebt)}
          formula={`상가 귀속 채무 ${fmtPlain(d.commercial)} + 구분 불분명 채무의 상가 몫 ${fmtPlain(d.unallocatedToCommercial)}`}
        />
        <DivRow />
        <Row label="주택분 채무비율" value={d.housingDebt > 0 ? fmtPct(d.housingRatio) : "-"} formula={d.housingDebt > 0 ? ratioFrac(bg, "housing") : undefined} />
        <Row label="상가분 채무비율" value={d.commercialDebt > 0 ? fmtPct(d.commercialRatio) : "-"} formula={d.commercialDebt > 0 ? ratioFrac(bg, "commercial") : undefined} />
        <DivRow />
        {(["housing", "commercial"] as const).map((side) =>
          mixedBgSideTransferred(bg, side) ? (
            <Row
              key={side}
              label={`${SIDE_LABEL[side]} 양도가액`}
              value={fmt(sumOf(bg, side, (p) => p.transferPrice))}
              highlight
              formula={`${SIDE_LABEL[side]}분 양도로 보는 채무액 ${fmtPlain(side === "housing" ? d.housingDebt : d.commercialDebt)} (양도가액 = 채무액, 시행령 §159①2호) — 토지·건물 몫은 아래 ${side === "housing" ? "②" : "③"}에서`}
            />
          ) : (
            <div key={side} className="space-y-0.5">
              <Row label={`${SIDE_LABEL[side]} 양도가액`} value="양도 없음" highlight />
              <MixedBgNotTransferred side={side} />
            </div>
          ),
        )}
      </div>
    </ResultSection>
  );
}

/** 취득가액 산정방식 라벨 — 부분별 줄의 머리말. */
const METHOD_LABEL: Record<MixedUseBurdenedGiftPart["acquisitionMethod"], string> = {
  standard_price: "취득시 기준시가 안분 (시행령 §159①1호 괄호)",
  actual: "실지취득가액 안분 (소득세법 §97①1호가목)",
  converted: "환산취득가액 (시행령 §176의2②2호)",
  salesCase: "매매사례가액 안분 (시행령 §176의2③1호)",
  appraisal: "감정가액 안분 (시행령 §176의2③2호)",
};

function rateLabel(rate: number): string {
  return `${(rate * 100).toFixed(1).replace(/\.0$/, "")}%`;
}

/** 한 부분의 취득가액 산식 — 엔진 echo(`acquisitionMethod`·기준시가·양도가액)만 쓴다. */
function acqFormulaLine(bg: MixedUseBurdenedGiftBreakdown, side: MixedBgSide, k: MixedUsePartKey): ReactNode {
  const p = bg.perPart[k];
  if (p.acquisitionBeforeSwap !== undefined) {
    return `${MIXED_BG_PART_LABEL[k]}: 환산취득가액 ${fmtPlain(p.acquisitionBeforeSwap)}은 필요경비(자본적지출·양도비)가 더 커서 차감하지 않습니다 (소득세법 §97②2호 단서)`;
  }
  switch (p.acquisitionMethod) {
    case "standard_price":
      return (
        <FLine>
          {MIXED_BG_PART_LABEL[k]}: 취득시 기준시가 {fmtPlain(p.stdPriceAtAcquisition)} × {ratioFrac(bg, side)}
        </FLine>
      );
    case "converted":
      return (
        <FLine>
          {MIXED_BG_PART_LABEL[k]}: 양도가액 {fmtPlain(p.transferPrice)} ×{" "}
          <Frac top={`취득시 기준시가 ${fmtPlain(p.stdPriceAtAcquisition)}`} bottom={`양도시 기준시가 ${fmtPlain(p.stdPriceAtTransfer)}`} />
        </FLine>
      );
    default:
      return (
        <FLine>
          {MIXED_BG_PART_LABEL[k]}: {mixedBgValueLabel(bg, p.acquisitionMethod, side)} 중 이 부분 몫 × {ratioFrac(bg, side)}
        </FLine>
      );
  }
}

/** ②·③의 취득가액 + 필요경비 행 (일반 겸용의 «환산취득가액» 행을 대체). 양도 없는 쪽은 아무것도 그리지 않는다. */
export function MixedUseBgAcqRows({ bg, side }: { bg: MixedUseBurdenedGiftBreakdown; side: MixedBgSide }) {
  if (!mixedBgSideTransferred(bg, side)) return null;
  const [land, building] = PARTS[side];
  const method = bg.perPart[land].acquisitionMethod;
  const lump = bg.perPart[land].estimatedDeductionRate !== undefined;
  const label = SIDE_LABEL[side];
  return (
    <div className="space-y-2" data-testid={`bg-result-acq-${side}`}>
      <Row
        label={`${label} 취득가액 · ${method === "actual" && bg.deemedCause ? `${mixedBgValueLabel(bg, method, side)} 안분 (소득세법 시행령 §163⑨)` : METHOD_LABEL[method]}`}
        value={fmt(sumOf(bg, side, (p) => p.acquisitionPrice))}
        formula={
          <>
            {acqFormulaLine(bg, side, land)}
            {acqFormulaLine(bg, side, building)}
          </>
        }
      />
      {lump ? (
        <Row
          label={`${label} 개산공제`}
          value={fmt(sumOf(bg, side, (p) => p.estimatedDeduction))}
          formula={
            <>
              {[land, building].map((k) => {
                const p = bg.perPart[k];
                return (
                  <FLine key={k}>
                    {MIXED_BG_PART_LABEL[k]}: 취득시 기준시가 {fmtPlain(p.stdPriceAtAcquisition)} × {ratioFrac(bg, side)} × 개산공제율{" "}
                    {rateLabel(p.estimatedDeductionRate ?? 0)}
                  </FLine>
                );
              })}
            </>
          }
        />
      ) : (
        <Row
          label={`${label} 필요경비`}
          value={fmt(sumOf(bg, side, (p) => p.estimatedDeduction))}
          formula={
            <FLine>
              자본적지출·양도비 등 실제 필요경비 중 이 부분 몫 × {ratioFrac(bg, side)} (실지거래가액 경로 — 개산공제 아님)
            </FLine>
          }
        />
      )}
    </div>
  );
}

/** 양도차익 한 줄 산식 — 4부분 각각 `양도가액 - 취득가액 - 필요경비`. */
export function mixedBgPartGainFormula(bg: MixedUseBurdenedGiftBreakdown, k: MixedUsePartKey): string {
  const p = bg.perPart[k];
  if (!p.transferred) return "양도 없음";
  const expense = p.estimatedDeductionRate !== undefined ? "개산공제" : "필요경비";
  return `양도가액 ${fmtPlain(p.transferPrice)} - 취득가액 ${fmtPlain(p.acquisitionPrice)} - ${expense} ${fmtPlain(p.estimatedDeduction)}`;
}
