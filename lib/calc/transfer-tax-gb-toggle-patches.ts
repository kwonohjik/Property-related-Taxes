/**
 * 일반건물 「토지·건물 취득일 다름」 **전환 patch**·취득원인별 선택지 leaf (A2 · 2026-10-06).
 *
 * `transfer-tax-split-acq-mode.ts`(800줄 정책)에서 분리했다 — 응집 단위는 「일반건물 분리 토글·원인 전환이 쓰는 순수 patch」다.
 * ⚠️ 분리 이전 함수는 원본에 **재export하지 않는다** — 소비처가 이 파일의 신규 함수뿐이라(전수 확인) 외부 import 사이트가 없다
 *    (재export는 eslint가 「미사용」으로 지운다 — memory feedback_800line_split_export_preservation).
 *    `deriveLegacyPartAcqMode`·`PartAcqMode`는 원본이 정본이다(여기서 import).
 */
import { deriveLegacyPartAcqMode, effectivePartAcqMode, type PartAcqMode } from "./transfer-tax-split-acq-mode";

interface LegacyAcqFlags {
  isSalesCaseAcquisition?: boolean;
  isAppraisalAcquisition?: boolean;
  useEstimatedAcquisition?: boolean;
}

/** 콤마 제거 후 정수 파싱 (CurrencyInput 저장 규약). */
function raw(v: string | undefined): number {
  const n = parseInt((v ?? "").replace(/,/g, ""), 10);
  return isFinite(n) ? n : 0;
}

/**
 * **일반건물 파트의 취득원인별 선택 가능 산정방식** — ⑤ 라디오 필터와 ⑧ R8이 공유하는 단일 소스 (A2 · §3.6).
 *
 * - 상속·증여: **실거래가 1종** — 「소득세법」 §97①1호 단서(가목 확인 가능 → 나목 추계 불가) · 영 §163⑨.
 *   ⑧ V2(`blockEstimation`)가 이 집합 밖 값을 차단한다.
 * - 이월과세: **{실거래가, 환산취득가} 현행 유지** — 감정·매매사례만 비노출(A-통합 Q-A·C-2). 이월과세 카드가
 *   취득가액을 시나리오 A/B로 교체하므로 감정·매매사례는 의미가 없다(⑧ R8이 stale을 차단).
 * - 그 외(매매·신축 자가건축): 4종. 신축의 매매사례는 주택 신축 경로와 대칭 유지(Q-D — 새 규칙 발명 금지).
 *
 * 부담부증여는 이 함수 밖이다(파트 라디오 자체가 숨겨진다 — §159).
 */
export function gbPartAllowedModes(cause: string | undefined): readonly PartAcqMode[] {
  if (cause === "inheritance" || cause === "gift") return ["actual"];
  if (cause === "carryover_gift") return ["actual", "estimated"];
  return ["actual", "estimated", "appraisal", "salesCase"];
}

/**
 * 파트 취득원인이 상속·증여·이월과세로 바뀔 때, **그 원인에서 허용되지 않는 모드**가 서 있으면 명시 `"actual"`로 고정하는 patch.
 *
 * ⚠️ `""`(미선택)로 비우지 않는다 — 비우면 `effectivePartAcqMode`가 stale 레거시 플래그로 되돌아가
 *    화면(무선택)↔전송값(감정)이 갈린다(G-3 근본 원인). 허용되는 모드(예: 이월과세의 환산)는 건드리지 않는다.
 * ⚠️ 두 키를 **같은 onChange patch**에 넣는다(나눠 부르면 뒤 호출이 앞을 덮는다).
 */
export function gbPartCauseModePatch(
  part: "land" | "building",
  cause: string | undefined,
  currentMode: PartAcqMode,
): { landAcqMode?: "actual"; buildingAcqMode?: "actual" } {
  if (gbPartAllowedModes(cause).includes(currentMode)) return {};
  return part === "land" ? { landAcqMode: "actual" } : { buildingAcqMode: "actual" };
}

/** 분리 OFF 전환 시 비우는 **파트 값** 6칸 — 파트 라디오가 사라져 어디서도 고칠 수 없는 값(A-통합 Q-H). */
const GB_PART_AMOUNT_KEYS = [
  "landAcquisitionPrice",
  "buildingAcquisitionPrice",
  "landSalesCaseValue",
  "buildingSalesCaseValue",
  "landDirectExpenses",
  "buildingDirectExpenses",
] as const;

/**
 * 분리 **OFF** 전환 patch — 파트 모드·파트 금액·`*SalesCaseValue`·`*DirectExpenses`를 한 덩어리로 비운다 (A2 · §3.9).
 *
 * 분리 OFF의 유효 모드는 레거시 3플래그뿐이고(`gbPartModes`) 파트 칸은 화면에 없다. stale 파트 값이 남으면
 * ④가 그 값을 싣거나 엔진이 총액과 파트 값을 함께 받아 throw한다. 재ON 시에도 복원하지 않는다(취득일은 별도 보존).
 */
export function gbSeparateOffPartClearPatch(): {
  landAcqMode: "";
  buildingAcqMode: "";
  landAcquisitionPrice: "";
  buildingAcquisitionPrice: "";
  landSalesCaseValue: "";
  buildingSalesCaseValue: "";
  landDirectExpenses: "";
  buildingDirectExpenses: "";
} {
  return {
    landAcqMode: "",
    buildingAcqMode: "",
    landAcquisitionPrice: "",
    buildingAcquisitionPrice: "",
    landSalesCaseValue: "",
    buildingSalesCaseValue: "",
    landDirectExpenses: "",
    buildingDirectExpenses: "",
  };
}

interface GbOffModeSource extends LegacyAcqFlags {
  landAcqMode?: PartAcqMode | "";
  buildingAcqMode?: PartAcqMode | "";
  /** 토지·건물 소유자 분리 — 본인 소유가 아닌 파트는 자산 단위 산정방식을 정하지 못한다. */
  selfOwns?: "both" | "building_only" | "land_only";
  gbHasExtension?: boolean;
  /** 분리 OFF의 단일 취득원인(= 토지 원인) */
  acquisitionCause?: string;
}

/**
 * 분리 OFF 전환 후 **자산 단위(레거시 3플래그)가 표현할 산정방식** — ON 승격(`gbSeparateOnPatch`)의 대칭 강등 (A2 후속 · 세액 조용한 변경 방지).
 *
 * 소유 파트(`selfOwns` 반영)의 명시 모드가 **모두 같고 `actual`이 아니면** 그 모드를 유지한다. 아래는 자산 단위로 표현할 수 없어 `actual`이다:
 *  - 파트 모드가 서로 다르다(혼합) — 기존 Dialog가 손실을 알린다
 *  - 그 취득원인에서 허용되지 않는 모드(`gbPartAllowedModes` — 상속·증여의 비-actual, 이월과세의 감정·매매사례)
 *  - 증축이 있는데 감정·매매사례 — ⑧ R9가 자산 단위 감정·매매사례를 차단한다(환산은 증축과 함께 허용)
 * 금액 칸(감정=`fixedAcquisitionPrice`, 매매사례=`similarSalesValue`)은 건드리지 않는다 — 비어 있으면 ⑧이 요구한다(파트 금액을 합쳐 지어내지 않는다).
 */
export function gbSeparateOffTargetMode(a: GbOffModeSource): PartAcqMode {
  const selfOwns = a.selfOwns ?? "both";
  const owned: PartAcqMode[] = [];
  if (selfOwns !== "building_only") owned.push(effectivePartAcqMode(a.landAcqMode, a));
  if (selfOwns !== "land_only") owned.push(effectivePartAcqMode(a.buildingAcqMode, a));
  const mode = owned[0];
  if (!mode || mode === "actual" || owned.some((m) => m !== mode)) return "actual";
  if (!gbPartAllowedModes(a.acquisitionCause).includes(mode)) return "actual";
  if (a.gbHasExtension && (mode === "appraisal" || mode === "salesCase")) return "actual";
  return mode;
}

/**
 * 분리 OFF 전환 시 **레거시 3플래그를 파트 모드에서 되돌리는** patch — `gbSeparateOffTargetMode`의 값을 세 플래그로 쓴다.
 *
 * 세 플래그를 **항상 전부** 쓴다(한 patch). 일부만 쓰면 ON 중 남은 `useEstimatedAcquisition` 등이 되살아나 파트 선택과 다른 산정방식이 된다.
 * `gbUnifiedSec1639ClearPatch`·`gbUnifiedCarryoverClearPatch`와 모순되지 않는다 — 두 patch가 끄는 조합은 `gbPartAllowedModes`가 이미 강등 대상에서 뺀다.
 */
export function gbSeparateOffFlagsPatch(a: GbOffModeSource): {
  useEstimatedAcquisition: boolean;
  isAppraisalAcquisition: boolean;
  isSalesCaseAcquisition: boolean;
} {
  const mode = gbSeparateOffTargetMode(a);
  return {
    useEstimatedAcquisition: mode === "estimated",
    isAppraisalAcquisition: mode === "appraisal",
    isSalesCaseAcquisition: mode === "salesCase",
  };
}

/**
 * 분리 OFF 전환이 **사용자가 입력한 값을 지우는가** — 참이면 확인 Dialog를 띄운다(A-통합 Q-H).
 *
 * 지워지는 것: ① 파트 금액 6칸 중 양수 ② 전환 후 자산 단위 모드(`gbSeparateOffTargetMode`)와 **다른** 명시 파트 모드(= 사용자가 고른 산정방식 —
 * 그 취득원인에서 허용되는 모드만). 강등으로 **보존되는 선택은 잃는 값이 아니다** — 분리 ON 직후(승격 그대로)에는 즉시 전환된다.
 */
export function gbSeparateOffHasDataToClear(
  a: GbOffModeSource &
    Partial<Record<(typeof GB_PART_AMOUNT_KEYS)[number], string>> & {
      gbBuildingAcquisitionCause?: string;
    },
): boolean {
  if (GB_PART_AMOUNT_KEYS.some((k) => raw(a[k]) > 0)) return true;
  const target = gbSeparateOffTargetMode(a);
  const selfOwns = a.selfOwns ?? "both";
  const lost = (mode: PartAcqMode | "" | undefined, cause: string | undefined) =>
    !!mode && mode !== target && gbPartAllowedModes(cause).includes(mode);
  return (
    (selfOwns !== "building_only" && lost(a.landAcqMode, a.acquisitionCause)) ||
    (selfOwns !== "land_only" && lost(a.buildingAcqMode, a.gbBuildingAcquisitionCause))
  );
}

/**
 * 분리 **ON** 전환 patch — 자산 단위에서 고른 산정방식을 **명시 파트 모드로 승격**하고 숨은 감정·매매사례 플래그를 끈다 (A2 · §3.9).
 *
 * 분리 ON에서는 자산 단위 라디오가 숨어(`hideAssetAcqAxis`) 레거시 감정·매매사례 플래그를 끌 수단이 없고, ④가 그 플래그로
 * 최상위 `acquisitionMethod`를 정해 ⑩ refine 400이 되던 것이 G-3의 실체다. 승격한 뒤 두 플래그를 같은 patch에서 소거한다.
 *
 * - 승격 값은 **레거시 파생값**이다 — 분리 OFF 화면이 보여 준 값(`gbPartModes` OFF 규칙)이므로 stale 명시 파트 모드가 있어도 쓰지 않는다.
 * - `useEstimatedAcquisition`은 건드리지 않는다(GB 별도 소비처 다수 — 연면적 게이트·⑧·④).
 * - 파트 **금액**은 옮기지 않는다 — 자산 단위 총액을 토지·건물로 자동 분할하지 않는다(자동 안분 fallback 금지). 비면 ⑧이 입력을 요구한다.
 */
export function gbSeparateOnPatch(a: LegacyAcqFlags): {
  hasSeperateLandAcquisitionDate: true;
  landAcqMode: PartAcqMode;
  buildingAcqMode: PartAcqMode;
  isAppraisalAcquisition: false;
  isSalesCaseAcquisition: false;
} {
  const mode = deriveLegacyPartAcqMode(a);
  return {
    hasSeperateLandAcquisitionDate: true,
    landAcqMode: mode,
    buildingAcqMode: mode,
    isAppraisalAcquisition: false,
    isSalesCaseAcquisition: false,
  };
}

/**
 * 일반건물 **분리 OFF**에서 취득원인이 **이월과세**가 될 때 감정·매매사례 플래그를 비우는 patch (A2 · R8의 짝).
 *
 * 이월과세 카드에는 산정 방식 라디오가 없고(매매 블록 전용) 이월과세는 감정·매매사례를 쓰지 않는다(§97의2①) —
 * 매매에서 고른 감정·매매사례가 남으면 ⑧ R8이 막는데 **끌 칸이 없다**. 환산(`useEstimatedAcquisition`)은 현행 경로라 건드리지 않는다.
 * 쓰는 곳: 화면 전환(`setUnifiedCause`·`setSeparate(false)`)과 저장값 복원.
 */
export function gbUnifiedCarryoverClearPatch(cause: string | undefined): {
  isAppraisalAcquisition?: false;
  isSalesCaseAcquisition?: false;
} {
  if (cause !== "carryover_gift") return {};
  return { isAppraisalAcquisition: false, isSalesCaseAcquisition: false };
}

/**
 * 분리 **ON**으로 **저장된** 일반건물의 복원 정규화 patch (A2 · G-3 — 전환을 거치지 않는 저장값은 화면 patch를 못 탄다).
 *
 * 숨은 레거시 감정·매매사례 플래그가 켜져 있으면 `gbSeparateOnPatch`와 같이 소거하되, 이미 **명시된 파트 모드는 보존**한다
 * (사용자가 고른 값 — 레거시 파생값으로 덮으면 입력 손실). 비어 있는 파트만 레거시 파생값으로 승격한다.
 * 플래그가 없으면 빈 patch — E2E 시드(명시 모드·플래그 false)는 정규화로 지워지지 않는다.
 */
export function gbSeparateOnRestorePatch(a: LegacyAcqFlags & {
  hasSeperateLandAcquisitionDate?: boolean;
  landAcqMode?: PartAcqMode | "";
  buildingAcqMode?: PartAcqMode | "";
}): { landAcqMode: PartAcqMode; buildingAcqMode: PartAcqMode; isAppraisalAcquisition: false; isSalesCaseAcquisition: false } | Record<string, never> {
  if (!a.hasSeperateLandAcquisitionDate) return {};
  if (!a.isAppraisalAcquisition && !a.isSalesCaseAcquisition) return {};
  const mode = deriveLegacyPartAcqMode(a);
  return {
    landAcqMode: a.landAcqMode || mode,
    buildingAcqMode: a.buildingAcqMode || mode,
    isAppraisalAcquisition: false,
    isSalesCaseAcquisition: false,
  };
}
