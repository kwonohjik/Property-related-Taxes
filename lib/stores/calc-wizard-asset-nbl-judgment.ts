/**
 * 비사업용 토지 — 정밀 판정 폼 슬라이스 (「소득세법」 §104의3 · 시행령 §168의6~§168의14)
 *
 * AssetForm이 extends. 800줄 정책으로 calc-wizard-asset.ts에서 분리(2026-08-04, Phase A-0).
 * NBL 서브 타입(NblBusinessUsePeriod 등)은 calc-wizard-asset-nbl.ts,
 * 기타토지(§168의11) 필드는 calc-wizard-asset-nbl-other.ts가 담당한다.
 * 필드 기본값·normalize는 calc-wizard-asset-factory.ts·calc-wizard-asset-nbl.ts.
 */
import type { NblBusinessUsePeriod, ResidenceHistoryInput, NblGracePeriodInput } from "./calc-wizard-asset-nbl";

export interface NblJudgmentFormSlice {
  // ── 비사업용 토지 정밀 판정 (assetKind === "land" 전용) ──
  /** 단순 체크박스 경로 — 상세 판정 없이 플래그만 전달 */
  isNonBusinessLand: boolean;
  /** true 시 엔진 자동 판정, isNonBusinessLand 체크박스 무시 */
  nblUseDetailedJudgment: boolean;

  // ── NBL 공통 ──
  /** 지목 (nblLandArea는 acquisitionArea 재사용 — area-taxonomy.md 원칙 B) */
  nblLandType: "" | "farmland" | "forest" | "pasture" | "housing_site" | "villa_land" | "other_land";
  nblZoneType: string;
  nblBusinessUsePeriods: NblBusinessUsePeriod[];

  // ── NBL 위치·거주 ──
  nblLandSigunguCode: string;
  nblLandSigunguName: string;
  nblResidenceHistories: ResidenceHistoryInput[];

  // ── NBL 무조건 면제 §168-14③ ──
  nblExemptInheritBefore2007: boolean;
  nblExemptInheritDate: string;
  nblExemptLongOwned20y: boolean;
  nblExemptAncestor8YearFarming: boolean;
  nblExemptPublicExpropriation: boolean;
  nblExemptPublicNoticeDate: string;
  nblExemptFactoryAdjacent: boolean;
  nblExemptJongjoongOwned: boolean;
  nblExemptJongjoongAcqDate: string;
  nblExemptUrbanFarmlandJongjoong: boolean;
  nblExemptInong: boolean;
  nblExemptInongDate: string;

  // ── NBL 양도일 의제 (§168조의14②) ──
  nblDeemedTransferReason: string; // none|auction|public_sale|kamco_consignment|newspaper_public_offering|republication
  nblDeemedTransferDate: string;

  // ── NBL 도시편입·수도권·공동상속 ──
  nblUrbanIncorporationDate: string;
  nblIsMetropolitanArea: "" | "yes" | "no" | "unknown";
  /** 소재지 행정구역 단위 — 법 §104의3①1호나목·3호가목 지역 열거(읍·면 제외) 판정용 */
  nblLandDivision: "" | "dong" | "eup_myeon";
  /*
   * `nblOwnershipRatio`는 2026-09-04에 **폼에서 제거**됐다. 공유 지분은 자산-수준
   * `ownershipNumerator`/`ownershipDenominator`(%) 단일 소스에서 파생한다
   * (`buildNonBusinessLandRaw`). 전송 페이로드(⑫ Zod)에는 파생값으로 남아 있다.
   */

  // ── NBL 농지 세부 ──
  nblFarmingSelf: boolean;
  /**
   * 조특령 §66⑭ 결격 과세기간 — 쉼표·공백 구분 연도 목록 (예: "2019, 2020").
   * 「소득세법 시행령」 §168의8② 후단이 자경기간 판정에 준용한다 (E2-09).
   */
  nblDisqualifiedTaxPeriods: string;
  nblFarmerResidenceDistance: string;
  nblFarmlandIsWeekendFarm: boolean;
  nblFarmlandIsConversionApproved: boolean;
  nblFarmlandIsFarmDevZone: boolean;
  nblFarmlandIsMarginalFarm: boolean;
  nblFarmlandIsReclaimedLand: boolean;
  nblFarmlandIsPublicProjectUse: boolean;
  nblFarmlandIsSickElderlyRental: boolean;

  // ── NBL 임야 세부 ──
  nblForestHasPlan: boolean;
  nblForestIsPublicInterest: boolean;
  nblForestIsProtected: boolean;
  nblForestIsSuccessor: boolean;
  nblForestInheritedWithin3Years: boolean;
  nblForestInheritanceDate: string;

  // ── NBL 목장 세부 ──
  nblPastureIsLivestockOperator: boolean;
  nblPastureLivestockType: string;
  /** 부대시설·초지·사료포 보유 — 별표1의3 항목별 인정 한도 (축사는 항상 포함) */
  nblPastureHasFacility: boolean;
  nblPastureHasGrassland: boolean;
  nblPastureHasFodder: boolean;
  nblPastureLivestockCount: string;
  nblPastureLivestockPeriods: NblBusinessUsePeriod[];
  nblPastureInheritanceDate: string;
  nblPastureIsSpecialOrgUse: boolean;

  // ── NBL 주택·별장·나대지 세부 ──
  nblHousingFootprint: string;
  nblVillaUsePeriods: NblBusinessUsePeriod[];
  nblVillaIsEupMyeon: boolean;
  nblVillaIsRuralHousing: boolean;
  nblVillaBuildingFloorArea: string;
  nblVillaAttachedLandArea: string;
  nblVillaCombinedStdValue: string;
  nblVillaIsInRestrictedArea: boolean;
  nblVillaIsAfter20150101: boolean;
  // nblOther*·nblRevenue* (기타토지 §168의11) 일체는 NblOtherFormSlice로 분리 (calc-wizard-asset-nbl-other.ts).

  // ── NBL 부득이한 사유 (§168의14①·§83의5①) ──
  nblGracePeriods: NblGracePeriodInput[];
  /** §83의5① 단서 — 부동산매매업 매매용부동산(1·2호 배제) */
  nblBusinessIsRealEstateDealer: boolean;
}
