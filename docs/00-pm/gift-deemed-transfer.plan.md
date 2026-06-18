# 증여로 보는 경우 (2)~(21) 증여이익 계산 기능 — 작업계획서 (PLAN)

> 출처: 「2026 양도·상속·증여세 이론 및 계산실무」 제8편 증여세편 제2장 제5절 "증여로 보는 경우" (765~794쪽)
> 브랜치: `feat/gift-asset-valuation` (worktree `gift-asset-value`)
> 작성일: 2026-06-18

---

## 0. 결정사항 (인터뷰 확정)

| # | 항목 | 결정 |
|---|---|---|
| 1 | **산출물 범위** | 각 규정의 **증여재산가액(증여이익)** 산정 → 기존 `calcGiftTax`에 주입 → **최종 증여세액까지** 산출 |
| 2 | **UI 위치** | **독립 "증여이익 계산기" 신규 페이지** (`/calc/gift-deemed`). 기존 4단계 증여세 마법사와 분리. 결과를 증여세 계산으로 이관 가능 |
| 3 | **구현 순서** | **단순 규정 MVP 먼저** → Phase 단계 확장 |
| 4 | **검증 anchor** | **산식 기반 자체 구성** (법령 정합 최우선, KoreanLaw MCP로 산식·이자율·임계 검증 후 원단위 `toBe()` anchor) |

---

## 1. 목표 · 범위

상증법 §32의4·§34~§45의5 "증여로 보는 경우"(증여 예시·추정·의제) 20개 규정 각각에 대해,
**교재 산식 그대로 증여재산가액(증여이익)을 산정**하고 그 값을 기존 증여세 엔진에 연결해 최종 세액까지 계산하는 기능을 구현한다.

### 대상 20개 규정 (교재 (2)~(21) — (1) 신탁 §33은 범위 외)

| 교재 | 규정 | 조문 | 그룹 | 난이도 | 기구현 |
|---|---|---|---|---|---|
| (2) | 보험금의 증여 | §34 | A.단순 | ★☆☆ | ❌ |
| (3) | 저가양수·고가양도 | §35 | B.거래 | ★★☆ | ✅ `detectBargainTransfer` (미통합) |
| (4) | 채무면제 등 | §36 | A.단순 | ★☆☆ | ❌ |
| (5) | 부동산 무상사용 | §37 | A.단순(현가합) | ★★☆ | ❌ |
| (6) | 금전 무상대출 | §41의4 | A.단순 | ★☆☆ | ❌ |
| (7) | 합병에 따른 이익 | §38 | C.자본거래 | ★★★ | ❌ |
| (8) | 증자에 따른 이익 | §39 | C.자본거래 | ★★★★ | ❌ |
| (9) | 감자에 따른 이익 | §39의2 | C.자본거래 | ★★★ | ❌ |
| (10) | 현물출자 | §39의3 | C.자본거래 | ★★★ | ❌ |
| (11) | 전환사채 등 | §40 | C.자본거래 | ★★★★ | ❌ |
| (12) | 초과배당 | §41의2 | D.파생 | ★★★ | ❌ |
| (13) | 주식 등 상장이익 | §41의3 | D.파생 | ★★★ | ❌ |
| (14) | 합병에 따른 상장이익 | §41의5 | D.파생 | ★★★ | ❌ |
| (15)① | 재산취득후 가치증가 | §42의3 | E.기타 | ★★★ | ❌ |
| (15)② | 법인 조직변경 | §42의2 | E.기타 | ★★☆ | ❌ |
| (15)③ | 사업기회 제공 이익 | §45의4 | G.법인의제 | ★★★★ | ❌ |
| (15)④ | 기타(재산사용·용역 등) | §42① | E.기타 | ★★☆ | ❌ |
| (16) | 증여추정·의제 구분 | (개념) | F.추정의제 | ☆ | ❌ |
| (17) | 재산취득자금 추정 | §45 | F.추정의제 | ★★☆ | ❌ |
| (18) | 명의신탁 의제 | §45의2 | F.추정의제 | ★★☆ | ❌ |
| (19) | 동일인·동일거래 합산 / 중복배제 | §43②·§43① (상증령 §32의4) | F.합산규칙 | ★★☆ | ❌ |
| (20) | 일감몰아주기 의제 | §45의3 | G.법인의제 | ★★★★★ | ❌ |
| (21) | 특정법인 거래 의제 | §45의5 | G.법인의제 | ★★★★ | ❌ |

> **조문번호 주의**: 본 계획서 조문번호는 PDF 원문 기준(검증됨). 사전 조사 에이전트 보고의 일부 조문번호 오류(§37=무상대출 등)는 폐기. 각 Phase Do 단계에서 KoreanLaw MCP로 최종 본칙·시행령까지 재검증한다. (memory `feedback_korean_law_82_vs_81_2_drift`)

### 범위 외 (Out of Scope)
- (1) 신탁이익 §33 (사용자 명시 제외)
- 증여세 신고서식(별지) 신규 재현 — 기존 별지10호 연결만, 의제별 신고서식은 후속
- 법인세 정산·환급 자동연계 (상장이익 §41의3 ④ 환급 등은 안내 표시만)

---

## 2. 아키텍처 설계

### 2.1 핵심 원칙 — "증여이익 산정"과 "세액 계산"의 분리

교재 (2)~(21)은 모두 **증여재산가액(증여이익)이라는 단일 금액**을 산정하는 산식이다.
일단 증여재산가액이 정해지면, 그 이후 흐름(§47② 동일인합산 → §53 공제 → §56 누진세율 → §57 할증 → §58·§69 세액공제)은
**기존 `calcGiftTax` 파이프라인(STEP 0~11)이 이미 100% 처리**한다.

```
[의제별 계산기]  →  증여재산가액(원)  →  [기존 calcGiftTax]  →  최종 증여세액
 (신규 구현)         (단일 숫자)          (재사용, 무변경)
```

따라서 신규 구현의 본체는 **각 의제별 "증여재산가액 계산기"(순수 함수)** 이고,
세액 연결은 산정값을 `GiftTaxInput`에 주입하는 얇은 어댑터다.

> **⚠️ 단발 주입 모델의 한계 (검토 반영)**: 위 "단일 금액 주입" 전제는 **비(非)정산 조문에만 성립**한다.
> **(13) 상장이익 §41의3④·(14) 합병상장 §41의5·(15)③ 사업기회 §45의4③·(20) 일감몰아주기 §45의3③**은
> 본칙이 "증여이익을 **당초의 증여세 과세가액에 가산하여 과세표준·세액을 정산(true-up)**"하거나
> 정산사업연도까지 실제이익으로 재정산하는 구조다(KoreanLaw §41의3④ "당초의 증여세 과세가액에 가산하여 … 정산" 확인).
> 이들은 calcGiftTax 단발 주입으로 표현 불가 → **정산 어댑터 또는 priorGift(§47) 가산 경로 별도 설계**가 필요하며,
> Phase 3에서 정산 메커니즘을 독립 설계한다(§8 R-9). 비정산 조문(나머지)은 단발 주입으로 충분하다.

### 2.2 디렉터리 구조 (신규)

```
lib/tax-engine/gift-deemed/
  index.ts                      # barrel — 모든 계산기 re-export + DeemedGiftType union
  types.ts                      # DeemedGiftInput(discriminated union) + DeemedGiftResult
  router.ts                     # calcDeemedGift(input): type별 계산기 dispatch
  insurance.ts            (2)   §34 보험금
  bargain-transfer.ts     (3)   §35  ← 기존 lib/tax-engine/bargain-transfer.ts 이전·통합
  debt-forgiveness.ts     (4)   §36 채무면제
  free-realestate-use.ts  (5)   §37 부동산무상사용 (5년 현가합)
  free-loan.ts            (6)   §41의4 금전무상대출
  merger.ts               (7)   §38 합병
  capital-increase.ts     (8)   §39 증자
  capital-decrease.ts     (9)   §39의2 감자
  contribution-in-kind.ts (10)  §39의3 현물출자
  convertible-bond.ts     (11)  §40 전환사채
  excess-dividend.ts      (12)  §41의2 초과배당
  listing-gain.ts         (13)  §41의3 상장이익
  merger-listing.ts       (14)  §41의5 합병상장
  value-increase.ts       (15)① §42의3 재산가치증가
  reorganization.ts       (15)② §42의2 조직변경
  business-opportunity.ts (15)③ §45의4 사업기회
  misc-benefit.ts         (15)④ §42① 기타
  presumed-acquisition.ts (17)  §45 취득자금추정
  nominee-trust.ts        (18)  §45의2 명의신탁
  same-transaction-agg.ts (19)  §43② 동일거래 합산 + §43①(19-b) 중복배제 (router.ts에서 호출)
  related-corp-funnel.ts  (20)  §45의3 일감몰아주기
  specific-corp.ts        (21)  §45의5 특정법인거래

lib/tax-engine/data/
  gift-deemed-rates.ts          # 적정이자율(§41의4)·환산율(§37)·정상거래비율(§45의3) 역사 고시값

lib/calc/
  gift-deemed-api.ts            # 폼 → DeemedGiftInput 변환 + 증여이익 → GiftTaxInput 어댑터
  gift-deemed-validate.ts       # validateDeemedStep

components/calc/gift-deemed/     # 독립 페이지 UI
app/calc/gift-deemed/page.tsx    # 신규 진입점
app/api/calc/gift-deemed/route.ts# 신규 API (Zod → calcDeemedGift → 선택적 calcGiftTax)
```

> **800줄 정책**: 각 계산기 1파일 = 1조문. 복잡 조문(증자 §39·전환사채 §40)은 sub-case별 helper 분리(`capital-increase-cases.ts` 등).

### 2.3 계산기 인터페이스 (공통 — `bargain-transfer.ts` 패턴 차용)

```ts
// 모든 계산기는 동일 형태의 Result 반환
interface DeemedGiftResult {
  applied: boolean;            // 과세요건·임계 충족 여부
  deemedGiftValue: number;     // 증여재산가액(원, 정수)
  threshold?: { ... };         // 30%·3억·1억 등 임계 판정 근거 (echo)
  breakdown: CalculationStep[];// 산식 단계별 표시 (formula-display-builder 연동)
  exclusionReason?: string;    // 미적용 사유 (임계 미달·기간만료 등)
  legalBasis: string;          // GIFT_DEEMED.* 법령 상수
}
```

### 2.4 세액 연결 — 기존 증여세 마법사 prefill 이관 (검토 반영)

**신규 `deemed_gift` enum은 만들지 않는다.** `evaluateEstateItem`의 default 분기가 이미
`valuatedAmount: item.marketValue ?? 0`으로 통과시키고(`property-valuation.ts:411-421`),
`resolveEstateItemValue`도 카테고리 무관하게 `marketValue > 0`이면 1순위로 그대로 반환한다
(`valuation/resolve-estate-item-value.ts:135-136`). 따라서 **기존 `category: 'other'` + `marketValue = 증여이익`**으로
재평가 없이 통과된다. (신규 enum 추가 시 부담: ① `estate-item-schema.ts:285` discriminatedUnion 브랜치 ② `COORD_INCOMPATIBLE` 배열
③ `evaluateEstateItem` switch case(누락 시 "기타재산 — 세무사 확인" 경고 오노출) ④ 1771줄 `inheritance-gift.types.ts` — **전부 회피**.)

**세액 연결 방식**: `calcGiftTax`는 `donor`·`donorRelation`·`priorGiftsWithin10Years`·`isGenerationSkip`·`isMinorDonee`·
`deductionInput`·`creditInput`을 **모두 필수**로 요구한다(`property-valuation-input.ts:488-508`, optional 없음).
독립 페이지에서 이들을 다시 입력받으면 중복이므로, **증여이익을 산정한 뒤 기존 증여세 마법사(`GiftTaxForm`)로
`grossGiftValue`를 prefill 이관**한다. 사용자는 마법사에서 증여자관계(§47·§57)·사전증여·공제만 마저 입력 → 세액 산출.

```ts
// 독립 페이지: 증여이익 산정만. "이 금액으로 증여세 계산하기" → 마법사 이관
function toGiftWizardPrefill(deemed: DeemedGiftResult): Partial<FormState> {
  return {
    giftItems: [{ id, name: `${규정명} 증여이익`, category: 'other', marketValue: deemed.deemedGiftValue }],
    // donor·priorGifts·공제·세액공제는 마법사 Step0·2·3에서 사용자 입력
  };
}
```
- 이관 시 IndexedDB 이력(`saveCalculation`)·`sourceCalculationId` 연동은 기존 6세목 마법사 패턴(`lib/storage`) 준수 (§8 R-12).
- 동일인합산(§47②)·세대생략(§57)·공제(§53)는 마법사 입력 → 자동 처리.

---

## 3. 규정별 산식 명세 (PDF 검증 기준)

> 각 산식은 PDF 765~794쪽에서 직접 전사. **Do 단계에서 KoreanLaw MCP로 본칙·시행령 재검증 후 anchor 확정.**

### Phase 1 — 단순 산식 (MVP)

#### (2) 보험금 §34 — `insurance.ts`
> **호 번호는 본칙 §34① 기준** (KoreanLaw 확인 — 교재 PDF ①②와 법문 1호2호 순서가 반대).
- 증여일 = 보험사고 발생일(만기보험금 포함).
- **§34①1호** 수령인 ≠ 납부자(수령인 아닌 자가 보험료 일부 납부 포함):
  `증여재산가액 = 보험금 × (수령인 아닌 자가 납부한 보험료 ÷ 납부보험료총액)`
- **§34①2호** 보험기간에 수령인이 재산을 증여받아 보험료 납부:
  `증여재산가액 = 보험금 × (증여받은 재산으로 납부한 보험료 ÷ 납부보험료총액) − 증여받은 재산으로 납부한 보험료`
- **§34② 배제 가드(필수)**: §8에 따라 보험금을 **상속재산으로 보는 경우 §34 미적용**.
- 입력(설계 정합): `caseType`(1호/2호), `보험금`, `납부보험료총액`, `relevantPremium`(1호=수령인외납부 / 2호=증여재산납부), `isInheritanceInsurance`(§34② §8 게이트). 상세 타입은 engine.design §2(2).
- anchor: 1호 보험금 1억·총보험료 1천만·타인납부 600만 → 6,000만. 2호 동입력 → 5,400만(−600만). (PDF 숫자예제 없음 → 산식기반)

#### (3) 저가양수·고가양도 §35 — `bargain-transfer.ts` (산식 정정 + 이전)
> **본칙 §35①·시행령 §26②③④로 확정** (KoreanLaw):
- **특수관계 §35①**: 적용요건 차액 ≥ MIN(시가×30%, 3억)[§26②] → `증여이익 = 차액 − MIN(시가×30%, 3억)`
- **비특수관계 §35②**: 적용요건 차액 ≥ 시가×30%[§26③] → `증여이익 = 차액 − 3억`[§26④, 고정]
- 차액 = 저가양수 시 (시가−대가), 고가양도 시 (대가−시가).
- **§35② 게이트**: 비특수관계인은 "거래의 관행상 정당한 사유 없는 경우"에 한정.
- 과세제외(§35③·§26①): 전환사채 등(§40), 거래소 상장 시가거래·다자간매매체결, 법인세법 §52② 시가 해당분.
  단서 — 거짓·부정한 방법으로 상증세 감소 시 과세제외 배제(§35③ 단서).
- **🔴 작업 = 산식 정정 + 이전 (단순 이전 금지)**: 기존 `bargain-transfer.ts:114-131`은
  특수관계인 공제를 0으로 두고(`deemedGiftAmount = rawDiff`) 비특수관계인에만 MIN(시가30%,3억)을 공제하는
  **버그**(본칙과 특수/비특수 공제가 뒤바뀜)다. (1) 특수관계인 공제 = MIN(시가30%,3억) 추가,
  (2) 비특수관계인 공제 = 3억 고정으로 정정, (3) 기존 테스트 `property-valuation.test.ts` [T18a] 등
  잘못된 기댓값(특수 차액4억 → `toBe(400_000_000)`, 정답 1억)을 **본칙 정합값으로 재산정**
  (memory `feedback_anchor_correction_legal_priority`). 현재 gift 엔진 미통합이라 실사용 영향 0이나 anchor 오염.

#### (4) 채무면제 §36 — `debt-forgiveness.ts`
- `증여재산가액 = (채무 면제·인수·변제 이익) − 보상액(지급액)`
- 증여시기: 채권자 면제=면제 의사표시일 / 제3자 인수=인수계약 체결일.
- 입력: `면제채무액`, `보상지급액`.

#### (5) 부동산무상사용 §37 — `free-realestate-use.ts`
- **무상사용이익 1억 이상** 시 적용.
- `증여재산가액 = Σ(n=1..5) [ (각 연도 부동산무상사용이익) ÷ (1+10%)^n ]`
- 각 연도 무상사용이익 = `부동산가액 × 2%`, n=5.
- **무상담보 이용**(차입이익 1천만 이상): `증여재산가액 = 차입금 × 4.6% − 실제지급이자`
- 5년 초과 시 5년 되는 날 다음날 새로 개시 (재계산 안내).
- 환산율 2%·할인율 10%·5년 현가계수는 **시행규칙 위임**(상증령 §27③) → `gift-deemed-rates.ts` 상수. ⚠️ `convertLeaseToValue`(÷0.12)는 보증금 환산 전용으로 **부적용**.
- anchor: 부동산가액 13억 → 연 무상이익 2,600만 → 5년 현가합 = 2,600만 × 3.790786769 ≈ **98,560,455** (1억 미만 → **미적용** 경계). 적용 경계는 부동산가액 ≈13.2억(현가합 1억) Do 단계 정밀 산정.

#### (6) 금전무상대출 §41의4 — `free-loan.ts`
- **증여이익(= 대출금액×적정이자율−실제이자) 1천만(시행령 기준금액) 이상** 시 적용(§41의4① 단서).
- `증여재산가액 = (대출금액 × 적정이자율) − 실제지급이자액`
- 적정이자율: **2016.3.7~ 연 4.6%** (그 이전 고시 이력 → `gift-deemed-rates.ts`).
- 대출기간 1년 이상 시 1년 되는 날 다음날 매년 새로(§41의4②). 기간 미정 시 1년으로 봄.
- **§41의4③ 게이트**: 비특수관계인 간 거래는 "거래의 관행상 정당한 사유 없는 경우"에 한정 적용(KoreanLaw 확인). 입력에 `isRelatedParty`·`hasJustifiableReason` 분기.
- anchor: 대출 3억 × 4.6% = 1,380만 (1천만 이상 → 적용) − 무이자 → 1,380만. 경계: 대출 2억×4.6%=920만(<1천만 → 미적용).

#### 공통 인프라 (Phase 1에 포함)
- `app/calc/gift-deemed/page.tsx` 페이지 골격 + 규정 유형 선택 UI
- `DeemedGiftType` union + `router.ts` dispatch
- `gift-deemed/types.ts`·`index.ts`
- `legal-codes/inheritance-gift.ts` GIFT 객체 확장 (`GIFT.INSURANCE` 등 신규 18키, §35·§44 재사용)
- `data/gift-deemed-rates.ts` (이자율·환산율 역사 고시)
- 결과뷰 (`formula-display-builder` 패턴 산식 표시) + "증여세 계산 연결" 버튼
- `app/api/calc/gift-deemed/route.ts` + Zod 스키마
- anchor 테스트 5종

### Phase 2 — 자본거래 주식 (고난도)

#### (7) 합병 §38 — `merger.ts`
- 대주주 요건: 특수관계 합병당사법인 + (① 지분 1% 이상 OR ② 액면 3억 이상).
- **주식교부**: `증여이익 = (① − ②) × 교부받은 주식수`
  - ① 합병후 1주당 평가액 (상장 Min(㉮㉯), 비상장 ㉯)
  - ② 과대평가법인 1주당 평가액 × (합병전 주식수 ÷ 교부주식수)
  - ㉮ 합병등기일~2개월 최종시세 평균, ㉯ (과대평가 합병직전가+과소평가 합병직전가)÷합병후주식수
- **주식 외 재산 교부**: `증여이익 = (액면가액 − 평가가액) × 대주주 주식수`
- 제외: 평가액의 30% 또는 3억 미만.
- 재사용: `evaluateListedStockValue`(상장 평균), `calcWeightedAvgPerShare`(비상장).

#### (8) 증자 §39 — `capital-increase.ts` (+ `-cases.ts`)
- **저가발행** × {실권주 재배정 / 미배정 / 제3자 직접배정·초과배정} × {전환주식}
- **고가발행** × {실권주 재배정 / 미배정 / 제3자}
- 상증령 §29 ②. 30%·3억 기준(미배정·고가). 권리락일 기준.
- 1주당 증자후 평가액 산식: `[(증자전1주평가×증자전주식총수)+(신주인수가×증자주식수)] ÷ (증자전주식총수+증자주식수)`
- **최다 sub-case 조문 → case별 helper 분리 필수.**

#### (9) 감자 §39의2 — `capital-decrease.ts`
- **저가소각**: `증여이익 = (감자주식1주평가 − 소각지급1주금액) × 총감자주식수 × 대주주감자지분비율 × (대주주특수관계인 감자주식 ÷ 총감자주식)`
- **고가소각**: `증여이익 = (소각지급1주금액 − 감자주식1주평가) × 해당주주 감자주식수`
- 제외: MIN(감자주식평가액×30%, 3억) 미달.

#### (10) 현물출자 §39의3 — `contribution-in-kind.ts`
- **저가인수**: `증여이익 = (현물출자후1주평가 − 신주1주인수가) × 배정신주수`
- **고가인수**: `증여이익 = (신주1주인수가 − 현물출자후1주평가) × 인수신주 × 출자전지분비율`
- 고가인수만 30%·3억 한도, 저가인수는 한도 없음.

#### (11) 전환사채 §40 — `convertible-bond.ts` (+ `-cases.ts`)
- ① 저가 인수·취득 (전환사채 시가−인수가 ≥ 시가30% or 1억)
- ② 고가 양도
- ③ 주식전환 초과 / ④ 미달 (1억 이상)
- ⑤ 기타 준용. 이자율 §58의2 (2016.3.21~ 8.0%) → `gift-deemed-rates.ts`.

### Phase 3 — 파생·기타·추정·의제·법인

#### (12) 초과배당 §41의2 — `excess-dividend.ts`
- `초과배당금액 = ① 가액 × ② 비율`. 소득세상당액 공제(누진표 5구간).
- 소득세상당액 누진율 테이블(5,220만 이하 14% ~ 5억 초과 40%) → 데이터 상수.

#### (13) 상장이익 §41의3 — `listing-gain.ts`
- 5년내 상장. `증여이익 = [(정산기준일1주평가 − 증여일1주과세가액) − 1주당 기업가치 실질증가이익] × 주식수`
- 정산기준일 = 상장등록 후 3개월. 30%·3억 기준. 환급 안내.

#### (14) 합병상장 §41의5 — `merger-listing.ts`
- 5년내 합병상장. `이익 = {A−(B+C)} × 주식수`. A=합병등기일1주평가, B=증여/취득1주과세가액, C=1주기업가치실질증가이익. 30%·3억.

#### (15)① 재산가치증가 §42의3 — `value-increase.ts`
- `증여이익 = ① − ② − ③ − ④` (가치증가사유 가액 − 취득가 − 통상가치상승 − 가치상승기여). 3억 또는 30%.

#### (15)② 조직변경 §42의2 — `reorganization.ts`
- 소유지분 변동: `(변동후지분 − 변동전지분) × 지분변동후1주가`
- 평가액 변동: `변동후 − 변동전`. 3억 또는 변동전 재산가액 30%.

#### (15)③ 사업기회 §45의4 — `business-opportunity.ts` (정산 조문)
- 수혜법인 = 지배주주등 주식보유비율 30% 이상 법인(KoreanLaw §45의4① 확인).
- `증여의제이익 = [(개시사업연도 수혜법인이익 × 지분보유비율) − 개시연도 법인세 납부세액 중 상당액] ÷ 개시연도 월수 × 12) × 3` (3년분 연환산).
- 증여시기 = 사업기회제공일이 속하는 개시사업연도 종료일. 지분율은 개시연도 종료일 기준(§45의4④).
- **정산(§45의4③)**: 사업기회제공일 **이후 2년이 지난 날이 속하는 정산사업연도**까지 실제이익 반영 정산증여의제이익 → 당초 세액과 차액 추납/환급. → §2.1 한계·§8 R-9 정산 어댑터 대상.

#### (15)④ 기타 §42① — `misc-benefit.ts`
- (1) 무상 재산사용(1억↑)/용역(1천만↑): 가중평균차입이자율 환산
- (2) 저가 사용·용역 (시가30%↑ 차액)
- (3) 고가 (시가30%↑ 차액)
- (4) 전환사채 자본증감 (1억↑)
- (5) 소유지분/가액 변동 (30%↑ or 3억↑)

#### (17) 재산취득자금추정 §45 — `presumed-acquisition.ts`
- 연령별 기준(30세미만/30↑/40↑ × 주택/기타/채무상환, 총액한도) — 10년내 합계가 기준 미만이면 추정 미적용.
- 자금출처 80% 입증 룰. 미입증액 = 취득자금 − 입증액.
- **배제 판정**: `미입증액 < MIN(취득자금×20%, 2억)` 이면 전액 입증 간주(추정 배제).
- **증여재산가액(추정 시)**: 위 배제 미해당이면 **미입증액 전액**(= 취득자금 − 입증된 자금출처)을 증여받은 것으로 추정 → 증여재산가액. (단, 타인 증여 객관 확인 시 기준 이하라도 과세 — 과세관청 입증)

#### (18) 명의신탁 §45의2 — `nominee-trust.ts`
- `증여재산가액 = 명의개서일(또는 다음연도 말일 다음날) 재산가액`. 조세회피목적 추정.
- 토지·건물 제외. 증여시기 3분기.

#### (19) 동일인·동일거래 합산 §43② (상증령 §32의4) — `same-transaction-agg.ts`
> **본칙 = 상증법 §43②** (KoreanLaw 확인), 시행령 §32의4 = 이익 계산방법. SAME_TX_AGG 상수는 **본칙 병기**.
- 대상 = **§31①2호·§35·§37·§38·§39·§39의2·§39의3·§40·§41의2·§41의4·§42·§45의5** 이익.
  (교재 "11종"은 부정확 — 본칙은 12개 조문, 시행령 §32의4에서 §37①/§37②를 별도 호로 분리 합산.)
- 규칙: 증여일부터 **소급 1년 이내 동일한 거래**가 있으면 각 거래 이익을 **해당 이익별로 합산**하여 금액기준(1억·3억 등) 판정.
- 계산기가 아니라 **다른 계산기 결과를 묶는 합산 규칙** → router 후처리. §37①(무상사용)·§37②(무상담보)는 **별도 호로 분리** 합산.

#### (19-b) 중복적용 배제 §43① — router 후처리 (신규)
> **본칙 = 상증법 §43①** (KoreanLaw 확인).
- 하나의 증여에 §33~§45의5 중 **둘 이상이 동시 적용**되면 **이익이 가장 많게 계산되는 것 하나만 적용**.
- 양도세 §127⑦(유리한=최소 1건)과 **방향 반대** — 증여세 §43①은 **이익 최대 1건**(명문, 납세자 불리 방향이나 명문 준수).
  memory `feedback_127_overlap_exclusion_by_tax` 정신: 세목별 중복배제 조문·방향이 다름. 일괄치환 금지.
- 구현: router에서 한 거래에 성립한 여러 의제 결과 중 `max(deemedGiftValue)` 1건 선택 (후보 배열 max 패턴).

#### (20) 일감몰아주기 §45의3 — `related-corp-funnel.ts` (정산 조문)
- 과세요건(§45의3①1호): **가목** 중소·중견 = 특수관계법인거래비율 > 정상거래비율. **나목** 대기업(중소·중견 외) = 2경로 — 나목1)가목 사유 OR 나목2)거래비율 > 정상거래비율의 **3분의 2** + 특수관계법인 매출액 > 시행령 기준금액.
- `증여의제이익 = 세후영업이익 × (특수관계법인거래비율 − 정상거래비율공제) × (주식보유비율 − 한계보유비율)`
- 중소: 공제 50%·한계 10% / 중견: 20%·5% / 대기업: 5%·(한계 없음). **수치 전부 시행령 §34의3 위임 → KoreanLaw 검증 후 `gift-deemed-rates.ts` 고정(§8 R6).**
- 간접출자(§45의3②) 합산·배당소득공제·**정산증여의제이익(§45의3③)** → §8 R-9 정산 어댑터. **최고난도** — sub-helper 다수. MVP는 직접출자 단일경로, 간접출자 후속.
- anchor: **PDF 숫자예제 직접 사용** — 수혜법인(중소) 세후영업이익 20억, 거래비율 70%, 병(28%) → 20억×(70%−50%)×(28%−10%)=0.72억. 정(13%) → 0.12억. 간접출자 예제: 직접 0.4억·간접 0.072억.

#### (21) 특정법인거래 §45의5 — `specific-corp.ts`
> **🔴 현행법(2026.1.2 시행) 정정**: 특정법인 = **지배주주등 주식보유비율 100분의 30 이상인 법인**
> (KoreanLaw §45의5① 확인). **교재 PDF의 "결손·휴폐업·지배주주 50%↑" 3종 서술은 구 조문**(2019년 이전).
> 증여세는 증여일 현행법 적용이므로 **현행 30%↑ 정의를 기본**으로 하되, 적용 시행일별 분기는 Do 단계에서 확정(§8 R-13).
- 거래유형(§45의5①1~3의2호·④): 무상제공, 현저히 낮은/높은 대가 양도·제공, 불균등 감자 등 자본거래.
- `증여재산가액 = 특정법인의 이익 × 지배주주등 주식보유비율`.
- **한도(§45의5②)**: 지배주주등이 직접 증여받은 경우의 증여세 상당액에서 특정법인이 부담한 법인세 상당액을 뺀 금액 초과분은 없는 것으로 봄.

#### (16) 추정·의제 구분 — UI 설명 카드 (계산 無)
- 증여추정(배우자·직계존비속 양도 §44, 우회양도, 취득자금 §45) vs 증여의제(명의신탁 §45의2 등) 개념 분류 안내.

---

## 4. Phase 계획 · 산출물

| Phase | 규정 | 핵심 산출물 | 의존 |
|---|---|---|---|
| **1 (MVP)** | (2)(3)(4)(5)(6) + 공통 인프라 | 페이지 골격·유형선택·결과뷰·세액연결·legal-codes·이자율데이터·anchor 5 | 없음 |
| **2** | (7)(8)(9)(10)(11) | 자본거래 5종 + 주식평가 재사용·sub-case helper | Phase 1 인프라 |
| **3** | (12)(13)(14)(15①②③④)(17)(18)(19)(20)(21)(16) | 파생·기타·추정·의제·법인 + **§43②합산·§43①중복배제 router 후처리** + **정산 어댑터** | Phase 1·2 |

- **정산 조문((13)§41의3·(14)§41의5·(15)③§45의4·(20)§45의3)**은 Phase 3에서 **정산 어댑터(R-9)** 선설계 후 구현 — 단발 주입 모델로 처리 불가.
- **§43① 중복배제·§43② 합산**은 개별 계산기 완성 후 **router 후처리 레이어**((19)·(19-b))로 마지막에 통합.
- 각 Phase는 독립 PR. Phase 1 완료·검증 후 2·3 착수 (사용자 결정: MVP 먼저).
- 각 Phase Do 진입 전 **Pre-Do anchor 1건 우선 실행**으로 디자인 환류. **Phase 1 첫 게이트 = (3)§35 버그 정정 anchor + `other`+marketValue 통과 probe** (memory `feedback_pre_anchor_verification`).

---

## 5. 공통 인프라

### 5.1 법령 상수 (`legal-codes/inheritance-gift.ts` GIFT 객체 확장)
> **별도 GIFT_DEEMED 객체 신설 대신 기존 `GIFT` 객체에 신규 18개 조문만 추가**(검토 반영).
> §35는 기존 `GIFT.BARGAIN_TRANSFER`(이미 존재), §44는 `GIFT.PRESUMED_GIFT`(이미 존재)를 **재사용**(중복 정의 금지 — 단일 진실).
```ts
// 기존 GIFT 객체에 추가 (BARGAIN_TRANSFER §35·PRESUMED_GIFT §44는 재사용)
  INSURANCE:         "상증법 §34",
  DEBT_FORGIVENESS:  "상증법 §36",
  FREE_REALESTATE:   "상증법 §37",
  MERGER:            "상증법 §38",
  CAPITAL_INCREASE:  "상증법 §39",
  CAPITAL_DECREASE:  "상증법 §39의2",
  CONTRIBUTION:      "상증법 §39의3",
  CONVERTIBLE_BOND:  "상증법 §40",
  EXCESS_DIVIDEND:   "상증법 §41의2",
  LISTING_GAIN:      "상증법 §41의3",
  FREE_LOAN:         "상증법 §41의4",
  MERGER_LISTING:    "상증법 §41의5",
  MISC_BENEFIT:      "상증법 §42①",
  REORGANIZATION:    "상증법 §42의2",
  VALUE_INCREASE:    "상증법 §42의3",
  OVERLAP_EXCLUSION: "상증법 §43①",         // 중복적용 배제 (이익 최대 1건)
  SAME_TX_AGG:       "상증법 §43② · 상증령 §32의4", // 본칙 병기
  PRESUMED_ACQ:      "상증법 §45",
  NOMINEE_TRUST:     "상증법 §45의2",
  RELATED_CORP:      "상증법 §45의3",
  BUSINESS_OPP:      "상증법 §45의4",
  SPECIFIC_CORP:     "상증법 §45의5",
```
> 문자열 리터럴 금지. 모든 인용은 이 상수 경유. (CLAUDE.md 세금 엔진 규칙)
> `inheritance-gift.ts`는 Do 단계에서 800줄 정책 여유 실측 확인 후 추가(현재 GIFT 객체 §31~§59 다수 키 보유 — 초과 시 GIFT_DEEMED 별도 객체 분리 fallback).

### 5.2 역사 고시 데이터 (`data/gift-deemed-rates.ts` 신규)
> **단일 소스 원칙**: §37② 무상담보 차입이익의 적정이자율은 **§41의4와 동일 소스**(상증령 §27⑤가 §31의4①을 명시 인용 — KoreanLaw 확인). 한 상수만 정의해 양쪽이 참조.
- **금전무상대출 적정이자율 §41의4 (= §37② 무상담보)** — 상증령 §31의4①(시행규칙 §10의5 위임): 1999.6.30~ 11% … 2016.3.7~ **4.6%**. PDF (6) 표 전사 + 기재부고시 교차검증.
- **부동산무상사용 환산율 §37①** — 연 2%·할인율 10%·5년 현가계수. **법적 출처 = 시행규칙(재정경제부령)** (상증령 §27③ "재정경제부령으로 정하는 방법" 위임). Do 단계 시행규칙 조문 KoreanLaw 검증 필수.
- **장기채권/전환사채 §58의2(=§40 평가)** (2001~ 7.5% … 2016.3.21~ **8.0%**) — PDF (11) 표 전사.
- **정상거래비율·한계보유비율 §45의3** — 시행령 §34의3 위임 (중소·중견·대기업별). PDF 전사값 → KoreanLaw 시행령 검증 후 고정.
- **초과배당 소득세상당액 누진율 §41의2** (5구간, PDF (12) 표).
- 패턴: `multi-house-surcharge-rate-history.ts`·`securities-transaction-tax-rates.ts` 차용. (memory `feedback_historical_tax_tables`·`feedback_historical_statute_value_via_tribunal`)

### 5.3 재사용 함수 (조사 확정 — 신규 작성 불필요)
| 용도 | 함수 | 경로 |
|---|---|---|
| 정수 세율곱 | `applyRate(amount, rate)` | `tax-utils.ts:42` |
| 오버플로 안전곱 | `safeMultiply` / `safeMultiplyThenDivide` | `tax-utils.ts:90·104` |
| 비율 안분 | `calculateProration(amt, num, den)` | `tax-utils.ts:138` |
| 상장 1주평가 | `evaluateListedStockValue(avg, shares)` | `lib/tax-engine/property-valuation-stock.ts:68` |
| 비상장 가중평균 | `calcWeightedAvgPerShare(NI, NA, w1, w2)` ⚠️**미export** | `lib/tax-engine/stock-transfer/stock-valuation-unlisted.ts:136` — Phase 2 착수 시 **export 승격** 또는 상위 `computeStockValuation` 경유 |
| 순자산/주 | `calcNetAssetPerShare` | `lib/tax-engine/property-valuation/net-asset-calc.ts:102` |
| 통합 주식평가 | `computeStockValuation(item, date?)` (export됨) | `lib/tax-engine/valuation/resolve-estate-item-value.ts:69` |
| 저가고가 판정 | `detectBargainTransfer(input)` 🔴**산식 정정 후** 이전 | `lib/tax-engine/bargain-transfer.ts:67` |
| 세액 연결 | `calcGiftTax(input)` | `lib/tax-engine/gift-tax.ts:70` (무변경) |

> ⚠️ **`convertLeaseToValue`(÷0.12) 재사용 금지**: 보증금→평가액 환산 **전용**(`property-valuation.ts:40`). §37 무상사용(2%·10% 현가)·§42① 기타(가중평균차입이자율)는 **0.12와 무관** — 별도 산식. §37 현가계수·§41의4 이자율은 `gift-deemed-rates.ts`로 일원화.

### 5.4 정수 연산 규칙 (강제)
- 모든 금액 = 원(정수). 세율×금액 직후 `Math.floor()`. `Math.round()` 금지.
- 현가합·안분 등 다단계 곱셈/나눗셈은 `safeMultiplyThenDivide` + BigInt 가드. (memory `feedback_safemul_decimal_apportion_precision`, `feedback_applyrate_fractional_rate_one_won_error`)
- 적정이자율 4.6% 등 분수율은 `floor(x*46/1000)` 정수 연산 (0.046 곱 1원 부족 함정 회피).

---

## 6. UI · 14 동기화 지점

### 6.1 독립 페이지 구조 (`/calc/gift-deemed`)
```
[규정 유형 선택]  RadioCardGroup/Select — 20종 (그룹 헤더: 단순·거래·자본·파생·기타·추정의제·법인)
       ↓
[유형별 전용 입력폼]  선택 규정의 입력 필드만 조건부 렌더 (ToggleCard 색상 카드)
       ↓
[증여이익 결과]  deemedGiftValue + breakdown 산식(formula-display-builder) + 임계 판정 + 미적용 사유
       ↓
[증여세 계산 연결]  "이 금액으로 증여세 계산하기" → 증여이익을 grossGiftValue로 기존 증여세 마법사(GiftTaxForm)에 prefill 이관
                    → 사용자가 Step0(증여자관계)·Step2(사전증여)·Step3(공제) 마저 입력 → calcGiftTax → GiftTaxResultView
```

### 6.2 UI 규칙 준수 (memory 공통 UI)
- 색상 섹션 카드 + 원형 번호 (sky/emerald/amber/violet/rose) — `feedback_section_card_numbering`
- 토글/라디오 `ToggleCard`/`RadioCardGroup` 필수, OFF도 tone 유지 — `feedback_toggle_card_visibility`
- 금액 `CurrencyInput`, 비율·연수 `DecimalInput`, 날짜 `DateInput` — `feedback_decimal_input`·`feedback_date_input`
- 결과 산식 한국어 풀어쓰기, 변수 약어·`floor()` 금지 — `feedback_result_view_korean_formula`
- 숫자 끝 "원" 생략 / 금액칼럼 우측정렬 font-mono — `feedback_no_won_suffix` · `amount-column-align`
- placeholder 숫자 예시 금지 → FieldCard `hint` — CLAUDE.md
- 법조문 배지 `LawArticleModal` 연결 — `feedback_law_article_link`

### 6.3 14 동기화 지점 (의제 유형마다)
①폼 상태 → ②initial → ③normalize → ④API변환(`gift-deemed-api.ts`) → ⑤UI 위젯 → ⑥결과 산식 → ⑦결과 카드 → ⑧validation → ⑨⑩Zod enum(메인+유형별) → ⑪자산-수준 N/A → ⑫Zod 입력객체(discriminatedUnion) → ⑬fetch body → ⑭Route 엔진 input 매핑.
> ⑫⑬⑭ TypeScript 미감지 → grep 자가점검 필수. (memory `feedback_api_zod_schema_sync`)
> **⑭ Date 변환 N/A (검토 반영)**: 증여세 파이프라인은 `YYYY-MM-DD` **문자열을 끝까지 사용**한다. `giftTaxInputSchema`는 `giftDate`를 `z.string().regex(...)`로 받고 `route.ts`는 `coerceDates` 없이 직접 캐스팅(`property-valuation-input.ts:487`, `app/api/calc/gift/route.ts:64`). gift-deemed도 **문자열 날짜 regex 검증만** — `date-coerce` 단계 없음(양도세 Date 패턴과 다름).
> **⑧ validation 패턴 (검토 반영)**: `lib/calc/gift-validate.ts`는 **존재하지 않음** — 증여세는 별도 validate 모듈 없이 **Zod `superRefine` + 폼 내 `validateStep`**에 의존. gift-deemed validate도 동일하게 Zod superRefine 중심으로 작성(`property-valuation-input.ts:515-563` 특례자산 superRefine 패턴 차용).
> discriminatedUnion으로 유형별 입력 분기 — 선택 규정 필드만 required (superRefine). (memory `feedback_three_state_optional_mode_toggle`)

---

## 7. 테스트 전략 — 산식 기반 anchor 자체 구성

- 각 규정 `__tests__/tax-engine/gift-deemed/{규정}-anchor.test.ts` 1파일.
- **anchor 구성 절차** (memory `feedback_anchor_correction_legal_priority`):
  1. KoreanLaw MCP로 산식·임계(30%·3억·1억)·이자율·환산율을 **본칙·시행령까지 검증**.
  2. 검증된 산식으로 입력값 설계 → 손계산 기댓값 → 원단위 `toBe()`.
  3. **경계값 필수**: 임계 미달(미적용) / 임계 충족(적용) 양쪽.
  4. PDF 숫자 예제 존재 규정((20) 일감몰아주기 0.72억·0.12억, 간접출자 0.4억·0.072억)은 **PDF값 직접 anchor**.
- **Pre-Do anchor**: 각 Phase 진입 전 대표 1건 우선 실행 → 실패 확보 → 디자인 환류.
- 회귀: `npm test` 전체 + `npx vitest run __tests__/tax-engine/gift-deemed/`.
- E2E: `e2e/gift-deemed-*.spec.ts` (페이지 진입 → 유형선택 → 입력 → 증여이익 → 세액연결). (memory `feedback_browser_verify_with_playwright`)

---

## 8. 리스크 · 미결정 · 법령 검증 필요 항목

| # | 항목 | 처리 |
|---|---|---|
| R1 | **§39 증자·§40 전환사채 sub-case 폭발** | case별 helper 분리. Phase 2에서 케이스 매트릭스 전수 enumerate 후 착수 (memory `feedback_ui_input_path_enumeration`) |
| R2 | **상장 1주평가 = 키움 자동조회 의존** | 합병·상장이익은 종가평균 입력 필요 → 키움 위젯 재사용 vs 수동입력 fallback 결정 (Phase 2) |
| R3 | **§45의3 일감몰아주기 = 법인세 데이터 광범위** | 세후영업이익·과세제외매출·간접출자 — 입력 부담 큼. MVP는 직접출자 단일경로, 간접출자 후속 |
| R4 | **(19)·(19-b) 합산·중복배제 = 후처리** | 계산기 아님 → router 후처리. 상세는 R11 참조(§43②합산·§43①중복배제). Phase 3 마지막 통합 |
| R5 | **`other` 카테고리 재사용 확정** | ✅ §2.4서 `deemed_gift` enum 폐기·`category:'other'`+marketValue 통과 확정. Phase 1 Pre-Do는 **§22 금융재산공제 비대상 분기 충돌 없음만 probe**(`other`는 금융재산공제 대상 아님 → 영향 없을 것, 실증) |
| R6 | **이자율·환산율 고시 정확성** | `gift-deemed-rates.ts`는 PDF 표 전사 후 KoreanLaw·기재부고시 교차검증 (memory `feedback_historical_statute_value_via_tribunal`) |
| R7 | **2-스트림(조특법 특례)와의 상호작용** | 의제 증여이익은 일반 스트림만 (특례 대상 아님). 명시 가드 |
| R8 | **임계의 조문별·항별 차이** | 규정마다 상이(§35① MIN(30%,3억) / §35② 적용 30%·공제 3억 / §37 1억 / §41의4 1천만 / §40 30%·1억). **같은 조문 내 ①②항 적용임계 vs 공제액이 또 다름**(§35). 규정·항별 상수 분리, 일괄치환 금지 (memory `feedback_127_overlap_exclusion_by_tax`) |
| **R9** | **정산(true-up) 구조 — 단발 주입 불가** | (13)§41의3④·(14)§41의5·(15)③§45의4③·(20)§45의3③은 "당초 과세가액 가산·정산"·"정산사업연도 재정산" 구조. calcGiftTax 단발 주입으로 표현 불가 → **Phase 3에서 정산 어댑터/priorGift 가산 경로 별도 설계**. §2.1 한계 참조 |
| **R10** | **🔴 기존 §35 `bargain-transfer.ts` 산식 버그** | 특수관계인 공제 누락 + 특수/비특수 공제 역전. "이전"이 아니라 **산식 정정 + 기존 테스트([T18a] 등) 기댓값 본칙 정합값으로 재산정**. Pre-Do anchor로 우선 실증 (memory `feedback_anchor_correction_legal_priority`) |
| **R11** | **§43① 중복배제 + §43② 합산** | §43①(둘 이상 동시→이익 최대 1건, **§127⑦과 방향 반대**) + §43②(소급 1년 동일거래 이익별 합산). 둘 다 **router 후처리**. 계산기 개별 산정 후 묶는 레이어. §37①/§37② 분리 합산 주의 |
| **R12** | **결과→마법사 이력 이관** | 독립 페이지 증여이익 → 마법사 prefill 시 IndexedDB(`saveCalculation`)·`sourceCalculationId` 연동을 기존 6세목 패턴(`lib/storage`) 준수. 이중 저장 방지 |
| **R13** | **§45의5 적용 시행일 분기** | 현행=지배주주등 30%↑ 법인. 교재 "결손·휴폐업·50%"는 구 조문. 증여일 현행법 적용 기본, 과거 증여 시점 분기는 Do 단계 확정 |
| **R14** | **자본거래 소액주주 의제(§39②)** | 증여자 측 소액주주 2명 이상 = 1명으로부터 이익 의제(§38②·§39②·§39의3 준용). (7)~(10) 케이스에 반영 |
| **R15** | **'정당한 사유' 게이트 + 부정행위 예외** | §35②·§37③·§41의4③ 등 비특수관계인은 "거래관행상 정당한 사유 없는 경우 한정". 부정행위 시 비특수관계인에도 적용·기간규정 배제(§35③ 단서). 케이스 분기에 게이트 추가 |

---

## 9. Definition of Done (Phase 공통)

- [ ] 케이스 매트릭스 표 — 규정별 모든 분기(적용/미적용·특수/비특수·저가/고가) enumerate
- [ ] Pre-Do anchor 1건 우선 실행 → 실패 확보 → 디자인 환류
- [ ] 계산기 순수함수 + `router.ts` dispatch + barrel export
- [ ] `legal-codes/inheritance-gift.ts` GIFT 상수 경유 (리터럴 0)
- [ ] 14 동기화 지점 전부 (⑫⑬⑭ grep 자가점검)
- [ ] API fallback ↔ validation 동기화 (3중 패턴)
- [ ] 세액 연결 어댑터 + `calcGiftTax` 무변경 확인
- [ ] `npx tsc --noEmit` 0건 / `npm run lint` 0건
- [ ] `npx vitest run __tests__/tax-engine/gift-deemed/` 통과 + `npm test` 전체 회귀
- [ ] anchor: 임계 경계 양쪽 + (가능 시) PDF 숫자 예제
- [ ] E2E spec 통과 (페이지→유형선택→입력→증여이익→세액연결)
- [ ] KoreanLaw MCP 산식·이자율·임계 본칙 검증 기록

---

## 10. 다음 단계

1. ✅ **본 계획서 자가 검토 완료** (아키텍처·완전성 병렬 검토 + KoreanLaw 법령 검증 — §11 이력)
2. Phase 1 **engine.design.md** + **ui.design.md** 작성 (엔진·UI 시니어 병렬, 케이스 매트릭스 동결)
3. Phase 1 Pre-Do anchor 실행 → 환류 (**(3)§35 버그 정정 anchor + `other` 통과 probe 우선**)
4. Phase 1 Do (단일 응답 완주) → Check(ui-engine-sync-checker + gap-detector) → PR
5. Phase 2·3 순차

---

## 11. 검토 반영 이력 (v2 — 2026-06-18)

작성 직후 **아키텍처·완전성 2관점 병렬 검토 + KoreanLaw MCP 본칙 검증**을 수행해 다음을 반영했다(전부 실측 근거).

**KoreanLaw 본칙 검증 (직접)** — §34·§35·§37·§38·§41의4·§43·§45의3·§45의4·§45의5 + 시행령 §26 조회:
- 🔴 **(21) §45의5**: 현행 특정법인 = "지배주주등 30%↑ 법인" (교재 "결손·휴폐업·50%"는 구 조문) → 정정
- **(3) §35**: 본칙①·시행령§26②③④로 특수=차액−MIN(30%,3억)·비특수=차액−3억 확정
- **(2) §34**: 법문 호 순서 교재와 반대 + §34② §8 상속재산 배제 → 정정
- **(19) §43②·(19-b) §43①**: 동일거래 합산 본칙 §43② 병기, 중복배제 §43①(이익 최대 1건) 신규
- **(15)③ §45의4**: 2년 후 정산 정정

**아키텍처 검토 반영**:
- 🔴 **§35 기존 `bargain-transfer.ts` 산식 버그** 확정(특수/비특수 공제 역전) → "이전"→"정정+테스트 재산정"(R10)
- **정산(true-up) 구조** 한계 식별 → §2.1 한정 + R9 (§41의3·§41의5·§45의4·§45의3)
- **`deemed_gift` enum 폐기** → `other`+marketValue 재사용(평가 통과 확인, 4지점 부담 회피)
- **세액 연결** = 기존 마법사 prefill 이관(필수입력 7종 중복 회피)
- **⑭ date-coerce N/A**(증여세 문자열 날짜) / **⑧ gift-validate.ts 부재**(superRefine 의존)
- `calcWeightedAvgPerShare` 미export·`convertLeaseToValue` 오재사용·GIFT 상수 중복 → §5 정정
- 누락 보강: §39② 소액주주 의제(R14)·정당사유 게이트(R15)·이력 이관(R12)·§37①/② 분리 합산

> 잔여 "확인 필요"(Do 단계 KoreanLaw 검증): §37 시행규칙 환산율 조문·§45의3 시행령 §34의3 비율·§43① 정확 적용범위·각 자본거래 시행령 산식.
