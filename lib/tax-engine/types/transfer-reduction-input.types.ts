/**
 * 양도세 감면 입력 union — TransferReduction
 *
 * transfer.types.ts 800줄 정책 분리 (2026-06-11).
 * 외부 import 호환을 위해 transfer.types.ts에서 re-export 유지.
 */

import type { TransferReductionStub } from "./transfer-reductions-stub.types";

export type TransferReduction =
  | {
      type: "self_farming";
      /** 상속인 본인이 해당 농지를 직접 경작한 기간(년). */
      farmingYears: number;
      /**
       * 피상속인의 경작기간(년) — 선택.
       * 본인 자경기간이 조특법 §69 요건(8년)에 미달할 때 조특령 §66⑪ 1호에 따라 합산.
       * 본인 자경기간만으로 요건 충족 시 무시된다.
       */
      decedentFarmingYears?: number;
      /**
       * 주거·상업·공업지역 편입일 — 선택.
       * 2002.1.1 이후 편입인 경우 조특령 §66 ⑤⑥에 따라 부분감면 적용:
       *   - 편입일까지의 양도소득(기준시가 증가분 비율)만 감면 대상
       *   - 편입일부터 3년 내 양도해야 감면 적용 (경과 시 감면 상실)
       */
      incorporationDate?: Date;
      /** 편입 지역 유형 (표시·판정용) */
      incorporationZoneType?: "residential" | "commercial" | "industrial";
      /**
       * 편입일 당시 기준시가 (원, 총액 또는 ㎡당 단가).
       * `standardPriceAtAcquisition`·`standardPriceAtTransfer`(TransferTaxInput 기본)와 같은 단위여야 한다.
       */
      standardPriceAtIncorporation?: number;
    }
  | { type: "long_term_rental"; rentalYears: number; rentIncreaseRate: number }
  | { type: "new_housing"; region: "metropolitan" | "non_metropolitan" }
  | { type: "unsold_housing"; region: "metropolitan" | "non_metropolitan" }
  | {
      type: "public_expropriation";
      cashCompensation: number;
      bondCompensation: number;
      bondHoldingYears?: 3 | 5 | null;
      businessApprovalDate: Date;
    }
  // Phase 1 (2026-05-06): 23개 조문 인벤토리 stub union — 별도 파일 분리 (800줄 정책)
  | TransferReductionStub;
