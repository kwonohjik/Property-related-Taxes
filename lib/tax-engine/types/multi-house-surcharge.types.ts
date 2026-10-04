/**
 * 다주택 중과세 엔진 공개 타입 정의
 *
 * 엔진 본체(`../multi-house-surcharge.ts`)와 분리하여 타입 의존 그래프를 얕게 유지한다.
 * transfer.types.ts 등 다수 파일이 이 타입들을 재수출해 사용하므로 동일 패턴.
 *
 * 소득세법 §104 (세율), §152 (1세대 범위),
 * 소령 §167-3 (주택 수 산정), §167-10 (2주택 중과 배제) 기반.
 */

import type { AptTransferDeadlineExtension } from "../rental-article/rules";

// ============================================================
// 타입 정의
// ============================================================

/**
 * 장기임대주택 유형 (소령 §167-3 ① 2호 가목~자목)
 * A: 민간매입임대 5년 (가목)
 * B: 기존사업자 매입임대 — 2003.10.29 이전 등록 (나목)
 * C: 민간건설임대 5년 (다목)
 * D: 미분양 매입임대 (라목)
 * E: 장기일반 매입임대 10년 (마목)
 * F: 장기일반 건설임대 10년 (바목)
 * G: 자진·자동 말소 후 양도 (사목)
 * H: 단기 매입임대 6년 — 2025.6.4 이후 신설 (아목)
 * I: 단기 건설임대 6년 — 2025.6.4 이후 신설 (자목)
 */
export type RentalHousingType = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I";

/** 세대 구성원이 보유한 주택 1채 정보 */
/** 합가 전 보유 쪽 — 양도자(본인) 쪽 · 합친 상대(배우자 또는 동거봉양 가족) 쪽. */
export type MergeOrigin = "seller_side" | "counterpart_side";

export interface HouseInfo {
  /** 내부 식별자 */
  id: string;
  /** 취득일 */
  acquisitionDate: Date;
  /** 공시가격 (원) — 취득 시 기준 */
  officialPrice: number;
  /**
   * 양도 시 공시가격 (원).
   * VALUE 지역(지방) 가액기준 판정에 사용.
   * 미제공 시 officialPrice로 폴백.
   */
  transferOfficialPrice?: number;
  /** 취득 당시 공시가격 (원) — 임대 요건 판정용 */
  acquisitionOfficialPrice?: number;
  /** 임대개시일 당시 공시가격 (원) — 장기임대 가액기준 판정용 */
  rentalStartOfficialPrice?: number;
  /** 수도권/비수도권 구분 — legacy 필드, regionCriteria 미제공 시 폴백 */
  region: "capital" | "non_capital";
  /**
   * 지역기준/가액기준 구분 (소령 §167-3 Stage 2)
   * - "REGION": 수도권·광역시·세종시 → 공시가격 무관 무조건 주택 수 산입
   * - "VALUE": 지방 → 양도 시 공시가격 3억 초과만 산입
   * - 미제공: region 필드로 폴백 (capital → REGION, non_capital → VALUE)
   */
  regionCriteria?: "REGION" | "VALUE";
  /** 수도권 여부 — 장기임대 가액기준 (수도권 6억/비수도권 3억) 판정용 */
  isCapitalArea?: boolean;
  /** 시군구 코드 — 조정대상지역 시점 조회 및 ⑪ 공고일 이전 계약 배제 판정용 */
  regionCode?: string;
  /** 상속주택 여부 */
  isInherited: boolean;
  /** 상속개시일 (isInherited === true 시 필수) */
  inheritedDate?: Date;
  /**
   * 공동상속주택(여럿이 지분으로 공동소유하는 1주택) 여부 — 소득세법 시행령 §155③ (2-A2).
   * isInherited === true 인 주택에서만 의미(UI가 isInherited ON 시에만 노출).
   */
  isCoInherited?: boolean;
  /**
   * 공동상속주택 중 상속지분이 최대인 상속인인지 — §155③ 단서.
   * true = 산입(주택수 포함, 제외 대상 아님) / false·미제공 = 소수지분(제외 후보).
   * ⚠️ 자기선언 boolean — 엔진은 다른 공동상속인의 지분을 알 수 없음.
   */
  isLargestCoInheritedShareholder?: boolean;
  /**
   * 상속개시 당시 피상속인과 동일세대였는지 — 소득세법 시행령 §155② 단서.
   * true = 동일세대 → 상속주택 특례(주택수 제외) 원칙 배제(parentalCareMergeInheritedHouse로만 예외 허용).
   * false·미제공 = 별도세대 → 특례 적용(제외). §155③ 공동상속에도 준용.
   */
  decedentSameHouseholdAtInheritance?: boolean;
  /**
   * 동거봉양 합가로 2주택이 되었고 "합치기 이전부터 피상속인이 보유"하던 주택인지 — §155② 단서 예외.
   * decedentSameHouseholdAtInheritance === true(동일세대)일 때만 의미. true면 동일세대라도 특례 적용(제외).
   */
  parentalCareMergeInheritedHouse?: boolean;
  /**
   * 피상속인이 상속개시 당시 2 이상 주택을 소유했고, 이 주택이 §155②1~4호 순위상 상속주택(1주택)이
   * 아닌지 — 순위 부적격. true = 특례 부적격(제외 안 함) / false·미제공 = 적격(또는 피상속인 단일주택).
   * ⚠️ 자기선언 boolean — 엔진은 피상속인 전체 포트폴리오(다른 상속인 상속분 포함)를 알 수 없음.
   */
  isRankingDisqualifiedInheritedHouse?: boolean;
  // ── 장기임대 관련 ──
  /** 장기임대사업자 등록주택 여부 (true + rentalType 없으면 legacy 판정) */
  isLongTermRental: boolean;
  /**
   * 장기임대주택 유형 (가목~자목).
   * 제공 시 유형별 세부 요건 검증, 미제공 시 isLongTermRental boolean으로 폴백.
   */
  rentalType?: RentalHousingType;
  /** 임대사업자 등록일 */
  rentalRegistrationDate?: Date;
  /** 사업자 등록일 */
  businessRegistrationDate?: Date;
  /** 임대사업자 말소일 (말소 시 중과 산정에 포함됨) */
  rentalCancelledDate?: Date;
  /** 임대사업자 자진·자동 말소일 (사목 G형 판정용) */
  rentalCancellationDate?: Date;
  /** 임대 시작일 */
  rentalStartDate?: Date;
  /** 임대 종료일 */
  rentalEndDate?: Date;
  /** 임대기간(년) — 직접 입력 가능, 없으면 startDate~endDate로 계산 */
  rentalPeriodYears?: number;
  /** 임대료 증가율 5% 이하 충족 여부 */
  rentIncreaseUnder5Pct?: boolean;
  /**
   * 5%를 넘게 올린 임대차계약의 체결·갱신일(여럿이면 가장 늦은 날) — 5% 미충족 선언일 때만 의미가 있다.
   * 2019-02-12 전이면 가·다·마·바목 5% 요건이 걸리지 않는다(대통령령 제29523호 부칙 제6조 · `isRentCapContractSubject`).
   */
  rentIncreaseContractDate?: Date;
  /** 임대사업자 정식 등록 여부 */
  isRegisteredRental?: boolean;
  /** 국민주택규모(85㎡ 이하, 수도권·도시지역 60㎡ 이하) 여부 */
  isNationalSizeHousing?: boolean;
  /** 전용면적(㎡) */
  exclusiveArea?: number;
  /**
   * #2a §167의3⑨ 혼인 차감용 — "양도자의 배우자 단독 보유" 주택 여부.
   * 규약: 양도 주택(sellingHouseId)=양도자 소유(false 전제). 3주택↑ + marriageMerge 발동 시
   * 양도일 현재 배우자 보유 주택 수를 차감(§167의3⑨). 미제공(기본 false)=본인 소유로 간주(차감 대상 아님).
   */
  isSpouseOwned?: boolean;
  /**
   * §155④⑤ 합가 의제 — 이 주택을 **합가(혼인) 전에** 누가 보유했나(판정 메뉴 명부 입력).
   *
   * 양도 주택은 늘 양도자 쪽이라 묻지 않는다. 합가일보다 나중에 취득한 행은 이 값과 무관하게
   * 「합가 후 취득」이다(`classifyMergeHouse` — 날짜가 먼저). 미제공이면 구성을 판정하지 않는다.
   * §167의3⑨ `isSpouseOwned`(중과 축, 양도일 현재 배우자 보유)와는 **다른 사실**이다.
   */
  mergeOrigin?: MergeOrigin;
  /** 대지면적(㎡) — 건설임대 규모 요건 판정용 (298㎡ 이하) */
  landArea?: number;
  /** 연면적(㎡) — 건설임대 규모 요건 판정용 (149㎡ 이하) */
  totalFloorArea?: number;
  /** 같은 시·군 내 2호 이상 보유 여부 (나목·다목·바목 등) */
  hasMinimum2Units?: boolean;
  /** 같은 시·군 내 5호 이상 보유 여부 (라목) */
  hasMinimum5UnitsInCity?: boolean;
  /** 최초 분양계약일 (라목 판정용) */
  firstSaleContractDate?: Date;
  /** 분양전환 여부 (다목·바목) */
  isConvertedToSale?: boolean;
  /** 임대의무기간 1/2 이상 충족 여부 (사목 G형) */
  hasHalfDutyPeriodMet?: boolean;
  /** 말소일 이후 1년 이내 양도 여부 (사목 G형) */
  isSoldWithin1YearOfCancellation?: boolean;
  /**
   * 사목(G형) base 목 (가·다·라·마) — §167조의3①2호 사목 "해당 목의 다른 요건" 검증 대상.
   * 사목은 base 목의 기준시가·면적·호수·5%룰 등을 모두 갖춰야 하며 임대기간요건만 면제된다.
   */
  saMokBaseArticle?: "가" | "다" | "라" | "마";
  /** 2018.9.14 이후 조정지역 취득·다주택 제외 해당 여부 (마목·아목) */
  isExcluded918Rule?: boolean;
  /** 2020.7.11 이후 등록 아파트 제외 해당 여부 (마목·라목) */
  isExcludedAfter20200711Apt?: boolean;
  /** 단기→장기 변경신고 제외 해당 여부 (마목·바목) */
  isExcludedShortToLongChange?: boolean;
  /**
   * 조특법 감면 대상 장기임대주택 (③).
   * 조세특례제한법 §97 등 — 국민주택규모 5년 이상 임대.
   */
  isTaxIncentiveRental?: boolean;
  /**
   * §167조의3①3호 후단(대통령령 제36737호, 2026.9.30. 공포·2026.10.1. 시행) — ③ 감면대상장기임대주택이
   * 「민간매입임대주택」(매입)인지. 건설임대(false)는 후단 게이트 대상이 아니다.
   * 미제공(undefined)은 "모른다" — 후단 대상으로 보고 ⑪ 기한을 적용한다(후단은 3호를 「한정」할 뿐이라 불리 방향 ·
   * 사용자 결정 2026-10-04). 결론이 갈리면 확인 필요 고지.
   */
  isTaxIncentiveRentalPurchase?: boolean;
  /**
   * ③ 감면대상장기임대주택의 등록 유형 — 종전 「민간임대주택에 관한 특별법」§2 5호(장기일반) vs
   * 6호(단기). 후단 게이트는 이 둘만 겨냥한다("other"=그 외 유형 → 게이트 대상 아님).
   * 미제공은 "모른다".
   */
  taxIncentiveRentalRegistrationType?: "long_term_general" | "short_term" | "other";
  /**
   * ③ 감면대상장기임대주택 아파트가 「주택법」상 도시형 생활주택인 아파트인지 — 후단이 명시
   * 제외한다(도시형 생활주택인 아파트는 게이트 대상 아님). 미제공은 "모른다".
   */
  isUrbanLifeHousingApartment?: boolean;
  /**
   * §167조의3⑪ 기한 연장 세 호(등록말소일·조정대상지역 신규지정 공고일·이전고시일) — ③ 전용.
   * 2호 가·나·라·마목(`rental-article/rules.ts` `AptTransferDeadlineExtension`)과 같은 모양을 재사용.
   */
  taxIncentiveRentalAptDeadlineExtension?: AptTransferDeadlineExtension;
  /**
   * §167조의3⑪ 기한 연장 사실 — ② 장기임대주택 가목2)·나목2)·라목8)·마목4) 아파트 전용.
   * 미제공 = 「모름」(기한 = 바닥 · 바닥 초과면 확인 필요 고지 · `isAptTransferDeadlinePending`).
   */
  rentalAptDeadlineExtension?: AptTransferDeadlineExtension;
  // ── 아파트/오피스텔 ──
  /** 아파트 여부 */
  isApartment: boolean;
  /** 주거용 오피스텔 여부 — 사실상 주거용이면 취득일과 무관하게 주택 수에 산입(F-11) */
  isOfficetel: boolean;
  /**
   * 조특법 감면 미분양·신축주택(§98의2·98의3·98의5~98의8·99·99의2·99의3) — 소령 §167의3①5호.
   * 주택 수에는 **산입**하고 중과 대상에서만 뺀다(양도 주택 자신 · 10호 「유일한 일반주택」 판정). F-11.
   * (필드명은 저장 기록 호환을 위해 유지한다.)
   */
  isUnsoldHousing: boolean;
  // ── 소형 신축/미분양 (⑬) ──
  /**
   * 취득가액(원) — 소형 신축주택 가액기준 판정용.
   * 수도권 6억/비수도권 3억 이하
   */
  acquisitionPrice?: number;
  /** 비수도권 준공 후 미분양 해당 여부 (소형 신축 특례 ⑬) */
  isUnsoldNewHouse?: boolean;
  /** 준공일 — 가목 소형신축 3호(2024.1.10~2027.12.31 준공) 검증용. 미제공 시 가목 미발동(보수적) */
  completionDate?: Date;
  // ── 계약·법적 취득 ──
  /**
   * **양도** 매매계약 체결일 — 이 주택을 **팔기 위한** 계약(취득 계약이 아니다).
   * ⑪ 「조정대상지역의 공고가 있은 날 이전에 해당 지역의 주택을 양도하기 위하여 매매계약을 체결하고
   * 계약금을 지급받은」(영 §167의3①11호 · §167의4③5호 · §167의10①11호 · §167의11①10호) 판정용.
   * 양도 주택 행에만 실린다(`buildHousesPayload`).
   */
  contractDate?: Date;
  /**
   * ⑪ 위 양도 매매계약의 **계약금을 지급받은** 사실이 증빙서류로 확인되는가.
   *
   * 🔑 아래 `hasContractDepositProof`와 **다른 사실**이다(계획서 regulated-area-region-code-match D-3) —
   *    그쪽은 장기임대 아목 4)·마목 1)의 「(취득하기 위해) 계약금을 **지급한**」 취득 측 사실이다.
   *    11호는 종전에 그 필드를 읽어, 임대 선언 칸이 양도 측 요건까지 충족시키는 구조였다.
   */
  saleDepositReceived?: boolean;
  /** 장기임대 아목 4) 단서 · 마목 1) 괄호 — 취득 계약금 **지급** 증빙(⑪과 무관 — 위 `saleDepositReceived`) */
  hasContractDepositProof?: boolean;
  /**
   * 저당권 실행·채권변제로 취득한 주택 여부.
   * ⑧ 취득일로부터 3년 이내 → 3주택+ 중과배제.
   */
  isMortgageExecution?: boolean;
  // ── 특수 용도 주택 ──
  /** 사원용 주택 여부 (④ 10년 이상 무상 제공 → 3주택+ 중과배제) */
  isEmployeeHousing?: boolean;
  /** 무상 제공 기간(년) */
  freeProvisionYears?: number;
  /** 조특법상 특례 적용 주택 여부 (⑤) */
  isTaxSpecialExemption?: boolean;
  /** 국가유산(문화재) 주택 여부 (⑥) */
  isCulturalHeritage?: boolean;
  /** 어린이집으로 운영 중인 주택 여부 (⑨ 5년 이상 운영 → 3주택+ 중과배제) */
  isDayCareCenter?: boolean;
  /** 어린이집 운영 기간(년) */
  dayCareOperationYears?: number;
  // ── ⑭ 인구감소지역 세컨드홈 ──
  /**
   * 인구감소지역 소재 주택 여부 (소령 §167-3 ① 2호의2).
   * isSecondHomeRegistered === true 와 함께 주택 수 산정 배제.
   */
  isPopulationDeclineArea?: boolean;
  /** 세컨드홈 특례 등록 여부 (인구감소지역 1주택 특례 신청) */
  isSecondHomeRegistered?: boolean;
  /**
   * 인구감소지역 유형 (소령 §167의3①12 다·라목, 2026.1.1~).
   * "decline" 다목(인구감소지역, 수도권 밖 9억), "interest" 라목(인구감소관심지역, 4억).
   * 미제공 시 4억 한도(보수적).
   */
  populationAreaType?: "decline" | "interest";
  // ── 2주택 배제 관련 ──
  /**
   * 취학·근무상 형편·질병 요양 등 부득이한 사유로 취득한 주택 여부.
   * 소령 §167의10①3호: 2주택 중과배제. 기준시가는 **취득 당시**(acquisitionOfficialPrice).
   * 해당 주택에서 1년 이상 거주 + 3년 내 해소 시 매도 주택 중과 배제.
   */
  isUnavoidableReason?: boolean;
  /** 부득이한 사유 주택 거주 기간(년) — 1년 이상 요건 충족 여부 판정용 */
  unavoidableResidenceYears?: number;
  /**
   * 도시·주거환경정비법상 정비구역 (재개발·재건축) 지정 주택 여부.
   * 양도 당시 기준시가 1억 이하 주택의 2주택 중과배제(소령 §167의10①9호) 단서 —
   * 정비구역·사업시행구역 소재 주택은 제외된다.
   */
  isRedevelopmentZone?: boolean;
  // ── 소송 취득 주택 ──
  /**
   * 소송으로 인하여 취득하거나 소송이 진행 중인 주택 여부.
   * 2주택 중과배제 적용 (소령 §167의10①7호 — 8호는 2023.2.28 삭제):
   *   - 소송 진행 중인 경우: 판결 확정 전까지 배제
   *   - 소송 결과로 취득한 경우: **확정판결일**부터 3년 이내 배제
   */
  isLitigationHousing?: boolean;
  /**
   * 소송(저당권 실행 외) 결과로 취득한 주택의 **확정판결일**.
   * 7호는 「소송으로 인한 **확정판결일**부터 3년이 경과하지 아니한 경우에 한정한다」고 한다 —
   * 등기 취득일이 아니다. 확정판결일 ≤ 취득일이므로 취득일을 넣으면 3년 창이 늦게 시작해
   * 배제가 과하게 유지된다(F-17).
   * ⚠️ **필드명은 legacy다**(`...AcquisitionDate`). 이름을 바꾸면 sessionStorage·이력
   * (`inputData`)에 저장된 값이 유실되고, 그러면 「미입력 = 소송 진행 중」으로 읽혀 조용히
   * 배제가 켜진다 — 이름 대신 이 주석과 화면 라벨로 의미를 못박는다.
   * 미제공 시 소송 진행 중으로 간주 → 배제 적용.
   */
  litigationAcquisitionDate?: Date;
  // ── 부득이한 사유 상세 ──
  /**
   * 부득이한 사유 해소일 (소령 §167-10 ① 3호).
   * 사유 해소 후 3년 이내에 양도해야 배제 적용.
   * 미제공 시 사유가 지속 중으로 간주.
   */
  unavoidableReasonResolvedDate?: Date;
}

/** 분양권/입주권 정보 (2021.1.1 이후 취득분 → 주택 수 산정 포함) */
export interface PresaleRight {
  id: string;
  type: "presale_right" | "redevelopment_right";
  acquisitionDate: Date;
  region: "capital" | "non_capital";
  /** 지역기준 (REGION 수도권·광역시·세종 / VALUE 지방). 미제공 시 region 폴백. 3억 이하 배제는 VALUE만 */
  regionCriteria?: "REGION" | "VALUE";
  /** 가액(원) — 분양권 공급계약서상 공급가격(선택품목 제외)/입주권 종전주택가격(도시정비법§74①5). §167의4②1호·§167의11②1호 3억 배제 */
  rightValue?: number;
  /**
   * 소재지 코드 — 분양권/입주권을 통해 공급되는 주택의 시·군·구 판정용.
   * 인구감소지역 세컨드홈 특례 다·라목 2호("취득 전 보유주택과 동일 시·군·구 아닐 것")에서
   * 후보 주택과 동일 시·군·구인지 비교. 법정동 10자리 또는 시·군·구 5자리(앞 5자리만 사용).
   * 미제공 시 해당 권리는 시·군·구 비교에서 제외.
   */
  regionCode?: string;
  /**
   * #2b §167의4⑤ 혼인 차감용 — "양도자의 배우자 단독 보유" 분양권/입주권 여부.
   * 주택+권 합 3↑ + marriageMerge 발동 시 양도일 현재 배우자 보유 권리수를 차감. 미제공=본인 보유.
   */
  isSpouseOwned?: boolean;
  /**
   * 상속받은 권리인가 — 「소득세법 시행령」 §156의2⑥·⑦ · §156의3④·⑤ (§89② 배제의 예외).
   *
   * 이 축의 **순위 규칙**(피상속인 소유·거주기간, 공동상속 지분)은 아직 미구현이다. 그래서 이
   * 필드는 「예외에 해당한다」를 판정하는 데 쓰지 않고, `resolveArticle89Clause2`가
   * **판정 불가(undetermined)로 빠져나가는 신호**로만 쓴다 — 상속 권리를 가진 세대에
   * §89② 배제를 잘못 적용하지 않기 위한 안전장치다.
   *
   * ⚠️ 중과(§104⑦) 주택 수 산정은 이 필드를 보지 않는다. 그쪽 상속 배제는 `HouseInfo` 축이다.
   */
  /**
   * 「도시 및 주거환경정비법」 **관리처분계획 인가일**
   * (「주택건설촉진법」 §33에 따른 주택재건축 사업계획승인일을 포함한다).
   *
   * 🔑 「소득세법」 §89②의 **조합원입주권 축 시행일 게이트** 전용이다 —
   *    법률 제7837호(2005-12-31 공포·2006-01-01 시행) 부칙 §12①이
   *    「2006년 1월 1일 이후 최초로 **관리처분계획이 인가된 분부터**」로 정했다.
   *
   * ⚠️ **분양권 축과 기준이 다르다** — 분양권은 §88 10호 정의 시행일 기준 **취득일**이다.
   *    한 상수·한 필드로 묶으면 조용히 틀린다.
   * ⚠️ 미입력은 **원칙(적용)** 으로 읽는다. 2026년 현재 보유 중인 입주권의 인가일이
   *    2006-01-01 이전인 경우는 인가 후 20년 넘게 준공되지 않은 사업뿐이라 사실상 예외다.
   */
  managementDisposalApprovalDate?: Date;
  isInherited?: boolean;
  /**
   * §156의2⑥1~3호 · §156의3④1~2호 **순위 부적격** 자기선언 — 피상속인이 2 이상의 권리를
   * 소유했을 때 순위상 「상속받은 1권리」가 아니면 true.
   *
   * 🔑 순위를 **계산하지 않는다**. 완전히 같은 문제(§155②1~4호 상속주택 순위)를 이 저장소는
   *    이미 자기선언 boolean으로 처리한다(`transfer-inheritance-exclusion.ts` `passesRankingGate`).
   *    ⚠️ 순위 단계 수는 조문마다 다르다 — 입주권 **3단계**(소유기간 → 거주기간 → 상속인 선택),
   *       분양권 **2단계**(소유기간 → 상속인 선택). 화면 안내에서 구별한다.
   */
  isRankingDisqualifiedInheritedRight?: boolean;
  /** 공동상속 권리인가 — §156의2⑥ 본문 괄호 · §156의3④ 본문 괄호 */
  isCoInherited?: boolean;
  /**
   * 공동상속 **최대지분** 상속인인가 — §156의2⑦3호가목 · §156의3⑤5호가목.
   * `true`가 아니면 「다른 사람이 소유한 것으로 본다」 ⇒ 이 세대에는 귀속되지 않는다.
   *
   * ⚠️ 후순위 단계가 조문마다 다르다 — 입주권 ⑦3호는 **3단계**(최대지분 → 인가일 현재 피상속인
   *    보유 주택 거주자 → 최연장자), 분양권 ⑤5호는 **2단계**(최대지분 → 최연장자).
   *    이 필드는 「최대지분 여부」만 받고 후순위는 자기선언에 맡긴다(주택 축과 같은 규약).
   */
  isLargestCoInheritedShareholder?: boolean;
  /**
   * §156의2⑥ 본문 괄호 「피상속인이 상속개시 당시 **주택** … 을 소유하지 않은 경우」.
   *
   * 🔑 **`decedentOwnedOtherRightTypeAtDeath`와 반드시 분리**한다 — §156의2⑮·§156의3⑫이
   *    면제하는 것은 「**권리** 미소유」 요건**뿐**이고 「주택 미소유」는 ⑮ 본문이 전제로 요구한다
   *    (「피상속인이 상속개시 당시 **주택은 소유하지 않고** 조합원입주권과 분양권만 소유한 경우」).
   *    한 필드로 뭉치면 ⑮가 주택 요건까지 면제해 버린다.
   */
  decedentOwnedHouseAtDeath?: boolean;
  /**
   * 같은 괄호의 나머지 — 입주권이면 「또는 **분양권**을 소유하지 않은 경우」,
   * 분양권이면 「또는 **조합원입주권**을 소유하지 않은 경우」(§156의3④).
   * §156의2⑮·§156의3⑫ 선택이 있으면 **이 요건만** 면제된다.
   */
  decedentOwnedOtherRightTypeAtDeath?: boolean;
  /**
   * §156의2⑥ 단서 — 상속인과 피상속인이 상속개시 당시 **1세대**였는가.
   * true면 원칙적으로 「상속받은 조합원입주권」으로 보지 않는다
   * (주택 축 `HouseInfo.decedentSameHouseholdAtInheritance`와 같은 규약).
   */
  decedentSameHouseholdAtInheritance?: boolean;
  /**
   * 같은 단서의 예외 — 동거봉양 합가로 2주택이 된 경우로서 **합치기 이전부터 보유하던 주택이
   * 조합원입주권으로 전환**된 경우. `decedentSameHouseholdAtInheritance === true`일 때만 의미.
   */
  parentalCareMergeInheritedRight?: boolean;
}

/** 다주택 중과세 판정 입력 */
/**
 * 다주택 중과 한시 유예 조건부 판정 입력 — §167의3①12의2 가·나·다목 (2026.5.9 양도분까지 가목,
 * 이후 양도분은 나·다목 계약·허가 요건). 미제공 시 suspended_until 날짜 기준 blanket 판정.
 * 제공 시 checkGracePeriodExemption()이 가목 우선 게이트 후 나·다목 정밀 조건 판정.
 * (엔진 입력·TransferTaxInput·폼 변환에서 공유 — 폼 계층은 Date 대신 string 사용.)
 */
export interface MultiHouseGracePeriodInput {
  /** 매매계약 체결일 — 나목4)·다목1) 기산일(계약일부터 4/6개월 판정) */
  contractDate: Date;
  /**
   * 주택부수토지가 부동산거래신고법 §11 토지거래허가 "대상"인지 — 나목(true)/다목(false) 분기.
   * true = 나목(허가신청·허가·계약금 4요건), false = 다목(계약·계약금 2요건).
   */
  isLandPermitTarget?: boolean;
  /** 나목1) 토지거래허가 신청일 — ≤ 2026-05-09 필요 */
  permitApplicationDate?: Date;
  /** 나목2) 허가 수령 여부 */
  permitGranted?: boolean;
  /** 나목3)·다목1) 공통 — 계약금 수령 증빙 확인 (자기확인) */
  depositReceiptConfirmed?: boolean;
  /**
   * @deprecated regionCode 명단 판정(transitionExemptionMonths)으로 대체 — G6 해소.
   * 판정 미사용, 하위호환만 유지.
   */
  areaDesignatedDate?: Date;
  /**
   * @deprecated 확정 시행령 나·다목 원문에 근거 없음(G3 — 임차인 조항 전무). 판정 미사용.
   */
  isLandPermitArea?: boolean;
  /** @deprecated G3 — 판정 미사용 */
  hasTenantInResidence?: boolean;
}

/**
 * §167의10①15호(·§167의3①13호) ① 요소로 인정되는 §155 의제 근거.
 * 값이 곧 표시 라벨의 키다 — 어느 항으로 의제가 성립했는지 결과에 남긴다.
 */
export type DeemedOneHouseBasis =
  | "temporary_two_house"
  | "rural_house"
  /** §155⑤ 혼인 합가 — `resolveMergeDeeming` */
  | "marriage_merge"
  /** §155④ 동거봉양 합가 — `resolveMergeDeeming` */
  | "parental_care_merge"
  /** F-1 — §155①+⑤ 중첩(3주택) — `resolveMergeOverlapDeeming` */
  | "marriage_merge_overlap"
  /** F-1 — §155①+④ 중첩(3주택) — `resolveMergeOverlapDeeming` */
  | "parental_care_merge_overlap"
  /** E-14 — §155②③ 상속주택 + 일반주택 → 일반주택 1주택 의제 — `resolveSurchargeDeemedOneHouse` */
  | "inherited_general_house"
  /** E-14c — §155⑳ 장기임대주택 + 거주주택 → 거주주택 1주택 의제(시나리오 A) — `resolveSurchargeDeemedOneHouse` */
  | "long_term_rental_residence"
  /** E-14a — 조특법 감면주택을 「소유주택으로 보지 아니」해 양도 주택만 남는 경우 — `resolveSurchargeDeemedOneHouse` */
  | "special_act_house_exclusion"
  /** E-14c — §156의2(주택 + 조합원입주권) 예외 충족 → 1세대1주택 의제 — `resolveSurchargeDeemedOneHouse` */
  | "house_with_redevelopment_right"
  /** E-14c — §156의3(주택 + 분양권) 예외 충족 → 1세대1주택 의제 — `resolveSurchargeDeemedOneHouse` */
  | "house_with_presale_right";

export interface MultiHouseSurchargeInput {
  /** 세대 보유 전체 주택 목록 */
  houses: HouseInfo[];
  /** 양도 대상 주택 ID */
  sellingHouseId: string;
  /** 양도일 */
  transferDate: Date;
  /** 1세대 여부 */
  isOneHousehold: boolean;
  /**
   * §155 1세대1주택 **의제 성립** 여부 — 영 §167의10①15호(·§167의3①13호) ① 요소.
   *
   * 15호는 「§155 … 1세대1주택으로 보아 §154①이 적용되는 주택으로서 **같은 항의 요건을 모두
   * 충족**하는 주택」이라는 **2요소** 판정이다. ②(§154① 충족)는
   * `sellingHouseMeetsOneHouseRequirements`가 담당한다.
   *
   * ⚠️ **①을 이 엔진이 재판정하지 않는다.** 종전에는 `{previousHouseId, newHouseId}`를 받아
   * §155① 처분기한을 자체 재구현했고, 그 기한이 비과세 정본과 달라
   * 「비과세 O / 중과배제 X」 모순을 만들었다(계획서 F-2). caller가 §155① 정본
   * (`judgeTemporaryTwoHouseTiming` + `resolveTemporaryTwoHouseDeadlineYears`) 결과를 주입한다.
   *
   * 값은 의제 근거 항이다. ⑦(농어촌)·①(일시적 2주택)·④⑤(합가)·②③(상속, E-14)·⑳(거주주택, E-14c)·
   * 조특법 감면주택(E-14a)·§156의2·§156의3(E-14c — 이 둘은 15호가 아니라 §167의11①13호·§167의4③7호)을 채운다.
   * 어느 호로 배제되는지는 주택·권리 수와 양도일로 `resolveDeemedSurchargeExclusion`이 정한다.
   */
  deemedOneHouseBy155?: DeemedOneHouseBasis;
  /**
   * 의제 근거 조문 **표시용** — 조특법 감면주택(`special_act_house_exclusion` — 예: 「조특법 §99의2②」)과
   * §156의2·§156의3(충족한 예외 항 — 예: 「소득세법 시행령 §156의2 ③」)만 채운다. 판정에는 쓰지 않는다.
   */
  deemedOneHouseSource?: string;
  /**
   * 영 §167의10①**4호**「제155조제8항에 따른 수도권 밖에 소재하는 주택」.
   *
   * 15호(§155 의제)를 거치지 않고 **직접** 배제하는 별개 호라 슬롯을 따로 둔다.
   * caller가 §155⑧ 요건(2주택 · 해소일부터 3년 · 소재)을 판정해 주입한다.
   */
  unavoidableOutsideCapitalHouse?: boolean;
  /**
   * 구 영 §167의10①**8호**(2018.4.1. ~ 2023.2.27. 양도분) — 일시적 2주택 종전 주택(E-14e).
   *
   * 15호와 요건이 다르다(§154① · §155① 1년 · 조정대상지역 기한 없음 · 실제 소유 2주택). caller가
   * `qualifiesOldClause8TemporaryTwoHouse`(`data/surcharge-old-clauses-era.ts`)로 판정해 주입한다.
   * 그 기간에는 `deemedOneHouseBy155: "temporary_two_house"`가 서도 이 값만 본다.
   */
  oldClause8TemporaryTwoHouse?: boolean;
  /**
   * 구 영 §167의11①**1호**(2018.4.1. ~ 2023.2.27. 양도분) 인용 범위 — `house_with_*_right` 의제가
   * §156의2③·④ 또는 §156의3②·③에서 **직접**(⑦⑩⑪ 준용 아님) 섰는가(E-14f). 미제공은 `false`.
   */
  rightDeemingCitedByOldClause1?: boolean;
  /** 혼인합가 정보 */
  marriageMerge?: {
    marriageDate: Date;
  };
  /**
   * §154① 보유·거주 요건 충족 여부 (양도 주택) — §155⑤ 1세대1주택 의제 중과배제(배제2) 게이트.
   * 파이프라인이 precompute(transfer-tax.ts). 미제공 시 충족 간주(직접 호출 하위호환).
   */
  sellingHouseMeetsOneHouseRequirements?: boolean;
  /** 동거봉양 합가 정보 */
  parentalCareMerge?: {
    mergeDate: Date;
  };
  /** 세대 보유 분양권/입주권 목록 */
  presaleRights: PresaleRight[];
  /**
   * 한시 유예 조건부 판정 데이터 (2022.5.10 ~ 2026.5.9).
   * 미제공 시 suspended_until 날짜 기준으로만 판단 (기존 동작 유지).
   * 제공 시 계약일(조건A) + 잔금기한(조건B) + 토지허가구역(조건C) 종합 판정.
   */
  gracePeriod?: MultiHouseGracePeriodInput;
}

/** 산정에서 제외된 주택과 사유 */
export interface ExcludedHouse {
  houseId: string;
  reason:
    | "inherited_5years"
    | "co_inherited_minor_share"      // §167의3②2호 공동상속 소수지분 (기간 제한 없음)
    | "long_term_rental"              // 장기임대 (boolean 또는 유형 검증 통과)
    | "low_price_non_capital"         // legacy: regionCriteria 미제공 + non_capital
    | "low_price_local_300"           // VALUE 지역 양도 공시가 3억 이하
    | "unsold_housing"
    | "officetel_pre2022"
    | "small_new_house"               // ⑬ 소형 신축/미분양 특례
    | "population_decline_second_home" // ⑭ 인구감소지역 세컨드홈 특례
    | "spouse_marriage_subtraction";  // #2a §167의3⑨ 혼인 5년내 배우자 주택수 차감 (3주택)
  detail: string;
}

/** 중과세 배제 사유 */
export interface ExclusionReason {
  type:
    | "temporary_two_house"
    | "marriage_merge"
    | "parental_care_merge"
    | "pre_designation_contract"    // ⑪ 공고일 이전 매매계약
    | "only_one_remaining"          // ⑩ 배제 후 유일한 1주택 (3주택+)
    | "mortgage_execution_3years"   // ⑧ 저당권 실행 3년 이내
    | "employee_housing_10years"    // ④ 사원용 주택 10년 이상
    | "tax_special_exemption"       // ⑤ 조특법 특례
    | "cultural_heritage"           // ⑥ 문화재
    | "daycare_center_5years"       // ⑨ 어린이집 5년 이상
    | "tax_incentive_rental"        // ③ 조특법 감면 임대주택
    | "small_new_house"            // ⑬ 소형 신축/미분양 (중과배제)
    | "unavoidable_reason_two_house" // ③ 2주택 취학·근무·질병 부득이한 사유 (소령 §167-10 ③)
    | "unavoidable_outside_capital" // ④ §155⑧ 수도권 밖 부득이 주택 (소령 §167-10 ① 4호)
    | "rural_house"                 // §155⑦ 농어촌주택 의제 (소령 §167-10 ① 15호)
    | "low_price_two_house"        // ⑩ 2주택 기준시가 1억 이하 소형 (소령 §167-10 ⑩)
    | "litigation_housing_two_house" // ⑦ 2주택 소송 취득/진행 중 주택 (소령 §167의10①7호)
    | "inherited_house_5years"      // 양도 주택 자체가 §155② 상속주택 5년 이내 (§167의3①7호 · 2주택 §167의10①2호) — D16
    | "long_term_rental_house"      // 양도 주택 자체가 장기임대주택 (§167의3①2호 · 2주택 §167의10①2호) — D16
    | "only_general_two_house"      // 2주택 — 다른 주택이 1~7호라 1주택만 소유 (§167의10①10호) — D16
    | "inherited_general_house"     // §155②③ 상속주택 보유 일반주택 1주택 의제 (§167의10①15호 · 구 13호) — E-14
    | "long_term_rental_residence"  // §155⑳ 장기임대주택 보유 거주주택 1주택 의제 (§167의10①15호 · 구 14호 · 3주택+ §167의3①13호) — E-14c
    | "special_act_house_exclusion" // 조특법 감면주택 소유주택 제외 → 1주택 의제 (§167의10①15호) — E-14a
    | "right_holding_one_house"     // §156의2·§156의3 1세대1주택 의제 (§167의11①13호 · 합 3 이상 §167의4③7호) — E-14c
    | "long_holding_10y_until_2020_06_30"; // 보유 10년 이상 · 2019.12.17.~2020.6.30. 양도 (§167의3①12호 등 · 2020.2.11. 신설) — E-14j
  detail: string;
}

/** 다주택 중과세 판정 결과 */
export interface MultiHouseSurchargeResult {
  /** 산정 후 유효 주택 수 (분양권 포함, 배제 주택 제외) */
  effectiveHouseCount: number;
  /** 단순 합계 주택 수 (배제 전) */
  rawHouseCount: number;
  /** 산정에서 제외된 주택 목록 */
  excludedHouses: ExcludedHouse[];
  /** 양도일 기준 조정대상지역 여부 */
  isRegulatedAtTransfer: boolean;
  /** 중과세 실제 적용 여부 (유예·배제 시 false) */
  surchargeApplicable: boolean;
  /** 이론적 중과 유형 */
  surchargeType: "multi_house_2" | "multi_house_3plus" | "none";
  /** 중과세 한시 유예 중 여부 */
  isSurchargeSuspended: boolean;
  /**
   * 한시 유예 근거 목 — §167의3①12의2 가목(a)/나목(na)/다목(da). isSurchargeSuspended === true일 때만 유의미.
   */
  surchargeSuspensionBasis?: "a" | "na" | "da";
  /** 나·다목 유예 시 계산된 양도 기한(절대기한 반영). isSurchargeSuspended === true + basis가 na/da일 때만 유의미. */
  surchargeSuspensionDeadline?: Date;
  /**
   * 부칙 §9270호 §14① — 2009.3.16~2012.12.31 취득 주택 세율 중과배제(조정지역 다주택이어도 기본세율).
   * true여도 surchargeType·isSurchargeSuspended는 유지 → §95² 장기보유특별공제 배제는 존속(세율만 배제).
   * 근거: 기재부 재산세제과-1422(2023.12.26.) · 서울행정법원 2024구단72950(국승).
   */
  rateSurchargeStatutoryExcluded?: boolean;
  /** 중과 배제 사유 목록 */
  exclusionReasons: ExclusionReason[];
  /** 경고 메시지 */
  warnings: string[];
  /**
   * ⑩번 "배제 후 유일한 1주택" 판정 상세.
   * 3주택+ 중과배제 시 표시.
   */
  onlyOneRemainingDetail?: {
    totalEffective: number;
    otherHousesExcluded: Array<{ houseId: string; reason: string }>;
  };
  /** #2b 산정에서 차감된 분양권/입주권 (혼인 §167의4⑤ 배우자 보유 차감). 미차감 시 빈 배열. */
  excludedPresaleRights?: Array<{ id: string; reason: "spouse_marriage_subtraction" }>;
}

// ============================================================
// DB 파싱용 규칙 데이터 타입
// ============================================================

/**
 * DB transfer:special:house_count_exclusion 에서 파싱된 주택 수 산정 규칙.
 *
 * ⛔ `rentalHousingExempt`를 **되살리지 말 것** (2026-09-22 제거). D16(`60225941`)이 종전
 *   `countEffectiveHouses`의 「배제 2: 장기임대 등록주택 (말소 전)」 블록을 옮길 때 그 게이트를
 *   **함께 옮기지 않아** 프로덕션 소비처가 0건이 됐다. 값은 seed에서 항상 `true`였으므로
 *   동작 변화는 없었지만, DB에서 `false`로 바꿔도 아무 일이 없는 **침묵 no-op 노브**였다.
 *   장기임대 배제 판정의 정본은 `isSurchargeExemptRental` →
 *   `isLongTermRentalHousingExempt`(§167의3①2호 본문·각 목)이다.
 *
 * ⛔ `inheritedHouseYears`도 **되살리지 말 것** (2026-09-22 제거). 같은 D16에서 같은 방식으로
 *   끊긴 형제 고아다 — 엔진은 `INHERITED_HOUSE_SURCHARGE_YEARS`
 *   (`multi-house-surcharge-count.ts`)를 쓰고 DB 값을 읽지 않는다.
 *   §167의3①7호 「상속받은 날부터 **5년**이 경과하지 아니한 경우」는 시행령이 정한 수치이고,
 *   이 규칙 객체 자체가 **optional**이라(`houseCountExclusionRules?`) DB 키가 없으면
 *   `undefined`가 된다 — 세액을 가르는 수치를 그런 경로에 두면 안 된다.
 */
export interface HouseCountExclusionRules {
  type: "house_count_exclusion";
  /** 저가주택 공시가격 한도 */
  lowPriceThreshold: {
    capital: number | null;    // null = 수도권(REGION) 저가 배제 없음
    non_capital: number;       // 지방(VALUE) 기준시가 배제 한도 (§167의3①1호 = 300_000_000)
    local?: number;            // 선택적 override (미제공 시 non_capital 사용)
  };
  /** 분양권 주택 수 산정 시작일 */
  presaleRightStartDate: string; // "2021-01-01"
  /**
   * @deprecated 엔진이 읽지 않는다(F-11) — 양도세에는 주거용 오피스텔 「산정 시작일」 경과규정이 없다
   * (심사-양도-2020-0038 · 조심-2023-서-10142). DB 세율 데이터 호환을 위해 필드만 남긴다.
   */
  officetelStartDate: string;    // "2022-01-01"
}

export interface RegulatedAreaDesignation {
  designatedDate: string;
  releasedDate: string | null;
}

export interface RegulatedAreaInfo {
  code: string;
  name: string;
  designations: RegulatedAreaDesignation[];
}

export interface RegulatedAreaHistory {
  type: "regulated_area_history";
  regions: RegulatedAreaInfo[];
}

// ============================================================
// 세금 시뮬레이션 타입
// ============================================================

/** 세금 시뮬레이션 입력 */
export interface TaxSimulationInput {
  /** 양도가액 (원) */
  salePrice: number;
  /** 취득가액 (원) */
  acquisitionPrice: number;
  /** 필요경비 (원) */
  expenses: number;
  /** 보유기간 (년) */
  holdingYears: number;
  /** 다주택 중과 유형 */
  surchargeType: "multi_house_2" | "multi_house_3plus";
}

/** 단일 시나리오 세액 */
export interface TaxScenario {
  label: string;
  /** 장기보유특별공제액 (원) */
  ltscAmount: number;
  /** 과세표준 (원) */
  taxableIncome: number;
  /** 산출세액 (원) */
  tax: number;
  /** 실효세율 */
  effectiveRate: string;
}

/** 기본세율 vs 중과세율 비교 결과 */
export interface MultiHouseTaxSimulation {
  /** 양도차익 */
  capitalGain: number;
  /** 보유기간(년) */
  holdingYears: number;
  /** 기본세율 시나리오 (장기보유특별공제 적용) */
  basicScenario: TaxScenario;
  /** 중과세율 시나리오 (장기보유특별공제 배제) */
  heavyScenario: TaxScenario;
  /** 중과 시 추가 세부담 (원) */
  additionalTax: number;
  /** 추가 세부담 포맷 문자열 */
  additionalTaxFormatted: string;
}
