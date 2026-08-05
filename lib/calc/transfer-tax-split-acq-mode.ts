/**
 * 파트별 취득 모드(land/buildingAcqMode) 유효값 도출 — 단일 소스.
 *
 * `AssetForm.landAcqMode`/`buildingAcqMode`는 사용자가 분리 모드에서 파트별 라디오를 아직
 * 선택하지 않으면 빈 문자열("")이다. 그 경우 자산 전체 레거시 단일 플래그
 * (`useEstimatedAcquisition`·`isAppraisalAcquisition`·`isSalesCaseAcquisition` — 상단
 * "취득가액 산정 방식" 라디오, `CompanionAcqPurchaseBlock.tsx:137-143`의 `acqPriceMode`와 동일 규칙)
 * 에서 파생한다.
 *
 * UI 표시(라디오 기본 선택) · API 변환(엔진 전송값) · validate(§7.2 필수 검증) **모두** 이 함수를
 * 단일 소스로 사용 — 각자 다른 파생 로직을 재구현하면 dual-truth(UI 표시 ≠ 실제 전송값)가 재발한다
 * (memory `feedback_ui_engine_dual_truth_avoidance`).
 */

export type PartAcqMode = "actual" | "estimated" | "appraisal" | "salesCase";

interface LegacyAcqFlags {
  isSalesCaseAcquisition?: boolean;
  isAppraisalAcquisition?: boolean;
  useEstimatedAcquisition?: boolean;
}

/** 자산 전체 단일 플래그에서 파생되는 레거시 취득 방식 (우선순위: 매매사례 > 감정 > 환산 > 실가). */
export function deriveLegacyPartAcqMode(asset: LegacyAcqFlags): PartAcqMode {
  if (asset.isSalesCaseAcquisition) return "salesCase";
  if (asset.isAppraisalAcquisition) return "appraisal";
  if (asset.useEstimatedAcquisition) return "estimated";
  return "actual";
}

/** `explicit`(land/buildingAcqMode, "" 허용)이 있으면 그대로, 없으면 레거시 파생값. */
export function effectivePartAcqMode(
  explicit: PartAcqMode | "" | undefined,
  asset: LegacyAcqFlags,
): PartAcqMode {
  return explicit || deriveLegacyPartAcqMode(asset);
}

interface SeparateAcquisitionFlags {
  hasSeperateLandAcquisitionDate?: boolean;
  landAcquisitionDate?: string;
  acquisitionDate?: string;
  isMixedUseHouse?: boolean;
  assetKind?: string;
}

/**
 * **별개 취득** 판정 — 토지와 건물을 서로 다른 시점에 각각 취득해 취득가액이 파트별로 실재하는 자산인가.
 *
 * `hasSeperateLandAcquisitionDate` 플래그 단독으로는 판정할 수 없다. 이 플래그는
 * 겸용주택 체크(`MixedUseSection.tsx:48`)와 `selfOwns !== "both"` 선택
 * (`CompanionAcquisitionCauseSection.tsx:179`)에서도 **강제로 켜지기 때문**이다 —
 * 그 두 경로는 토지·건물을 같은 날 함께 취득했어도 분리 계산 경로를 타므로,
 * 취득가액은 여전히 하나의 총액으로 실재한다(§166⑥ "구분할 수 없는 때" 안분이 정당).
 *
 * 취득가액을 파트별 완결로 요구해야 하는 것은 **실제로 취득시점이 다른** 경우뿐이다
 * (소득세법 §97①1호 · §114⑦ · 소득령 §176의2③ — 자산별 추계).
 *
 * UI 노출·API 전송·validate·엔진이 **모두** 이 함수를 단일 소스로 사용한다
 * (memory `feedback_ui_engine_dual_truth_avoidance`).
 */
interface SeparatePartAmounts extends LegacyAcqFlags {
  selfOwns?: "both" | "building_only" | "land_only";
  landAcqMode?: PartAcqMode | "";
  buildingAcqMode?: PartAcqMode | "";
  landAcquisitionPrice?: string;
  buildingAcquisitionPrice?: string;
  landSalesCaseValue?: string;
  buildingSalesCaseValue?: string;
}

/** 콤마 제거 후 정수 파싱 (CurrencyInput 저장 규약). */
function raw(v: string | undefined): number {
  const n = parseInt((v ?? "").replace(/,/g, ""), 10);
  return isFinite(n) ? n : 0;
}

/**
 * 별개 취득 자산의 **파트 취득가액 합계** — 사이드바 합계 전용.
 *
 * 별개 취득에서는 자산 전체 `fixedAcquisitionPrice`가 UI에서 숨겨지므로, 그 필드를 읽는
 * 종전 합계는 0(또는 stale 총액)을 표시한다. 파트 값을 더해 대체한다.
 *
 * 환산(estimated) 파트는 계산 전에는 금액이 없다 → `pending: true`로 알리고 **부분합을
 * 합계로 표시하지 않는다**(미확정 파트를 뺀 값을 총액으로 오독 — `feedback_engine_result_display_drift`).
 * 비소유 파트(`selfOwns≠both`)는 애초에 합계 대상이 아니다.
 */
export function separateAcqPartsSum(asset: SeparatePartAmounts): { sum: number; pending: boolean } {
  const selfOwns = asset.selfOwns ?? "both";
  const parts = [
    {
      owned: selfOwns !== "building_only",
      mode: effectivePartAcqMode(asset.landAcqMode, asset),
      price: asset.landAcquisitionPrice,
      salesCase: asset.landSalesCaseValue,
    },
    {
      owned: selfOwns !== "land_only",
      mode: effectivePartAcqMode(asset.buildingAcqMode, asset),
      price: asset.buildingAcquisitionPrice,
      salesCase: asset.buildingSalesCaseValue,
    },
  ];

  let sum = 0;
  let pending = false;
  for (const p of parts) {
    if (!p.owned) continue;
    if (p.mode === "estimated") {
      pending = true; // 환산은 결과 도착 후에야 확정
      continue;
    }
    const v = p.mode === "salesCase" ? raw(p.salesCase) : raw(p.price);
    if (v <= 0) pending = true;
    sum += v;
  }
  return { sum, pending };
}

/**
 * 토지분 취득시 기준시가 = `㎡당 개별공시지가 × 면적` (소득세법 §99①1호 가목).
 *
 * **엔진(`calcAcqStdPair`)과 UI 읽기 전용 표시가 공유하는 단일 소스**다. UI가 같은 산식을
 * 재구현하면 절사 규약이 갈려 표시값과 계산값이 어긋난다(`feedback_ui_engine_dual_truth_avoidance`).
 * 금액은 원 단위 정수이므로 `Math.floor` — 반올림 금지.
 */
export function calcLandStdPriceAtAcq(pricePerSqm: number, area: number): number | null {
  if (!(pricePerSqm > 0) || !(area > 0)) return null;
  return Math.floor(pricePerSqm * area);
}

/**
 * 건물분 취득시 기준시가 — **결합 총액에서 토지분을 뺀 역산** (소득세법 §99①1호 라목).
 *
 * 주택의 개별주택가격·공동주택가격은 **부수토지를 포함한 결합 공시**라 건물분 단독 공시가
 * 존재하지 않는다. 이 역산이 정본이며, `토지분 + 건물분 ≡ 라목 총액` 항등성을 지켜
 * 개산공제 합계를 법정액(시행령 §163⑥2호가목 = 라목 가액 × 3/100)과 일치시킨다.
 *
 * **엔진(`calcAcqStdPair`)과 UI 읽기 전용 표시가 공유하는 단일 소스**다 — UI가 같은 식을
 * 재구현하면 clamp 규약이 갈려 표시값과 계산값이 어긋난다
 * (`feedback_ui_engine_dual_truth_avoidance`). 총액 미입력(≤0)은 산출 불가라 `null`이다.
 */
export function calcDerivedBuildingStdAtAcq(total: number, landStd: number): number | null {
  if (!(total > 0)) return null;
  return Math.max(total - landStd, 0);
}

/**
 * 파트 취득일 — 「분리 OFF면 `landAcquisitionDate === acquisitionDate`」 불변식의 **방어적 표현**.
 *
 * M-1a(2026-08-05) 이후 `acquisitionDate` = 건물 · `landAcquisitionDate` = 토지다. 불변식은
 * `migrateAsset`이 세우지만 **직접 조립한 fixture·구 세션은 그 경로를 거치지 않아** 토지 값이
 * 빈 채로 도달할 수 있다. 그 상태로 토지 게이트(상속·증여 1985 판정 등)를 태우면 조용히
 * false가 되어 특례가 사라진다 — 빈 토지 값은 건물 값으로 되돌린다(= 분리 OFF와 동치).
 *
 * ⚠️ 이것은 「자동 안분 fallback」이 아니다. 안분은 없는 값을 **지어내는** 것이고, 여기서는
 *    분리 OFF에서 두 값이 같다는 **정의된 불변식**을 복원할 뿐이다.
 *
 * UI·API 변환·validate가 **이 함수 하나**를 쓴다(dual-truth 회피).
 */
export function partAcquisitionDates(a: {
  acquisitionDate?: string;
  landAcquisitionDate?: string;
}): { land: string; building: string } {
  const building = a.acquisitionDate ?? "";
  return { land: a.landAcquisitionDate || building, building };
}

export function isSeparateAcquisition(asset: SeparateAcquisitionFlags): boolean {
  if (!asset.hasSeperateLandAcquisitionDate) return false;
  if (!asset.landAcquisitionDate || !asset.acquisitionDate) return false;
  if (asset.landAcquisitionDate === asset.acquisitionDate) return false;
  // 겸용주택은 4부분 안분(transfer-tax-mixed-use.ts)이 별도 축을 지배 — 범위 밖.
  if (asset.assetKind === "housing" && asset.isMixedUseHouse) return false;
  return true;
}

/** 미입력 판정 — `AssetForm`은 string(콤마 포함), 엔진 input은 number라 두 형태를 모두 받는다. */
function empty(v: string | number | undefined | null): boolean {
  if (v == null) return true;
  if (typeof v === "number") return !(v > 0);
  return !(raw(v) > 0);
}

/** 양도시 기준시가 배치 판정 입력 — 각 계층의 기존 단일 소스가 파생해 주입한다(재파생 금지). */
export interface SaleStdPlacementCtx {
  /** `AssetForm.saleSplitMode` — stale 자산 대비 `?? "apportioned"` fallback을 **호출부가** 적용 */
  saleSplitMode: "actual" | "apportioned";
  landMode: PartAcqMode;
  buildingMode: PartAcqMode;
  selfOwns: "both" | "building_only" | "land_only";
}

/**
 * **양도시 기준시가를 어디에 두는가** — 축 A(양도가액 결정) vs 파트 섹션(축 B 취득가액).
 *
 * 계획서: docs/02-design/features/transfer-split-std-price-colocation.plan.md §5.1
 *
 * 엔진 소비 구조와 1:1로 대응한다(`transfer-tax-split-gain.ts`):
 *   · 일괄양도(apportioned) → `calcSaleApportionRatio`(:162-171)가 **토지·건물 둘 다** 요구.
 *     이 값은 특정 파트가 아니라 **양도가액 축**에 속하므로 축 A에 둔다.
 *   · 구분양도(actual) → 파트 환산 분모로만 쓰인다(:258-262 `partStdAtTransfer`).
 *     그 파트가 환산이 아니면 계산 어디에도 등장하지 않으므로 노출하지 않는다.
 *   · 비소유 파트(`selfOwns≠both`)의 양도차익은 상위에서 폐기되므로(transfer-tax.ts:315-316)
 *     그 파트의 환산 분모도 필요 없다.
 *
 * **불변식**: `saleAxis && (landPart || buildingPart)`가 참인 조합은 없다 — 같은 `data-testid`가
 * 화면에 2개 존재해 E2E strict mode가 깨지는 사고를 차단한다. (`landPart`와 `buildingPart`는
 * 양쪽 환산에서 동시에 참이며, 이는 서로 다른 섹션의 서로 다른 카드라 정상이다.)
 *
 * ⚠️ **공통 조상이 1회 계산해 양축에 주입**한다(`CompanionAcqPurchaseBlock`). 축 A·축 B가 각자
 * 호출하면 인자가 어긋나는 순간 위 불변식이 관례적 보증으로 전락한다 — 기존 `acqStdPriceRequired`
 * 주입과 같은 패턴이다(memory `feedback_ui_engine_dual_truth_avoidance`).
 */
export function saleStdPlacement(ctx: SaleStdPlacementCtx): {
  /** 축 A: 양도가액 안분 비율 — 토지·건물을 한 카드에 */
  saleAxis: boolean;
  /** 축 B 토지 섹션: 토지 환산 분모 */
  landPart: boolean;
  /** 축 B 건물 섹션: 건물 환산 분모 */
  buildingPart: boolean;
} {
  if (ctx.saleSplitMode === "apportioned") {
    return { saleAxis: true, landPart: false, buildingPart: false };
  }
  return {
    saleAxis: false,
    landPart: ctx.landMode === "estimated" && ctx.selfOwns !== "building_only",
    buildingPart: ctx.buildingMode === "estimated" && ctx.selfOwns !== "land_only",
  };
}

/**
 * 그 파트의 양도시 기준시가가 **계산에 실제로 쓰이는가** = 입력 필수 여부.
 *
 * UI 노출(`saleStdPlacement`)과 validate 요구가 **같은 술어에서 나온다** — 어긋나면
 * "입력 칸이 없는데 차단"(dead-end)이 된다(memory `feedback_ui_gate_removes_sole_input_path` 3항).
 */
export function needsSaleStdPart(part: "land" | "building", ctx: SaleStdPlacementCtx): boolean {
  const p = saleStdPlacement(ctx);
  return p.saleAxis || (part === "land" ? p.landPart : p.buildingPart);
}

interface AcqStdPriceNeedFlags {
  landAcquisitionPrice?: string | number;
  buildingAcquisitionPrice?: string | number;
  landTransferPrice?: string | number;
  buildingTransferPrice?: string | number;
  landDirectExpenses?: string | number;
  buildingDirectExpenses?: string | number;
  /** 자산 전체 자본적지출 총액 (legacy `directExpenses` 경로에서만 > 0) */
  expenses?: number;
}

/**
 * 모드·별개취득 판정은 각 계층의 기존 단일 소스가 파생해 주입한다(재파생 금지).
 *
 * ⚠️ **양도 축(`hasSaleRatio`)은 인자가 아니다**(2026-07-30 3절 폐지와 함께 제거).
 *    취득시 기준시가는 **취득가액**을 나누는 값이고, 양도가액 안분은 양도시 기준시가가
 *    담당한다(`calcSaleApportionRatio`). 두 축을 한 술어에 섞어 두면 "양도가액이 없으니
 *    취득시 기준시가를 넣으라"는 거짓 요구가 되살아난다 — 실제로 그 형태로 남아 있었다.
 */
interface AcqStdPriceNeedContext {
  landMode: PartAcqMode;
  buildingMode: PartAcqMode;
  isSeparate: boolean;
}

/**
 * **취득시 기준시가(㎡당 개별공시지가 × 면적)가 실제로 필요한가.**
 *
 * 계획서: docs/02-design/features/transfer-split-acq-std-gate-relaxation.plan.md §3·§4.1
 *
 * 취득시 기준시가는 취득가액을 **환산해야 할 때만** 필요하다. 토지·건물 양쪽의 실지거래가액을
 * 아는 경우(케이스 a)에는 계산 어디에도 등장하지 않으므로 요구해서는 안 된다
 * (2026-07-29 사용자 확정 규칙 ③).
 *
 * 아래 4개 절은 `transfer-tax-split-gain.ts`의 소비 지점과 1:1로 대응한다(계획서 §3 표):
 *   1절 ①환산 분자 · ②개산공제 base(§163⑥) · ⑧stdPriceAtAcq echo · ⑨lumpDeductionBase
 *   2절 ③취득가액 안분 · ④매매사례 안분   3절 ⑤양도가액 안분 fallback   4절 ⑥자본적지출 안분
 *
 * `splitPair`는 **양쪽 다 미입력일 때만** 비율을 쓰므로(한쪽만 있으면 잔액 도출) 2·3·4절의
 * 조건이 모두 "2칸 모두 미입력"인 것이다.
 *
 * **엔진·validate·UI가 이 함수 하나를 공유**한다 — 조건을 각자 재기술하면 dual-truth가 된다
 * (선례: `isSplitPairOverflow`를 엔진이 export하고 validate가 import).
 */
export function requiresAcqStdPrice(
  a: AcqStdPriceNeedFlags,
  ctx: AcqStdPriceNeedContext,
): boolean {
  return (
    requiresAcqStdPricePart("land", a, ctx) || requiresAcqStdPricePart("building", a, ctx)
  );
}

/**
 * **안분 비율**(토지·건물 기준시가 **둘 다** 필요)이 실제로 소비되는가 — 위 2·3·4절.
 *
 * 1절(환산 분자·개산공제 base·echo)은 파트 자기 기준시가만 쓰므로 여기 들어오지 않는다.
 */
function needsApportionRatio(a: AcqStdPriceNeedFlags, ctx: AcqStdPriceNeedContext): boolean {
  // ③④ 취득가액 안분 — 별개취득은 파트별 완결이라 안분 자체가 없다(§97①1호·§114⑦).
  //     비-별개취득에서 파트 2칸이 모두 비면 비율 안분이 유일한 도출 수단이다.
  if (!ctx.isSeparate && empty(a.landAcquisitionPrice) && empty(a.buildingAcquisitionPrice)) return true;

  // ⑤ 양도가액 안분 — **폐지**(2026-07-30).
  //    종전엔 "양도시 기준시가 비율도 없고 구분 입력도 없으면 취득시 비율로 후퇴한다"였으나,
  //    2026-07-29에 그 후퇴가 폐지됐다 — `transfer-tax-split-gain.ts`의 양도가액 축은
  //    `effectiveSaleLandRatio = saleRatio?.land ?? null`로 **취득시 비율을 참조하지 않는다**
  //    (토지는 오르고 건물은 감가해 두 시점의 비율이 크게 다르고, 취득시 비율로 양도대가를
  //     나눌 법령 근거가 없다). 남겨두면 계산에 쓰이지 않는 값을 요구하는 **거짓 요구**이고,
  //    오류 메시지가 실제 원인(양도가액 구분 근거 부재)이 아니라 기준시가를 가리킨다.
  //    차단은 validate V4(구분양도)·V7(일괄양도 기준시가)과 엔진 `splitPair`가 담당한다.

  // ⑥ 자본적지출 — legacy 총액을 안분해야 하는데 파트 2칸이 모두 빈 경우.
  if ((a.expenses ?? 0) > 0 && empty(a.landDirectExpenses) && empty(a.buildingDirectExpenses)) return true;

  return false;
}

/**
 * **그 파트의** 취득시 기준시가가 실제로 쓰이는가 (2026-07-30 파트별 분해).
 *
 * 계획서: docs/02-design/features/transfer-split-acq-std-part-gating.plan.md §3.2
 *
 * 종전 `requiresAcqStdPrice` 1절은 "어느 한 파트라도 non-actual이면 true"라 파트를 구분하지
 * 않았다. 그 결과 **토지=실거래가 + 건물=환산**에서 토지 공시지가·면적이 계산 어디에도 쓰이지
 * 않는데(취득가액은 파트별 완결·개산공제는 파트 자기 base·양도가액은 양도시 기준시가 비율)
 * 미입력이면 엔진이 throw하고 validate가 차단했다.
 *
 * 1절(환산 분자 ①·개산공제 base ②·echo ⑧·lumpDeductionBase ⑨)은 **그 파트 자신의 기준시가**만
 * 소비하므로 파트 모드로 판정하고, 2·3·4절(안분 비율)은 양쪽을 함께 요구한다.
 */
export function requiresAcqStdPricePart(
  part: "land" | "building",
  a: AcqStdPriceNeedFlags,
  ctx: AcqStdPriceNeedContext,
): boolean {
  const mode = part === "land" ? ctx.landMode : ctx.buildingMode;
  // ① 환산 분자 · ② 개산공제 base · ⑧ echo · ⑨ lumpDeductionBase — 그 파트가 실가가 아니면 필요
  if (mode !== "actual") return true;
  return needsApportionRatio(a, ctx);
}

// ──────────────────────────────────────────────────────────────────────────────
// 양도시 토지분 기준시가 — 저장값이 아니라 파생값이 정본
// ──────────────────────────────────────────────────────────────────────────────

/** 콤마 허용 문자열 → 양수. 그 외는 0. (단가=정수·면적=소수 둘 다 처리) */
function positive(v: string | undefined): number {
  const n = parseFloat((v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * **양도시 토지분 기준시가**(「소득세법」 제99조 제1항 제1호 가목) = ㎡당 개별공시지가 × 양도 당시 토지 면적.
 *
 * ## 왜 저장값을 그대로 쓰면 안 되는가
 *
 * 토지분은 **직접 입력 칸이 없다** — 가목은 "개별공시지가 × 면적"이 정의 그 자체라 별도 고시
 * 총액이 존재하지 않는다(`TransferStdPriceCards.tsx:88-91`). 그래서 `landStandardPriceAtTransfer`는
 * 사용자가 적어 넣는 값이 아니라 **파생값의 캐시**다.
 *
 * 그런데 그 캐시를 갱신하는 경로는 `TransferStdPriceCards.tsx`의 `writeLandStd` **하나뿐**인데,
 * 곱셈 인자인 `transferArea`를 쓰는 경로는 넷이다:
 *
 *   `AssetAreaSection.tsx:323·373·412`  ① 기본정보 축 A   → 캐시 갱신 ❌
 *   `AssetSectionTransfer.tsx:105`      ② 공익수용 면적    → 캐시 갱신 ❌
 *   `CompanionAcquisitionCauseSection.tsx:171`             → 캐시 갱신 ❌
 *   `TransferStdPriceCards.tsx:50`      `writeLandStd`      → 캐시 갱신 ✅
 *
 * ⇒ ③에서 면적 100으로 총액을 만든 뒤 ①에서 면적을 200으로 고치면 캐시가 100 기준으로 남는다.
 *   실측(면적을 절반으로 어긋나게 둔 경우, `land-building-split.test.ts` S1 fixture 기준):
 *   **산출세액 20,202,957원 → 0원**. 양도가액 안분 비율(`calcSaleApportionRatio`)과 환산 분모가
 *   함께 틀어지면서 세액이 통째로 사라진다 — 과소신고 방향이다.
 *
 * ## 규약
 *
 * 단가와 면적이 모두 있으면 **항상 그 곱**이 정본이다. 저장값은 둘 중 하나가 없을 때만 쓴다
 * (단가·면적 없이 총액만 있는 legacy·stale sessionStorage 자산 호환).
 *
 * 절사는 `writeLandStd`(:56)·`LandPriceLookupField`(:144-145)와 동일한 `Math.floor`.
 *
 * UI 표시·API 변환·validate가 **이 함수 하나**를 쓴다 — 각자 계산하면 dual-truth가 된다
 * (memory `feedback_ui_engine_dual_truth_avoidance`).
 */
export function resolveLandStdAtTransfer(a: {
  standardPricePerSqmAtTransfer?: string;
  transferArea?: string;
  landStandardPriceAtTransfer?: string;
}): number | undefined {
  const perSqm = positive(a.standardPricePerSqmAtTransfer);
  const area = positive(a.transferArea);
  if (perSqm > 0 && area > 0) return Math.floor(perSqm * area);

  const stored = positive(a.landStandardPriceAtTransfer);
  return stored > 0 ? stored : undefined;
}
