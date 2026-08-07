/**
 * 일반건물 **상속 토지**의 §164④ 등급환산 브리지 — 「소득세법 시행령」 제163조 제9항 제1호 (상속·증여 공통).
 *
 * ## 왜 필요한가
 *
 * §163⑨1호는 「1990년 8월 30일 개별공시지가가 고시되기 **전에**」 상속·증여받은 토지의
 * 취득가액을 상증법 §60~66 평가액과 **§164④ 가액** 중 **많은 금액**으로 한다.
 *
 * 그런데 그 시기의 개별공시지가는 **존재하지 않는다** — 1990.8.30.이 최초 고시일이다.
 * 그래서 §164④가 등급가액 환산식을 두었고, 그 계산 없이는 ② 비교값을 **입력할 방법이
 * 아예 없다**(`feedback_api_trigger_without_input_path_is_noop`).
 *
 * ## 상가 브리지의 미러
 *
 * `transfer-pre1990-commercial-bridge.ts`와 **같은 3단 구조**다 — 게이트 · 파생 · effective.
 * 필드만 다르다(`cbLandArea`→`gbLandArea`, `cbLandPricePerSqmAtAcq`→`gbAcqLandPricePerSqm`,
 * 취득일은 GB의 **파트 취득일** 규약을 따른다). 상가 함수를 인자로 일반화하지 않은 이유는
 * 호출부가 「어느 자산의 어느 필드인지」를 고를 여지를 만들지 않기 위해서다
 * (`feedback_shared_predicate_argument_parity`).
 *
 * ⚠️ **3중 동일 fallback**(`mirror-pattern`) — UI display·④ API 변환·⑧ validate가
 *    `effectiveGbLandPriceAtAcq` **하나**를 쓴다. 한 곳만 파생값을 보면 「화면엔 있는데
 *    계산엔 없다」가 된다.
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import {
  calculatePre1990LandValuation,
  type LandGradeInput,
} from "@/lib/tax-engine/pre-1990-land-valuation";
import { LAND_PRICE_NOTICE_START } from "./transfer-pre1990-commercial-bridge";
import { partAcquisitionDates } from "./transfer-tax-split-acq-mode";

/** §163⑨1호 게이트의 취득일 — GB 토지 파트 취득일(상속개시일·증여일). 분리 ON이면 `landAcquisitionDate`. */
export function gbLandAcquisitionDate(asset: AssetForm): string {
  return partAcquisitionDates(asset).land;
}

/**
 * §163⑨1호 구간인가 — **상속·증여 토지** + 취득일(상속개시일·증여일) < 1990-08-30.
 *
 * ⚠️ 취득원인을 함께 본다. 매매 토지의 1990 이전 환산은 별도 경로
 * (`CompanionAcqPurchaseBlock`의 `showPre1990`)이고 근거 조문도 다르다.
 * 세 경로는 **배타**다 — GB 카드가 `acquisitionCause`로 매매/상속/증여 블록을 갈라 렌더한다.
 *
 * ⚠️ **1985-01-01 하한을 함께 본다.** ④의 `acquisitionByInheritance`·`isLandGift`가 그 하한을
 *    갖기 때문이다. 하한 없이 열면 pre-1985에서 **섹션은 뜨는데 ④가 그 값을 쓰지 않는다** —
 *    「보이는데 아무 효과가 없는 칸」이 된다(`feedback_ui_engine_dual_truth_avoidance`).
 *
 *    🔴 pre-1985 상속 GB는 별도 결함이 있다 — 취득가액이 **0**으로 계산되고 validate가
 *    통과한다(실측 세액 443,235,000). Phase 1이 「pre-1985는 기존 환산 fallback」을 전제했으나
 *    O-3(2026-08-06)이 상속 파트의 환산을 **1985 하한 없이** 차단하면서 그 fallback이
 *    사라졌다. 이 파일의 범위 밖이며 별건으로 다룬다.
 */
export function isGbLandPre1990Sec163_9(asset: AssetForm): boolean {
  if (asset.assetKind !== "general_building") return false;
  const cause = asset.acquisitionCause;
  if (cause !== "inheritance" && cause !== "gift") return false;
  const acqDate = gbLandAcquisitionDate(asset);
  if (!acqDate) return false;
  return acqDate >= "1985-01-01" && acqDate < LAND_PRICE_NOTICE_START;
}

/**
 * §164④ 환산 — 취득시 토지 ㎡당 가액(원, 정수) 단일 진실.
 *
 * @returns 환산 ㎡당 가액 | null (구간 아님·미활성·입력 부족·면적 0 시)
 */
export function deriveGbPre1990LandPricePerSqmAtAcq(
  asset: AssetForm,
  transferDate: string,
): number | null {
  if (!isGbLandPre1990Sec163_9(asset)) return null;
  if (!asset.pre1990Enabled || !transferDate) return null;

  const area = parseDecimal(asset.gbLandArea);
  if (!area || area <= 0) return null;

  const buildGrade = (raw: string | undefined): LandGradeInput | undefined => {
    if (!raw) return undefined;
    const n = parseFloat(raw.replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return asset.pre1990GradeMode === "number" ? Math.trunc(n) : { gradeValue: n };
  };
  const gCur = buildGrade(asset.pre1990Grade_current);
  const gPrev = buildGrade(asset.pre1990Grade_prev);
  const gAcq = buildGrade(asset.pre1990Grade_atAcq);
  const p1990 = parseAmount(asset.pre1990PricePerSqm_1990 || "");
  if (!gCur || !gPrev || !gAcq || p1990 <= 0) return null;

  try {
    const r = calculatePre1990LandValuation({
      acquisitionDate: new Date(gbLandAcquisitionDate(asset)),
      transferDate: new Date(transferDate),
      areaSqm: area,
      pricePerSqm_1990: p1990,
      // 환산엔 미사용 — validateInput 통과용 동일값 주입(상가·PHD 브리지와 동일).
      pricePerSqm_atTransfer: p1990,
      grade_1990_0830: gCur,
      gradePrev_1990_0830: gPrev,
      gradeAtAcquisition: gAcq,
    });
    return r.pricePerSqmAtAcquisition;
  } catch {
    return null;
  }
}

/** 위 파생값을 폼 문자열로 — display fallback(`value={asset.x || asString}`)용. */
export function deriveGbPre1990LandPricePerSqmAtAcqString(
  asset: AssetForm,
  transferDate: string,
): string {
  const v = deriveGbPre1990LandPricePerSqmAtAcq(asset, transferDate);
  return v !== null && v > 0 ? String(v) : "";
}

/**
 * ④ API·⑧ validate·⑤ UI 공용 — 취득시 토지 ㎡당 가액의 **최종 유효값**.
 * 사용자 직접 입력이 우선, 없으면 §164④ 환산 파생값.
 */
export function effectiveGbLandPriceAtAcq(asset: AssetForm, transferDate: string): number {
  return (
    parseAmount(asset.gbAcqLandPricePerSqm) ||
    (deriveGbPre1990LandPricePerSqmAtAcq(asset, transferDate) ?? 0)
  );
}
