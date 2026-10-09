/**
 * 주택·건물 분리 계산의 **혼합 원인 토지 파트** — 「소득세법 시행령」 §163⑨ 단서 1호 ②(영 §164④ 가액) 브리지 (D1-4).
 *
 * 1990.8.30. 개별공시지가 고시 전에 상속·증여받은 토지의 취득가액은 상속개시일·증여일 평가액(①)과 영 §164④ 가액(②) 중
 * 많은 금액이다. 그 시기의 개별공시지가는 존재하지 않으므로(그날이 최초 고시일) ②는 토지등급 환산으로만 얻는다.
 *
 * `transfer-pre1990-gb-bridge.ts`(일반건물)의 3단 구조(게이트 · 파생 · 전송)를 미러링한다. 다른 점:
 *  - **래치 `pre1990Enabled`를 요구하지 않는다** — §163⑨ 비교는 법이 정한 계산이라 사용자가 켜고 끄는 선택이 아니다
 *    (`sec164LandFieldsAlwaysOpen` 주석). 5필드가 모두 찰 때만 ②가 생기고 부분 입력은 ②를 만들지 않는다.
 *  - max를 여기서 하지 않는다. ①과 ②를 **따로** 엔진에 보내 엔진 split 파트가 max·echo를 한다
 *    (`resolveLandPartAcquisition`) — ⑫가 「② 필수」를 강제하고 채택 값을 표시하려면 비교가 엔진에 있어야 한다.
 *
 * 입력 5필드(`pre1990*` 등급 3종 + 1990.1.1. ㎡당가)와 `acquisitionArea`는 기존 자산 필드를 재사용한다. 혼합 원인 주택
 * (건물 매매·신축)에서 그 필드의 다른 소비처(토지 환산·`hasPre1990ForSec164`·주택 상속 3시점·PHD)는 전부 불활성이다.
 *
 * ⚠️ 3중 패턴 — ⑤ 표시·④ 전송·⑧ 검증이 이 파일의 `landSec164Applies`/`deriveHousingLandSec164Total`을 **같이** 읽는다.
 *    파생값은 store에 쓰지 않는다(useEffect → store 미러링 금지).
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { calculatePre1990LandValuation, type LandGradeInput } from "@/lib/tax-engine/pre-1990-land-valuation";
import { getGradeValue } from "@/lib/tax-engine/data/land-grade-values";
import { multiplyByArea, multiplyByAreaShare } from "@/lib/tax-engine/area-utils";
import { isSec163_9LandProviso } from "@/lib/tax-engine/transfer-split-part-cause";
import { getOwnershipRatio } from "./transfer-tax-api-asset-basics";
import { resolveAcqAreaForStdPrice } from "./transfer-tax-api-helpers";
import { effectiveLandAcquisitionCause } from "./transfer-land-part-cause";

/** 영 §163⑨ 단서 1호 구간인가 — 유효 토지 원인(상속·증여) ∧ 토지 취득일 < 1990-08-30. 엔진·⑫와 같은 술어(`isSec163_9LandProviso`). */
export function landSec164Applies(asset: AssetForm): boolean {
  return isSec163_9LandProviso(effectiveLandAcquisitionCause(asset), asset.landAcquisitionDate);
}

/**
 * ② 면적 — 콤마는 지운다(stale 저장값 방어). ⑤ 카드·⑧ 상태(`sec164LandPartStatus`)와 같은 파싱이어야 카드에 보이는 ②와
 * ④가 보내는 ②가 갈리지 않는다. 단건 §164④ 경로(`transfer-tax-api-helpers.ts` pre1990Land)와 같은 규약.
 */
export function sec164AreaSqm(asset: AssetForm): number | undefined {
  return resolveAcqAreaForStdPrice({
    areaScenario: asset.areaScenario,
    acquisitionArea: (asset.acquisitionArea ?? "").replace(/,/g, ""),
    transferArea: (asset.transferArea ?? "").replace(/,/g, ""),
  });
}

/** 면적 입력 방식 「일부 양도」 — 단서 구간에서 차단되는 사실(엔진·⑫·⑧ 공통 leaf 사실). */
export function isPartialAreaScenario(asset: { areaScenario?: string }): boolean {
  return asset.areaScenario === "partial";
}

/** 영 §164④ 환산 — 취득시 토지 ㎡당 가액(원, 정수). 단서 구간이 아니거나 5필드·면적이 덜 차면 null. */
export function deriveHousingLandSec164PerSqm(asset: AssetForm): number | null {
  if (!landSec164Applies(asset)) return null;
  const area = sec164AreaSqm(asset);
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
    // 양도일은 환산에 쓰이지 않는다(`validateInput` 통과용) — 취득일을 더미로 둔다. CAP-2는 **토지 파트 취득일** 기준.
    const acq = new Date(asset.landAcquisitionDate as string);
    return calculatePre1990LandValuation({
      acquisitionDate: acq,
      transferDate: acq,
      areaSqm: area,
      pricePerSqm_1990: p1990,
      pricePerSqm_atTransfer: p1990,
      grade_1990_0830: gCur,
      gradePrev_1990_0830: gPrev,
      gradeAtAcquisition: gAcq,
    }).pricePerSqmAtAcquisition;
  } catch {
    return null;
  }
}

/**
 * ② 영 §164④ 가액 총액(원) — ㎡당 가액 × 면적. **지분 스케일 적용 후**(①`ratioed`와 같은 축).
 * 지분이면 `multiplyByAreaShare`(floor 한 번 — 단가×면적×지분), 단독이면 `multiplyByArea`. 파생 불가·단서 밖이면 0.
 */
export function deriveHousingLandSec164Total(asset: AssetForm): number {
  const perSqm = deriveHousingLandSec164PerSqm(asset);
  const area = sec164AreaSqm(asset);
  if (!perSqm || !area) return 0;
  const ratio = getOwnershipRatio(asset);
  return ratio < 1 ? multiplyByAreaShare(perSqm, area, ratio) : multiplyByArea(perSqm, area);
}

/**
 * 5칸이 모두 찼는데 ②가 안 나올 때(`deriveHousingLandSec164PerSqm` null) 고칠 **첫 등급 칸**.
 * 등급번호 모드에서 1 미만(예: 0.5 → 정수부 0)은 등급가액을 구할 수 없다(`Pre1990LandValuationInput`의 「등급 범위 밖」과 같은 판정).
 * 등급가액 모드는 양수면 항상 계산된다. 해당 칸이 없으면 null.
 */
export function invalidSec164GradeField(
  asset: Pick<AssetForm, "pre1990GradeMode" | "pre1990Grade_current" | "pre1990Grade_prev" | "pre1990Grade_atAcq">,
): "pre1990Grade_current" | "pre1990Grade_prev" | "pre1990Grade_atAcq" | null {
  if (asset.pre1990GradeMode !== "number") return null;
  for (const k of ["pre1990Grade_current", "pre1990Grade_prev", "pre1990Grade_atAcq"] as const) {
    const n = parseFloat((asset[k] ?? "").replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) continue; // 미입력은 완결 검사가 먼저 잡는다
    try {
      getGradeValue(Math.trunc(n));
    } catch {
      return k;
    }
  }
  return null;
}
