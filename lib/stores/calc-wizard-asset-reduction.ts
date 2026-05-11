/**
 * 자산별 감면 폼 타입.
 * Zod reductionSchema(lib/api/transfer-tax-schema.ts)와 1:1 대응.
 * 숫자 입력 필드는 string 타입(빈 문자열 = 미입력).
 * calc-wizard-asset.ts 800줄 정책에 따라 분리 (2026-05-11).
 */

export type AssetReductionForm =
  | {
      type: "self_farming";
      /** 본인 자경기간(년) */
      farmingYears: string;
      /** 피상속인 자경기간(년) — 상속 취득 + 본인 미달 시 합산 (조특령 §66⑪) */
      decedentFarmingYears?: string;
      /** 주거·상업·공업지역 편입 부분감면 적용 여부 (조특령 §66⑤⑥) */
      useSelfFarmingIncorporation?: boolean;
      /** 편입일 (YYYY-MM-DD) */
      selfFarmingIncorporationDate?: string;
      /** 편입 지역 유형 */
      selfFarmingIncorporationZone?: "residential" | "commercial" | "industrial" | "";
      /** 편입일 당시 기준시가 (원) */
      selfFarmingStandardPriceAtIncorporation?: string;
    }
  | {
      type: "long_term_rental";
      /** 임대기간(년) */
      rentalYears: string;
      /** 임대료 인상률(%) — 5% 이하 요건 */
      rentIncreaseRate: string;
    }
  | {
      type: "new_housing";
      /** 소재지 유형 — 감면율 결정 */
      reductionRegion: "metropolitan" | "non_metropolitan" | "outside_overconcentration";
    }
  | {
      type: "unsold_housing";
      /** 소재지 유형 */
      reductionRegion: "metropolitan" | "non_metropolitan" | "outside_overconcentration";
    }
  | {
      type: "public_expropriation";
      /** 현금 보상액 (원) */
      expropriationCash: string;
      /** 채권 보상액 (원) */
      expropriationBond: string;
      /** 채권 만기보유 특약 */
      expropriationBondHoldingYears: "none" | "3" | "5";
      /** 사업인정고시일 (YYYY-MM-DD) */
      expropriationApprovalDate: string;
    }
  // ── Phase 2 (2026-05-06): §99의3 신축주택 과세특례 본격 구현 ──
  // 설계: docs/02-design/features/transfer-reduction-99-3.engine.design.md
  | {
      type: "new_99_3";
      /** 분양계약일 (YYYY-MM-DD) — 1호 적용 시 시한 검증 + 고가주택 적용기준일 */
      contractDate993?: string;
      /** 사용승인일 (YYYY-MM-DD) — 2호 적용 시 시한 검증 */
      usageApprovalDate993?: string;
      /** 5년 시점 기준시가 (원) — 취득일+5년 인접 고시일 가격 */
      standardPriceAt5Years: string;
      /** 취득시 기준시가 (원) — PHD 환산 결과 또는 직접 입력 */
      standardPriceAtAcquisition993: string;
      /** 양도시 기준시가 (원) — 자산의 standardPriceAtTransfer와 별개로 §99의3 전용 입력 (필요 시) */
      standardPriceAtTransfer993?: string;
      /** 지역 — 가격 급등 지역 내/외 (서울·과천·5대 신도시) */
      region993: "outside_speculation" | "speculation";
      /** 취득 유형 — 1호(주건업 취득) | 2호(자기건설) */
      acquisitionType993: "from_builder" | "self_built";
      /** (1호만) 매매계약일 입주사실 있는 주택 — 적용 배제 */
      hasOccupancyAtContract?: boolean;
      /** 거주자 여부 — 비거주자는 §99의3 적용 배제 */
      isResident993: boolean;
      /** 본인이 주택건설사업자 — 적용 배제 */
      isHousingConstructionBusiness993: boolean;
      // ── Round 10 (2026-05-06): PHD 환산 입력 (취득시 추정 공동주택가격 자동 산출) ──
      // 신축주택은 준공 후 1~2년 후 공시되므로 취득시 공시가격이 대부분 없음 → §164⑤ 환산 필수.
      // PHD 모드 ON 시 standardPriceAtAcquisition993를 자동 산출.
      /** PHD 환산 모드 ON/OFF (기본: 자동 — acquisitionDate < firstDisclosureDate 시 ON) */
      phdMode993?: boolean;
      /** 최초공시일자 (YYYY-MM-DD) */
      phdFirstDisclosureDate993?: string;
      /** 최초공시 공동주택가격 (원) */
      phdFirstDisclosurePrice993?: string;
      /** 토지면적 (㎡, 소수 가능) */
      phdLandAreaSqm993?: string;
      /** 취득시 토지 공시지가 (원/㎡) */
      phdLandPricePerSqmAtAcq993?: string;
      /** 최초공시시 토지 공시지가 (원/㎡) */
      phdLandPricePerSqmAtFirst993?: string;
      /** 취득시 건물 기준시가 (원, 선택) */
      phdBuildingStdAtAcq993?: string;
      /** 최초공시시 건물 기준시가 (원, 선택) */
      phdBuildingStdAtFirst993?: string;
    };

export type ReductionType = AssetReductionForm["type"];

/** 인별 5년 합산 한도 산정용 과거 감면 이력 항목 */
export interface PriorReductionUsageItem {
  year: number;
  type: ReductionType;
  amount: number;
}
