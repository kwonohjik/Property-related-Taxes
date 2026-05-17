# 주식 양도소득세(Stock Transfer Tax) — 엔진 설계

> **출처 계획서**: `.claude/plans/stock-transfer-tax-implementation.md` (4차 정밀 검토 완료, 누적 25건+ 정정 반영)
> **법령 시점**: 2026.4.21. 시행 소득세법 (mst=285523)
> **첨부 PDF**: 주식 이론.pdf / 주식-비상장 주식.pdf / 주식-취득후 상장.pdf (2023년판 — 2026년 시점 반영을 위해 대주주 임계·금투세 폐지·증권거래세 환원 별도 정정 반영)

## Context

부동산 6대 세금 중 양도세는 부동산 한정으로만 완전 구현되어 있다. **주식 양도소득세는 신규 도메인**이며 다음 시나리오 대응이 필요하다:

1. 상장 대주주 + 취득 후 상장된 주식의 환산취득가 (사례 48)
2. 비상장주식 + 환산취득가 + 부동산·채무·현금 교환 양도 (사례 49)
3. 기타자산(과점주주·부동산과다보유) — §55 누진세율 우선 적용
4. 2024.1.1. 시행 대주주 시총 임계 50억 상향 (PDF 2023년판은 10억 기준)
5. 금융투자소득세 폐지(2024.12. 국회 통과)로 기존 양도세 체계 유지

부동산 양도세 엔진을 확장하기보다 **독립 도메인** `lib/tax-engine/stock-transfer/` 로 분리한다. 평가·LTHD·중과·§114의2 가산세 모듈은 공유하지 않는다.

---

## ★ 케이스 인벤토리 (Do 진입 게이트)

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|----------|-------------|-----------|------|
| 1 | 사례 48 — 취득 후 상장 코스닥 중소기업 대주주, 환산취득가, 보유 19년 | 소령 §165⑤ 본문 + §165④1·§163⑥4 + 소칙 §81④ | PDF "주식-취득후 상장" 590p | `case-48-acquired-then-listed.test.ts` | ⚠ **PDF 내부 모순 확인**. 본칙 자가검증값을 anchor: 1주당 취득기준시가 **5,824원** / 취득가 **29,120,000** / 필요경비 **291,200** (=29,120,000×1%) / 양도소득금액 **15,338,800** / 산출세액 **2,567,760** / 지방세 **256,776**. PDF 6,019/30,095,000/14,363,800/2,372,760은 alternative anchor로 별도 추적 |
| 2 | 사례 49 — 비상장 + 장부분실 액면가 + 부동산·채무면제·현금 교환 양도, 1985.9.13. 상속, 80% 하한 발동 | §94①3 나목 + 소령 §165④1 단서 (80% 하한 직접 명시) + §99①4 + §97 환산 | PDF "주식-비상장 주식" 592p | `case-49-unlisted-exchange.test.ts` | ⚠ §165⑤은 미적용(취득후상장 한정). **본칙 자가검증값 1주당 단위 통일**: 환산취득가 = 60억 × 12,500/160,000 = **468,750,000** / 필요경비 = 6,250,000 (=12,500×5,000×1%) ※ 양도분 8,000주 기준. PDF 23.4375억은 분자(40,000주)/분모(8,000주) 단위 불일치 적용으로 alternative anchor 별도 추적 |
| 3 | 코스피 비대주주 장내거래 | §94①3 가목 1) 대우 비대주주 | (비과세) | `non-major-listed.test.ts` | ☐ 양도소득세 0 |
| 4 | 코스피 비대주주 장외거래 | §94①3 가목 2) + 조특법 §104의4 | (과세) | `non-major-otc.test.ts` | ☐ 비중소 20% 단일 |
| 5 | 코스피 대주주 보유 1년 미만 + **중소기업 외(=비중소기업+중견기업 공통)** | §104①11 가목 1) | 30% 단일 | `major-short-term.test.ts` | ☐ `isSmallMediumEnterprise=false` 모든 케이스 (검토자 #2 — 중견기업 흡수) |
| 6 | 코스피·코스닥·비상장 **대주주 1년 이상 보유** (중소·비중소 공통) + 과세표준 4억 | §104①11 가목 2) | 4억 × 25% − 1,500만 = 8,500만 | `major-progressive.test.ts` | ☐ 누진공제 1,500만 — **단기 30% 분기는 비중소 1년 미만 한정** (검토자 ③ 라벨 보강) |
| 7 | 코스닥 대주주 시총 50억 임계 판정 (2024.1.1.~) | 시행령 §157④ | (대주주 확정) | `major-threshold-2024.test.ts` | ☐ 50억 경계값 |
| 8 | 코넥스 대주주 (4% 지분 또는 50억 시총) | 시행령 §157·§165③·§104①11 가목 | **§104①11 가목 통합 적용** (코스피·코스닥과 동일 — KoreanLaw MCP 확인 완료, 별도 row 분리 불필요) | `konex-major.test.ts` | ☐ §104①11 가목 통합 |
| 9 | ~~벤처기업 + 시총 40억~~ | **6차 정정**: §157에 벤처 임계 별도 없음. 시장 기본 50억 통일. 대신 **K-OTC 거래 + 벤처기업 + 비대주주 비과세** (조특법 §14①7호) | `venture-kotc-exemption.test.ts` | ☐ 비과세 finalTax=0 |
| 10 | 기타자산 — 과점주주 (자산 50% + 지분 50% 초과 + 50% 이상 양도) | §94①4 다목·시행령 §158① | §55 누진 | `qualifying-block-shareholder.test.ts` | ☐ §55 8단계 |
| 11 | 기타자산 — 부동산과다보유법인 (자산 80% + 골프장 등) | §94①4 라목·시행령 §158⑤ | §55 누진 | `real-estate-heavy.test.ts` | ☐ §55 8단계 |
| 12 | **§94② 우선순위** — §94①3 (**상장·비상장 모두**) + §94①4 다·라목 동시 충족 | §94② + §103② 1호 그룹 | 기타자산 §55 누진 + **기본공제 1호 그룹 (부동산 합산)** | `dual-eligibility-priority.test.ts` | ☐ 4호 우선 강제. **§94①4는 상장 주식에도 적용 가능** (검토자 ④ 정정 — "비상장 동시" 표현이 좁은 해석) |
| 13 | 비상장 + 부동산과다보유 평가 (자산 50% — §165⑤ 가중치 반전) | 시행령 §165⑤ 단서 | 순손익 2/5 + 순자산 3/5 | `valuation-real-estate-heavy.test.ts` | ☐ 가중치 반전 |
| 14 | 순자산가액 단독 평가 (4가지 사유 — 가/나/다/라목) | 시행령 §165④3 가~라목 | 순자산만 (§165④1 나목) | `net-asset-only.test.ts` | ☐ **4가지 사유** (가: 청산·사망 / 나: 사업개시전·1년 미만·휴폐업 / 다: 주식 80% 지주회사형 / 라: 잔여 존속기한 3년) |
| 15 | 80% 하한 발동 — 평가가액 < 순자산×80% | 상증령 §54④ 준용 | 사례 49 max(98,000, 160,000) = 160,000 | `valuation-80-floor.test.ts` | ☐ 사례 49 anchor 재현 핵심 |
| 16 | K-OTC + **중소·중견** 소액주주 비과세 | **소득세법 §94①3 나목 단서** (조특법 아님 — KoreanLaw 재확인 정정) | (비과세) | `kotc-sme-mid-small.test.ts` | ☐ finalTax=0 + appliedRules `KOTC중소중견비과세` |
| 17 | K-OTC + **벤처기업** 비대주주 비과세 | **조특법 §14①7호** (KoreanLaw 정확 인용 — §94의2/§99의6 모두 무관) | (비과세) | `kotc-venture-small.test.ts` | ☐ finalTax=0 + appliedRules `KOTC벤처비과세` |
| 18 | 양도 후 거래정지·관리종목 지정 | 시행령 §165③ | 1개월 종가 X → 비상장 보충 평가 | `trading-halt.test.ts` | ☐ 평가 분기 |
| 19 | 시기별 평가 연혁 (1998↓·1999~·2001~·2004~·2007.2.28~) | 시행령 §165⑤ 시행 시기 | 5분기 | `valuation-historical.test.ts` | ☐ 5건 |
| 20 | 대주주 임계 시기별 (2017·2018.4.1.·2020.4.1.·**2024.1.1.**) | 시행령 §157 부칙 | 4분기 + 2 시장 = 8건 | `major-threshold-historical.test.ts` | ☐ 8건 |
| 21 | **외국법인 발행 주식 입력 시 차단** | §94①3 다목 (스코프 외 — 별도 도메인) | 검증 오류 반환 | `out-of-scope-foreign.test.ts` | ☐ validate 차단 |
| 22 | **상속 받은 주식 단기 30% 기산점** (피상속인 취득일) | §104②1 | 피상속인 취득일 → 양도일 | `short-term-inherited.test.ts` | ☐ `decedentAcquisitionDate` 기산 |
| 23 | **증여 받은 주식 단기 30% 기산점** (수증일 — §97의2 미적용) | §104② 본문 | 수증일 → 양도일 (이월과세 없음) | `short-term-gifted.test.ts` | ☐ 일반 증여 수증일 기산 |
| 24 | **합병·분할 신주** 단기 30% 기산점 | §104②3 | 종전 주식 취득일 | `short-term-merger.test.ts` | ☐ `preMergerAcquisitionDate` 기산 |
| 25 | **부정행위 과소신고 40%** | §47의2②1 | `isFraudulent=true` 분기 | `fraudulent-penalty.test.ts` | ☐ 40% 가산세 |
| 26 | **국제거래 부정 60%** | §47의2②1 단서 | `isInternationalTransaction=true` 분기 | `international-fraud.test.ts` | ☐ 60% 가산세 |
| 27 | **순자산 단독 평가 시 80% 하한 미적용** | §165④3 + 상증령 §54④ | appliedRules `80%하한미적용` | `net-asset-no-floor.test.ts` | ☐ 분기 명시 |
| 28 | **의제취득일 1986.1.1.** (1985.12.31. 이전 취득 주식) | 시행령 §162① | 사례 49 fixture에 명시 적용 | `deemed-acquisition-1986.test.ts` | ☐ 1985.9.13. 상속 → 1986.1.1. |

**규칙**: 행≥1 충족 (20건). 사례 48의 6,019원/30,095,000원/291,200원은 산식 확정 전까지 참고 anchor.

---

## 법령 근거 (정확 인용 — 소득세법 2026.4.21. 시행)

```
소득세법 §94①3 가목 — 주권상장법인 주식 (대주주 + 장외 비대주주)
소득세법 §94①3 나목 — 주권비상장법인 주식 (K-OTC 중소·중견 소액·벤처 소액 제외)
소득세법 §94①3 다목 — 외국법인 발행/해외상장 주식 (본 엔진 미포함)
소득세법 §94①4 다목 — 과점주주 (자산 50% + 지분 50% 초과 + 50% 이상 양도)
소득세법 §94①4 라목 — 부동산과다보유법인 (다목 1)·2) 합계 80% + 골프장 등)
소득세법 §94② — §94①3 + §94①4 동시 충족 시 제4호(기타자산) 우선
소득세법 §99①3 — 상장주식 기준시가 (1개월 종가평균)
소득세법 §99①4 — 장부분실 시 액면가 적용
소득세법 §104①11 — 주식등 양도소득 세율
소득세법 §103 — 양도소득기본공제 (250만원, 그룹별 분리)
소득세법 §47의2·§47의4 — 가산세 (신고불성실·납부불성실)
소득세법 §52의2 — 전자신고 세액공제 (개인 2만원)
소령 §157 — 대주주 범위 (2024.1.1.~ 시총 50억)
소령 §158① — 과점주주 정의 (지분 50% 초과)
소령 §158⑤ — 부동산과다보유법인 사업 종류
소령 §162⑤ — 취득시기 불명확 시 선입선출법
소령 §163⑥ — 개산공제 (취득당시 기준시가 × 1%)
소령 §165③ — 거래정지·관리종목 평가
소령 §165④3 가~라목 — 순자산 단독 평가 **4가지 사유** (가: 청산·사망 / 나: 사업개시전·1년미만·휴폐업 / 다: 주식 80% 지주회사형 / 라: 잔여 존속기한 3년 이내)
소령 §165⑤ — 비상장 보충적 평가 + 단서 (취득 후 상장 환산)
소칙 §81④ — 취득·상장 평가액 동일 시 월할 가산
소칙 §82 — "÷ 10%" 율 (시행령 §165④2 위임)
상증령 §54④ — 순자산가액 80% 하한 (소령 §165⑤ 준용)
조특법 §94의2 — K-OTC 중소·중견 소액주주 비과세
조특법 §104의4 — **다자간매매체결회사(ATS) 거래 상장주식 = 증권시장 거래로 의제** (장외거래 분 과세와 무관 — PDF 인용 정정)
※ 장외거래 비대주주 과세 근거 = §94①3 가목 2) 본문 (단서: 상법 §360조의2·15·5·22 주식 포괄적 교환·이전 제외)
지방세법 §103의3 — 지방소득세 10%
**국고금 관리법 §47** — 절사 단위 (9차 정정 — 이전 "지방세기본법 §38" 잘못된 조문)
  · §47① 국고금 수입·지출 = 10원 미만 절사 (본세·가산세)
  · §47② 국세 과세표준 산정 = 1원 미만 절사
  · §47③ 지방자치단체 준용 (양도세 지방소득세 = 10원 미만 절사)
**소득세법 §105①2호** — 주식(§94①3 가목·나목) 예정신고 = 양도일 속하는 **반기 말일 + 2개월** (KoreanLaw 정확 인용 확정)
```

**KoreanLaw MCP 정확 인용 결과 (2026.4.21./4.23./3.20. 시행)**:

```
시행령 §165⑤ 본문 (취득 후 상장 한정):
  주식등의 양도일 현재에는 제3항에 따른 주식등에 해당되나
  그 취득 당시에는 제3항에 따른 주식등에 해당되지 않는 경우
  → 환산식 적용. 단서: 취득일 평가 = 상장일 평가 시 §165⑨ 준용 (소칙 §81④)

시행령 §165④1 (비상장 보충 평가):
  순손익가치(가목) × 3 + 순자산가치(나목) × 2 ÷ 5
  ※ §94①4 다목(과점주주) 법인은 비율 2:3 반전
  ※ **80% 하한 — §165④1 본칙 단서 직접 적용** (상증령 §54④ 준용 아님 — 검토자 ② 정정)
    "그 가중평균한 가액이 1주당 순자산가치에 100분의 80을 곱한 금액보다 적은 경우에는
     1주당 순자산가치에 100분의 80을 곱한 금액을 평가액으로 한다"

시행령 §163⑥4 (개산공제 1%):
  "1호 내지 3호 외의 자산: 취득당시의 기준시가 × 1/100"
  → 주식은 4호 적용

시행령 §165⑨ + 소칙 §81④ (월할 가산):
  양도/취득 기준시가 동일 시 보유월수 × (직전 - 전전 기준시가) / 사업연도 월수 가산

시행령 §165③ (코스닥·코넥스 정의):
  "대통령령으로 정하는 주권상장법인" = 코스닥시장 또는 코넥스시장에 주권을 상장한 법인

§104①11 가목 (대주주 양도 세율):
  1) 1년 미만 + 중소기업 외 = 30%
  2) 그 외 = 누진 (3억 이하 20%, 3억 초과 6,000만 + (X-3억)×25%)
§104①11 나목 (대주주 아닌 자):
  1) 중소기업 = 10%
  2) 그 외 = 20%
```

**적용 제외 (스코프 외)**:
- 소득세법 §114의2 (환산취득가 5% 가산세) — 토지·건물·부동산권리만 대상 → 주식 미적용
- 소득세법 §57 (외국납부세액공제) — 거주자 국내주식 무관 → 해외주식 도메인
- 소득세법 §118의9~118의15 (국외전출세) — 별도 도메인
- 소득세법 §94①5 (파생상품·신주인수권) — 후속 PR
- 소득세법 §94①3 다목 (해외주식) — 별도 도메인

---

## 엔진 input 타입

```ts
export type StockTransferInput = {
  // §94①3 - 시장 분류
  marketType: "kospi" | "kosdaq" | "konex" | "unlisted" | "other_asset";
  // 대주주 판정 (시장별 — 모두 50억 통일, 시행령 §157)
  isMajorShareholder: boolean;            // 직전 사업연도 종료일 기준
  shareRatio: number;                      // 본인+특수관계자 지분율 (0.01 = 1%)
  marketCapAtPriorYearEnd: number;        // 직전 사업연도 종료일 시총 (원, §157④1 최종시세가액)
  isVentureCompany: boolean;               // 벤처기업 (조특법 §14①7호 K-OTC 비대주주 비과세 분기용)
  isKOTCTrading: boolean;                  // K-OTC 거래 여부 (§94①3 나목 단서 + 조특법 §14①7호)
  priorYearEndDate: Date;                  // 직전 사업연도 종료일

  // §94①4 - 기타자산 판정 (과점주주·부동산과다보유)
  isQualifyingBlockShareholder: boolean;   // §94①4 다목
  isHeavyRealEstateForRate: boolean;       // §94①4 라목 (80% + 골프장)
  // 시행령 §165⑤ 가중치 반전용 (별개 임계 50%)
  isHeavyRealEstateForValuation: boolean;

  // 회사 분류
  isSmallMediumEnterprise: boolean;        // 중소기업 여부 (세율 분기)
  isMidsizeEnterprise: boolean;            // 중견기업 여부 (K-OTC 비과세 분기)
  isListedSmallShareholder: boolean;       // 소액주주 (K-OTC·벤처)

  // 거래 일자·수량
  acquisitionDate: Date;
  transferDate: Date;
  shareCount: number;                       // 양도 주식수
  totalIssuedShares: number;                // 발행주식 총수 (시총·과점주주 계산용)
  // 보유기간 기산점 분기 (§104② 단서 — 검토자 지적 #15)
  acquisitionCause: "purchase" | "inheritance" | "gift" | "merger_split";
  decedentAcquisitionDate?: Date;           // 상속: 피상속인 취득일 (§104②1)
  donorAcquisitionDate?: Date;              // §97의2 적용 시 증여자 취득일 (§104②2 — 주식은 §97의2 미적용이므로 일반 증여는 수증일 기산)
  preMergerAcquisitionDate?: Date;          // 합병·분할: 종전 주식 취득일 (§104②3)
  // 보유기간 결과는 result.holdingPeriodMonths 노출

  // §94①4 다목 부가 정보
  cumulativeTransferRatio?: number;        // 3년간 양도 누적 비율 (다목 ③ 요건)

  // 양도가액 모드 (실가 / 교환 합계)
  transferPriceMode: "actual" | "exchange";
  perShareTransferPrice?: number;          // actual 모드
  exchangePropertyValue?: number;          // exchange — 부동산 정상가액
  exchangeDebtRelief?: number;             // exchange — 채무감소액
  exchangeCash?: number;                   // exchange — 현금

  // 취득가액 모드
  acquisitionMode: "actual" | "sale_case" | "appraisal" | "estimated" | "face_value";
  perShareAcquisitionPrice?: number;        // actual

  // 환산 모드 — 상장 (1개월 종가평균)
  transferDatePriceAvg1Month?: number;     // 양도일 직전 1개월 종가평균
  listingDate?: Date;                       // 상장일 (취득 후 상장 분기 트리거)
  listingDatePriceAvg1Month?: number;      // 상장일 1개월 종가평균
  acquiredBeforeListing: boolean;          // §165⑤ 단서 적용 여부
  tradingHaltAtTransfer: boolean;          // 양도일 거래정지/관리종목

  // 환산 모드 — 비상장 보충적 평가 (3시점)
  // 양도일 직전 사업연도
  transferYearNetIncomePerShare?: number;
  transferYearNetAssetPerShare?: number;
  // 상장일 직전 사업연도 (취득 후 상장)
  listingYearNetIncomePerShare?: number;
  listingYearNetAssetPerShare?: number;
  // 취득일 직전 사업연도
  acquisitionYearNetIncomePerShare?: number;
  acquisitionYearNetAssetPerShare?: number;

  // 장부분실 (§99①4)
  bookLost: boolean;
  faceValuePerShare?: number;

  // 순자산 단독 평가 (시행령 §165④3) — 4가지 사유 (KoreanLaw MCP 정확 인용)
  netAssetOnlyReason?:
    | "liquidation_or_owner_death"      // 가목 — 청산 진행 / 사업자 사망
    | "no_business_or_short_or_closed"  // 나목 — 사업개시 전 / 1년 미만 / 휴폐업
    | "stock_holding_company"           // 다목 — 자산총액 중 주식가액 80% 이상 (지주회사형)
    | "remaining_term_under_3y";        // 라목 — 정관상 잔여 존속기한 3년 이내

  // 필요경비
  expenseMode: "actual" | "estimated";
  actualExpenses?: number;                  // 자본적 지출 + 양도비용 (증권거래세 포함)

  // 신고
  filingType: "preliminary" | "final" | "revised";
  filingDate: Date;
  isElectronicFiling: boolean;
  // 가산세 분기 (§47의2)
  isFraudulent: boolean;                    // 부정행위 과소신고 → 40% (default false → 10%)
  isInternationalTransaction: boolean;      // 국제거래 + 부정 → 60%

  // §103② 기본공제 그룹 합산 (검토자 P0 — §94② 발동 시 부동산 그룹 합산)
  realEstateGroupBasicDeductionUsed: number; // 같은 해 부동산 그룹에서 이미 사용한 기본공제 (250만원 한도 잔여 계산)
};
```

## 엔진 result 타입

```ts
export type StockTransferResult = {
  // §94 분류 결과 (8차 정정 — 비과세·비대주주 케이스 enum 보강)
  taxCategory:
    | "listed_major"                      // 상장 대주주 (코스피·코스닥·코넥스 통합)
    | "listed_non_major_in_market"        // 상장 비대주주 장내거래 → 비과세
    | "listed_otc_non_major"              // 상장 비대주주 장외거래 → 과세 (§94①3 가목 2)
    | "unlisted_major"                    // 비상장 대주주
    | "unlisted_non_major"                // 비상장 비대주주
    | "kotc_sme_mid_exempt"               // K-OTC + 중소·중견 소액주주 → 비과세 (§94①3 나목 단서)
    | "kotc_venture_exempt"               // K-OTC + 벤처 비대주주 → 비과세 (조특법 §14①7호)
    | "other_asset_block_shareholder"     // 기타자산 §94①4 다목
    | "other_asset_heavy_re"              // 기타자산 §94①4 라목
    | "out_of_scope_foreign";             // §94①3 다목 스코프 외 (validate 차단)
  appliedSection94:
    | "①3가1)"                            // 상장 대주주
    | "①3가2)"                            // 상장 비대주주 장외
    | "①3나_본문"                         // 비상장 (대주주·비대주주)
    | "①3나_단서"                         // K-OTC 중소·중견 소액 비과세
    | "①4다"                              // 과점주주
    | "①4라";                             // 부동산과다보유법인
  section94_2Applied: boolean;              // §94② 우선순위 발동
  isExempt: boolean;                        // 비과세 결과 (finalTax = 0 + 사유 표시용)
  exemptReason?: "kotc_sme_mid" | "kotc_venture" | "non_major_in_market";

  // 양도가액
  transferPrice: number;
  transferPriceBreakdown?: { property: number; debt: number; cash: number };

  // 취득가액
  acquisitionPrice: number;
  acquisitionMode: StockTransferInput["acquisitionMode"];
  usedEstimatedAcquisition: boolean;
  // 3중 패턴 (`feedback_estimated_deduction_separation`)
  estimatedBase?: number;                    // 환산 base (취득기준시가)
  estimatedDeduction?: number;               // 개산공제

  // 평가 detail
  valuationDetail?: {
    method:
      | "actual_acquisition"           // ★ 실가 입증 (검토자 #14)
      | "weighted_avg"                  // §165④1 본칙 (3/5, 2/5)
      | "net_asset_only"                // §165④3 4가지 사유
      | "face_value"                    // §99①4 장부분실 액면가
      | "post_listing_conversion"       // §165⑤ 취득 후 상장 환산
      | "monthly_avg_listed";           // 상장 1개월 종가평균
    weightedAvgPerShare?: number;
    netAssetFloorApplied: boolean;          // 80% 하한 발동 (순자산 단독 평가 시 미발동)
    netAssetFloorValue?: number;
    finalPerShareValue: number;
  };
  // 기본공제 그룹 분기 결과 (§103②)
  basicDeductionGroup: "real_estate_and_other_asset" | "stock";

  // 필요경비
  expenses: number;
  expenseMode: "actual" | "estimated";

  // 소득금액·과세표준
  transferIncome: number;                    // 양도가 - 취득가 - 필요경비
  basicDeduction: number;                    // 250만원 (§103)
  taxBase: number;

  // 세율·세액
  appliedRate: number | { progressive: true };
  progressiveDeduction?: number;             // 1,500만원 (3억 초과 누진)
  calculatedTax: number;                     // 산출세액

  // 가산세·공제
  underReportPenalty: number;                // §47의2
  latePaymentPenalty: number;                // §47의4
  electronicFilingCredit: number;            // §52의2

  // 최종
  finalTax: number;
  localIncomeTax: number;                    // 10% × **10원 미만 절사** (국고금 관리법 §47③ 준용 — 9차 정정: 이전 "지방세기본법 §38" 인용은 완전 오류)

  // 보유기간 (단기 30% 분기 결과 표시용)
  holdingPeriodMonths: number;
  holdingPeriodDays: number;
  isShortTermHolding: boolean;               // 비중소기업 대주주 1년 미만

  // 신고서
  lthdStartDate: null;                       // 주식은 LTHD 미적용 (부동산 결과 인터페이스 호환용 null)
  filingFormData: StockFilingFormData;

  // 디버그·경고
  warnings: string[];
  // 사용자 표시용 (검토자 #13 보강)
  appliedRules: Array<
    | "§94②우선"           // 비상장+기타자산 동시 충족
    | "80%하한"            // 평가 80% 하한 발동
    | "80%하한미적용"      // ★ 순자산 단독 평가 시 (검토자 #13)
    | "단기30%"            // 비중소기업 대주주 1년 미만
    | "거래정지우회"       // 시행령 §165③ 비상장 보충 평가 우회
    | "KOTC중소중견비과세" // §94①3 나목 단서
    | "KOTC벤처비과세"     // 조특법 §14①7호
    | "월할가산"           // ★ 소칙 §81④ 발동 (검토자 #13)
    | "의제취득일적용"     // ★ 1985.12.31. 이전 취득 → 1986.1.1. (검토자 #13)
    | "장부분실액면가"     // ★ §99①4 (검토자 #13)
    | "기타자산우선§55누진" // §94① 동시 충족 시 §55 누진
    | "기본공제부동산그룹합산" // ★ §94② 발동 → §103② 1호 그룹 (검토자 P0)
  >;
};
```

새 Date 필드 라우트 매핑은 `lib/api/date-coerce.ts`의 `toDate()`/`coerceDates(obj, ["acquisitionDate", "transferDate", "priorYearEndDate", "listingDate", "filingDate"])` 적용.

---

## 계산 알고리즘 (단계별)

```
STEP 1 — 과세대상 판정
  1a. §94① 분류 결정
      - marketType + isMajorShareholder + isVentureCompany 로 §94①3 가/나목 판정
      - 대주주 임계 시기별 적용 (2024.1.1.~ 50억 / 벤처 40억)
  1b. §94①4 기타자산 동시 충족 확인
      - 다목 (과점주주 50% 이상 양도 충족) OR 라목 (자산 80% + 사업 영위)
  1c. §94② 우선순위
      - §94①3 ∧ §94①4 동시 충족 → taxCategory = "other_asset_*"
  1d. 비과세 조기 반환
      - K-OTC 중소·중견 소액 / 벤처 소액 → finalTax = 0 반환

STEP 2 — 취득가액 결정
  2a. acquisitionMode 분기
       actual: perShareAcquisitionPrice × shareCount
       sale_case: (비상장만, 외부 입력)
       appraisal: (외부 감정가, PR-2)
       estimated: 환산취득가 산정 → STEP 2b
       face_value: §99①4 — bookLost AND 기준시가 확인 불가 → faceValuePerShare × shareCount
  2b. 환산취득가 산정 분기
       상장 (acquiredBeforeListing=false): transferDatePriceAvg1Month × shareCount
       상장 + 취득 후 상장 (acquiredBeforeListing=true):
         취득기준시가 = listingDatePriceAvg1Month × (취득일 비상장평가 / 상장일 비상장평가)
         ※ 소칙 §81④ 월할 가산 적용 (취득·상장 평가액 동일 시) — Pre-Do 산식 확정
       거래정지 (tradingHaltAtTransfer=true): 비상장 보충 평가로 우회
       비상장:
         valuationMethod = 시기별 평가 연혁(시행령 §165⑤ 시기별)
         per-share 계산:
           weighted_avg: (NIp / 0.10) × 3/5 + NAp × 2/5
             (부동산과다보유 §165⑤ 가중치 반전: 2/5 + 3/5)
           net_asset_only: 시행령 §165④3 **4가지 사유** (가/나/다/라목)
         80% 하한 적용: finalPerShareValue = max(weighted, NAp × 0.8)
  2c. estimated 모드 시: estimatedBase = 환산 base 저장

STEP 3 — 양도가액 결정
  actual: perShareTransferPrice × shareCount
  exchange: exchangePropertyValue + exchangeDebtRelief + exchangeCash

STEP 4 — 필요경비
  actual: actualExpenses (자본적 지출 + 증권거래세 포함, 집행기준 97-163-1)
  estimated: 취득기준시가 × 1% (소령 §163⑥)
    ※ estimatedDeduction 별도 저장 (`feedback_estimated_deduction_separation`)
    ※ Pre-Do — 사례 48 291,200원 base 정의 확정 필요

STEP 5 — 양도소득금액 = transferPrice − acquisitionPrice − expenses
  ※ LTHD 미적용 (주식 양도세는 §95 적용 안 함)

STEP 6 — 기본공제 250만원 (§103)
  주식 그룹별 — 부동산과 별도. 연간 1회 한정

STEP 7 — 과세표준 = transferIncome − basicDeduction (0 미만 0)

STEP 8 — 세율 적용
  taxCategory별 분기:
    other_asset_*: §55 누진세율 8단계 (부동산 엔진 applyBasicProgressiveRate 재사용)
    listed_major / unlisted (대주주):
      중소기업 + 보유 1년 미만 + 비중소기업 → 30%
      중소기업 대주주 또는 비중소기업 대주주 1년 이상 → 누진 (3억 이하 20%, 3억 초과 25% — 누진공제 1,500만원)
    unlisted 비대주주:
      중소기업 10% / 비중소기업 20% (단일)
    listed_otc (비대주주 장외): 비상장 비대주주와 동일 세율
    konex_major: PR-1 시드 row 단독 확정 후 적용

STEP 9 — 산출세액
  단일세율: taxBase × rate
  누진: taxBase × 0.25 − 15,000,000 (3억 초과)
  Math.floor() 적용 — `feedback_legal_codes` 정수 연산

STEP 10 — 세액공제 (전자신고 §52의2만)

STEP 11 — 가산세 (신고불성실 §47의2 / 납부불성실 §47의4)
  ※ §114의2 환산취득가 5% 미적용 (조문상 부동산 한정)

STEP 12 — 최종세액 = 산출세액 - 공제 + 가산세
  localIncomeTax = floorWonUnit(finalTax × 0.10) — 지방세기본법 §38
```

---

## Silent fallback / 자동 안분 후보 식별

- ❌ **금지**: 순손익가액·순자산가액 미입력 시 자동 0 적용 (validate에서 차단)
- ❌ **금지**: 시총 미입력 시 지분율만으로 대주주 판정 (양쪽 입력 모두 받고 OR 판정)
- ❌ **금지**: useEffect → store 미러링으로 환산 평가액 자동 채움 (useMemo만 허용)
- ✅ **허용**: §94① 3호+4호 동시 충족 시 §94② 따른 4호 강제 적용 (법문 명시)
- ✅ **허용**: **80% 하한 자동 발동** (시행령 §165④1 본칙 단서 직접 적용 — 8차 정정: 상증령 §54④ 준용 표기 잘못)
- ✅ **허용**: K-OTC 중소·중견 소액 → §94①3 나목 단서 / 벤처 → 조특법 §14①7호 자동 비과세

## Validation 분기 (8차 추가)

- `acquisitionMode === "sale_case"` AND `marketType ∈ {kospi, kosdaq, konex}` → 검증 오류 (매매사례가액은 비상장만 적용 — PDF 출처)
- `marketType === "out_of_scope_foreign"` → 검증 오류 (해외주식은 별도 도메인)
- `expenseMode === "estimated"` AND `acquisitionMode !== "estimated" && !== "face_value"` → 경고 (개산공제는 환산·액면가 모드 시 권장)
- `acquisitionMode === "face_value"` → `bookLost: true` 강제 (둘 중 하나 단독 입력 차단)
- `transferDate < acquisitionDate` → 검증 오류 (음수 보유기간)
- `cumulativeTransferRatio > 1` → 검증 오류 (3년 양도 누적 비율 100% 초과 불가)

---

## 테스트 약속

- 케이스 인벤토리 20건 × anchor 테스트 ≥ 1건 = **최소 20건**
- Pre-Do anchor 우선 검증 (`feedback_pre_anchor_verification`):
  - 사례 48 산출세액 2,372,760 / 지방세 237,276 (확정)
  - 사례 49 환산취득가 2,343,750,000 / 필요경비 5,000,000 (확정)
- 사례 48 취득가 6,019원·필요경비 291,200원은 KoreanLaw MCP 산식 확정 후 anchor 승격

---

## Cross-cutting / 후속

- ~~§97의2 이월과세 준용 (증여받은 주식)~~ → **§97의2 정정**: 본 조항은 토지·건물·시설물이용권 한정. **주식은 §97의2 미적용**, 부당행위계산 부인(§101②) 영역. 본 엔진은 일반 증여 수증일 기산만 처리, §101② 부당행위는 후속 PR
- 의제취득일 1986.1.1. (상속) — **케이스 28로 PR-2 케이스 인벤토리에 흡수** + 사례 49 fixture에 1986-01-01 의제 변환 명시
- 무상증자·무상감자 환산주식수 — PR-2
- 다자산 합산신고 (다종목 양도) — PR-3 + `addPropertyRefines` 패턴
- 증권거래세 시장별 자동 산정 (코스피·코스닥 0.15% / 코넥스 0.10% / 비상장 0.35%) — PR-3 정보성 카드
- **주식 양도손익 통산** (§103·§118) — 같은 그룹 내 양도손실 통산 (부동산과 분리). 다종목 PR-3
- **양도손실 이월공제 — 주식은 적용 안 함** (소득세법상 주식 양도손익은 당해 연도 한정)
- **자기주식·소각 (의제배당)** — §17②1 배당소득 → 양도세 도메인 외 명시 (검토자 #7)
- **비거주자 주식 양도** — §119⑨·§126 원천징수 → 별도 도메인 명시 (검토자 #7)
- **사례 48 fixture 시점 의존성** (검토자 #11) — `acquisitionDate=2004-07-01` / `transferDate=2023-02-26`로 PDF 시점 고정. 보유기간 19년은 fixture 내 상수로 유지

---

## PR 분할 약속 (8차 정정 — 22~28 분배)

- **PR-1**: 케이스 1, 3~8, 12, 18, 20, **22~24** (상장 + 기타자산 + §94② + 거래정지 + 임계 이력 + 단기 30% 기산점 분기)
- **PR-2**: 케이스 2, 9~11, 13~17, 19, **27~28** (비상장 + 80% 하한 + 가중치 반전 + 시기별 연혁 + 의제취득일 + 순자산 단독 80%하한 미적용)
- **PR-3**: 케이스 21, **25~26**, 다자산 합산 + 부정·국제 가산세 + 신고서 양식 + 증권거래세 시장별 표시
