/**
 * 겸용주택 **별개 취득** — 파트별 취득가액 산정방식·취득가액 (B1) 타입. 타입 전용.
 *
 * 설계: `docs/02-design/features/mixed-use-separate-acq-per-part.engine.design.md`
 * 판정·분할 로직은 `lib/tax-engine/mixed-use-part-acq.ts`(leaf)에 있다 — 이 파일에는 로직이 없다.
 *
 * `types/transfer-mixed-use.types.ts`는 이미 1031줄이라 신규 타입은 여기 둔다.
 */
import type { PartAcqMode } from "@/lib/calc/transfer-tax-split-acq-mode";

/**
 * 파트별 취득 입력. **존재 = 파트 모델 / 부재 = 총액 모델**(구 이력 무영향 — 기본값 뒤집기 금지).
 *
 * 값 필드는 **모드가 쓰는 것만 읽는다**(쓰지 않는 값은 무시 — ④는 활성 모드 값만 싣는다):
 *
 * | 모드 | 값 필드 |
 * |---|---|
 * | actual · appraisal | `landAcquisitionPrice` / `buildingAcquisitionPrice` (감정은 실가와 필드 공용 — 단건 주택 split 규약) |
 * | salesCase | `landSalesCaseValue` / `buildingSalesCaseValue` |
 * | estimated | 없음 — 현행 환산값(양쪽 환산일 때와 같은 값)을 쓴다 |
 *
 * 절대금액 5종은 **본인 지분 금액**이다(④가 `share()`로 스케일). 기준시가·면적은 100% 값.
 */
export interface MixedSeparateAcquisition {
  landMode: PartAcqMode;
  buildingMode: PartAcqMode;
  landAcquisitionPrice?: number;
  landSalesCaseValue?: number;
  buildingAcquisitionPrice?: number;
  buildingSalesCaseValue?: number;
  /**
   * S-2 — 건물 파트가 **실거래가**일 때 주택건물분 계약액(도급계약서·세금계산서). 상가건물 = 총액 − 이 값(도출).
   * 0·미입력 = 계약액 없음(건물 취득일 나목 비율로 나눈다). 건물 모드가 actual이 아니면 입력 불가(X-6).
   */
  housingBuildingContractPrice?: number;
}

/**
 * `mixedPartAcqNeeds`의 반환 — **무엇이 쓰이는가**(= 무엇이 필수인가). UI ⑤ 노출·⑧ 필수·⑫·엔진이 같은 값을 본다.
 * 파트 모델이 아닐 때(총액 모델)는 이 객체 자체가 없고 기존 술어가 그대로 동작한다.
 */
export interface MixedPartAcqNeeds {
  /** 취득시 개별주택가격 H_A — 비-실가 파트의 환산·개산공제 basis(γ1) 또는 취득시 경비 안분에 쓰인다. */
  housingPriceAtAcq: boolean;
  /** 건물 취득일 기준 ㎡당 공시지가 L_b — H_A와 같은 소비처(γ1 분모의 가목). */
  landPricePerSqmAtBuildingDay: boolean;
  /** 취득시 주택건물 기준시가 N(나목) — γ1 basis 또는 S-2 나목 비율(계약액이 없을 때). */
  housingBuildingStdAtAcq: boolean;
  /** 취득시 상가건물 기준시가·개별공시지가 — 상가 환산·개산공제 basis·S-2 상가건물 몫·취득시 경비 안분. */
  commercialStdAtAcq: boolean;
}

export type MixedPartKey = "housingLand" | "housingBuilding" | "commercialLand" | "commercialBuilding";

/** 4부분 각각의 결과 echo — 결과 카드·신고서는 이것을 읽고 값을 재도출하지 않는다. */
export interface MixedPartAcqPartEcho {
  mode: PartAcqMode;
  /** 최종 차감되는 취득가액(단서 `direct` 채택 시 0). */
  acquisitionPrice: number;
  /** 개산공제(취득시 기준시가 × 3%, 미등기 3/1000)가 이 파트에 적용됐는가. 실가·단서 채택 파트는 false. */
  deemedDeduction: boolean;
  /** 개산공제 basis(= 취득시 기준시가 — 주택은 γ1 비례값). 비-실가 파트만. */
  basis?: number;
}

export interface MixedUseSeparateAcquisitionEcho {
  landMode: PartAcqMode;
  buildingMode: PartAcqMode;
  parts: Record<MixedPartKey, MixedPartAcqPartEcho>;
  /** S-1 — 토지 파트(비-환산)를 주택부수토지:상가부수토지로 나눈 근거. 면적비(같은 필지 = 같은 단가). */
  landSplit?: { basis: "area_ratio"; housingArea: number; commercialArea: number };
  /** S-2 — 건물 파트(비-환산)를 주택건물:상가건물로 나눈 근거. */
  buildingSplit?: {
    kind: "contract" | "std_ratio";
    /** `std_ratio` — 나목(주택건물 기준시가)·상가건물 기준시가 */
    housingStd?: number;
    commercialStd?: number;
    /** `contract` — 주택건물 계약액 */
    contract?: number;
  };
  /** §97②2호 단서 판정 묶음(환산 파트). 환산 파트가 없거나 경비 선언이 없으면 없다. */
  provisoGroup?: {
    parts: ("land" | "building")[];
    estimatedSide: number;
    directSide: number;
    chosen: "estimated" | "direct";
  };
}
