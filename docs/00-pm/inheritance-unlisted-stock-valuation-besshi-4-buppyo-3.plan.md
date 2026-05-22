# 상속세 비상장주식 평가 — 별지 제4호 부표3 완전 재현 (PRD/Plan)

> **Status**: Plan 작성 — Design·Do 진입 전 사용자 승인 대기
> **Source PDF**: `~/Downloads/비상장주식 평가 사례.pdf` (한국세무사회 교재 제8장 비상장주식의 평가방법, pp.1533~1548, 사례 6건 + 평가심의위원회 운영규정 별지 제4호 서식 부표3)
> **Companion**: `docs/02-design/features/inheritance-unlisted-stock-valuation.engine.design.md` (Design 단계 작성 예정), `inheritance-unlisted-stock-valuation.ui.design.md` (UI 디자인)
> **Date**: 2026-05-22
> **Author**: claude (interview-driven)

---

## 0. 사용자 인터뷰 결과 (확정)

| # | 질문 | 결정 |
|---|---|---|
| Q1 | 구현 범위 | **A. 풀 재현** — 별지 부표3 6쪽 양식 컴포넌트 + 사례 1~6 전부 (2~3주 규모) |
| Q2 | 모듈 범위 | **공용 확장** — 기존 `property-valuation-stock.ts` 확장, 상속세·증여세 공용. 평가기준일만 분기 |
| Q3 | 영업권 평가 | **포함** — 상증령 §59② 산식 + 사례 6 anchor 31,747,950원 |
| Q4 | 최대주주 할증평가 | **포함** — 상증법 §63③ 본문 + 상증령 §53⑥⑦⑧9호 (중소·중견 배제). 사례 5(중소 ×100%) / 사례 6(중소·중견 아님 ×120%) anchor. ★ 조특법 §101은 삭제됨 — 검증 결과 인용 정정 |

---

## 0-1. 사실관계 정정 (사용자 표현 vs 법령)

| 사용자 표현 | 실제 법령 (상증령 §56①·§54) |
|---|---|
| "증여세는 증여일 직전 **1년** 사업연도로 평가" | **3개년** 가중평균 — 평가기준일 이전 1·2·3 사업연도 순손익액을 3·2·1 가중 후 6으로 나눔 |
| "상속세는 상속개시일 직전 **3년** 사업연도로 평가" | **3개년** 가중평균 — 동일 산식 |
| 결론 | **상속·증여 평가 산식 100% 동일**. 차이는 평가기준일(상속개시일 vs 증여일)뿐 |

다만 다음은 평가기준일에 따라 분기됨 (둘 다 동일 규칙):
- 사업개시 후 **3년 미만** 법인 → 순자산가치 단독 (§54④ 2호)
- 휴·폐업·청산절차 진행 → 순자산가치 단독 (§54④ 1호·6호)
- 평가기준일 직전 사업연도 종료일이 평가기준일 **6개월 이내** 미경과 시 → 추정이익 옵션 가능 (§56②)

---

## 1. 배경

### 1-1. 현행 구현 (gap 분석)

`lib/tax-engine/property-valuation-stock.ts` (10KB, 311줄)는 다음만 처리:

```ts
interface UnlistedStockData {
  weightedNetIncome: number;     // ← 사용자가 이미 가중평균 계산해서 입력
  netAssetValue: number;          // ← 사용자가 이미 영업권 포함해서 입력
  totalShares: number;
  capitalizationRate: number;     // 기본 10%
  ownedShares: number;
  assetValueOnlyReason?: ...;
}
```

**미구현 영역** (PDF 사례 1·5·6의 핵심):
1. ❌ 사업연도별 소득금액 → 가산항목·차감항목 → 순손익액 환산 산식 (사례 1)
2. ❌ 유상증자·무상증자에 따른 환산주식수 계산 (시행령 §56③ + 상증규 §17의3⑤, 사례 1·5)
3. ❌ 유상증자 순손익액 조정 (§56⑤: 1주당 **납입금액** × 증가 주식수 × 상증규 §17 이자율, 유상증자 사업연도는 월할, 사례 1)
4. ❌ 3개년 가중평균(3·2·1/6) 자동 산식
5. ❌ 영업권 평가 (상증령 §59②, 사례 6 = 31,747,950원)
6. ❌ 최대주주 할증평가 (§63③, 사례 5 중소 배제 / 사례 6 ×120%)
7. ❌ §54④ 4·5호(순자산가치 단독: 자산총액 중 주식·부동산 80% 이상) 분기
8. ❌ 별지 제4호 부표3 비상장주식 평가서 6쪽 양식 컴포넌트
9. ❌ PDF 다운로드 (별지 양식 6쪽 출력)

### 1-2. 목표

PDF 사례 6(2024.1.20. 상속개시 사례) 종합평가를 입력 → 평가 → 별지 양식 6쪽 → PDF 출력까지 **100% 재현**. 사례 1~5는 anchor 테스트로 회귀 보호.

---

## 2. 법령 근거 (KoreanLaw MCP 위임체인 검증 ✅ 완료)

> 검증 결과 전문: [`docs/02-design/features/inheritance-unlisted-stock-valuation.legal-verification.md`](../02-design/features/inheritance-unlisted-stock-valuation.legal-verification.md) (2026-05-22, 1차+2차)
> Critical 정정 1차 3건 + 2차 1건 + 보완 2건 — ★ 표시

| 항목 | 정정 후 인용 라벨 | 비고 |
|---|---|---|
| 비상장주식 평가 원칙 | 상증법 §63①1호 **나목** ★ | "다목"으로 잘못 인용 → 다목은 삭제됨 |
| 1주당 가중평균 본칙 (3·2/5) + 80% 하한 | 상증령 §54① 본문 단일 항 | 본칙·단서·부동산과다보유 모두 포함 |
| 부동산과다보유법인 가중치 반전 (2·3/5) | 상증령 §54① 본문 **괄호 내 단서** ★ | "§54②"로 잘못 인용 → §54②는 순자산 산식 위임 |
| 부동산과다보유 정의 | 소법 §94①4호다목 | §54① 괄호 내 위임 |
| 순자산가치 단독 5사유 | 상증령 §54④ 1·2·3·5·6호 ★ | "4호"로 잘못 인용 → 4호 삭제됨, 주식 80%는 5호 |
| 순손익가치 산식 (3년 가중평균) | 상증령 §56① | ✅ 정합 — 음수 시 0 |
| 추정이익 옵션 | 상증령 §56② + 상증규 §17의3①(8가지 사유) | ✅ 정합 |
| 유상증자 환산주식수 | 상증령 §56③·상증규 §17의3⑤ | ✅ 정합 |
| 유상증자 순손익액 조정 | 상증령 §56⑤·상증규 §17의3⑥(= §17 이자율) | ✅ 정합 |
| 순자산가액 산식 | 상증령 §55① | ✅ 정합 — 0원 이하 시 0원, 장부가액 하한 |
| 영업권 가산 (자산가액에) | 상증령 §55③ | ✅ — 단서 1·2·3호 자동 배제 (결손법인 포함) |
| 영업권 평가 산식 | 상증령 §59②·③ | "초과이익 × 영업권지속연수(원칙 5년) × 기재부령" |
| 영업권 §59② 이자율 10% | **상증규 §19①** | ★ 영업권 전용 본칙 |
| 비상장주식 §54① 환원율 10% | **상증규 §17** ★ 2차 정정 | 1차에서 "§19①"으로 통합 → 분리. 두 다른 조문, 둘 다 10% |
| §55② 무형자산·준비금·충당금 평가 | **상증규 §17의2** ★ 2차 정정 | 1·2·3·4호 — 자산 가산/차감, 부채 가산/차감 (NetAssetCalc 모델 정정) |
| 부동산과다보유법인 정의 (양도조건 미적용) | 소법 §94①4호다목 — **자산총액 중 토지·건물·부동산권리 ≥ 50%** | ★ 2차 명확화 — "과점주주 50% 이상 양도" 조건은 평가 시 불적용 |
| §63② 기업공개준비중 (사례 1~6 외) | 상증령 §57 | 후속 PR F-10 신설 — 공모가 vs §54 비교 |
| 5년 연금현가 3.7908 | 평가심의위원회 운영규정 별지 부표3 양식 본문 산식 (시행규칙 본칙에 명시 X) | ⚠️ 후속 PR F-8로 재검증 |
| 최대주주 할증평가 | 상증법 §63③ (×120%) | ✅ 정합 |
| 최대주주 범위 | 상증령 §53④⑤ | ✅ "보유주식 가장 많은 1인" + 1년 내 양도·증여 합산 |
| 중소·중견 할증 배제 | 상증법 §63③ 본문 괄호 + **상증령 §53⑥⑦⑧9호** ★ | "조특법 §101"로 잘못 인용 → §101 삭제됨 |
| 중견기업 정의 | 상증령 §53⑦ | 매출액 평균 5천억원 미만 |
| 평가심의위원회 신청 옵션 (70~130%) | 상증령 §54⑥ | 4방법: 유사상장·DCF·DDM·기타 (후속 F-7) |

---

## 3. 케이스 매트릭스 (PDF 사례 1~6 + 분기)

| # | PDF 사례 | 핵심 분기 | 1주당 평가액 | 비고 |
|---|---|---|---|---|
| **C-1** | (1) 순손익가치 계산 | 사업연도별 소득금액 → 가산·차감 → 환산주식수 → 가중평균 | 7,150원 | 순손익가치 단독 산출 |
| **C-2** | (2) 사업개시 3년 이상 | 가중평균 본칙 + 80% 하한 미적용 (4,840 > 5,000×80%=4,000) | 4,904원 | (4,840×3+5,000×2)/5 |
| **C-3** | (3) 순자산가치(−) | 음수 순자산 → 0 처리 (§55① 후단) | 1,680원 | (2,800×3+0×2)/5 |
| **C-4** | (4) 양쪽 모두 음수·0 | 가중평균(△758) → 0 처리 | 0원 | §55① 후단 양쪽 적용 |
| **C-5** | (5) 유상증자·최대주주·중소기업 | 환산주식수 + 중소기업 할증 배제 | 10,456원 | ×100% (상증령 §53⑧9호 — 중소기업 발행 주식) |
| **C-6** | (6) 종합평가 | 영업권 + 최대주주(피상속인 보유 50% 초과 가정·중소·중견 아님) ×120% + 별지 부표3 | 10,910원 × 120% | 상속재산 340,392,000원. ★ "50% 초과"는 PDF 가정 — 법령상 임계는 §53④ "보유 가장 많은 1인" |

**외부 분기 (사용자가 추가 입력해야 발동)** — KoreanLaw 검증 정정 적용:
- §54④ **1호** 청산절차 — `liquidation` (무조건)
- §54④ **2호** 사업개시 3년 미만 — `lt3y` (자동 분기 가능: 사업개시일 입력 시 평가기준일 차이 < 3년) (무조건)
- §54④ **3호** 부동산 80% 이상 — `real_estate_80` (단서: 가중평균 < 순자산일 때만)
- ~~§54④ 4호~~ — **삭제됨**
- §54④ **5호** 자산총액 중 주식등 80% 이상 — `stock_holding_80` (단서: 가중평균 < 순자산일 때만)
- §54④ **6호** 잔여 존속기한 3년 이내 — `remaining_3y` (무조건)

---

## 4. 데이터 모델 변경

### 4-1. 기존 `UnlistedStockData` → 신규 `UnlistedStockValuationInput`

**전략**: 기존 타입은 deprecate(legacy 입력) 유지, 신규 풀-입력 타입 도입. 둘 다 `evaluateUnlistedStock` 진입점에서 분기 처리.

```ts
// lib/tax-engine/types/inheritance-gift.types.ts

/** 신규 풀-입력 모델 — 별지 부표3 양식 1:1 매핑 */
export interface UnlistedStockValuationInput {
  // === 1쪽: 평가대상 비상장법인 ===
  corpName: string;               // 법인명
  representative?: string;        // 대표자
  businessStartDate: Date;        // 사업개시일
  evaluationDate: Date;           // 평가기준일 (상속개시일 or 증여일)
  faceValuePerShare: number;      // 1주당 액면가액
  totalShares: number;            // 발행주식총수 (평가기준일 현재)
  ownedShares: number;            // 피상속인·수증인 소유 주식수

  // === 부동산과다보유법인 여부 ===
  isRealEstateHeavy: boolean;

  // === 순자산가치 단독 평가 사유 (§54④ — 5종, 4호 삭제) ===
  netAssetOnlyReason?:
    | "liquidation"        // 1호: 청산·해산·합병 (무조건)
    | "lt3y"               // 2호: 사업개시 3년 미만 (자동 계산 권장, 무조건)
    | "real_estate_80"     // 3호: 부동산 80% 이상 (단서: 가중평균 < 순자산일 때만)
    | "stock_holding_80"   // 5호: 주식등 80% 이상 (단서: 가중평균 < 순자산일 때만)
    | "remaining_3y";      // 6호: 잔여 존속기한 3년 이내 (무조건)

  // === 3개년 순손익액 산출 (사업연도별) ===
  // ★ 각 사업연도에 대해 PDF 사례 1처럼 가산·차감 항목 입력
  fiscalYears: [FiscalYearAdjustment, FiscalYearAdjustment, FiscalYearAdjustment];
  // 인덱스 0: 평가기준일 이전 1년 (가중치 ×3)
  // 인덱스 1: 평가기준일 이전 2년 (가중치 ×2)
  // 인덱스 2: 평가기준일 이전 3년 (가중치 ×1)

  // === 자본금 변동사항 (유상증자·무상증자) ===
  capitalChanges: CapitalChange[]; // 환산주식수 산정용

  // === 순자산가액 (재무상태표 기준) ===
  netAssetValueRaw: NetAssetCalculation; // 자산총액·부채총액·평가차액 등

  // === 영업권 자동 판정 (§55③ 단서) — 사용자 토글 X, 엔진 자동 ===
  // 다음 시 영업권 자산 가산 0 강제:
  //   1) §54④ 1호 (청산) — 자동
  //   2) §54④ 3호 (부동산 80%) — 자동
  //   3) §54④ 2호 (3년 미만) — 단, 무체재산권 현물출자+합산 3년 이상 시 가산
  //   4) §55③ 3호 평가기준일 직전 3년 계속 결손 — `isContinuousLossLastThreeYears: boolean` 입력
  isContinuousLossLastThreeYears: boolean; // §55③ 3호 자동 영업권 배제
  capitalizationRate: number; // 비상장주식 §54① 환원율 (기본 10% — 상증규 §17)
  goodwillRate?: number;      // 영업권 §59② 이자율 (기본 10% — 상증규 §19①) — 통상 동일

  // === 할증평가 (§63③ 본문 + §53⑥⑦⑧9호) ===
  isMaxShareholder: boolean;  // 최대주주 등 해당 여부 (§53④ "보유 가장 많은 1인" + §53⑤ 1년내 합산)
  companySize: "small" | "medium" | "large";  // 중소·중견·일반
  // small (§53⑥) → ×100% (할증 배제, §53⑧9호)
  // medium (§53⑦ 매출 5천억 미만) → ×100% (할증 배제, §53⑧9호)
  // large → ×120% (할증 적용)
  // ★ 조특법 §101 인용 금지 — 삭제됨
}

/** 사업연도별 가산·차감 항목 (별지 부표3 6쪽 표 1:1) */
export interface FiscalYearAdjustment {
  fiscalYearLabel: string;        // 예 "2021", "2022.1.1.~12.31."
  fiscalYearEndDate: Date;        // 사업연도 종료일
  taxableIncome: number;          // ① 각 사업연도 소득금액

  // 가산 항목 (②~⑦)
  addRefundInterest?: number;          // ② 국세·지방세 과오납 환급금 이자
  addLossFromDividend?: number;        // ③ 수입배당금 중 익금불산입액
  addCarriedDonation?: number;         // ④ 이월된 기부금 손금산입액
  addCarriedCarPayment?: number;       // ⑤ 이월된 업무용승용차 손금산입액
  addForexValuationGain?: number;      // ⑥ 외화환산이익 (법인세 미반영)
  addOtherByOrdinance?: number;        // ⑦ 기타 기획재정부령이 정하는 금액

  // 차감 항목 (⑧~㉒)
  subCorporateTax?: number;            // ⑧ 당해 사업연도 법인세
  subAdditionalTaxes?: number;         // ⑨ 농어촌특별세 + 지방소득세 (법인세 부가)
  subFines?: number;                   // ⑩ 벌금·과료·과태료·가산금·체납처분비
  subCompulsoryPublicCharges?: number; // ⑪ 법령상 의무 아닌 공과금 손금불산입
  subPunitiveDamages?: number;         // ⑫ 징벌적 손해배상금 손금불산입
  subWithholdingPenalty?: number;      // ⑬ 징수불이행 세액
  subExcessiveExpenses?: number;       // ⑭ 과다경비 손금불산입
  subDonationExcess?: number;          // ⑮ 기부금 한도초과 손금불산입
  subEntertainmentExcess?: number;     // ⑯ 접대비 한도초과 손금불산입
  subNonBusinessExpenses?: number;     // ⑰ 업무무관 비용 손금불산입
  subNonBusinessCarExpenses?: number;  // ⑱ 업무용승용차 비용 손금불산입
  subInterestPayment?: number;         // ⑲ 지급이자 손금불산입
  subDepreciationShortage?: number;    // ⑳ 감가상각 시인부족액 손금환입
  subForexValuationLoss?: number;      // ㉑ 외화환산손실
  subOtherByOrdinance?: number;        // ㉒ 기타 기획재정부령이 정하는 금액

  // 유상증자·감자 반영액 (라)
  capitalIncreaseAdjustment?: number;  // = 유상증자 주식수 × 액면가 × 환원율 × 월할
}

/** 자본금 변동 (환산주식수 산정) */
export interface CapitalChange {
  changeType: "paid_in" | "free_issue" | "capital_reduction";
  changeDate: Date;
  sharesIssued: number;
  pricePerShare?: number;  // 유상증자 발행가 (액면가가 아닐 수 있음)
}

/** 순자산가액 계산 (별지 부표3 2쪽) — §55② 위임 §17의2 1~4호 매핑 */
export interface NetAssetCalculation {
  // 자산총액 (가) — §17의2 1·2호
  bsTotalAssets: number;          // ① 재무상태표상 자산가액
  assetValuationDelta: number;    // ② 평가차액 (자산금액 차액 합계, §60·§66 평가)
  corpTaxReservedAmount: number;  // ③ 법인세법상 유보금액
  paidInCapitalIncrease: number;  // ④ 유상증자 등
  otherEarnedRights: number;      // ⑤ 평가기준일 현재 지급받을 권리 확정 가액 (§17의2 1호 — 자산 가산)
  prepaidExpenses: number;        // ⑥ 선급비용 + 법인세령 §24①2호바목 무형자산 (§17의2 2호 — 자산 차감)
  preGiftRetainedEarnings: number;// ⑦ 증자일 전의 잉여금 유보액 (차감)

  // 부채총액 (나) — §17의2 3·4호
  bsTotalLiabilities: number;     // ⑨ 재무상태표상 부채액
  corporateTaxPayable: number;    // ⑩ 법인세 (§17의2 3호 가)
  farmingSurtax: number;          // ⑪ 농어촌특별세 (§17의2 3호 가)
  localIncomeTax: number;         // ⑫ 지방소득세 (§17의2 3호 가)
  dividendPayable: number;        // ⑬ 평가기준일 현재 확정 배당금·상여금·지급의무 확정 (§17의2 3호 나)
  retirementProvision: number;    // ⑭ 임원·사용인 전원 퇴직 시 퇴직급여 추계액 (§17의2 3호 다)
  otherProvision: number;         // ⑮ 기타 충당금 중 비용 확정분 (§17의2 4호 단서 가)
  reserveExcluded: number;        // ⑯ 제준비금 (§17의2 4호 본문 — 부채 차감)
  allowanceExcluded: number;      // ⑰ 제충당금 (§17의2 4호 본문 — 부채 차감)
  deferredTaxAdjustment: number;  // ⑱ 기타 (이연법인세대 등)

  // 보험사업 단서 (§17의2 4호 나·다) — optional, 비보험법인은 0
  insuranceReservePolicy?: number;       // §17의2 4호 나·다: 책임준비금
  insuranceExtraordinaryReserve?: number;// §17의2 4호 나·다: 비상위험준비금
  insuranceSurrenderReserve?: number;    // §17의2 4호 다: 해약환급금준비금
}
```

### 4-2. 평가 결과 타입 확장

```ts
export interface UnlistedStockValuationResult {
  // === 1주당 평가액 (별지 부표3 1쪽 ③~⑨ 매핑) ===
  netAssetTotal: number;              // ③ 순자산가액 (영업권 포함)
  netAssetPerShare: number;           // ④ 1주당 순자산가액 (③ ÷ 발행주식총수)
  netIncomePerShare: number;          // ⑤ 최근 3년 가중평균 순손익가치
  weightedAvgPerShare: number;        // ⑥-㉠ 1주당 평가액 (가중평균)
  netAssetFloor80: number;            // ⑥-㉡ 순자산가치 × 80% (하한)
  finalPerShareValue: number;         // ⑥ 1주당 평가액 (㉠과 ㉡ 중 큰 금액)
  perShareValueNonMaxShareholder?: number; // ⑦ 최대주주 아닌 경우 1주당 평가액 = ⑥
  premiumPerShare: number;            // ⑧ 최대주주 해당 시 1주당 평가액 = ⑥ × (1 + 할증률)
  netAssetFloorApplied: boolean;
  // 별지 양식 ⑨ "보충적 평가가액"은 ⑦ or ⑧ (최대주주 여부에 따라 분기)
  finalPerShareForReporting: number;  // ⑨ 보충적 평가가액 (⑦ or ⑧)

  // === 별지 부표3 6쪽 순손익가치 명세 (사업연도별) ===
  fiscalYearBreakdowns: FiscalYearBreakdown[];  // 3개년 각각의 가산·차감 결과
  weightedNetIncome: number;          // 3년 가중평균 순손익액
  weightedNetIncomePerShare: number;  // 1주당 가중평균 순손익가치 (자 ÷ 환원율)

  // === 별지 부표3 5쪽 영업권 평가 ===
  goodwillCalculation?: GoodwillResult;  // §59② 산식 결과 (포함 시)

  // === 환산주식수 ===
  convertedSharesByYear: number[];  // [평가기준일 직전 1년, 2년, 3년]
  perShareNetIncomeByYear: number[]; // 각 사업연도 주당 순손익액

  // === 할증평가 (§63③ + §53⑧ 1~9호 9가지 배제 사유) ===
  premiumRate: number;          // 0 (배제) | 0.20 (×120%)
  premiumExclusionReason?:
    | "continuous_loss_3y"       // §53⑧1호: 3년 이내 계속 결손
    | "all_sold_within_6m"       // §53⑧2호: 평가기준일 전후 6개월(증여 전6/후3) 내 전부 매각
    | "calc_gift_profit"         // §53⑧3호: 증여이익 계산 (§28·§29·§29의2·§29의3·§30)
    | "subsidiary_other_max"     // §53⑧4호: 다른 법인 최대주주에 해당하는 경우의 그 다른 법인
    | "all_negative_op_income_3y"// §53⑧5호: 3년 이내 사업개시 + 영업이익 모두 0 이하
    | "liquidation_confirmed"    // §53⑧6호: 신고기한 내 청산 확정
    | "not_max_after_succession" // §53⑧7호: 상속·증여로 최대주주에서 벗어남
    | "deemed_gift_nominee"      // §53⑧8호: §45조의2 명의신탁 증여의제
    | "small_medium_enterprise"; // §53⑧9호: 중소기업 또는 중견기업

  // === 최종 ===
  totalValuation: number;       // 1주당 평가액(할증 후) × 보유주식수
  warnings: string[];
  appliedRules: string[];
}

export interface FiscalYearBreakdown {
  label: string;
  taxableIncome: number;
  addTotal: number;
  subTotal: number;
  adjustedNetIncome: number;       // 다. 순손익액
  capitalIncreaseAdjustment: number; // 라. 유상증자·감자분
  finalNetIncome: number;          // 마. 순손익액 (다 ± 라)
  convertedShares: number;         // 바. 환산주식수
  perShareNetIncome: number;       // 사. 주당순손익액
}

export interface GoodwillResult {
  // 별지 부표3 5쪽 6.영업권 매핑
  weightedAvg3y: number;          // 가. 3년간 순손익액 가중평균 (§59③ 준용 §56①)
  weightedAvgHalf: number;        // 나. 가 × 50%
  selfCapital: number;            // 다. 평가기준일 현재 자기자본 (§55① 영업권 포함 전 순자산가액)
  selfCapital10pct: number;       // 마. 다 × 라(이자율 10%, 상증규 §19①)
  annualExcessProfit: number;     // (나 − 마) — 초과이익금액. ★ 음수면 0
  durationYears: number;          // 바. 영업권 지속연수 = 5년 (§59②)
  goodwillCalc: number;           // 사. ∑[(나−마)/(1+0.1)^n] for n=1..5 (별지 양식 본문 산식)
  intangibleDeduction: number;    // 아. 매입 무체재산권 가액 중 감가상각비 차감 (§59② 단서)
  goodwillFinal: number;          // 자. 영업권 평가액 = max(사 − 아, 0)
  // 참고: (나−마)가 음수일 때 사 = 0이 되어야 함. 매년 동일 상수일 때 ∑ = (나−마) × 3.7908(5년 연금현가)
  // ★ 5년 연금현가 3.7908 본칙 위치는 상증규에 직접 명시 X — 평가심의위 별지 양식 산식. 후속 F-8로 재검증
}
```

---

## 5. Phase별 구현 계획 (PDCA 6단계)

### Phase 1 — Plan·Design + Pre-Do anchor (3~5일)

- ☑ KoreanLaw MCP로 §63·§54·§56·§55·§59·§63③·§53 위임 체인 끝까지 검증 → `legal-verification.md` (2026-05-22 완료, Critical 정정 3건 발견)
- ☐ `legal-codes/inheritance-gift.ts` 의 `VALUATION.UNLISTED_*` 상수 정정 (legal-verification.md §4 참조)
- ☐ Engine Design 문서(`*.engine.design.md`) 작성 — 케이스 매트릭스 6+ 행 enumerate
- ☐ UI Design 문서(`*.ui.design.md`) 작성 — 별지 부표3 양식 6쪽 캡처 + 칸 번호(①~㉒, 가~자) testid 동결
- ☐ **Pre-Do anchor** 1건 작성·실행: 사례 6 1주당 평가액 10,910원 anchor를 **현행 엔진**에 직접 입력값 모드(`UnlistedStockData`)로 작성·실행 → FAIL 메시지 확인 → 디자인 환류

**Phase 1 Gate**: KoreanLaw 검증 완료 ✅ + Pre-Do anchor FAIL로 디자인 환류 1회 이상 수행 ✅
- Pre-Do anchor 위치: `__tests__/tax-engine/property-valuation/pre-do-anchor.test.ts` (10 tests | 4 FAIL · 6 PASS)
- 환류 1건: `weighted-avg.ts` floor 시점 PDF 산식 준수 (1주당 가중평균 floor 후 ÷환원율)
- 환류 2건: 사례 3 PDF 오기 확정 — anchor U-8 정정(1,680 → 1,200) + U-8b 보존
- 환류 3건: 할증평가 미지원이 사례 6 총 평가액 gap의 70% 차지 — `max-shareholder-premium.ts` Phase 4 필수 확정

### Phase 2 — 엔진: 사업연도별 순손익액 환산 (3~4일)

신규 모듈 분리 (800줄 정책 준수):

```
lib/tax-engine/property-valuation/
├── unlisted-orchestrator.ts        # 진입점 evaluateUnlistedStockV2() (Phase 4)
├── fiscal-year-net-income.ts       # ①~㉒ 가산·차감 → 다. 순손익액 (Phase 2)
├── capital-increase-adjustment.ts  # §56⑤ 유상증자·감자 순손익액 조정 라. (Phase 2)
├── converted-shares.ts             # 환산주식수 산정 §56③·§17의3⑤ (Phase 2)
├── weighted-avg.ts                 # 3년 가중평균(3·2·1/6) (Phase 2)
├── net-asset-calc.ts               # 자산·부채 → 영업권포함전 순자산가액 (Phase 3)
├── goodwill.ts                     # §59② 영업권 + §55③ 자동 배제 (Phase 3)
├── max-shareholder-premium.ts      # §63③ 할증 + §53⑧9사유 enum (Phase 4)
└── besshi-form-mapper.ts           # 엔진 결과 ↔ 별지 부표3 6쪽 매핑 어댑터 (Phase 4 끝)
```

총 9파일 예상 LoC = **약 1,450** (모두 800줄 미만, 디자인 §5 참조)

**Phase 2 산출물**:
- `fiscal-year-net-income.ts` 단독 anchor (사례 1 — 2021년 순손익액 120,000천원 toBe)
- `converted-shares.ts` 단독 anchor (사례 1 — 2021년 환산주식수 180,000 / 2020년 180,000 / 2019년 180,000 toBe)
- `weighted-avg.ts` 단독 anchor (사례 1 — 715 / 환원율 10% → 7,150원 toBe)
- Cross-cutting integration anchor 1건

### Phase 3 — 엔진: 순자산가액 + 영업권 평가 (2~3일)

- `net-asset-calc.ts`: 자산총액(①~⑧) − 부채총액(⑨~⑱) = **영업권 포함 전 순자산가액** (사례 6 = 489,351,700원)
- `goodwill.ts`: §59② 산식 + §55③ 1·2·3호 자동 배제 (청산·부동산 80%·결손 3년)
  - 사례 6 영업권 = **0원** — `(가×50%) − (다×10%)` = 29,170,755 − 48,935,170 = **△19,764,415 (음수) → 0** (§55③ 사유가 아닌 초과이익 음수)
- ★ **사례 5(유상증자·최대주주·중소기업)의 영업권 평가 사례 anchor** = 31,747,950원 (해설 1538p 영업권 = {28,750,000×50% − 60,000,000×10%} × 3.7908 = 31,747,950)

### Phase 4 — 엔진: 가중평균 + 80% 하한 + 할증평가 (2일)

- `unlisted-orchestrator.ts`: ④⑤⑥ → ⑥-㉠·㉡ → ⑦·⑧ 파이프라인 연결
- `max-shareholder-premium.ts`: 최대주주(§53④) + 중소·중견 아님(§53⑥⑦) → ×1.20. 사례 6 anchor 10,910 × 120% × 26,000 = **340,392,000원**
- 사례 5 anchor: 중소기업(§53⑧9호) 배제 ×100%, 10,456 × 10,000 = **104,560,000원**
- §54④ **5호**(주식 80% 이상) 분기 추가 — 4호 아님

### Phase 5 — UI: 별지 부표3 6쪽 양식 컴포넌트 (4~5일)

> `feedback_besshi_form_replica` 정책 강제

**별지 부표3 6쪽 ↔ 컴포넌트 매핑**:
| 별지 쪽 | 구역 | 컴포넌트 | 칸 번호 |
|---|---|---|---|
| 1쪽 | 1.평가대상 비상장법인 | `CorporateInfoSection.tsx` | ① 발행주식총수·1주당 액면가·자본금·② 부동산과다보유법인 |
| 1쪽 | 2.순자산가치로만 평가하는 경우 | `CorporateInfoSection.tsx` (체크박스) | 가·나·다·라·마·바 (§54④ 5종) |
| 1쪽 | 3.1주당 가액의 평가 | `PerShareValuationResultCard.tsx` | ③ 순자산가액·④ 1주당 순자산가액·⑤ 1주당 순손익가치·⑥ 1주당 평가액(㉠·㉡)·⑦ 비최대주주·⑧ 최대주주·⑨ 보충적 평가가액 |
| 2쪽 | 4.순자산가액 (자산총액 + 부채총액) | `NetAssetCalculationTable.tsx` | ①~⑧ 자산 / ⑨~⑱ 부채 / 다.영업권포함전 순자산가액 / 라.영업권 / 마.순자산가액 |
| 3쪽 | (자산총액 좌 + 부채총액 우 분할) | `NetAssetCalculationTable.tsx` 내부 | — |
| 4쪽 | 5.평가차액 | `ValuationDeltaTable.tsx` | 자산금액·부채금액 평가액 vs 재무상태표 금액 차액 |
| 5쪽 | 6.영업권 평가 | `GoodwillCalculationTable.tsx` | 가.가중평균·나.가×50%·다.자기자본·라.이자율 10%·마.다×라·바.지속연수 5년·사.∑계산·아.무체재산권·자.영업권 평가액 |
| 6쪽 | 7.순손익액 (3년치) | `FiscalYearAdjustmentTable.tsx` | ①~㉒ 가산·차감 / 다.순손익액 / 라.유상증자·감자 반영액 / 마.순손익액 / 바.환산주식수 / 사.주당순손익액 / 아.가중평균액 / 자.환원율 / 차.1주당 가액 |

**컴포넌트 파일 구조** (800줄 정책 준수):
```
components/calc/inheritance/unlisted-stock/
├── UnlistedStockValuationStep.tsx       # 마법사 단계 진입점
├── CorporateInfoSection.tsx              # 1쪽 1·2.평가대상 + 순자산 단독 사유 체크박스
├── FiscalYearAdjustmentTable.tsx         # 6쪽 ①~㉒ 가산·차감 입력 (3년치 칼럼)
├── CapitalChangeTable.tsx                # 자본금 변동사항 (유상증자·무상증자·감자)
├── NetAssetCalculationTable.tsx          # 2~3쪽 자산총액·부채총액 표
├── ValuationDeltaTable.tsx               # 4쪽 평가차액 (자산·부채 평가액 vs 장부)
├── GoodwillCalculationTable.tsx          # 5쪽 영업권 (자동 계산 + 표시)
├── PerShareValuationResultCard.tsx       # 1쪽 3.1주당 가액 평가 결과 ③~⑨
└── BesshiForm4Buppyo3PrintView.tsx       # PDF 출력용 (6쪽 양식 + print-only-css-toggle)
```

**14개 동기화 지점** (정책 강제):
| 지점 | 작업 |
|---|---|
| ① FormData | `EstateForm.unlistedStockValuation: UnlistedStockValuationInput` (자산-수준 nested) |
| ② initial | `lib/stores/calc-wizard-inheritance-store.ts` factory에 빈 3년치 fiscalYears |
| ③ normalize | 단위 변환(천원 → 원), 빈 슬롯 0으로 |
| ④ API 변환 | `lib/calc/inheritance-tax-api.ts` — `EstateItem.unlistedStockValuationV2?` 직렬화 |
| ⑤ UI 위젯 | 9개 컴포넌트 (위) |
| ⑥ 사이드바 합계 | 자산 카드 평가액 + 할증 후 총액 표시 |
| ⑦ 결과 카드 | `PerShareValuationResultCard` + 산출근거 산식 한국어 풀어쓰기 |
| ⑧ validation | `lib/calc/inheritance-validate.ts` — 3년치 fiscalYearEndDate 순서 + capitalChange 날짜 검증 |
| ⑨ Zod enum 메인 | `netAssetOnlyReason` **5종** (1·2·3·5·6호 — 4호 삭제) |
| ⑩ Zod enum 컴패니언 | `companySize` 3종, `capitalChange.changeType` 3종, `premiumExclusionReason` 9종(§53⑧1~9호) |
| ⑪ acquisitionDate fallback | N/A (해당 없음) |
| ⑫ Zod 입력 객체 | `UnlistedStockValuationInputSchema` 신규 |
| ⑬ callInheritanceTaxAPI body | `body.estate[i].unlistedStockValuationV2` spread |
| ⑭ Route handler | `app/api/calc/inheritance/route.ts` — Date 변환 (`coerceDates`) |

### Phase 6 — QA + 사례 anchor + Check·Act (2~3일)

- 사례 1~6 anchor 통과 (1주당 가액 toBe)
- 별지 양식 testid 6쪽 전수
- `ui-engine-sync-checker` read-only 검증
- `tax-qa-lead` 병렬 회귀
- 브라우저 수동 확인 (Network 탭 request body 신규 필드 확인 + PDF 출력 6쪽 양식)
- PDCA `report-generator` 완료 보고서

---

## 6. anchor 매트릭스

| ID | Phase | 사례 | 산출 | 기대값 |
|---|---|---|---|---|
| U-1 | 2 | (1) 2021년 | 순손익액(소득 + 가산 − 차감) | 120,000,000원 |
| U-2 | 2 | (1) 2021년 | 환산주식수 | 180,000주 |
| U-3 | 2 | (1) 2020년 | 환산주식수 | 180,000주 (100,000 × (100,000+80,000)/100,000) |
| U-4 | 2 | (1) 2019년 | 환산주식수 | 180,000주 |
| U-5 | 2 | (1) | 1주당 가중평균 | 715 (= (736×3 + 750×2 + 583×1)/6) |
| U-6 | 2 | (1) | 1주당 순손익가치 | 7,150원 (= 715 / 0.1) |
| U-7 | 4 | (2) | 1주당 평가액 | 4,904원 |
| U-8 | 4 | (3) | 1주당 평가액 (손계산 정합) | **1,200원** (Pre-Do P1-B 환류 — PDF 1,680 오기 확정. 1주당 순손익 (550×3+△120×2+△210)/6 = 200, ÷0.1 = 2,000, (2,000×3+0×2)/5 = 1,200) |
| U-8b | 4 | (3) | PDF 표기 보존 anchor | 1,680원 (PDF 표기 280 가정 시 — 회사전체 28M 역산 입력. PDF 자체 일관성 확인용) |
| U-9 | 4 | (4) | 1주당 평가액 | 0원 (양쪽 0) |
| U-10 | 4 | (5) | 1주당 평가액 (할증 전) | 10,456원 |
| U-11 | 4 | (5) | 상속재산가액 | 104,560,000원 (중소기업 ×100%) |
| U-12 | 3 | (6) | 순자산가액 (영업권 포함 전) | 489,351,700원 |
| U-13 | 3 | (6) | 영업권 평가 | **0원** (초과이익 = 29,170,755 − 48,935,170 = △19,764,415 음수 → 0. §55③ 배제 아닌 산식상 0) |
| U-14 | 4 | (6) | 1주당 순손익가치 ⑤ | 11,660원 (3년 가중평균순손익 1,166 / 0.1 환원율) |
| U-15 | 4 | (6) | 1주당 순자산가치 ④ | 9,787원 (489,351,700 / 50,000주) |
| U-16 | 4 | (6) | 1주당 평가액 ⑥ | **10,910원** = max((⑤×3+④×2)/5, ④×80%) = max((11,660×3+9,787×2)/5=10,910, 9,787×80%=7,830) = 10,910. 80% 하한 미발동 |
| U-17 | 4 | (6) | 1주당 평가액 ⑧ (할증 후) | 13,092원 (10,910 × 120%) |
| U-18 | 4 | (6) | 상속재산가액 | 340,392,000원 (13,092 × 26,000 ≈ 340,392,000원) |
| U-19 | 3 | (5) | 영업권 평가 | 31,747,950원 = {28,750,000×50% − 60,000,000×10%} × 3.7908 |
| U-20 | 4 | (6) | 최대주주 할증 배제 사유 | undefined (일반기업) — 사례 5는 `small_medium_enterprise`(§53⑧9호) |

---

## 7. 후속 PR 분리 (이번 PR 범위에서 제외)

| # | 항목 | 사유 |
|---|---|---|
| F-1 | 추정이익 옵션 (§56② 단서, 2개 신용평가전문기관 평균) | 사례 6에는 없음. 별도 UI 분기 필요 |
| F-2 | 증여세 시나리오 anchor | 평가산식 동일하나 평가기준일·관계·공제 차이 검증 anchor |
| F-3 | §54⑤ 부동산과다보유법인 자동 판정 | 현재는 사용자 입력 토글만. 자산 비율 자동 산정 후속 |
| F-4 | PDF 다운로드 6쪽 양식 출력 | print-only-css-toggle만 우선. 정식 react-pdf 컴포넌트는 후속 |
| F-5 | history-lookup-modal 연동 | 비상장주식 평가 이력 자동 채움 |
| F-6 | 단주 처리 (1주 미만 환산) | 사례에 없음. 별도 검증 |
| **F-7** | 평가심의위원회 신청 옵션 (§54⑥) | 보충적 평가가액 70~130% 범위 내 4방법: ① 유사상장법인 비교 ② DCF ③ 배당할인모형 ④ 기타 — UI 분기 별도 |
| **F-8** | 5년 연금현가 3.7908 본칙 위치 재검증 | 상증규 §19에 직접 명시 X — 평가심의위 운영규정 별지 부표3 양식 본문 산식. KoreanLaw `chain_action_basis` + 국세청 해석례 추가 검증 |
| F-9 | 무상증자 환산식 별도 검증 | 상증규 §17의3⑤은 "증자 또는 감자" 통합 환산식 — 무상증자도 증자에 포함. 사례 1 anchor로 검증 |
| **F-10** | §63② 기업공개준비중 법인 (상증령 §57) | 사례 1~6에 없음. 공모가 vs §54 평가 중 큰 금액 + 코스닥 상장신청 별도 분기 |
| F-11 | 보험사업 법인 §17의2 4호 단서 (가·나·다) | 보험회사·보험사업법인 책임준비금·비상위험준비금·해약환급금준비금 부채 차감 단서. 사례에 없음, 보험법인 입력 시 활성 |

---

## 8. Definition of Done (체크리스트)

- [x] KoreanLaw MCP 위임 체인 검증 결과 첨부 (§63·§54·§56·§55·§59·§63③·§53 — 조특법 §101 삭제 확인) ✅ legal-verification.md
- [ ] 케이스 매트릭스 6+ 행 enumerate
- [ ] Pre-Do anchor 1건 작성·실행 → FAIL → 디자인 환류
- [ ] 사례 1~6 anchor 18+ 건 100% PASS (`toBe` 원단위)
- [ ] 14개 동기화 지점 grep 자가 점검 (⑫⑬⑭ TS 미감지 영역 포함)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/inheritance-gift/` 전체 회귀 0건
- [ ] `ui-engine-sync-checker` read-only 0 누락
- [ ] 브라우저 수동 확인: 사례 6 입력 → 별지 부표3 양식 6쪽 testid 전수 확인 + Network 탭 신규 필드 송신
- [ ] 800줄 정책 준수 (PostToolUse hook 0 경고)
- [ ] 상속세·증여세 둘 다 회귀 0건 (공용 모듈 — 증여세 사용자가 사례 6 동일 입력 시 동일 1주당 결과)
- [ ] 사례 6 PDF 출력 (print-only-css-toggle) 1쪽 + 6쪽 양식 흰 배경 확인

---

## 9. 일정 예상 (총 16~21일)

| Phase | 작업 | 일수 |
|---|---|---|
| 1 | Plan·Design + Pre-Do anchor + KoreanLaw 검증 | 3~5 |
| 2 | 엔진: 사업연도별 순손익액 + 환산주식수 + 가중평균 | 3~4 |
| 3 | 엔진: 순자산가액 + 영업권 평가 | 2~3 |
| 4 | 엔진: 가중평균 통합 + 80% 하한 + 할증평가 | 2 |
| 5 | UI: 별지 부표3 9 컴포넌트 + 14지점 동기화 | 4~5 |
| 6 | QA + 사례 anchor + 브라우저 + 보고서 | 2~3 |

**병렬화 가능 영역**:
- Phase 1 KoreanLaw 검증과 Phase 2 환산주식수 anchor 손계산은 병렬
- Phase 5 UI는 Phase 2~4 엔진과 일부 병렬 (단, ⑤⑥⑦은 엔진 결과 타입 확정 후 시퀀셜)

**Plan/Design 병렬 / Do 시퀀셜 패턴** (CLAUDE.md 강제):
- Plan/Design — `inheritance-gift-tax-senior` + `property-valuation-senior` + `inheritance-gift-tax-ui-senior` 단일 메시지 동시 호출
- Do — 엔진 시니어가 ①②③④⑧⑨⑫⑭ 선처리(타입·헬퍼·anchor) → UI 시니어가 결과 받아 ⑤⑥⑦만 담당

---

## 10. 리스크 & 미정 사항

| 항목 | 영향 | 대응 |
|---|---|---|
| 사례 6 별지 양식 1쪽 ⑥(10,910) 산식 정합성 | 1주당 평가액 anchor 핵심 | ✅ 손계산 확정 — (11,660×3+9,787×2)/5 = 10,910.8 = 10,910 (일반 본칙 적용, 80% 하한 미발동) |
| ~~§54④ 4호 vs 5호 단서 구분~~ | ~~순자산 단독 적용 vs max 조건~~ | ✅ 확정 — 4호 삭제, 5호 = 주식 80% 단서 |
| 영업권 평가 §59② 자기자본 정의 | 평가기준일 현재 자기자본 = 영업권 포함 전 순자산가액 | ✅ 별지 양식 5쪽 다. "평가기준일 현재 자기자본" 명시. 사례 6 = 489,351,700원 확정 |
| 환산주식수 §56③·④ 산식 정확성 | 사례 1·5의 핵심 anchor | ✅ 상증규 §17의3⑤ 환산식 확정 — Phase 2 anchor로 검증 |
| 별지 부표3 칸 번호 ①~㉒, 가~자 동결 | PDF 신구판 차이 발생 시 testid 깨짐 | 평가심의위원회 운영규정 별지(2021.3.4. 개정본) 기준으로 동결, 사용자가 구판 첨부 시 최신본 라벨로 환류 |
| 사례 6 자본금 393,109,520원 (1쪽 자본금 393M ↔ 액면가 5,000 × 50,000주 = 250M 차이) | 자본금 ≠ 액면가 합계 — 잉여금 추가 자본전입 등 별도 | 변동사항 입력에 무상증자·자본준비금 자본전입 항목 보강 검토 |
| **5년 연금현가 3.7908 본칙 위치** | 영업권 평가 산식 핵심 | 상증규 §19에 직접 명시 X — 평가심의위 별지 양식 본문 산식. F-8 후속 PR로 재검증 |
| **§55③ 영업권 가산 자동 배제** | 청산·부동산 80%·3년 결손 시 자동 0 | 사용자 토글이 아닌 엔진 자동 판정 로직. `isContinuousLossLastThreeYears` 입력 필드 추가됨 |

---

## 11. 참고 자료

- PDF: `~/Downloads/비상장주식 평가 사례.pdf` (사례 1~6, 별지 제4호 부표3)
- 현행 코드: `lib/tax-engine/property-valuation-stock.ts` (확장 대상)
- 정책 메모리: `feedback_besshi_form_replica`, `feedback_pdf_table_row_one_to_one_mapping`, `feedback_korean_law_82_vs_81_2_drift`, `feedback_pre_anchor_verification`, `feedback_flat_vs_nested_form_field_decision`
- 유사 사례 (별지 양식 재현): `inheritance-besshi-9-buppyo-1-property-code-alignment.plan.md`, `gift-tax-valuation-besshi-10-buppyo.plan.md`
- 주식 양도세 비상장 평가 모듈 (재사용 가능 헬퍼): `lib/tax-engine/stock-transfer/stock-valuation-unlisted.ts` (§165④·⑤ — 보충적 평가 공식은 §54와 유사, 다만 양도세 시기별 연혁 분기는 무관)

---

## 12. 다음 행동 (본 PR 완료 후 갱신 — 2026-05-22)

### ✅ 본 PR 완료
1. ☑ KoreanLaw MCP 1차+2차 위임체인 검증 (legal-verification.md)
2. ☑ 계획서 v1.2 + 엔진 디자인 v1.1 작성
3. ☑ Pre-Do anchor 4건 FAIL → 디자인 환류 3건 반영
4. ☑ legal-codes/inheritance-gift.ts VALUATION 상수 22개 분리
5. ☑ unlisted-stock-valuation.types.ts 신규 (9 타입)
6. ☑ Phase 2 모듈 3개 (fiscal-year-net-income·converted-shares·weighted-avg)
7. ☑ 사례 1·2·3·4 anchor 10건 (U-1·U-2·U-3·U-4·U-5·U-6·U-7·U-8·U-8b·U-9 + D-12) 100% PASS

### ☐ 후속 PR (Phase 3·4·5·6)
| 후속 PR | 산출 | anchor |
|---|---|---|
| **#1 Phase 3 영업권·순자산** | `net-asset-calc.ts` + `goodwill.ts` (§55·§59②) | U-12·U-13·U-15·U-19 |
| **#2 Phase 4 할증·진입점** | `max-shareholder-premium.ts` + `unlisted-orchestrator.ts` + `capital-increase-adjustment.ts` + `besshi-form-mapper.ts` | U-11·U-14·U-16·U-17·U-18·U-20 |
| **#3 Phase 5 UI 별지 양식** | 9 컴포넌트 + 14 동기화 지점 (Phase 5 UI senior 협업) | 브라우저 수동 + Network 송신 |
| **#4 Phase 6 QA·보고서** | ui-engine-sync-checker · tax-qa-lead · report-generator | 회귀 0건 + 완료 보고서 |
| F-1 ~ F-11 | 추정이익·증여세·자동 부동산 판정·PDF 출력·history-lookup·단주·평가심의위·5년 연금현가·무상증자·기업공개준비중·보험사업 | 별도 분리 |
