/**
 * 계산결과 상세명세서 — **겸용주택 × 부담부증여** 4부분 양도가액·취득가액·필요경비 산식 빌더.
 *
 * 단건 부담부증여(`DetailedStatementBgFormulas.ts`)는 토지/건물 2부분(`perAsset`)과 단일 `debtRatio`를 전제한다.
 * 겸용은 4부분(`perPart`)이고 채무비율이 주택분·상가분 둘이라 같은 빌더를 쓸 수 없다. 쓰면
 * `resolveBgSingleDisplay`가 겸용을 제외해 명세서가 일반 겸용 문구(양도가액 «사용자 입력 0», 취득가액 «-320,000,002»)로 떨어진다
 * (2026-10-16 렌더 실측).
 *
 * 원칙은 같다 — **적힌 산식이 적힌 값을 만든다.** 값은 전부 엔진 echo(`burdenedGift.perPart`·`debtAttribution`)에서 읽고,
 * 표시 층이 다시 계산하지 않는다. 중간 절사(floor)는 산식에 적지 않는다.
 *
 * 설계: docs/02-design/features/transfer-burdened-gift-mixed-use.ui.design.md §6.5 R-3·R-12
 */
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import type {
  MixedUseBurdenedGiftBreakdown,
  MixedUseBurdenedGiftPart,
  MixedUsePartKey,
} from "@/lib/tax-engine/types/mixed-use-burdened-gift.types";

type Side = "housing" | "commercial";
type Method = MixedUseBurdenedGiftPart["acquisitionMethod"];

const fmt = (n: number): string => n.toLocaleString("ko-KR");
const pct = (rate: number): string => `${(rate * 100).toFixed(1).replace(/\.0$/, "")}%`;

export const MIXED_BG_PART_LABEL: Record<MixedUsePartKey, string> = {
  housingLand: "주택 토지분",
  housingBuilding: "주택 건물분",
  commercialLand: "상가 토지분",
  commercialBuilding: "상가 건물분",
};
/** 안분 대상 가액의 이름 — 「실지취득가액 중 이 부분 몫」처럼 쓴다. */
export const MIXED_BG_VALUE_LABEL: Record<Method, string> = {
  standard_price: "취득시 기준시가",
  actual: "실지취득가액",
  converted: "환산취득가액",
  salesCase: "매매사례가액",
  appraisal: "감정가액",
};

/**
 * 가액 이름 — 증여자가 상속·증여로 취득했으면(엔진 echo `deemedCause` · 소령 §163⑨) 「실지취득가액」 대신 그 쪽(주택분/상가분)이 실제로 정해진 가액을 적는다:
 * 평가액(①)이면 그 날 현재 평가액, §163⑨ 단서로 §164 가액(②)이 이겼으면 그 가액(PR-7b-7a · 7a-2). `side`가 없으면 평가액으로 적는다.
 */
export function mixedBgValueLabel(bg: MixedUseBurdenedGiftBreakdown, m: Method, side?: Side): string {
  if (m === "actual" && bg.deemedCause) {
    const basis = side && bg.deemedBasis ? bg.deemedBasis[side] : "reported";
    if (basis === "standard") {
      if (side === "commercial") return "§164 기준시가(상가 토지·건물)";
      return bg.deemedBasis?.housingPhd ? "§164⑦ 환산가액" : "§164 기준시가(개별주택가격)";
    }
    return bg.deemedCause === "gift" ? "증여일 평가액" : "상속개시일 평가액";
  }
  return MIXED_BG_VALUE_LABEL[m];
}

const PARTS: Record<Side, readonly [MixedUsePartKey, MixedUsePartKey]> = {
  housing: ["housingLand", "housingBuilding"],
  commercial: ["commercialLand", "commercialBuilding"],
};

/** 부분별 채무비율 «양도로 보는 채무액 / 그 쪽 증여가액» — 분자·분모를 숫자로 적는다. */
function ratioText(bg: MixedUseBurdenedGiftBreakdown, side: Side): string {
  const d = bg.debtAttribution;
  const label = side === "housing" ? "주택분" : "상가분";
  return `${label} 양도로 보는 채무액 ${fmt(side === "housing" ? d.housingDebt : d.commercialDebt)} / ${label} 증여가액 ${fmt(
    side === "housing" ? d.housingGiftValue : d.commercialGiftValue,
  )}`;
}

/** 겸용 부담부증여 명세서 표시값 — 엔진 4부분 슬롯의 합. 역산이 아니라 echo다. */
export interface BgMixedDisplay {
  breakdown: MixedUseBurdenedGiftBreakdown;
  transferPrice: number;
  acquisition: number;
  expenses: number;
}

/** 해당하지 않으면 undefined — 호출부는 종전 경로를 그대로 탄다. */
export function resolveBgMixedDisplay(result: TransferTaxResult): BgMixedDisplay | undefined {
  const bg = result.mixedUseDetail?.burdenedGift;
  if (!bg) return undefined;
  const sum = (pick: (p: MixedUseBurdenedGiftPart) => number) =>
    (Object.keys(bg.perPart) as MixedUsePartKey[]).reduce((n, k) => n + pick(bg.perPart[k]), 0);
  return {
    breakdown: bg,
    transferPrice: sum((p) => p.transferPrice),
    acquisition: sum((p) => p.acquisitionPrice),
    expenses: sum((p) => p.estimatedDeduction),
  };
}

/** 쪽(주택/상가)별 줄을 이어 쓴다 — 양도 없는 쪽은 한 줄로 «양도 없음». */
function bySide(bg: MixedUseBurdenedGiftBreakdown, build: (k: MixedUsePartKey, side: Side) => string): string {
  const lines: string[] = [];
  for (const side of ["housing", "commercial"] as const) {
    const [land, building] = PARTS[side];
    if (!bg.perPart[land].transferred && !bg.perPart[building].transferred) {
      lines.push(`${side === "housing" ? "주택분" : "상가분"}: 양도 없음 (인수 채무가 귀속되지 않음)`);
      continue;
    }
    lines.push(build(land, side), build(building, side));
  }
  return lines.join("\n");
}

/** 양도가액 산식 — 양도로 보는 채무액이 곧 양도가액이다(소령 §159①2호). */
export function buildBgMixedTransferFormula(d: BgMixedDisplay): string {
  const a = d.breakdown.debtAttribution;
  const head = `양도가액 = 양도로 보는 채무액 (소령 §159①2호) — 주택분 ${fmt(a.housingDebt)} + 상가분 ${fmt(a.commercialDebt)} = ${fmt(d.transferPrice)}`;
  const parts = [
    `주택분 = 주택 귀속 채무 ${fmt(a.housing)} + 구분 불분명 채무의 주택 몫 ${fmt(a.unallocatedToHousing)}`,
    `상가분 = 상가 귀속 채무 ${fmt(a.commercial)} + 구분 불분명 채무의 상가 몫 ${fmt(a.unallocatedToCommercial)}`,
  ];
  return [head, ...parts.map((p) => `        ${p}`)].join("\n");
}

/** 취득가액 산식 — 부분별로, 방식(`acquisitionMethod`)에 따라. */
export function buildBgMixedAcquisitionFormula(d: BgMixedDisplay): string {
  const bg = d.breakdown;
  return bySide(bg, (k, side) => {
    const p = bg.perPart[k];
    const label = MIXED_BG_PART_LABEL[k];
    if (p.acquisitionBeforeSwap !== undefined) {
      return `${label}: 0 (소득세법 §97②2호 단서 — 환산취득가액 ${fmt(p.acquisitionBeforeSwap)} 대신 자본적지출·양도비를 필요경비로 정함)`;
    }
    switch (p.acquisitionMethod) {
      case "standard_price":
        return `${label}: 취득시 기준시가 ${fmt(p.stdPriceAtAcquisition)} × (${ratioText(bg, side)}) = ${fmt(p.acquisitionPrice)}`;
      case "converted":
        return `${label}: 양도가액 ${fmt(p.transferPrice)} × 취득시 기준시가 ${fmt(p.stdPriceAtAcquisition)} / 양도시 기준시가 ${fmt(p.stdPriceAtTransfer)} = ${fmt(p.acquisitionPrice)} (시행령 §176의2②2호)`;
      default:
        return `${label}: ${mixedBgValueLabel(bg, p.acquisitionMethod, side)} 중 이 부분 몫 × (${ratioText(bg, side)}) = ${fmt(p.acquisitionPrice)}`;
    }
  });
}

/** 필요경비 산식 — 개산공제(율 echo가 있을 때) 또는 실비의 부분 몫. */
export function buildBgMixedExpenseFormula(d: BgMixedDisplay): string {
  const bg = d.breakdown;
  return bySide(bg, (k, side) => {
    const p = bg.perPart[k];
    const label = MIXED_BG_PART_LABEL[k];
    if (p.estimatedDeductionRate === undefined) {
      return `${label}: 자본적지출·양도비 등 실제 필요경비 중 이 부분 몫 × (${ratioText(bg, side)}) = ${fmt(p.estimatedDeduction)}`;
    }
    return `${label}: 취득시 기준시가 ${fmt(p.stdPriceAtAcquisition)} × (${ratioText(bg, side)}) × 개산공제율 ${pct(p.estimatedDeductionRate)} = ${fmt(p.estimatedDeduction)} (개산공제, 소령 §163⑥)`;
  });
}

/** 신고서 양도가액 칸 고지 — 양도 없는 부분(`transferred === false`)의 열에만. 값은 0이 아니라 «양도 없음»이다. */
export function mixedBgFilingNotes(
  bg: MixedUseBurdenedGiftBreakdown,
  setRoseNote: (rowKey: string, col: MixedUsePartKey, note: string) => void,
): void {
  for (const k of Object.keys(bg.perPart) as MixedUsePartKey[]) {
    if (!bg.perPart[k].transferred) setRoseNote("transferPrice", k, "양도 없음 (채무 미귀속)");
  }
}
