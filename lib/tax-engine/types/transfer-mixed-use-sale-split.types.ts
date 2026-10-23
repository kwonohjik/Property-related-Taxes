/**
 * 겸용주택 일괄양도 — 양도가액 토지·건물 안분 기준(계약서 구분·감정가액) 입력·결과 타입.
 *
 * 계획서: `docs/00-pm/mixed-use-sale-split-basis.plan.md` §4.2 · §10
 * 1164줄 `transfer-mixed-use.types.ts`에 넣지 않고 분리한다(파트 취득 `transfer-mixed-use-part-acq.types.ts`와 같은 이유).
 */
import type { SaleSplitExemption, SaleSplitPair, DeemedUnclearDetail } from "../sale-split-deemed-unclear";
import type { AppraisalRejectReason } from "../sale-split-apportion-basis";

/**
 * `MixedUseAssetInput`이 확장하는 입력 필드. **값의 유무가 스위치다** — 전부 없으면 현행 기준시가 안분 경로를
 * 한 줄도 바꾸지 않는다(계획서 §4.1-2 · anchor SB-0).
 */
export interface MixedUseSaleSplitFields {
  /** 계약서에 구분 기재된 토지 양도가액(물건 전체). `buildingTransferPrice`와 짝이며 합은 총 양도가액이다. */
  landTransferPrice?: number;
  /** 계약서에 구분 기재된 건물 양도가액(물건 전체). */
  buildingTransferPrice?: number;
  /**
   * 양도시 토지 감정평가가액(물건 전체) — 「부가가치세법 시행령」 §64①1호 단서. 건물 값과 **양쪽 다** 있어야 basis가 된다.
   * 감정 시기 요건은 엔진이 판정하지 않는다(`sale-split-apportion-basis.ts` 헤더 Q-9 · 계획서 Q-5).
   */
  landAppraisalAtTransfer?: number;
  /** 양도시 건물 감정평가가액(물건 전체). */
  buildingAppraisalAtTransfer?: number;
  /**
   * 공유지분일 때만 — 계약서(물건 전체 100%) 구분 기재. 위 두 칸은 지분 몫으로 줄인 값이다.
   * §100③ 30% 판정은 이 금액으로 하고 결론만 지분에 적용한다(`sale-split-100-3-share-scale-judgment.plan.md` PR-3).
   */
  contractLandTransferPrice?: number;
  contractBuildingTransferPrice?: number;
  /** 「소득세법 시행령」 §166⑧ 예외 사유 — 계약서 구분 모드에서만 의미가 있다. */
  saleSplitExemption?: SaleSplitExemption;
  /**
   * 상가건물 감가상각비(「소득세법」 §97③) — 보유기간 중 사업소득 필요경비에 산입한 금액. 상가건물 취득가액에서 차감한다.
   * 미입력 = 0 = 종전과 동일.
   */
  commercialBuildingDepreciation?: number;
  /**
   * 건물에 직접 귀속되는 양도비(물건 전체 — 예: 매수자 요구 철거비). 「소득세법」 §100② 후단은 **공통되는** 양도비만 안분하므로
   * 이 값은 토지로 나누지 않는다. 주택건물:상가건물은 두 건물의 양도가액 비율로 나눈다.
   */
  buildingDirectTransferExpense?: number;
}

/** 양도시 기준시가 4파트 — 엔진의 기준시가 정의 그대로(주택분은 개별주택가격을 가목:나목 비례로 나눈 몫). */
export interface MixedTransferStd4 {
  housingLand: number;
  housingBuilding: number;
  commercialLand: number;
  commercialBuilding: number;
}

/** 4파트 금액. */
export type MixedPart4 = MixedTransferStd4;

/** 1차 안분에 실제로 쓴 basis. */
export type MixedSaleSplitBasis = "declared" | "appraisal";

/**
 * 결과 echo — 새 경로를 탔을 때만 존재한다(현행 경로·구 이력은 undefined). 표시 계층은 이 값을 그대로 읽는다(재계산 금지).
 */
export interface MixedUseSaleSplitEcho {
  basis: MixedSaleSplitBasis;
  /** 1차 토지·건물(물건 전체). */
  landBuilding: SaleSplitPair;
  /** 2차 후 4파트 양도가액. */
  parts: MixedPart4;
  /** 2차 비율의 근거가 된 양도시 기준시가 4파트. */
  transferStd: MixedTransferStd4;
  /** 계약서 구분 모드의 §100③ 판정(판정하지 않은 경우 undefined). */
  deemedUnclear?: MixedDeemedUnclear;
}

/** §100③ 판정 결과. `contract`는 공유지분일 때만 — 판정에 쓴 계약서(100%) 금액이다(위 `landBuilding`은 지분 몫). */
export interface MixedDeemedUnclear {
  deemed: boolean;
  detail: DeemedUnclearDetail;
  contract?: { declared: SaleSplitPair; apportioned: SaleSplitPair | null; ownershipRatio: number };
}

/**
 * leaf 결과 — 새 경로를 쓰지 않는 경우(`applies: false`)에도 **왜 안 썼는지**를 남긴다(침묵 후퇴 금지).
 * - `no_input`: 구분가액·감정가액 모두 없음(현행 `apportioned` 모드)
 * - `deemed_to_std`: 계약서 구분가액이 §100③으로 불분명 의제됐고 감정가액이 없어 기준시가 → 현행 경로(계획서 R-1)
 * - `appraisal_incomplete`: 감정가액이 한쪽만 있음 → 기준시가 → 현행 경로(정상 경로에서는 ⑧이 먼저 막는다)
 */
export type MixedSaleSplitResult =
  | { applies: true; echo: MixedUseSaleSplitEcho }
  | {
      applies: false;
      reason: "no_input" | "deemed_to_std" | "appraisal_incomplete";
      deemedUnclear?: MixedDeemedUnclear;
      appraisalRejected?: AppraisalRejectReason;
    };
