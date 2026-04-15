# 취득세 계산기 개발 계획 (Acquisition Tax)

> 작성일: 2026-04-15 | Phase 2 (v1.1) 대상
> 담당 에이전트: 6개 전문 에이전트 공동 작업
> 설계 문서: `docs/02-design/features/korean-tax-calc-engine.design.md`
> 법령 기준: 지방세법 제6조~제20조, 지방세특례제한법 제36조의3

---

## 1. 전체 구조 및 에이전트 책임 분담

```
┌─────────────────────────────────────────────────────────────────┐
│                     취득세 계산기 전체 흐름                        │
│                                                                 │
│  입력 → [과세대상 판정] → [과세표준 결정] → [세율 결정] → [중과판정]  │
│          object-senior   base-senior      rate-senior  surcharge│
│                ↓               ↓                               │
│         [시가표준액 산정]   [표준가격 적용]                         │
│          standard-price   standard-price                        │
│                                                                 │
│                    ↓ 모두 취합                                    │
│              [acquisition-tax.ts 메인 엔진]                      │
│                    acquisition-tax-senior                       │
│                         ↓                                       │
│              [API Route] → [UI 폼] → [결과 화면]                  │
└─────────────────────────────────────────────────────────────────┘
```

### 에이전트별 담당 영역

| 에이전트 | 담당 파일 | 핵심 역할 |
|---------|---------|---------|
| `acquisition-tax-senior` | `acquisition-tax.ts`, API, UI | 메인 엔진 통합·조율, API/UI |
| `acquisition-tax-object-senior` | `acquisition-object.ts`, `acquisition-deemed.ts`, `acquisition-timing.ts` | 과세 대상 8종 판정, 간주취득 3종, 취득 시기 |
| `acquisition-tax-base-senior` | `acquisition-tax-base.ts` | 과세표준 결정 (사실상취득가·시가인정액·시가표준액, 부담부증여, 연부취득) |
| `acquisition-tax-rate-senior` | `acquisition-tax-rate.ts`, DB 시딩 SQL | 세율 결정 (선형보간 포함), 부가세, DB 세율 매트릭스 |
| `acquisition-tax-standard-price-senior` | `acquisition-standard-price.ts` | 시가표준액 산정 (주택공시가·개별공시지가·건물기준시가) |
| `acquisition-tax-surcharge-senior` | `acquisition-tax-surcharge.ts` | 중과세 판정 (다주택·법인·사치성 재산), 중과 배제·유예 |

---

## 2. 생성할 파일 목록

### 2.1 엔진 레이어 (lib/tax-engine/)

```
lib/tax-engine/
├── types/
│   └── acquisition.types.ts              ← 공유 타입 정의 (전 에이전트 공통)
├── acquisition-object.ts                 ← 과세 대상 8종 판정 + 비과세 확인
├── acquisition-deemed.ts                 ← 간주취득 3종 (과점주주·지목변경·개수)
├── acquisition-timing.ts                 ← 취득 시기 확정 (원인별 기준)
├── acquisition-standard-price.ts         ← 시가표준액 산정 (물건유형별)
├── acquisition-tax-base.ts               ← 과세표준 결정 (사실상가격·특수관계인·부담부증여)
├── acquisition-tax-rate.ts               ← 세율 결정 (선형보간 포함) + 부가세
├── acquisition-tax-surcharge.ts          ← 중과세 판정 + 생애최초 감면
└── acquisition-tax.ts                    ← 메인 통합 엔진 (Pure Engine)
```

### 2.2 검증 레이어

```
lib/validators/
└── acquisition-input.ts                  ← Zod 입력 스키마 (Route Handler용)
```

### 2.3 API 레이어

```
app/api/calc/acquisition/
└── route.ts                              ← Orchestrator (세율 로드 + 엔진 호출)
```

### 2.4 UI 레이어

```
components/calc/
├── AcquisitionTaxForm.tsx                ← StepWizard 기반 입력 폼
├── AcquisitionSurchargeDetailCard.tsx    ← 중과세 판정 상세 카드
└── results/
    └── AcquisitionTaxResultView.tsx      ← 결과 화면 (세액 분해 표시)

app/calc/acquisition-tax/
└── page.tsx                              ← 취득세 계산기 페이지 (기존 스켈레톤 교체)
```

### 2.5 DB 시딩

```
supabase/seeds/
└── acquisition_rates_seed.sql            ← 세율 매트릭스 + 중과세 + 감면 시딩
```

### 2.6 테스트

```
__tests__/tax-engine/
├── acquisition-object.test.ts            ← 과세 대상 판정 테스트
├── acquisition-standard-price.test.ts   ← 시가표준액 산정 테스트
├── acquisition-tax-base.test.ts          ← 과세표준 결정 테스트
├── acquisition-tax-rate.test.ts          ← 세율 결정 테스트 (선형보간 경계값 집중)
├── acquisition-tax-surcharge.test.ts     ← 중과세 판정 테스트
└── acquisition-tax.test.ts               ← 통합 엔진 테스트
```

---

## 3. 세부 작업 목록 (Task Breakdown)

### Phase A — 기반 준비 [acquisition-tax-rate-senior 주도]

#### A-1. 공유 타입 정의
- **파일**: `lib/tax-engine/types/acquisition.types.ts`
- **내용**:
  - `PropertyObjectType`: 과세 대상 물건 8종 유니온 타입
  - `AcquisitionCause`: 취득 원인 15종 (유상/무상/원시/간주)
  - `AcquisitionTaxInput`: 메인 엔진 입력 타입 (전 모듈 공통)
  - `AcquisitionTaxResult`: 결과 타입 (세액 분해 + 경고 + 법령 조문)
  - `TaxBaseMethod`: 과세표준 결정 방식 유니온
  - `TaxRateDecision`: 세율 결정 결과 타입
  - `SurchargeDecision`: 중과세 판정 결과 타입
- **담당**: acquisition-tax-rate-senior
- **의존**: 없음 (최우선 작성)

#### A-2. legal-codes.ts 상수 확장
- **파일**: `lib/tax-engine/legal-codes.ts` (기존 파일 수정)
- **추가 내용**:
  ```typescript
  export const ACQUISITION = {
    // 과세 대상 (§7)
    TAXABLE_OBJECTS: '지방세법 제7조',
    DEEMED_ACQUISITION: '지방세법 제7조의2',
    // 과세표준 (§10~§10의5)
    TAX_BASE: '지방세법 제10조',
    RELATED_PARTY: '지방세법 제10조의2',
    STANDARD_VALUE: '지방세법 제10조의3',
    BURDENED_GIFT: '지방세법 제10조의4',
    INSTALLMENT: '지방세법 제10조의5',
    // 세율 (§11~§13의2)
    BASIC_RATE: '지방세법 제11조',
    LINEAR_RATE: '지방세법 제11조 제1항 제1호의2',
    SURCHARGE: '지방세법 제13조',
    CORP_SURCHARGE: '지방세법 제13조의2',
    // 취득 시기 (§20)
    ACQUISITION_TIMING: '지방세법 제20조',
    // 생애최초 감면
    FIRST_HOME_REDUCTION: '지방세특례제한법 제36조의3',
  } as const;

  export const TAX_BASE_CONST = {
    RELATED_PARTY_MIN_RATIO: 0.70,
    RELATED_PARTY_MAX_RATIO: 1.30,
    TRUNCATION_UNIT: 1000,
  } as const;

  export const SURCHARGE_RATE = {
    REGULATED_2HOUSE: 0.08,
    REGULATED_3HOUSE_PLUS: 0.12,
    CORPORATE: 0.12,
    FIRST_HOME_MAX_REDUCTION: 2_000_000,
  } as const;
  ```
- **담당**: acquisition-tax-rate-senior
- **의존**: A-1

#### A-3. DB 세율 시딩
- **파일**: `supabase/seeds/acquisition_rates_seed.sql`
- **내용**:
  - 주택 유상취득 세율 브래킷 (6억 이하 1%, 선형보간, 9억 초과 3%)
  - 농지 포함 토지·건물 세율 (농지 상속 2.3% 별도)
  - 취득 원인별 세율 (상속 2.8%, 증여 3.5%, 원시취득 2.8%)
  - 중과세율 (조정지역 2주택 8%, 3주택+ 12%, 법인 12%)
  - 농어촌특별세 규칙 (표준세율 2% 초과분 × 10%, 85㎡ 이하 면제)
  - 지방교육세 규칙 (표준세율 2% 기준 취득세액 × 20%)
  - 생애최초 감면 규칙 (200만원 한도, 수도권 4억/비수도권 3억)
  - 시가표준액 건물 잔가율 테이블 (경과연수별)
  - 구조지수·용도지수 매핑
- **담당**: acquisition-tax-rate-senior
- **의존**: A-1

---

### Phase B — 과세 대상 및 시가표준액 모듈 [object-senior + standard-price-senior 병렬 작업]

#### B-1. 과세 대상 판정 모듈
- **파일**: `lib/tax-engine/acquisition-object.ts`
- **핵심 함수**:
  - `checkAcquisitionObject(input)` — 8종 물건 해당 여부 + 비과세 사유 확인
  - `checkAcquisitionTaxExemption(input)` — 비과세 6종 판정 (정부취득·신탁반환 등)
- **테스트**: `__tests__/tax-engine/acquisition-object.test.ts`
  - 8종 물건 각각 과세 대상 확인
  - 비과세 사유별 면제 확인
  - 과세 대상 아닌 경우 (열거 외 물건) 확인
- **담당**: acquisition-tax-object-senior
- **의존**: A-1, A-2

#### B-2. 간주취득 판정 모듈
- **파일**: `lib/tax-engine/acquisition-deemed.ts`
- **핵심 함수**:
  - `calcDeemedMajorShareholder(input)` — 과점주주 간주취득 과세표준 계산
  - `calcDeemedLandCategoryChange(input)` — 지목변경 간주취득 차액
  - `calcDeemedRenovation(input)` — 건물 개수 간주취득 차액
- **주요 로직**:
  - 과점주주 50% 초과 판단 (직·간접 지분, 특수관계인 합산)
  - 상장법인 주식 취득 비과세 처리
  - 이미 과점주주인 경우 증가분만 과세
- **테스트**: 과점주주 신규/증가 케이스, 상장법인 비과세, 지목변경 음수 차액
- **담당**: acquisition-tax-object-senior
- **의존**: A-1, A-2

#### B-3. 취득 시기 확정 모듈
- **파일**: `lib/tax-engine/acquisition-timing.ts`
- **핵심 함수**:
  - `determineAcquisitionDate(input)` — 취득 원인별 취득일 결정
  - `calcFilingDeadline(acquisitionDate, cause)` — 신고 기한 (60일/6개월)
- **원인별 기준**:
  - 매매·교환·경매: `min(잔금지급일, 등기접수일)`
  - 상속: 상속개시일 (피상속인 사망일)
  - 증여: 계약일 (증여계약서 작성일)
  - 신축·증축·개축: 사용승인서 발급일 (임시사용승인 포함)
  - 공유수면 매립: 준공인가일
  - 과점주주: 과점주주 요건 충족일
  - 지목변경: 사실상 완료일
- **담당**: acquisition-tax-object-senior
- **의존**: A-1, A-2

#### B-4. 시가표준액 산정 모듈
- **파일**: `lib/tax-engine/acquisition-standard-price.ts`
- **핵심 함수**:
  - `calcStandardPrice(input)` — 물건 유형별 시가표준액 계산
  - `getDepreciationRate(elapsedYears)` — 경과연수별 잔가율
  - `determineTaxBase(input)` — 취득 원인별 과세표준 결정 (standard-price 담당 버전)
- **물건 유형별 산정**:
  - 주택: 주택공시가격 직접 사용
  - 토지: 개별공시지가(원/㎡) × 면적(㎡)
  - 건물: 신축가격기준액 × 구조지수 × 용도지수 × 위치지수 × 잔가율 × 연면적
- **테스트**: `__tests__/tax-engine/acquisition-standard-price.test.ts`
  - 주택·토지·건물 각각 시가표준액 계산
  - 잔가율 경계값 (1년, 10년, 30년+)
  - 간주취득 차액 음수 처리
- **담당**: acquisition-tax-standard-price-senior
- **의존**: A-1, A-2, A-3 (DB 잔가율 테이블)

---

### Phase C — 과세표준 및 세율 모듈 [base-senior + rate-senior 순차 작업]

#### C-1. 과세표준 결정 모듈
- **파일**: `lib/tax-engine/acquisition-tax-base.ts`
- **핵심 함수**:
  - `determineTaxBase(input): TaxBaseResult` — 메인 과세표준 결정
  - `isNormalRelatedPartyPrice(reportedPrice, marketValue)` — 특수관계인 정상가격 범위 (70%~130%)
  - `calculateBurdenedGiftTaxBase(input)` — 부담부증여 유상/무상 분리
  - `calcInstallmentTaxBase(installments)` — 연부취득 회차별 과세표준
  - `calcLumpSumAllotment(input)` — 일괄취득(토지+건물) 안분 계산
- **결정 우선순위**:
  ```
  1. 부담부증여 → 유상(채무)/무상(초과분) 분리
  2. 특수관계인 + 비정상 가격(70% 미만 or 130% 초과) → 시가인정액
  3. 유상취득 → 사실상취득가격
  4. 무상취득(상속·증여) → 시가인정액 → 시가표준액
  5. 원시취득 → 공사비 → 시가표준액
  ```
- **테스트**: `__tests__/tax-engine/acquisition-tax-base.test.ts`
  - 일반 매매 → 신고가액 적용 + 천원 미만 절사
  - 특수관계인 정상범위(80%) → 신고가액 유지
  - 특수관계인 비정상(60%) → 시가인정액 적용
  - 부담부증여: 채무 4억/총 10억 → 유상 4억 + 무상 6억
  - 부담부증여: 채무 > 취득가액 → 취득가액 한도 + 경고
  - 상속 → 시가표준액 적용
  - 연부취득 → 회차별 개별 계산
- **담당**: acquisition-tax-base-senior
- **의존**: A-1, A-2, B-4

#### C-2. 세율 결정 모듈 + 부가세
- **파일**: `lib/tax-engine/acquisition-tax-rate.ts`
- **핵심 함수**:
  - `linearInterpolationRate(acquisitionValue)` — 주택 6억~9억 선형보간 (BigInt 정밀 계산)
  - `calcLinearInterpolationTax(acquisitionValue)` — 선형보간 세액
  - `determineTaxRate(input, ratesMap)` — 세율 결정 통합 함수
  - `calcAdditionalTaxes(acquisitionValue, appliedRate, areaSqm?)` — 농특세 + 지방교육세
- **세율 결정 우선순위**:
  ```
  1. 법인 주택 → 12% (최우선)
  2. 사치성 재산 → 기본세율 + 중과분
  3. 상속·증여·원시취득 → 고정세율
  4. 조정대상지역 다주택 → 8% or 12%
  5. 주택 매매 → 금액 구간별 (1%/선형보간/3%)
  6. 토지·건물 → 4%
  ```
- **선형보간 정밀 계산**:
  ```typescript
  // (취득가액 × 2n - 900_000_000n) / 30_000_000_000n
  // 소수점 5자리 유지, 세액 계산 시 Math.floor()
  ```
- **부가세 계산**:
  - 농특세: `(appliedRate - 0.02) × acquisitionValue × 0.1` (음수이면 0, 85㎡ 이하 면제)
  - 지방교육세: `acquisitionValue × 0.02 × 0.2` (중과세에도 표준세율 기준)
- **테스트**: `__tests__/tax-engine/acquisition-tax-rate.test.ts`
  - 선형보간 경계값 6종: 6억 정확히/6억+1원/7억/7.5억/9억-1원/9억 정확히
  - 취득 원인별: 상속(2.8%)/농지상속(2.3%)/증여(3.5%)/원시취득(2.8%)
  - 중과세: 조정지역2주택(8%)/3주택+(12%)/법인(12%)
  - 비조정지역 다주택 → 기본세율 유지
  - 부가세: 85㎡이하 농특세 0원, 세율1% 농특세 0원, 세율3% 농특세 계산
  - 지방교육세: 중과세에도 표준세율 기준 계산
- **담당**: acquisition-tax-rate-senior
- **의존**: A-1, A-2, A-3

---

### Phase D — 중과세 모듈 [acquisition-tax-surcharge-senior]

#### D-1. 중과세 판정 모듈
- **파일**: `lib/tax-engine/acquisition-tax-surcharge.ts`
- **핵심 함수**:
  - `determineSurcharge(input, regulatedAreaHistory, specialRules)` — 중과세율 판정
  - `calcHouseCountForSurcharge(houseInfo[])` — 취득 후 주택 수 산정 (시행령 §28의2)
  - `checkSurchargeException(input)` — 중과 배제·유예 확인 (시가표준액 1억 이하 등)
  - `checkFirstHomeReduction(input)` — 생애최초 주택 감면 판정
  - `calcFirstHomeReductionAmount(acquisitionTax)` — 감면액 계산 (200만원 한도)
- **중과세 판정 흐름**:
  ```
  입력: 취득자 유형(개인/법인) + 조정대상지역 여부 + 취득 후 주택 수 + 물건 유형
  ↓
  1. 법인 여부 확인 → YES: 12% 중과 (예외법인 체크 선행)
  2. 사치성 재산 여부 (별장·골프장·고급주택 기준 확인)
  3. 조정대상지역 여부 (취득일 기준 DB 조회 결과 사용)
  4. 중과 배제 예외 확인 (시가표준액 1억 이하, 인구감소지역 등)
  5. 취득 후 주택 수 → 2주택: 8%, 3주택+: 12%
  6. 생애최초 주택 감면 (무주택·소득 요건 + 200만원 한도)
  ```
- **고급주택 기준** (지방세법 시행령 §28의5):
  - 단독주택: 취득가액 9억 초과
  - 공동주택: 취득가액 9억 초과
  - 단독주택 면적 기준: 연면적 331㎡ 초과 + 부속토지 포함 취득가액 9억 초과
- **생애최초 감면**:
  - 조건: 본인·배우자 모두 주택 미보유 + 소득요건
  - 대상: 수도권 4억 이하, 비수도권 3억 이하
  - 감면: 취득세액 × 100% (상한 200만원)
  - 추징: 3개월 내 미전입, 3년 내 매도·임대 시
- **테스트**: `__tests__/tax-engine/acquisition-tax-surcharge.test.ts`
  - 법인 주택 취득 → 12% (조정지역 무관)
  - 법인 예외 (주택건설사업자 분양주택) → 중과 미적용
  - 조정지역 2주택 → 8%
  - 조정지역 3주택+ → 12%
  - 비조정지역 다주택 → 기본세율
  - 시가표준액 1억 이하 → 중과 배제
  - 생애최초 감면: 1억 세액 → 200만원 감면 (한도 적용)
  - 생애최초 감면: 세액 150만원 → 150만원 감면 (전액)
  - 추징 요건 경고 안내 포함
- **담당**: acquisition-tax-surcharge-senior
- **의존**: A-1, A-2, C-2

---

### Phase E — 메인 엔진 통합 [acquisition-tax-senior]

#### E-1. 메인 계산 엔진
- **파일**: `lib/tax-engine/acquisition-tax.ts`
- **핵심 함수**:
  - `calculateAcquisitionTax(input, ratesMap, regulatedAreaHistory): AcquisitionTaxResult`
- **통합 흐름**:
  ```
  1. checkAcquisitionObject()     ← B-1 호출
  2. determineAcquisitionDate()   ← B-3 호출
  3. determineTaxBase()           ← C-1 호출
     ├── calcStandardPrice()      ← B-4 호출 (시가표준액 필요 시)
  4. determineSurcharge()         ← D-1 호출 (중과 판정)
  5. determineTaxRate()           ← C-2 호출
  6. calcAdditionalTaxes()        ← C-2 호출 (농특세+지방교육세)
  7. 부담부증여 분리: 유상(매매세율) + 무상(증여세율) 별도 계산 후 합산
  8. 생애최초 감면 적용 (checkFirstHomeReduction → 감면액 차감)
  9. 결과 반환 (AcquisitionTaxResult)
  ```
- **반환 타입** (AcquisitionTaxResult):
  ```typescript
  {
    // 입력 요약
    propertyType, acquisitionCause, acquisitionValue,
    // 과세표준
    taxBase, taxBaseMethod,
    // 세율
    appliedRate, rateType, isSurcharged, surchargeReason?,
    // 세액
    acquisitionTax,           // 취득세 본세
    ruralSpecialTax,          // 농어촌특별세
    localEducationTax,        // 지방교육세
    totalTax,                 // 총 납부세액
    // 감면
    reductionType?, reductionAmount,
    totalTaxAfterReduction,   // 감면 후 최종 납부세액
    // 부담부증여 분리 (해당 시)
    breakdown?: { onerousTax, gratuitousTax },
    // 메타
    acquisitionDate, filingDeadline,
    appliedLawDate,
    warnings,
    legalBasis[],
  }
  ```
- **담당**: acquisition-tax-senior
- **의존**: B-1~B-4, C-1~C-2, D-1 모두

#### E-2. 통합 테스트
- **파일**: `__tests__/tax-engine/acquisition-tax.test.ts`
- **필수 케이스**:
  - 주택 매매 5억 (1%): 취득세 + 농특세 0원 + 지방교육세
  - 주택 매매 7억 (선형보간): 전체 세액 계산
  - 주택 매매 12억 (3%): 전체 세액 계산
  - 조정지역 2주택 매매 7억 (8%): 중과 + 부가세
  - 조정지역 3주택+ 매매 10억 (12%): 중과 + 부가세
  - 법인 주택 취득 (12%): 조정지역 무관 중과
  - 주택 상속 (2.8%): 시가표준액 기준
  - 농지 상속 (2.3%): 농지 특례
  - 주택 증여 (3.5%): 시가인정액 또는 시가표준액
  - 부담부증여: 유상/무상 분리 계산
  - 생애최초 주택 감면: 200만원 한도 적용
  - 생애최초 주택 감면: 소규모 세액 전액 감면
  - 연부취득: 회차별 세액
  - 간주취득(과점주주): 과세표준 계산
  - 간주취득(지목변경): 차액 기준 과세
  - 비과세 사유: 정부 취득 등
- **담당**: acquisition-tax-senior
- **의존**: E-1

---

### Phase F — API 레이어 [acquisition-tax-senior]

#### F-1. Zod 입력 검증 스키마
- **파일**: `lib/validators/acquisition-input.ts`
- **내용**:
  ```typescript
  export const AcquisitionTaxInputSchema = z.object({
    propertyType: z.enum(['housing', 'land', 'building', 'vehicle', 'vessel', /* ... */]),
    acquisitionCause: z.enum(['purchase', 'inheritance', 'gift', 'original', 'auction', /* ... */]),
    acquisitionValue: z.number().int().positive(),
    // 주택 관련
    houseCount: z.number().int().min(1).optional(),
    isRegulatedArea: z.boolean().optional(),
    areaSqm: z.number().positive().optional(),
    // 취득자 유형
    acquiredBy: z.enum(['individual', 'corporation']),
    isFirstHome: z.boolean().optional(),
    isMetropolitan: z.boolean().optional(),
    // 시가표준액
    standardValue: z.number().int().nonnegative().optional(),
    marketValue: z.number().int().nonnegative().optional(),
    // 특수 케이스
    isRelatedParty: z.boolean().optional(),
    encumbrance: z.number().int().nonnegative().optional(),
    // 간주취득
    deemedInput: z.object({ ... }).optional(),
    // 취득 시기
    acquisitionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  });
  ```
- **담당**: acquisition-tax-senior
- **의존**: A-1

#### F-2. API Route Handler
- **파일**: `app/api/calc/acquisition/route.ts`
- **처리 흐름**:
  ```typescript
  export async function POST(request: Request) {
    // 1. Rate Limiting (IP당 30회/분)
    // 2. Zod 입력 검증 (AcquisitionTaxInputSchema)
    // 3. DB 세율 일괄 로드: preloadTaxRates(['acquisition'], targetDate)
    // 4. 조정대상지역 이력 로드: regulated_areas 테이블 (취득일 기준)
    // 5. calculateAcquisitionTax(input, ratesMap, regulatedAreaHistory) 호출
    // 6. 로그인 시: saveCalculation(userId, 'acquisition', input, result)
    // 7. 결과 JSON 반환
  }
  ```
- **담당**: acquisition-tax-senior
- **의존**: E-1, F-1

---

### Phase G — UI 레이어 [acquisition-tax-senior]

#### G-1. 입력 폼 컴포넌트
- **파일**: `components/calc/AcquisitionTaxForm.tsx`
- **Step 구성** (StepWizard 패턴):
  ```
  Step 1: 물건 기본 정보
    - 물건 종류 (주택/토지/건물/차량/선박/회원권 등)
    - 취득 원인 (매매/상속/증여/신축/경매/부담부증여)
    - 취득일 (DateInput 컴포넌트 사용)
    - 취득가액 (CurrencyInput)
    - 전용면적 (선택, ㎡)

  Step 2: 취득자 정보
    - 취득자 유형 (개인/법인)
    - 현재 보유 주택 수 (취득 전)
    - 조정대상지역 여부 (취득일 기준 자동 안내)
    - 생애최초 주택 여부 (체크박스)
    - 수도권 여부 (생애최초 시)
    - 특수관계인 여부 (체크박스)

  Step 3: 시가표준액 / 과세표준 보완
    - 무상취득 시: 시가(매매사례가액) 입력 (선택)
    - 주택공시가격 / 개별공시지가 입력 (선택)
    - 부담부증여 시: 승계채무액 (CurrencyInput)
    - 원시취득(신축) 시: 건축공사비 (CurrencyInput)
    - 간주취득 시: 변경 전/후 시가표준액

  Step 4: 결과 확인
    - AcquisitionTaxResultView 렌더링
  ```
- **규칙 준수**:
  - `DateInput` 컴포넌트 사용 (type="date" 금지)
  - `CurrencyInput` 컴포넌트 사용
  - 모든 단계 뒤로/다음 버튼 필수
  - Step 1 뒤로가기 → 홈(`/`) 이동
- **담당**: acquisition-tax-senior
- **의존**: F-1, F-2

#### G-2. 중과세 상세 카드
- **파일**: `components/calc/AcquisitionSurchargeDetailCard.tsx`
- **내용**:
  - 중과세 적용 여부 + 사유 (조정지역 2주택, 법인, 사치성 등)
  - 중과세율 적용 전/후 세액 비교
  - 생애최초 감면 적용 시 감면 상세 + 추징 주의사항
- **담당**: acquisition-tax-senior
- **의존**: E-1

#### G-3. 결과 화면 컴포넌트
- **파일**: `components/calc/results/AcquisitionTaxResultView.tsx`
- **표시 항목**:
  ```
  [과세표준 결정]
  취득가액: 700,000,000원
  과세표준 적용방식: 사실상취득가격
  과세표준: 700,000,000원

  [세율 결정]
  세율 유형: 선형보간 (6억~9억)
  적용 세율: 1.66667%
  중과 여부: 해당 없음

  [세액 계산]
  취득세 본세: 11,666,690원
  농어촌특별세: -원 (전용면적 85㎡ 이하 면제 또는 비해당)
  지방교육세: 2,800,000원
  ─────────────────────
  총 납부세액: 14,466,690원

  [생애최초 감면]
  감면액: 200만원 (한도 적용)
  감면 후 납부세액: 12,466,690원
  ⚠ 3개월 내 전입, 3년 내 매도 금지 (위반 시 추징)

  [신고 기한]
  취득일: 2024-03-15
  신고 기한: 2024-05-14 (60일 이내)

  [적용 법령]
  - 지방세법 제11조 제1항 제1호의2 (선형보간 세율)
  - 농어촌특별세법 제4조
  - 지방세법 제151조 (지방교육세)
  ```
- **담당**: acquisition-tax-senior
- **의존**: E-1

#### G-4. 페이지 교체
- **파일**: `app/calc/acquisition-tax/page.tsx` (기존 스켈레톤 → 실제 구현)
- **내용**: AcquisitionTaxForm 컴포넌트 렌더링, 메타데이터 설정
- **담당**: acquisition-tax-senior
- **의존**: G-1, G-3

---

## 4. 작업 순서 및 의존 관계 (Gantt)

```
Week 1
├── A-1  공유 타입 정의 ───────────────────────────────────┐
├── A-2  legal-codes.ts 확장 ─────────────────────────────┤
├── A-3  DB 세율 시딩 SQL ────────────────────────────────┤
│                                                         ↓
Week 1~2 (A 완료 후 병렬 시작)
├── B-1  과세 대상 판정 ──────────────────────────────────┐
├── B-2  간주취득 판정 ──────────────────────────────────┤
├── B-3  취득 시기 확정 ─────────────────────────────────┤ (병렬)
├── B-4  시가표준액 산정 ─────────────────────────────────┤
│                                                         ↓
Week 2
├── C-1  과세표준 결정 ──────────────────────────────────┐
│                                                         ↓
Week 2~3
├── C-2  세율 결정 + 부가세 ──────────────────────────────┐
├── D-1  중과세 판정 ────────────────────────────────────┤ (병렬)
│                                                         ↓
Week 3
├── E-1  메인 엔진 통합 ─────────────────────────────────┐
├── E-2  통합 테스트 ────────────────────────────────────┤
│                                                         ↓
Week 3~4
├── F-1  Zod 입력 검증 ─────────────────────────────────┐
├── F-2  API Route ──────────────────────────────────────┤
├── G-1  입력 폼 ────────────────────────────────────────┤
├── G-2  중과세 상세 카드 ───────────────────────────────┤
├── G-3  결과 화면 ─────────────────────────────────────┤
└── G-4  페이지 교체 ───────────────────────────────────┘
```

---

## 5. 테스트 커버리지 목표

| 모듈 | 테스트 파일 | 목표 커버리지 | 핵심 케이스 수 |
|------|-----------|------------|--------------|
| acquisition-object | acquisition-object.test.ts | 100% | 15+ |
| acquisition-standard-price | acquisition-standard-price.test.ts | 100% | 12+ |
| acquisition-tax-base | acquisition-tax-base.test.ts | 100% | 14+ |
| acquisition-tax-rate | acquisition-tax-rate.test.ts | 100% | 20+ (선형보간 집중) |
| acquisition-tax-surcharge | acquisition-tax-surcharge.test.ts | 100% | 18+ |
| acquisition-tax (통합) | acquisition-tax.test.ts | 99%+ | 20+ |

---

## 6. 완료 기준 (Definition of Done)

- [ ] `npm test` 전체 통과 (기존 339개 + 신규 100+ 케이스)
- [ ] 취득세 계산 정확도 99%+ (국세청 예시, 세무사 실무 사례 기준)
- [ ] 선형보간 경계값 6종 테스트 통과 (6억/6억+1원/7억/7.5억/9억-1원/9억)
- [ ] 중과세 판정 전 케이스 (조정지역/법인/사치성/비조정지역) 테스트 통과
- [ ] 부담부증여 유상/무상 분리 계산 정확도 검증
- [ ] 생애최초 감면 200만원 한도 테스트 통과
- [ ] API: 비로그인 계산 가능, Rate Limiting(30회/분) 동작 확인
- [ ] UI: StepWizard 4단계, DateInput/CurrencyInput 사용 확인
- [ ] UI: 모바일 반응형 확인
- [ ] `npm run build` 에러 없음
- [ ] `npm run lint` 에러 없음
- [ ] DB 시딩: `supabase/seeds/acquisition_rates_seed.sql` 실행 성공

---

## 7. 주요 엣지 케이스 및 주의사항

### 7.1 선형보간 정밀도
- **문제**: JS 부동소수점으로 `700_000_000 * 2 / 300_000_000 = 4.666666666...` 오차 발생
- **해결**: BigInt 연산 `(BigInt(value) * 2n - 900_000_000n) / 30_000_000_000n`
- **검증**: 국세청 예시와 1원 단위 일치 확인

### 7.2 조정대상지역 판단 시점
- **취득세**: 취득일(잔금일 or 등기접수일 중 빠른 날) 기준
- **양도소득세 중과**: 양도일 기준 (다른 기준 — 혼동 주의)
- `regulated_areas` 테이블에서 `designation_date` 기준으로 취득일에 적용 중인 지역 조회

### 7.3 부담부증여 복합 처리
- 유상 부분(채무)과 무상 부분(초과분)에 각각 다른 세율 적용
- 특수관계인 간 부담부증여: 채무액도 시가 기준 안분 필요
- 중과세 대상인 경우: 유상 부분에도 중과세 적용 여부 확인

### 7.4 생애최초 감면 추징 안내
- 계산 결과 화면에 반드시 추징 조건 경고 표시
- 3개월 내 전입 의무, 3년 내 매도·임대·임시사용 금지

### 7.5 중과세 유예 처리
- `tax_rates.special_rules.surcharge_suspended` 필드로 관리
- 유예 기간 중에는 중과세율 대신 기본세율 적용

---

## 8. 에이전트 협업 호출 순서 (권장)

```
1단계 (병렬): acquisition-tax-rate-senior 에이전트
  → A-1 (공유 타입), A-2 (법령상수), A-3 (DB 시딩)

2단계 (병렬): 
  acquisition-tax-object-senior 에이전트 → B-1, B-2, B-3
  acquisition-tax-standard-price-senior 에이전트 → B-4

3단계 (순차):
  acquisition-tax-base-senior 에이전트 → C-1
  acquisition-tax-rate-senior 에이전트 → C-2
  acquisition-tax-surcharge-senior 에이전트 → D-1

4단계 (순차):
  acquisition-tax-senior 에이전트 → E-1, E-2, F-1, F-2, G-1~G-4
```
