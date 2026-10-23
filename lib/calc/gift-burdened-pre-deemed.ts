/**
 * 증여세 계산기 부담부증여 양도세 × 의제취득일(1985.1.1.) 전 상속 자산 (계획서 `inheritance-pre-deemed-bg-pr7b.plan.md` §6 PR-7b-3).
 *
 * 사용자 결정 — Q-24(시가 평가 → max(① 상증법 평가액, ② §164④ 가액, ③ 환산취득가액) × 채무비율 · ③의 양도가액 = 증여가액 C) ·
 * Q-25(기준시가 평가 → 의제취득일 기준시가 × 채무비율) · Q-32(이 경로도 같은 규칙 · 시가 평가에서 ①② 모두 없으면 「확인할 수 없음」 선언 · 토지 등급 칸).
 * 엔진은 양도세 계산기 PR-7a·7b-1과 같은 입력(`inheritedAcquisition` pre-deemed · `pre1990Land`)을 받는다 — 이 경로는 그 입력을 싣기만 한다.
 * ⑤ 노출·④ 전송·⑧ 검사가 이 파일의 술어를 같이 쓴다.
 *
 * 범위는 이 경로의 부동산 3종 전부(토지·아파트·건물 — 건물은 주택이면 housing, 아니면 building)다. 비주택 건물의 ②(§164⑥)는 PR-7b-3b.
 * 증여로 취득한 자산은 이 경로의 취득원인에 없다(범위 밖).
 */
import { calculatePre1990LandValuation, type LandGradeInput } from "@/lib/tax-engine/pre-1990-land-valuation";
import { DEEMED_ACQUISITION_DATE } from "./transfer-163-9-base-date";
import { giftBurdenedValuationBasis } from "./gift-burdened-valuation-basis";
import { parseAmount } from "./number-parse";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";

const ymd = (v: Date | string | undefined): string =>
  v instanceof Date ? (Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10)) : (v ?? "").slice(0, 10);

/** 의제취득일 전 상속 자산인가 — 이 경로에서 상속받은 자산의 취득일 칸은 상속개시일이다(위젯 안내). */
export function giftBgPreDeemedInScope(bgt: BurdenedGiftTransferTaxInput | undefined): boolean {
  if (!bgt || bgt.acquisitionCause !== "inheritance") return false;
  const d = ymd(bgt.acquisitionDate);
  return !!d && d < DEEMED_ACQUISITION_DATE;
}

/** 시가 평가 · 담보 패 — ①②③ 3자 max(Q-24). 담보 승은 §159①1호 괄호라 기준시가 평가와 같다(Q-25). */
export function giftBgPreDeemedUsesThreeWay(item: EstateItem): boolean {
  if (!giftBgPreDeemedInScope(item.burdenedGiftTransferTax)) return false;
  const v = giftBurdenedValuationBasis(item);
  return v.mode === "sangjeungbeop_market" && !v.collateralForcesStandardAcquisition;
}

/** 토지 등급(§164④) 칸을 여는가 — 의제취득일 전 상속 토지. 1985.1.1. 현재 개별공시지가는 없어(최초 고시 1990.8.30.) 등급 환산이 ②이자 ③의 분자다. */
export function giftBgPre1990LandApplies(item: EstateItem): boolean {
  return item.category === "real_estate_land" && giftBgPreDeemedInScope(item.burdenedGiftTransferTax);
}

/**
 * 등급 환산 의제취득일 기준시가(총액) — 엔진이 `pre1990Land`로 계산하는 값과 같은 함수·같은 입력. 토글이 꺼졌거나 입력이 모자라면 null.
 * ⑤ 표시·④ 전송·⑧ 검사가 이 값 하나를 쓴다(3중 패턴).
 */
export function giftBgPre1990LandStd(item: EstateItem, giftDate: string | undefined): number | null {
  const bgt = item.burdenedGiftTransferTax;
  if (!bgt || !giftBgPre1990LandApplies(item) || !bgt.pre1990Enabled || !giftDate) return null;
  const payload = pre1990LandPayload(item, bgt, giftDate);
  if (!payload) return null;
  try {
    return calculatePre1990LandValuation({
      acquisitionDate: new Date(payload.acquisitionDate),
      transferDate: new Date(payload.transferDate),
      areaSqm: payload.areaSqm,
      pricePerSqm_1990: payload.pricePerSqm_1990,
      // 환산에는 쓰지 않는다 — validateInput 통과용 같은 값(GB·상가 브리지와 같다)
      pricePerSqm_atTransfer: payload.pricePerSqm_1990,
      grade_1990_0830: payload.grade_1990_0830,
      gradePrev_1990_0830: payload.gradePrev_1990_0830,
      gradeAtAcquisition: payload.gradeAtAcquisition,
    }).standardPriceAtAcquisition;
  } catch {
    return null;
  }
}

/** 의제취득일 기준시가로 쓰는 값 — 등급 환산이 서면 그 값, 아니면 칸 값(범위 밖이면 늘 칸 값). */
export function giftBgEffectiveStdAtAcquisition(item: EstateItem, giftDate: string | undefined): number {
  return giftBgPre1990LandStd(item, giftDate) ?? (item.burdenedGiftTransferTax?.standardPriceAtAcquisition ?? 0);
}

/** 시가 평가(3자 max)에서 ①·② 중 하나라도 있는가 — 없으면 「확인할 수 없음」 선언이 필요하다(Q-32 · 계산기 E-1과 같은 판정). */
export function giftBgPreDeemedClauseAFilled(item: EstateItem, giftDate: string | undefined): boolean {
  return (item.burdenedGiftTransferTax?.reportedValueAtInheritance ?? 0) > 0 || giftBgPre1990LandStd(item, giftDate) !== null;
}

/** 양도시 기준시가(③ 분모) — ④가 §159에 싣는 값과 같다(비주택 건물은 부수토지 개별공시지가 합산 · 경로 B). */
export function giftBgStdAtTransfer(item: EstateItem): number {
  return (item.standardPrice ?? 0) + (item.category === "real_estate_building" ? (item.appurtenantLandStandardPrice ?? 0) : 0);
}

/**
 * ④ — 범위 안이면 `inheritedAcquisition`(pre-deemed)과 토지 등급 `pre1990Land`. 범위 밖이면 키를 만들지 않는다(남은 값이 엔진에 닿지 않는다).
 * 엔진 자산 종류는 양도세 계산기 ④(`deriveEngineInheritanceAssetKind`)와 같다 — 토지 land · 단독주택 house_individual · 그 밖 house_apart.
 * ①은 3자 max일 때만 싣는다(⑤가 그때만 칸을 보인다). 등급 환산이 서면 의제취득일 기준시가를 싣지 않는다 — 엔진이 같은 값을 주입한다.
 */
export function buildGiftBgPreDeemedPayload(item: EstateItem, giftDate: string | undefined): Record<string, unknown> {
  const bgt = item.burdenedGiftTransferTax;
  if (!bgt || !giftBgPreDeemedInScope(bgt)) return {};
  const gradeStd = giftBgPre1990LandStd(item, giftDate);
  const stdAtDeemed = gradeStd === null ? bgt.standardPriceAtAcquisition : 0;
  const stdAtTransfer = giftBgStdAtTransfer(item);
  const reported = giftBgPreDeemedUsesThreeWay(item) ? (bgt.reportedValueAtInheritance ?? 0) : 0;
  const assetKind =
    item.category === "real_estate_land"
      ? "land"
      : item.category === "real_estate_building" && bgt.isHousing
        ? "house_individual"
        : "house_apart";
  return {
    inheritedAcquisition: {
      mode: "pre-deemed" as const,
      inheritanceStartDate: ymd(bgt.acquisitionDate),
      assetKind,
      ...(reported > 0 ? { reportedValue: reported } : {}),
      ...(stdAtDeemed > 0 ? { standardPriceAtDeemedDate: stdAtDeemed } : {}),
      ...(stdAtTransfer > 0 ? { standardPriceAtTransfer: stdAtTransfer } : {}),
    },
    ...(gradeStd !== null && giftDate ? { pre1990Land: pre1990LandPayload(item, bgt, giftDate) } : {}),
  };
}

/** 양도세 계산기 `buildPre1990LandPayload`와 같은 모양 — 면적은 이 경로의 자산 면적 한 칸(`item.areaSqm`). */
function pre1990LandPayload(item: EstateItem, bgt: BurdenedGiftTransferTaxInput, giftDate: string) {
  const grade = (raw: string | undefined): LandGradeInput | undefined => {
    const n = Number((raw ?? "").replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return (bgt.pre1990GradeMode ?? "number") === "number" ? Math.trunc(n) : { gradeValue: n };
  };
  const gCur = grade(bgt.pre1990Grade_current);
  const gPrev = grade(bgt.pre1990Grade_prev);
  const gAcq = grade(bgt.pre1990Grade_atAcq);
  const p1990 = parseAmount(bgt.pre1990PricePerSqm_1990 ?? "");
  const areaSqm = item.areaSqm ?? 0;
  if (!gCur || !gPrev || !gAcq || p1990 <= 0 || areaSqm <= 0) return null;
  return {
    acquisitionDate: ymd(bgt.acquisitionDate),
    transferDate: giftDate,
    areaSqm,
    pricePerSqm_1990: p1990,
    grade_1990_0830: gCur,
    gradePrev_1990_0830: gPrev,
    gradeAtAcquisition: gAcq,
  };
}

/**
 * ⑧ — 시가 평가(3자 max)의 필수 입력. 산정방식은 묻지 않는다(⑤가 라디오를 숨긴다). 문구 앞에 자산 라벨을 붙이는 것은 호출부.
 * ①·② 모두 없고 선언도 없으면 차단(Q-32), ③의 분모(양도시 기준시가)가 없으면 차단 — 엔진은 ③을 늘 계산해 비교한다.
 */
export function giftBgPreDeemedThreeWayError(item: EstateItem, giftDate: string | undefined): string | null {
  const bgt = item.burdenedGiftTransferTax;
  if (!bgt || !giftBgPreDeemedUsesThreeWay(item)) return null;
  if (!giftBgPreDeemedClauseAFilled(item, giftDate) && bgt.preDeemedClauseAUnconfirmed !== true) {
    return (
      "의제취득일(1985.1.1.) 전에 상속받은 자산을 시가로 평가해 부담부증여하면 취득가액은 ① 상속개시일 현재 상증법 평가액" +
      (item.category === "real_estate_land" ? "·② §164④ 기준시가(토지등급 환산)" : "") +
      "·③ 환산취득가액 중 큰 금액에 채무비율을 곱한 금액입니다 — 상속개시일 평가액(상속세 신고·결정가액)을 입력하거나, " +
      "확인할 수 없으면 「상증법 평가액을 확인할 수 없음」을 선택하세요 (소득세법 시행령 §159①1호·§163⑨·§176조의2④)."
    );
  }
  if (giftBgStdAtTransfer(item) <= 0) {
    return `${item.category === "real_estate_land" ? "양도시(증여시) 개별공시지가 총액" : "양도시(증여시) 기준시가"}를 입력하세요 — ③ 환산취득가액의 분모입니다 (소득세법 시행령 §176조의2④).`;
  }
  return null;
}

/** ⑤ — 등급 위젯(`Pre1990LandValuationInput`)에 넘기는 슬라이스. 이 경로는 같은 이름의 optional 필드로 저장한다. */
export function giftBgPre1990Slice(bgt: BurdenedGiftTransferTaxInput) {
  return {
    pre1990Enabled: bgt.pre1990Enabled === true,
    pre1990PricePerSqm_1990: bgt.pre1990PricePerSqm_1990 ?? "",
    pre1990PricePerSqm_atTransfer: bgt.pre1990PricePerSqm_atTransfer ?? "",
    pre1990Grade_current: bgt.pre1990Grade_current ?? "",
    pre1990Grade_prev: bgt.pre1990Grade_prev ?? "",
    pre1990Grade_atAcq: bgt.pre1990Grade_atAcq ?? "",
    pre1990GradeMode: bgt.pre1990GradeMode ?? ("number" as const),
  };
}
