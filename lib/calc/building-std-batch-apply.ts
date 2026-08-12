/**
 * 건물 기준시가 **일괄 계산 결과 → 자산 폼 patch** (순수 함수, 자산유형별)
 *
 * 계획서: docs/02-design/features/building-std-price-modal-multipoint.plan.md §4.3·§4.4
 *
 * ## 왜 순수 함수인가
 *
 * 1. **단일 배치 patch 강제** — 최대 4키(건물 기준시가 3시점 + §164⑤ 준용 확인)를 한 객체로
 *    만들어 호출부가 `onChange(patch)` **1회**로 반영하게 한다. 단일키 setter를 연속 호출하면
 *    먼저 쓴 값이 stale spread에 덮여 되돌아간다(memory `feedback_multikey_patch_stale_spread_overwrite`).
 * 2. **트랙 오염 규칙을 테스트 가능하게** — 취득 ≤2000의 모달 공시지가는 2001.1.1 기준
 *    (위치지수 전용)이라 취득당시 토지값에 넣으면 환산이 조용히 틀린다. UI를 열지 않고
 *    anchor로 고정한다.
 *
 * 자산유형별로 대상 필드가 다르다:
 *   상업용건물·오피스텔(§164⑥) — `cbBuildingStdPriceAt*` 3시점 + §164⑤ 준용 확인
 *   일반건물(§166⑥ 안분)        — `gbAcqBuildingValue`·`gbTransferBuildingValue` 2시점
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type {
  MultiPointStdPriceApply,
  StdPricePointSpec,
} from "@/components/calc/building-std-price/MultiPointBuildingStdPriceModal";
import { recommendLandPriceYear } from "@/lib/utils/land-price-year";
import { isAcq2001LocationIndexTrack } from "./phd-acq-land-price-track";
import { isSec164_5ProvisoApplicable } from "./commercial-164-6-proviso";
import { resolveCbEra } from "./commercial-cb-era";

/** 취득연도(YYYY-MM-DD → number). 미완성 값은 undefined. */
export function commercialAcqYear(acquisitionDate: string | undefined): number | undefined {
  return acquisitionDate && acquisitionDate.length >= 4
    ? Number.parseInt(acquisitionDate.slice(0, 4), 10)
    : undefined;
}

/**
 * 개별공시지가 **기준연도**(매년 5/31 공시 — 그 이전 날짜면 전년도).
 *
 * 상위 화면 `LandPriceLookupField`가 자동 선택하는 연도와 같은 규칙이다. 건물기준시가 고시
 * 체계 연도(`commercialAcqYear`)와는 **다른 축**이라 섞어 쓰면 라벨·값의 연도가 어긋난다.
 * 미완성 날짜는 undefined.
 */
export function landPriceYearOf(date: string | undefined): number | undefined {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const y = recommendLandPriceYear(date);
  return Number.isFinite(y) ? y : undefined;
}

/**
 * 취득시 토지 공시지가를 **건물 시점과 공유할 수 있는가**(일반건물 전용).
 *
 * 일반건물은 토지·건물 취득일이 다를 수 있다(`hasSeperateLandAcquisitionDate`). ① 토지 공시지가
 * 칸은 **토지 취득일** 기준연도로 조회된 값인데, 건물 기준시가 위치지수에 필요한 것은 **건물
 * 취득일** 기준연도 공시지가다 — 두 기준연도가 다르면 서로 다른 해의 값이라 prefill도
 * 되돌려쓰기도 오염이다.
 *
 * 판정 축이 "취득일이 같은가"가 **아니라** "기준연도가 같은가"인 이유: 5/31 공시 규칙상
 * 2022-01-10과 2022-03-05는 둘 다 2021년 기준으로 같은 공시지가를 쓴다.
 * 판정 불가(날짜 미완성)면 `true` — 종전 동작을 유지한다.
 */
export function sharesAcqLandPriceYear(
  asset: Pick<AssetForm, "acquisitionDate" | "landAcquisitionDate">,
): boolean {
  return sameLandPriceYear(asset.acquisitionDate, asset.landAcquisitionDate);
}

/**
 * 두 날짜가 **같은 공시지가 기준연도**를 쓰는가. 판정 불가(미완성 날짜)면 `true`(종전 동작).
 * 자산 폼이 아닌 곳(3시점 섹션 props 등)에서 같은 규칙을 재사용하기 위한 원형.
 */
export function sameLandPriceYear(a: string | undefined, b: string | undefined): boolean {
  const ya = landPriceYearOf(a);
  const yb = landPriceYearOf(b);
  if (ya == null || yb == null) return true;
  return ya === yb;
}

/** 토지·건물 취득일의 공시지가 기준연도가 달라 취득 공시지가를 비워 둘 때의 사유 안내(공용). */
export const SEPARATE_LAND_ACQ_LANDPRICE_HINT =
  "토지 취득일과 건물 취득일의 공시지가 기준연도가 달라 취득시 토지 공시지가를 자동으로 채우지 " +
  "않았습니다 — 건물 취득일 기준연도로 조회하거나 직접 입력하세요.";

/**
 * 배치 적용 patch 조립.
 *
 * - 건물 기준시가: 산출된 시점만 반영(미산출 시점의 기존 값은 보존).
 * - `cbAcqBuildingStdBy164_5`(Q-1): 취득시 금액이 새로 들어오고 §164⑥ 단서 구간이면 자동 체크.
 *   배치의 취득 ≤2000 경로가 곧 §164⑤ 준용 산정(`acqBaseStdPrice`)이라 전제가 코드로 보장된다.
 * - 공시지가 되돌려쓰기: 최초고시·양도만 무조건 반영. **취득분은 ≤2000이면 드롭**(트랙 상이).
 */
export function buildCommercialBatchPatch(
  v: MultiPointStdPriceApply,
  asset: Pick<AssetForm, "acquisitionDate" | "cbEra">,
): Partial<AssetForm> {
  const patch: Partial<AssetForm> = {};
  const acqYear = commercialAcqYear(asset.acquisitionDate);

  if (v.acquisition?.housing != null) patch.cbBuildingStdPriceAtAcq = String(v.acquisition.housing);
  if (v.firstDisclosure?.housing != null)
    patch.cbBuildingStdPriceAtFirst = String(v.firstDisclosure.housing);
  if (v.transfer?.housing != null) patch.cbBuildingStdPriceAtTransfer = String(v.transfer.housing);

  if (
    patch.cbBuildingStdPriceAtAcq &&
    isSec164_5ProvisoApplicable(resolveCbEra(asset), asset.acquisitionDate)
  ) {
    patch.cbAcqBuildingStdBy164_5 = true;
  }

  if (v.landPrices?.firstDisclosure) patch.cbLandPricePerSqmAtFirst = v.landPrices.firstDisclosure;
  if (v.landPrices?.transfer) patch.cbLandPricePerSqmAtTransfer = v.landPrices.transfer;
  if (v.landPrices?.acquisition && !isAcq2001LocationIndexTrack(acqYear))
    patch.cbLandPricePerSqmAtAcq = v.landPrices.acquisition;

  return patch;
}

/**
 * 취득시 건물 기준시가를 **사용자가 직접 수정**할 때의 patch (Q-1).
 * 계산기가 산정한 값이 아니게 되므로 §164⑤ 준용 확인을 해제한다 — 해제도 같은 patch에 싣는다.
 */
export function buildAcqBuildingStdEditPatch(
  value: string,
  asset: Pick<AssetForm, "cbAcqBuildingStdBy164_5">,
): Partial<AssetForm> {
  return asset.cbAcqBuildingStdBy164_5
    ? { cbBuildingStdPriceAtAcq: value, cbAcqBuildingStdBy164_5: false }
    : { cbBuildingStdPriceAtAcq: value };
}


// ── 일반건물(토지+건물 일괄) — 취득·양도 2시점 ─────────────────────────────

/**
 * 일반건물 배치 모달 시점 구성(취득·양도 2시점).
 *
 * 두 연도 축을 분리해 싣는다:
 *   `year`          건물기준시가 고시 체계 연도(구조·용도 코드표) = 이벤트 연도
 *   `landPriceYear` 위치지수용 개별공시지가 기준연도 = 5/31 공시 규칙(`landPriceYearOf`)
 *
 * 취득 공시지가 prefill은 두 사유로 비운다:
 *   ≤2000       모달 칸이 2001.1.1 기준(§164⑤ 위치지수 전용) — 취득당시 토지값 트랙과 다르다
 *   기준연도 상이 토지 취득일 기준으로 조회된 값이라 건물 시점에 쓸 수 없다(`sharesAcqLandPriceYear`)
 * 후자는 빈 칸만 남기면 값을 구할 경로가 없어 조회 필드로 열어 준다.
 */
export function buildGeneralBuildingBatchPoints(
  asset: Pick<
    AssetForm,
    "acquisitionDate" | "landAcquisitionDate" | "gbAcqLandPricePerSqm" | "gbTransferLandPricePerSqm"
  >,
  transferDate: string | undefined,
): StdPricePointSpec[] {
  const acqYear = commercialAcqYear(asset.acquisitionDate);
  const acqPre2001 = isAcq2001LocationIndexTrack(acqYear);
  const shared = sharesAcqLandPriceYear(asset);
  return [
    {
      key: "acquisition",
      label: "취득시",
      year: acqYear,
      landPriceYear: landPriceYearOf(asset.acquisitionDate),
      landPricePerM2: acqPre2001 || !shared ? "" : asset.gbAcqLandPricePerSqm,
      ...(!acqPre2001 && !shared
        ? { lookupLandPrice: true, landPriceHint: SEPARATE_LAND_ACQ_LANDPRICE_HINT }
        : {}),
    },
    {
      key: "transfer",
      label: "양도시",
      year: commercialAcqYear(transferDate),
      landPriceYear: landPriceYearOf(transferDate),
      landPricePerM2: asset.gbTransferLandPricePerSqm,
    },
  ];
}

/**
 * 건물1(원건물) 기준시가 계산기에 넘길 **연면적**.
 *
 * 🔑 **세액에 닿는 유일한 경로다.** `gbBuildingArea`는 엔진이 소비하지 않지만(payload
 * `buildingArea`로 실릴 뿐 미사용), 이 값은 계산기 → `gbAcqBuildingValue`/
 * `gbTransferBuildingValue` → §166⑥ 3-way 안분 분모로 흘러간다. 증축이 있는데 전체
 * 연면적을 쓰면 건물1 기준시가가 과대해지고 안분이 통째로 어긋난다(2026-08-12 사용자 지적).
 *
 * 3곳(2시점 일괄·취득시 단일·양도시 단일)이 같은 값을 써야 하므로 **함수 하나로 고정**한다 —
 * 인라인 `||`를 복제하면 한 곳만 고쳐질 때 조용히 갈린다(dual-truth).
 *
 * 미입력이면 `gbBuildingArea`로 fallback한다: legacy 자산에는 신설 필드가 없고, 여기서
 * 빈 값을 내보내면 모달이 연면적 0으로 계산하거나 입력 경로가 사라진다(dead-end 금지).
 */
export function gbBuildingStdPriceFloorArea(
  asset: Pick<AssetForm, "gbOriginalBuildingArea" | "gbBuildingArea">,
): string {
  return asset.gbOriginalBuildingArea || asset.gbBuildingArea;
}

/**
 * 일반건물 **증축분(건물2)** 배치 모달 시점 구성 — 증축시·양도시 2시점.
 *
 * 원건물(`buildGeneralBuildingBatchPoints`)과 축이 하나 다르다: 취득 시점이 **증축일**이다
 * (「소득세법 시행령」 제162조 제1항 제4호 — 건축물대장 사용승인일). 증축분은 그 시점에
 * 비로소 존재하므로 원건물 취득일로 계산하면 없는 건물의 기준시가를 산정하게 된다.
 *
 * 공시지가는 **위치지수 산정에만** 쓰이고 필지가 같으므로 원건물과 같은 값을 싣는다 —
 * 다만 취득 트랙 게이트(≤2000의 2001.1.1 기준 문제)는 증축일 연도로 다시 판정한다.
 */
export function buildGeneralBuildingExtensionBatchPoints(
  asset: Pick<AssetForm, "gbExtensionDate" | "gbTransferLandPricePerSqm">,
  transferDate: string | undefined,
): StdPricePointSpec[] {
  const extYear = commercialAcqYear(asset.gbExtensionDate);
  return [
    {
      key: "acquisition",
      label: "증축시",
      year: extYear,
      landPriceYear: landPriceYearOf(asset.gbExtensionDate),
      /* 증축일 당시 공시지가는 폼에 없다(원건물 취득일 기준 값뿐) — 조회로 연다.
         빈 칸만 남기면 위치지수를 구할 경로가 사라진다(dead-end 금지). */
      landPricePerM2: "",
      lookupLandPrice: true,
      landPriceHint: "증축 완료 시점의 개별공시지가 — 위치지수 산정용입니다.",
    },
    {
      key: "transfer",
      label: "양도시",
      year: commercialAcqYear(transferDate),
      landPriceYear: landPriceYearOf(transferDate),
      landPricePerM2: asset.gbTransferLandPricePerSqm,
    },
  ];
}

/**
 * 증축분 배치 적용 patch — 건물2 기준시가 2필드로 간다.
 *
 * ⚠️ 원건물 필드(`gbAcqBuildingValue`·`gbTransferBuildingValue`)를 건드리지 않는다.
 *    같은 모달 결과 형태를 쓰지만 **목적지가 다른 파트**다 — 섞이면 §166⑥ 안분 분모가
 *    통째로 어긋난다.
 * ⚠️ 공시지가도 되돌려쓰지 않는다. 증축시 공시지가는 원건물 취득시 축(`gbAcqLandPricePerSqm`)과
 *    시점이 다르고, 양도시 값은 원건물 쪽에서 이미 관리한다.
 */
export function buildGeneralBuildingExtensionBatchPatch(
  v: MultiPointStdPriceApply,
): Partial<AssetForm> {
  const patch: Partial<AssetForm> = {};
  if (v.acquisition?.housing != null)
    patch.gbAcquisitionExtensionBuildingStdPrice = String(v.acquisition.housing);
  if (v.transfer?.housing != null)
    patch.gbTransferExtensionBuildingStdPrice = String(v.transfer.housing);
  return patch;
}

/**
 * 일반건물 배치 적용 patch.
 *
 * 상가와 달리 **최초고시 시점이 없고**(§164⑥ 환산 경로가 아니다) §164⑤ 준용 확인 토글도 없다.
 * 공시지가 되돌려쓰기의 취득 트랙 규칙은 동일하다 — 취득 ≤2000의 모달 값은 2001.1.1 기준이라
 * 취득당시 토지값(`gbAcqLandPricePerSqm`)에 넣지 않는다. 토지·건물 취득일의 **기준연도가
 * 다를 때도** 마찬가지다(모달 값은 건물 취득일 연도 — 토지축 필드에 덮으면 오염).
 */
export function buildGeneralBuildingBatchPatch(
  v: MultiPointStdPriceApply,
  asset: Pick<AssetForm, "acquisitionDate" | "landAcquisitionDate">,
): Partial<AssetForm> {
  const patch: Partial<AssetForm> = {};
  // 건물 취득일이 따로 있으면 그것이 건물분 기준시가의 시점이다(§166⑥ 별개취득).
  // M-1a(2026-08-05): `acquisitionDate`가 **건물** 취득일이다 — 건물 기준시가 연도는 이 값 하나.
  const acqYear = commercialAcqYear(asset.acquisitionDate);

  if (v.acquisition?.housing != null) patch.gbAcqBuildingValue = String(v.acquisition.housing);
  if (v.transfer?.housing != null) patch.gbTransferBuildingValue = String(v.transfer.housing);

  if (v.landPrices?.transfer) patch.gbTransferLandPricePerSqm = v.landPrices.transfer;
  if (
    v.landPrices?.acquisition &&
    !isAcq2001LocationIndexTrack(acqYear) &&
    sharesAcqLandPriceYear(asset)
  )
    patch.gbAcqLandPricePerSqm = v.landPrices.acquisition;

  return patch;
}
