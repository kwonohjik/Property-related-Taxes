/**
 * 양도세 감면 23개 조문 Phase 1 골격 — discriminated union stub 멤버
 *
 * 본 파일은 transfer.types.ts의 800줄 정책 준수를 위해 분리됨.
 * 23개 조문 중 신규 20개의 stub union 멤버를 정의 (자경/공익은 기존 멤버 유지).
 *
 * 본 단계는 stub — `type` 필드만 정의, 본 요건은 Phase 2~ 에서 추가.
 * 기존 long_term_rental/new_housing/unsold_housing 은 자동변환 마이그레이션
 * 완료 후 deprecated 처리 예정 (`lib/storage/migrations/`).
 *
 * 매핑: lib/tax-engine/transfer-reductions/types.ts TransferReductionId
 *      lib/tax-engine/transfer-reductions/metadata.ts REDUCTION_METADATA
 */

export type TransferReductionStub =
  // 장기임대 §97 시리즈 (rental_97_3 = 기존 long_term_rental 후속 — 정정된 ID)
  | { type: "rental_97_main";    _phase1Stub?: true }
  | { type: "rental_97_proviso"; _phase1Stub?: true }
  | { type: "rental_97_2";       _phase1Stub?: true }
  | { type: "rental_97_3";       rentalYears?: number; rentIncreaseRate?: number; _phase1Stub?: true }
  | { type: "rental_97_4";       _phase1Stub?: true }
  | { type: "rental_97_5";       _phase1Stub?: true }
  // 신축 §99 시리즈
  | { type: "new_99";            region?: "metropolitan" | "non_metropolitan"; _phase1Stub?: true }
  // §99의3 — Phase 2 본격 구현 (2026-05-06): 본 요건 필드 union 멤버
  | {
      type: "new_99_3";
      // Phase 1 stub 호환
      region?: "metropolitan" | "non_metropolitan";
      _phase1Stub?: true;
      // Phase 2 본 요건 필드 (lib/tax-engine/transfer-reductions/new-99-3.ts New993Input 일부)
      contractDate993?: string;
      usageApprovalDate993?: string;
      standardPriceAt5Years?: number;
      standardPriceAtAcquisition993?: number;
      standardPriceAtTransfer993?: number;
      region993?: "outside_speculation" | "speculation";
      acquisitionType993?: "from_builder" | "self_built";
      hasOccupancyAtContract?: boolean;
      isResident993?: boolean;
      isHousingConstructionBusiness993?: boolean;
      // Round 10 (2026-05-06): PHD 환산 입력
      phdMode993?: boolean;
      phdFirstDisclosureDate993?: string;
      phdFirstDisclosurePrice993?: number;
      phdLandAreaSqm993?: number;
      phdLandPricePerSqmAtAcq993?: number;
      phdLandPricePerSqmAtFirst993?: number;
      phdBuildingStdAtAcq993?: number;
      phdBuildingStdAtFirst993?: number;
    }
  | { type: "new_99_4_rural";    _phase1Stub?: true }
  | { type: "new_99_4_hometown"; _phase1Stub?: true }
  // 미분양 §98 시리즈 + §99의2
  | { type: "unsold_98";         _phase1Stub?: true }
  | { type: "unsold_98_2";       _phase1Stub?: true }
  | { type: "unsold_98_3";       region?: "metropolitan" | "non_metropolitan"; _phase1Stub?: true }
  | { type: "unsold_98_4";       _phase1Stub?: true }
  | { type: "unsold_98_5";       priceReductionRate?: number; _phase1Stub?: true }
  | { type: "unsold_98_6";       _phase1Stub?: true }
  | { type: "unsold_98_7";       _phase1Stub?: true }
  | { type: "unsold_98_8";       _phase1Stub?: true }
  | { type: "unsold_98_9";       _phase1Stub?: true }
  | { type: "unsold_99_2";       _phase1Stub?: true };
