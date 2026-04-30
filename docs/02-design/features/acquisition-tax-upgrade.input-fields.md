# 취득세 업그레이드 — 신규/변경 입력 필드 요약 (Input Fields)

**상위 문서**: [`acquisition-tax-upgrade.design.md`](./acquisition-tax-upgrade.design.md) · [`acquisition-tax-upgrade.phases.md`](./acquisition-tax-upgrade.phases.md)
**작성일**: 2026-04-30 (v5 — 800줄 정책 분리)

본 문서는 v3·v4 검토에서 추가된 신규 입력 필드 ~60개의 TypeScript 타입 정의를 모아둔 참조 문서입니다. 엔진 시니어가 명세하면 UI 시니어가 다음 7개 동기화 지점에 반영:

① FormState · ② INITIAL_FORM · ③ normalize fallback · ④ API 변환 · ⑤ UI 위젯 · ⑥ 사이드바 (해당 시) · ⑦ 결과 카드

---

## AcquisitionTaxInput 확장 명세

```ts
interface AcquisitionTaxInput {
  // ... 기존 필드 ...

  // [P1] 다주택·중과 정밀화
  /** 정비구역(재개발·재건축·소규모정비) 소재 여부 — 1억/2억 이하 중과 배제 시 제외 */
  isUrbanRegenerationArea?: boolean;
  /** 일시적 2주택 여부 (종전 주택 처분 예정) */
  isTemporaryTwoHouse?: boolean;
  /** 종전 주택 잔금/등기일 (일시적 2주택 처분기한 계산) */
  previousHouseAcquisitionDate?: string;
  /** 종전 주택 소재 지역 (조정/비조정) */
  previousHouseRegion?: "regulated" | "non_regulated";
  /** 신규 주택 소재 지역 (조정/비조정) */
  newHouseRegion?: "regulated" | "non_regulated";
  /** 전체 주택 시가표준액 (지분/부속토지 취득 시 1억/2억 이하 판정 기준) */
  wholeHouseStandardValue?: number;
  /** [v3] 수도권 여부 (시행령 §28의2 1호 — 1억/2억 한도 결정) */
  isMetropolitanRegion?: boolean;

  // [P1 v3·v4] 부담부증여·무상취득 관계
  /** 증여자 관계 — burdened_gift 시 spouse_or_lineal이면 무상 처리 */
  giftRelation?: "spouse_or_lineal" | "other";
  /** [v4 M4] 무상취득 단서 — 수증자 관점에서 본 증여자 신분 (시행령 §28의6② 1호, 사실혼 모두 제외) */
  giftorRelation?:
    | "spouse"                   // 가목: 증여자가 수증자의 배우자
    | "lineal_ascendant"         // 나목 1: 직계존속 (부모·조부모)
    | "lineal_ascendant_spouse"  // 나목 2: 직계존속의 배우자 (계부·계모)
    | "lineal_descendant"        // 다목 1: 직계비속 (자녀·손자녀)
    | "lineal_descendant_step"   // 다목 2: 의붓자녀 (혼인 중 배우자의 직계비속)
    | "other";
  /** [v3] 증여자가 무상취득 직전 1세대 1주택자인지 (무상취득 단서 적용 필수) */
  giftorIs1HHHolder?: boolean;

  // [P1 v3] 조정대상지역 지정 전 계약 보호 (§13의2④)
  /** 매매·분양계약일이 조정대상지역 지정고시일 이전인지 */
  contractDateBeforeRegulation?: boolean;
  /** 조정대상지역 지정고시일 */
  regulationDesignationDate?: string;
  /** 계약금 지급 증빙 보유 여부 */
  hasContractDepositProof?: boolean;

  // [P1 v3] 사치성 + 대도시 법인 중복 (§13⑦)
  /** 대도시 법인 중과 적용 컨텍스트 (§13②) */
  isCorpMetroSurcharge?: boolean;

  // [P2] 법인·공장 중과
  /** 과밀억제권역 소재 (수도권정비계획법 §6) */
  isMetropolitanCongestion?: boolean;
  /** 본점·주사무소 신증축 용도 */
  isHeadquarterNewBuild?: boolean;
  /** 비도시형 공장 신증설 */
  isNonUrbanFactory?: boolean;
  /** 비도시형 공장 — 토지·건물 분리 (G22) */
  factoryComponent?: "land" | "building" | "combined";
  /** 법인 설립/전입 후 5년 이내 */
  isWithin5YearsOfEstablishment?: boolean;
  /** 중과제외업종 (지법 §13②단서) */
  excludedBusinessType?: "infrastructure" | "bank" | "overseas_construction" | "housing_construction" | "telecom" | "high_tech" | "distribution" | "transport" | "gov_funded";
  /** 휴면법인 인수 여부 */
  isDormantCorpAcquisition?: boolean;

  // [P2] 세율특례 §15
  /** 세율특례 적용 사유 */
  specialRateType?:
    | "redemption" | "inheritance_one_house" | "corp_merger"
    | "co_ownership_split" | "building_relocation" | "divorce_division"
    | "hoyu_division" | "timber" | "leasing";
  /** 1가구 1주택 (상속 특례 적용) */
  isOneHouseHousehold?: boolean;
  /** 자경농지 (상속 특례 적용) */
  isSelfCultivatedFarmlandInheritance?: boolean;

  // [P2] 자경농지 50% 감면 (지특법 §6)
  /** 2년 이상 영농 종사자 */
  isSelfCultivatedFarmer?: boolean;
  /** 영농 종사 연수 */
  farmingYears?: number;
  /** 농지 소재지로부터 거주지까지 거리 (km) */
  farmlandLocationDistance?: number;

  // [P3] 주택 수 정교화
  /** 보유 주택 (시가표준액·종류·소재지·한시특례·지분·공동소유자 배열) */
  ownedHouses?: OwnedHouseInfo[];  // v4: ownershipShare, coOwnersAllInHousehold 포함
  /** 조합원입주권 수 */
  redevelopmentRights?: number;
  /** 주택분양권 수 */
  housingSubscriptionRights?: number;
  /** 주거형 오피스텔 수 (시가표준액 1억 초과만 카운트) */
  residentialOffices?: number;
  /** 신탁재산 위탁자로서 보유 주택 수 */
  trustedHouseCount?: number;

  // [P3 v4 D3] 공유지분
  /** 취득 주택의 지분율 (단독은 1.0, 부부 공동은 0.5 등) */
  acquisitionOwnershipShare?: number;
  /** 공동소유자 모두 동일 1세대인지 (1세대 내 공유 → 1주택 카운트) */
  coOwnersAllInHousehold?: boolean;

  // [P3 v4 D4] 공동상속
  /** 상속 주택 정보 배열 (5년 미경과 제외 + 주된 상속자 판정) */
  inheritedHouses?: Array<{
    inheritanceDate: string;          // 상속개시일
    shareInInheritance: number;       // 본인 상속 지분
    maxShareInInheritors: number;     // 최대 지분 (다른 상속인 비교)
    tieInMaxShare: boolean;           // 동순위 여부
    isResident: boolean;              // 거주자 여부 (동순위 시 우선)
    isOldest: boolean;                // 최연장자 여부 (거주자 동순위 시)
  }>;

  // [P3 v4 D5] 입주권·분양권 권리취득일 소급
  /** 분양권·입주권으로 주택을 취득하는지 (취득일 소급 산정) */
  acquiredViaRight?: boolean;
  /** 권리 취득일 (분양사업자 분양권: 분양계약일) — 주택 수 산정 기준일 */
  rightAcquisitionDate?: string;

  // [P3 v3] 한시 특례 (2024.1.10~2027.12.31)
  /** 취득 주택이 한시 특례 60㎡·3억(수도권 6억) 이하 신축인지 (시행령 §28의4② 1호) */
  isHansiBenefitNewBuild?: boolean;
  /** 취득 주택이 한시 특례 유상승계 + 임대등록인지 (§28의4② 2호) */
  isHansiBenefitLeaseRegistered?: boolean;
  /** 취득 주택이 한시 특례 미분양 아파트 (수도권 외 85㎡·6억 이하)인지 (§28의4② 3호) */
  isHansiBenefitUnsoldApt?: boolean;
  /** 다가구주택 호별 전용면적 구분 기재 여부 (60㎡ 한도 판정용) */
  isMultiHouseholdWithUnitArea?: boolean;

  // [P3 v3] 세대 별도 인정 (시행령 §28의3②)
  /** 30세 미만 자녀 소득 ≥ 기준중위소득 40% + 독립 생계 */
  separateHouseholdReason?: "under30_income" | "over65_cohabitation" | "overseas_90days" | "relocate_60days" | null;

  // [P4] 농특세 + 생애최초 소형주택
  /** 수도권 외 도시지역 외 읍·면 지역 — 농특세 100㎡ 한도 적용 */
  isRuralRegion?: boolean;
  /** 소형주택 (생애최초 한도 300만원) */
  isSmallHouseFirstHome?: boolean;
}
```

## FormState 매핑 (UI 측)

`components/calc/acquisition/shared.ts` 의 `FormState`는 위 `AcquisitionTaxInput`의 모든 optional 필드를 string·boolean·배열로 매핑하여 폼 상태로 보관 (numeric은 string으로 보관 후 API 변환 시 `parseAmount`/`parseDecimal`로 정규화).

상세 매핑 규칙은 P5-UI Phase 작업 항목 참조: [`acquisition-tax-upgrade.phases.md`](./acquisition-tax-upgrade.phases.md) §1 Phase 5-UI.
