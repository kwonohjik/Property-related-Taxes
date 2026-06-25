# §45의3 일감몰아주기 증여의제 — UI 설계

> PDCA Design 단계 산출물. 엔진 설계 `gift-related-corp-45-3.engine.design.md` 를 단일 진실로 삼음.
> 계획서 `gift-related-corp-45-3.plan.md` v2 (13단계 자가검증 완료) 기반.
>
> **분리 파일**:
> - `gift-related-corp-45-3.ui.result-code.md` — §2 ⑦ 결과뷰 렌더링 의사코드 전체
> - `gift-related-corp-45-3.ui.mockup.md` — §7 ASCII 목업 + §8~§11 DoD·정책 점검

---

## 0. 메타

| 항목 | 값 |
|---|---|
| 신규 `DeemedGiftType` | `"related_corp"` |
| UI 진입점 | `DeemedGiftCalculator.tsx` 유형 선택 → `DeemedDetailModal` → `related-corp-form.tsx` |
| 결과 뷰 | `DeemedGiftResultView.tsx` 내 `related_corp` 분기 추가 |
| 폼 상태 파일 | `components/calc/deemed-gift/deemed-form-state.ts` |
| API 변환 파일 | `lib/calc/gift-deemed-api.ts` |
| Validation | `lib/calc/gift-deemed-validate.ts` |
| Zod 스키마 | `lib/validators/gift-deemed-input.ts` |
| E2E 포트 | 3105 |

---

## 1. 사용자 시나리오 — 교재 사례4 입력 흐름

**목표**: 중소기업 수혜법인 A 2023 귀속 데이터를 입력 → 갑 20,520,000원 + 을 16,200,000원 = 36,720,000원 확인.

### 단계 흐름

```
① DeemedGiftCalculator 유형 선택
   → "일감몰아주기 증여의제 (§45의3)" 클릭

② DeemedDetailModal 공통 상단
   → 증여일 입력: 2023-12-31 (사업연도 종료일 = 증여시기, §34의3③)

③ 수혜법인 기본 정보 카드 (섹션 1)
   → 기업규모: "중소기업" 선택
   → 매출액: 20,000,000,000원 (200억)
   → 세무조정 반영 후 영업손익: 2,500,000,000원 (25억)
   → 각 사업연도 소득금액: 1,800,000,000원 (18억)
   → 법인세 순세액(산출세액−공제감면): 340,000,000원 (3억4천)

④ 주주현황 roster (섹션 2) — 6행 입력
   [이름:갑  관계:본인   직접지분%:20  법인주주:X]
   [이름:을  관계:친족   직접지분%:10  법인주주:X]
   [이름:병  관계:기타   직접지분%:25  법인주주:X]
   [이름:B법인 관계:기타 직접지분%:30  법인주주:O]
   [이름:C법인 관계:기타 직접지분%:10  법인주주:O]
   [이름:기타 관계:기타  직접지분%:5   법인주주:X]
   → 합계 100% 실시간 표시 (validate 통과 조건)

⑤ 간접출자법인 roster (섹션 3) — 2행 입력
   [법인주주: B법인(선택)  수혜법인지분%: 30]
     └ 개인소유주: [갑 30%] [을 20%] [정 20%] [무 20%] [기타 10%]
   [법인주주: C법인(선택)  수혜법인지분%: 10]
     └ 개인소유주: [갑 10%]

⑥ 매출처 roster (섹션 4) — 5행 입력
   [이름:B법인  매출:3,000,000,000  특수관계:O  과세제외유형:⑩1호(중소-중소)  지배주주지분:(없음)]
   [이름:C법인  매출:4,000,000,000  특수관계:X  과세제외유형:(없음)           지배주주지분:(없음)]
   [이름:D법인  매출:10,000,000,000 특수관계:O  과세제외유형:(없음)           지배주주지분:[갑 30%]]
   [이름:E법인  매출:2,000,000,000  특수관계:O  과세제외유형:⑩5호(수출)       지배주주지분:(없음)]
   [이름:기타   매출:1,000,000,000  특수관계:X  과세제외유형:(없음)           지배주주지분:(없음)]
   → 합계 = 200억 = totalSales 일치 확인 (validate 통과 조건)

⑦ "계산하기" 클릭
   → 결과 뷰: 갑 직접 20,520,000 / 을 직접 16,200,000 / 합계 36,720,000

⑧ "이 금액으로 증여세 계산하기" → 증여세 마법사 prefill 이관
   (갑·을 각각 simultaneousGifts 패턴으로 분리)
```

---

## 2. 클라이언트 8지점 상세 매핑

### ① 폼 상태 타입 (`deemed-form-state.ts` 신규 필드)

**정책**: roster는 모두 **string flat row** — `parseAmount` / `parseDecimal` 변환은 API 변환 시(④)에만. `useEffect → store` 미러링 금지(memory `mirror-pattern`). cross-field(지분합, 매출합) 파생은 `useMemo` 또는 validate/API 시점.

```typescript
// deemed-form-state.ts 에 추가

/** §45의3 일감몰아주기 — 주주 roster 1행 (전부 string) */
export interface RcShareholderRow {
  id: string;               // 행 고유 UUID (결과뷰 표시 금지 — name 우선)
  name: string;             // 표시용 이름
  /** "self" | "relative" | "other" */
  relation: string;
  /** 직접지분 % — DecimalInput, 0-100 */
  directRatioPctStr: string;
  /** 법인주주 여부 — intermediaryCorps와 연결 */
  isCorporate: boolean;
}

/** §45의3 일감몰아주기 — 간접출자법인 개인소유주 1행 */
export interface RcIntermediaryOwnerRow {
  /** RcShareholderRow.id 참조 */
  individualId: string;
  /** 이 법인에 대한 보유비율 % — DecimalInput */
  ratioPctStr: string;
}

/** §45의3 일감몰아주기 — 간접출자법인 roster 1행 */
export interface RcIntermediaryRow {
  id: string;
  /** 법인주주 RcShareholderRow.id 참조 (Select) */
  corpShareholderId: string;
  /** 수혜법인에 대한 직접지분 % — DecimalInput */
  stakeInBeneficiaryPctStr: string;
  /** 이 법인의 개인소유주 목록 (§⑱ 자동판정용) */
  owners: RcIntermediaryOwnerRow[];
}

/** §34의3⑩ 과세제외유형 코드 (string — select) */
export type RcExclusionTypeStr =
  | "sec10_1" | "sec10_2" | "sec10_3" | "sec10_4"
  | "sec10_5" | "sec10_5_2" | "sec10_5_3"
  | "sec10_6" | "sec10_7" | "sec10_8" | "";

/** §45의3 일감몰아주기 — 매출처 roster 지배주주등 보유비율 1행 */
export interface RcRulingStakeRow {
  /** RcShareholderRow.id 참조 */
  shareholderId: string;
  /** 이 특수관계법인에 대한 보유비율 % — DecimalInput */
  ratioPctStr: string;
}

/** §45의3 일감몰아주기 — 매출처 roster 1행 */
export interface RcSalesRow {
  id: string;
  name: string;
  /** 매출액(원) — CurrencyInput */
  salesAmountStr: string;
  isRelated: boolean;
  /** 과세제외유형 — Select, 없으면 "" */
  exclusionType: RcExclusionTypeStr;
  /**
   * §⑭3호 지배주주등 보유비율 목록.
   * 빈 배열이면 ⑭3호 미적용 (additionalExclusion=0).
   * 특수관계이고 과세제외유형 없는 법인에만 노출(UI 조건부).
   */
  rulingStakes: RcRulingStakeRow[];
}

// DeemedFormState 에 추가 필드:
// rcEnterpriseSize: "small" | "medium" | "large" | ""
// rcTotalSalesStr: string
// rcPreTaxAdjOperatingIncomeStr: string
// rcTaxableIncomeStr: string
// rcCorporateTaxNetStr: string
// rcShareholders: RcShareholderRow[]
// rcIntermediaryCorps: RcIntermediaryRow[]
// rcSalesPartners: RcSalesRow[]
// rcDirectDividendIncomeStr: string          (§⑮, 기본 "0")
// rcIndirectDividendIncomeStr: string        (§⑮, 기본 "0")
// rcShowDividendDeduction: boolean           (고급 토글, 기본 false)
```

### ② 초기값 (`INITIAL_DEEMED` 에 추가)

```typescript
// INITIAL_DEEMED 에 추가
rcEnterpriseSize: "",
rcTotalSalesStr: "",
rcPreTaxAdjOperatingIncomeStr: "",
rcTaxableIncomeStr: "",
rcCorporateTaxNetStr: "",
rcShareholders: [],
rcIntermediaryCorps: [],
rcSalesPartners: [],
rcDirectDividendIncomeStr: "0",
rcIndirectDividendIncomeStr: "0",
rcShowDividendDeduction: false,
```

**헬퍼 함수** (`deemed-form-state.ts` 에 추가):
```typescript
export function makeRcShareholderRow(id: string): RcShareholderRow {
  return { id, name: "", relation: "other", directRatioPctStr: "", isCorporate: false };
}

export function makeRcIntermediaryRow(id: string): RcIntermediaryRow {
  return { id, corpShareholderId: "", stakeInBeneficiaryPctStr: "", owners: [] };
}

export function makeRcSalesRow(id: string): RcSalesRow {
  return { id, name: "", salesAmountStr: "", isRelated: false, exclusionType: "", rulingStakes: [] };
}
```

### ③ normalize fallback

`related_corp` 신규 타입이므로 sessionStorage migration이 거의 없음. `rcShareholders / rcIntermediaryCorps / rcSalesPartners` 가 undefined이면 `[]` 로 normalize. 개별 row의 `rulingStakes` 가 undefined이면 `[]`.

zustand persist merge 시 `rc*` 필드가 undefined → `INITIAL_DEEMED` 기본값 적용. 별도 normalize 함수 불필요.

### ④ API 변환 (`gift-deemed-api.ts` — `buildDeemedGiftInput` case 추가)

⚠️ **Critical**: `buildDeemedGiftInput` 의 discriminated union이므로 TS가 누락을 감지하지 못함 → Do 완료 후 반드시 grep 점검.

```typescript
case "related_corp": {
  // ① string → number/분수 변환
  const parseRatio = (pctStr: string): { numer: number; denom: number } => ({
    numer: Math.round(parseDecimal(pctStr) * 100),  // 20.5% → {2050, 10000}
    denom: 10_000,
  });

  // ② shareholders 배열 명시 매핑 (discriminated union 침묵 strip 방지)
  const shareholders = form.rcShareholders.map((row) => ({
    id: row.id,
    name: row.name,
    relation: (row.relation as "self" | "relative" | "other") || "other",
    directRatio: parseRatio(row.directRatioPctStr),
    isCorporate: row.isCorporate,
  }));

  // ③ intermediaryCorps 배열 명시 매핑 (중첩 owners 포함)
  const intermediaryCorps = form.rcIntermediaryCorps.map((row) => ({
    corpShareholderId: row.corpShareholderId,
    stakeInBeneficiary: parseRatio(row.stakeInBeneficiaryPctStr),
    owners: row.owners.map((o) => ({
      individualId: o.individualId,
      ratio: parseRatio(o.ratioPctStr),
    })),
  }));

  // ④ salesPartners 배열 명시 매핑 (rulingShareholderStakes 중첩 포함)
  const salesPartners = form.rcSalesPartners.map((row) => ({
    id: row.id,
    name: row.name,
    salesAmount: parseAmount(row.salesAmountStr),
    isRelated: row.isRelated,
    exclusionType: row.exclusionType || undefined,
    rulingShareholderStakes:
      row.rulingStakes.length > 0
        ? row.rulingStakes.map((s) => ({
            shareholderId: s.shareholderId,
            ratio: parseRatio(s.ratioPctStr),
          }))
        : undefined,
  }));

  return {
    type: "related_corp",
    enterpriseSize: (form.rcEnterpriseSize as "small" | "medium" | "large"),
    totalSales: parseAmount(form.rcTotalSalesStr),
    preTaxAdjOperatingIncome: parseAmount(form.rcPreTaxAdjOperatingIncomeStr),
    taxableIncome: parseAmount(form.rcTaxableIncomeStr),
    corporateTaxNet: parseAmount(form.rcCorporateTaxNetStr),
    shareholders,
    intermediaryCorps,
    salesPartners,
    directDividendIncome: form.rcShowDividendDeduction
      ? parseAmount(form.rcDirectDividendIncomeStr)
      : undefined,
    indirectDividendIncome: form.rcShowDividendDeduction
      ? parseAmount(form.rcIndirectDividendIncomeStr)
      : undefined,
  };
}
```

**grep 자가점검 의무** (Do 완료 후):
```bash
grep -n "related_corp" lib/calc/gift-deemed-api.ts
# → case "related_corp": 분기
# → shareholders / intermediaryCorps / salesPartners 3배열 명시 확인
```

#### prefill 분기 신설 (`buildGiftWizardPrefill` 내)

`result.type === "related_corp"` + **존재 가드** 조합 분기를 `contribution` 게이트 **이후**에 신설.
`contribution` 패턴(`simultaneousGifts`) 차용하되 타입 게이트 `=== "related_corp"` 로 별도.

> **Critical-1**: `result.type === "related_corp"` 단독 내로잉으로는 `result.recipientBreakdown` 접근 불가.
> base `DeemedGiftResult`에 optional로 추가되므로 존재 가드 `&& result.recipientBreakdown` 필수.
> 기존 패턴 `gift-deemed-api.ts:511`: `result.type === "contribution" && result.contributionBreakdown`

```typescript
// result.type === "related_corp" + 존재 가드: 수증자별 다건 prefill
if (result.type === "related_corp" && result.recipientBreakdown && result.recipientBreakdown.length > 0) {
  const [main, ...rest] = result.recipientBreakdown.filter((r) => r.subtotal > 0);
  if (!main) return { giftDate: form.giftDate };

  const simultaneousGifts =
    rest.length > 0
      ? rest.map((r) => ({
          donorRelation: "other_relative" as const,
          taxableValue: String(r.subtotal),
        }))
      : undefined;

  return {
    giftDate: form.giftDate,
    donorRelation: "other_relative" as const,
    giftItems: [
      {
        id: `deemed-rc-${main.recipientName.trim() || "recipient"}`,
        category: "other" as const,
        name: `일감몰아주기 이익 — ${main.recipientName.trim() || "지배주주등"}`,
        marketValue: main.subtotal,
      },
    ],
    simultaneousGifts,
  };
}
```

### ⑤ UI 위젯 (`related-corp-form.tsx` 신규)

**파일 위치**: `components/calc/deemed-gift/related-corp-form.tsx`

**800줄 정책**: 예상 ~650줄. 단일 파일 가능. 3개 roster 테이블은 내부 함수 분리 권장.

#### 섹션 구조 (4섹션 + 고급 섹션)

```
관련 법인 UI — related-corp-form.tsx
├── 섹션 1 [sky]     수혜법인 기본 정보 (기업규모 RadioCardGroup + 재무 4필드)
├── 섹션 2 [emerald] 주주현황 roster (지분합계 useMemo 배지 포함)
├── 섹션 3 [amber]   간접출자법인 roster (법인주주 있을 때 노출)
├── 섹션 4 [violet]  매출처 roster (매출합계 useMemo 배지 포함)
└── ToggleCard [sky] §⑮ 배당소득공제 (기본 OFF)
```

#### 섹션 1 — 수혜법인 기본 정보 (sky)

```
기업규모: RadioCardGroup tone=sky layout=inline
  옵션: [중소기업]  [중견기업]  [일반기업]
  hint: 정상거래비율·한계보유비율·증여이익 계산식이 달라집니다

총 매출액 (원):               CurrencyInput
세무조정 후 영업손익 (원):     CurrencyInput
각 사업연도 소득금액 (원):     CurrencyInput
법인세 순세액 (원):            CurrencyInput
  hint: 법인세 순세액 = 산출세액 − 공제·감면액 (§34의3⑫)
```

#### 섹션 2 — 주주현황 roster (emerald)

테이블 컬럼: `#` | `이름(text)` | `관계(Select)` | `직접지분%(DecimalInput)` | `법인주주(toggle)` | `삭제`

관계 Select 옵션:
```typescript
const RELATION_OPTIONS = [
  { value: "self",     label: "본인 (지배주주 판정 대상)" },
  { value: "relative", label: "친족 (지배주주 친족)" },
  { value: "other",    label: "기타" },
] as const;
```

지분합계 배지: `useMemo` 파생. 100% 미달 시 경고 배지 표시 (useEffect 미러링 금지).

#### 섹션 3 — 간접출자법인 roster (amber)

조건부 노출: `rcShareholders.some(r => r.isCorporate)` 가 true 일 때만 렌더.

각 행:
- 법인주주: `Select` — `rcShareholders` 중 `isCorporate=true` 목록
- 수혜법인 지분%: `DecimalInput`
- 개인소유주 서브 테이블: 주주(`Select`) + 지분%(`DecimalInput`) + 추가/삭제

§⑱ 판정 배지: 개인소유주 중 `relation=self|relative` 합산 ≥ 30% → "⑱1호 충족" / 미달 → "간접 제외".

#### 섹션 4 — 매출처 roster (violet)

각 행:
- 이름: `text input`
- 매출액: `CurrencyInput`
- 특수관계: `toggle (sky)`
- 과세제외유형: `Select` (특수관계=ON 일 때 노출)
- §⑭3호 지배주주등 보유비율 서브 테이블: 특수관계=ON AND 과세제외유형="" 일 때만 노출

과세제외유형 Select 옵션:
```typescript
const EXCLUSION_TYPE_OPTIONS = [
  { value: "",          label: "없음 (과세대상)" },
  { value: "sec10_1",   label: "⑩1호 — 중소기업 간 거래" },
  { value: "sec10_2",   label: "⑩2호 — 50% 이상 출자 법인" },
  { value: "sec10_3",   label: "⑩3호 — 50% 미만 출자 × 보유비율" },
  { value: "sec10_4",   label: "⑩4호 — 지주회사-자회사·손자회사" },
  { value: "sec10_5",   label: "⑩5호 — 수출목적 거래" },
  { value: "sec10_5_2", label: "⑩5의2호 — 국외용역" },
  { value: "sec10_5_3", label: "⑩5의3호 — 영세율용역" },
  { value: "sec10_6",   label: "⑩6호 — 법정의무거래" },
  { value: "sec10_7",   label: "⑩7호 — 프로스포츠 광고" },
  { value: "sec10_8",   label: "⑩8호 — 공공기관" },
] as const;
```

매출합계 배지: `useMemo` 파생. 총매출액과 불일치 시 경고 배지.

#### 고급 섹션 — §⑮ 배당소득공제 (ToggleCard sky, 기본 OFF)

ON 시 노출:
- 수혜법인 배당소득 (직접): `CurrencyInput`, 기본 "0"
- 간접출자법인 배당소득 (간접): `CurrencyInput`, 기본 "0"
- hint: §34의3⑮ — 사업연도 중 수령 배당소득 공제. 음수 발생 시 0으로 처리.

### ⑥ 폼 내 실시간 합계 배지 (High-2 정정 — 사이드바 N/A)

> **High-2 정정**: deemed-gift 플로우는 `DeemedDetailModal` + `DeemedGiftCalculator` 기반 **modal 구조**.
> StepWizard 사이드바 없음(`grep "Summary\|sidebar\|sticky" DeemedGiftCalculator.tsx = 0건`).
> `tax-summary-sidebar-pattern`은 StepWizard 전용 — 이 플로우에 **적용 불가**.
> ⑥은 **폼 내 실시간 합계 배지**로 재정의.

```typescript
// related-corp-form.tsx 내 useMemo — 섹션 2·4 배지 데이터 소스
const rcSummary = useMemo(() => {
  if (form.type !== "related_corp") return null;
  const totalSales = parseAmount(form.rcTotalSalesStr);
  const salesSum = form.rcSalesPartners
    .reduce((s, r) => s + parseAmount(r.salesAmountStr), 0);
  const relatedSales = form.rcSalesPartners
    .filter((r) => r.isRelated)
    .reduce((s, r) => s + parseAmount(r.salesAmountStr), 0);
  const totalDirectPct = form.rcShareholders
    .reduce((s, r) => s + parseDecimal(r.directRatioPctStr), 0);
  return { totalSales, salesSum, relatedSales, totalDirectPct };
}, [form.type, form.rcTotalSalesStr, form.rcSalesPartners, form.rcShareholders]);
```

폼 내 배지 표시 (0원·null 미표시):
- 섹션 2 상단: `지분합계: {totalDirectPct.toFixed(2)}%` — 100% 미달 시 경고색
- 섹션 4 상단: `매출합계: {salesSum.toLocaleString()}원` — totalSales 불일치 시 경고색
- 결과 카드: `result.deemedGiftValue` (API 응답 후)

**useEffect → store 미러링 금지** 준수: 배지 파생값은 `useMemo`만, store `set()` 없음.

### ⑦ 결과 카드 (`DeemedGiftResultView.tsx` 내 `related_corp` 분기)

**`result.type === "related_corp"` 전용 섹션. 기존 `breakdown` 표 아래에 추가.**

> **Critical-1 정정**: `DeemedGiftResultView`의 `result` 타입은 `DeemedGiftAnyResult`(union).
> `result.type === "related_corp"` 내로잉 **단독**으로는 신규 optional 필드 접근 불가(TS2339).
> 엔진이 신규 필드를 base `DeemedGiftResult`에 optional로 추가하므로, UI는 **존재 가드**를 조합:
> `if (result.type === "related_corp" && result.recipientBreakdown) { ... }`
> 기존 패턴 참조: `DeemedGiftResultView.tsx:319` — `result.contributionBreakdown &&`

**id 비노출 강제**: `recipientName.trim() || "지배주주등"` (memory `feedback_no_internal_id_in_result`).

#### 결과 카드 구조

```
합계 카드 [rose]       — deemedGiftValue + LawArticleModal
과세요건 카드 [sky]    — 지배주주·relatedSales(echo)·거래비율·정상비율·충족여부·공통과세제외매출
수증자별 표 [emerald]  — recipientBreakdown[] 순회 (수증자·세후영업이익·거래비율차감후·보유비율차감후·직접이익·간접이익·소계)
보유비율 raw 표 [amber] — directRatioRaw + indirectRatioRaw 대칭 echo (Medium-4 정정)
교재 반올림차 주석     — 정확분수 20,520,000 vs 교재 8.33% 반올림 20,514,000
증여세 마법사 이관 버튼
```

결과뷰 렌더링 전체 의사코드(존재 가드 포함): `gift-related-corp-45-3.ui.result-code.md` 참조.

**산식 한국어 풀어쓰기** (변수 약어·floor 금지):

```
세후영업이익(갑)
  = (세무조정 반영 영업손익 − 법인세 순세액 × min(세무조정영업이익 / 소득, 1))
    × (1 − 과세제외매출(갑) / 총매출액)
  = (2,500,000,000 − 340,000,000 × 1) × (1 − 8,000,000,000 / 20,000,000,000)
  = 1,296,000,000

갑 직접 증여의제이익
  = 세후영업이익(갑) × 거래비율차감후 × 직접보유비율차감후
  = 1,296,000,000 × (1/12) × (19/100)
  = 20,520,000
```

### ⑧ Validation (`gift-deemed-validate.ts` — `related_corp` case 추가)

**정책**: 자동 안분 fallback 금지. 미입력 = validation 오류 차단. 3 roster 빈행 차단.

```typescript
case "related_corp": {
  // R-1: 기업규모 필수
  if (!form.rcEnterpriseSize) return "기업규모를 선택하세요";

  // R-2: 재무 필수
  if (parseAmount(form.rcTotalSalesStr) <= 0) return "총 매출액을 입력하세요";
  if (parseAmount(form.rcTaxableIncomeStr) <= 0) return "각 사업연도 소득금액을 입력하세요";
  if (parseAmount(form.rcCorporateTaxNetStr) < 0) return "법인세 순세액은 0 이상이어야 합니다";

  // R-3: 주주 roster — 빈행 차단
  if (form.rcShareholders.length < 2) return "주주를 2명 이상 입력하세요";
  for (const [i, row] of form.rcShareholders.entries()) {
    const n = i + 1;
    if (!row.name.trim()) return `${n}번째 주주 이름을 입력하세요`;
    if (parseDecimal(row.directRatioPctStr) < 0)
      return `${n}번째 주주의 직접지분율은 0 이상이어야 합니다`;
    if (!row.relation) return `${n}번째 주주의 관계를 선택하세요`;
  }

  // R-4: 주주 직접지분 합계 = 100% (cross-field — useEffect 미러링 금지)
  // Low-6 정정: 톨러런스 0.01% — parseDecimal은 round 없음, 소수 2자리 입력 오차 흡수
  // Zod superRefine도 동일: 분모 10000 전제 시 Math.abs(sum-1_000_000) > 100 = 0.01%
  const totalDirectPct = form.rcShareholders.reduce(
    (s, r) => s + parseDecimal(r.directRatioPctStr), 0,
  );
  if (Math.abs(totalDirectPct - 100) > 0.01)
    return `주주 직접지분 합계가 100%가 아닙니다 (현재 ${totalDirectPct.toFixed(2)}%)`;

  // R-5: 간접출자법인 roster — 빈행 차단
  for (const [i, row] of form.rcIntermediaryCorps.entries()) {
    const n = i + 1;
    if (!row.corpShareholderId) return `${n}번째 간접출자법인의 법인주주를 선택하세요`;
    if (parseDecimal(row.stakeInBeneficiaryPctStr) <= 0)
      return `${n}번째 간접출자법인의 수혜법인 지분율을 입력하세요`;
    for (const [j, owner] of row.owners.entries()) {
      if (!owner.individualId) return `${n}번째 법인 ${j + 1}번 소유주를 선택하세요`;
      if (parseDecimal(owner.ratioPctStr) <= 0)
        return `${n}번째 법인 ${j + 1}번 소유주의 지분율을 입력하세요`;
    }
  }

  // R-6: 매출처 roster — 최소 1개 + 빈행 차단 (자동 안분 fallback 금지)
  if (form.rcSalesPartners.length === 0) return "매출처를 1개 이상 입력하세요";
  for (const [i, row] of form.rcSalesPartners.entries()) {
    const n = i + 1;
    if (!row.name.trim()) return `${n}번째 매출처 이름을 입력하세요`;
    if (parseAmount(row.salesAmountStr) < 0)
      return `${n}번째 매출처의 매출액은 0 이상이어야 합니다`;
    for (const [j, stake] of row.rulingStakes.entries()) {
      if (!stake.shareholderId)
        return `${n}번째 매출처 §⑭ ${j + 1}번 주주를 선택하세요`;
      if (parseDecimal(stake.ratioPctStr) <= 0)
        return `${n}번째 매출처 §⑭ ${j + 1}번 주주의 보유비율을 입력하세요`;
    }
  }

  // R-7: 매출처 합계 = 총매출액 일치 (자동 안분 fallback 금지 — 명시 오류 차단)
  // Low-6 정정: parseAmount = 정수(원) → 톨러런스 0, 정확 일치 비교
  // Zod superRefine(§3)도 동일: salesSum !== data.totalSales 정확 비교 → UI↔validate↔Zod 일치
  const salesSum = form.rcSalesPartners.reduce(
    (s, r) => s + parseAmount(r.salesAmountStr), 0,
  );
  const totalSales = parseAmount(form.rcTotalSalesStr);
  if (totalSales > 0 && salesSum !== totalSales)
    return `매출처 합계(${salesSum.toLocaleString()}원)가 총매출액(${totalSales.toLocaleString()}원)과 다릅니다`;

  // R-8: 배당공제 모드 ON 시 음수 차단
  if (form.rcShowDividendDeduction) {
    if (parseAmount(form.rcDirectDividendIncomeStr) < 0)
      return "직접 배당소득은 0 이상이어야 합니다";
    if (parseAmount(form.rcIndirectDividendIncomeStr) < 0)
      return "간접 배당소득은 0 이상이어야 합니다";
  }

  break;
}
```

**3중 패턴 확인** (memory `mirror-pattern`):
- `totalDirectPct 100%`: UI(useMemo 배지) + API 변환(전달) + validate(R-4) — 3중 일치.
- `salesSum = totalSales`: UI(useMemo 배지) + API 변환(전달) + validate(R-7) — 3중 일치.
- 자동 안분 fallback 없음 — 미입력은 오류(R-6).

---

## 3. ⑫ Zod 스키마 (`gift-deemed-input.ts` 에 추가)

```typescript
const rcOwnerSchema = z.object({
  individualId: z.string().min(1),
  ratio: z.object({ numer: z.number().int().min(0), denom: z.number().int().min(1) }),
});

const rcRulingStakeSchema = z.object({
  shareholderId: z.string().min(1),
  ratio: z.object({ numer: z.number().int().min(0), denom: z.number().int().min(1) }),
});

export const relatedCorpSchema = z.object({
  type: z.literal("related_corp"),
  enterpriseSize: z.enum(["small", "medium", "large"]),
  totalSales: z.number().int().min(1),
  preTaxAdjOperatingIncome: z.number().int(),
  taxableIncome: z.number().int().min(1),
  corporateTaxNet: z.number().int().min(0),
  shareholders: z.array(z.object({
    id: z.string().min(1),
    name: z.string(),
    relation: z.enum(["self", "relative", "other"]),
    directRatio: z.object({ numer: z.number().int().min(0), denom: z.number().int().min(1) }),
    isCorporate: z.boolean(),
  })).min(1),
  intermediaryCorps: z.array(z.object({
    corpShareholderId: z.string().min(1),
    stakeInBeneficiary: z.object({ numer: z.number().int().min(0), denom: z.number().int().min(1) }),
    owners: z.array(rcOwnerSchema),
  })),
  salesPartners: z.array(z.object({
    id: z.string().min(1),
    name: z.string(),
    salesAmount: z.number().int().min(0),
    isRelated: z.boolean(),
    exclusionType: z.enum([
      "sec10_1","sec10_2","sec10_3","sec10_4","sec10_5",
      "sec10_5_2","sec10_5_3","sec10_6","sec10_7","sec10_8",
    ]).optional(),
    rulingShareholderStakes: z.array(rcRulingStakeSchema).optional(),
  })).min(1),
  directDividendIncome: z.number().int().min(0).optional(),
  indirectDividendIncome: z.number().int().min(0).optional(),
}).superRefine((data, ctx) => {
  // 주주 직접지분 합계 100% 검증 (분모 10000 전제)
  const allDenom10000 = data.shareholders.every((sh) => sh.directRatio.denom === 10_000);
  if (allDenom10000) {
    const sum = data.shareholders.reduce((s, sh) => s + sh.directRatio.numer, 0);
    if (Math.abs(sum - 1_000_000) > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "주주 직접지분 합계가 100%가 아닙니다",
        path: ["shareholders"],
      });
    }
  }
  // 매출처 합계 = totalSales 검증
  const salesSum = data.salesPartners.reduce((s, p) => s + p.salesAmount, 0);
  if (salesSum !== data.totalSales) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "매출처 합계가 총매출액과 다릅니다",
      path: ["salesPartners"],
    });
  }
});
```

기존 `giftDeemedInputSchema` (`z.discriminatedUnion("type", [...])`) 에 `relatedCorpSchema` 추가.

---

## 4. prefill 분기 (`gift-deemed-api.ts`)

`result.type === "related_corp"` 전용 분기를 `contribution` 분기 **이후**에 신설.

**핵심**: `contribution` 게이트(`=== "contribution"`) 와 **별개 분기**. 재사용 불가.

> **Critical-1 정정**: `buildGiftWizardPrefill`의 `result` 타입도 `DeemedGiftAnyResult`.
> 단순 `result.type === "related_corp"` 내로잉만으로는 `result.recipientBreakdown` 접근 불가(TS2339).
> 엔진이 필드를 base에 optional로 추가하므로 **존재 가드** 조합 필수:
> `if (result.type === "related_corp" && result.recipientBreakdown) { ... }`
> 기존 패턴 참조: `gift-deemed-api.ts:511` — `result.type === "contribution" && result.contributionBreakdown`

상세 코드는 §2 ④ API 변환 절 "prefill 분기 신설" 참조 (코드에도 존재 가드 반영됨).

---

## 5. 유형 선택 (`shared.tsx`)

`DEEMED_TYPE_META` 추가:
```typescript
related_corp: {
  label: "일감몰아주기 증여의제",
  law: "상증법 §45의3",
},
```

`TYPE_OPTIONS` 추가:
```typescript
{
  value: "related_corp",
  label: "일감몰아주기 증여의제",
  description: "상증법 §45의3 — 수혜법인 특수관계법인 거래이익 → 지배주주 증여의제",
  testId: "deemed-type-related_corp",
},
```

`DeemedGiftResultView.tsx` 임포트 추가:
```typescript
import type { RelatedCorpResult } from "@/lib/tax-engine/gift-deemed/types";
```

---

## 6. 파일 분할 계획 (800줄 정책)

```
components/calc/deemed-gift/
├── related-corp-form.tsx      신규 (~600줄, 단일 파일 가능)
│   내부: RcShareholderTable / RcIntermediaryTable / RcSalesPartnerTable
│
├── deemed-form-state.ts       기존 473줄 → +~80줄 = ~553줄 (이하)
│
components/calc/results/
└── DeemedGiftResultView.tsx   기존 700줄 → +~120줄 = ~820줄
    ⚠️ 800줄 초과 시 RelatedCorpResultSection.tsx 분리 필수
    Do 착수 전 줄수 실측 후 결정
```

ASCII 목업: `gift-related-corp-45-3.ui.mockup.md` 참조.
DoD 체크리스트 + 3대 핵심 정책 점검: `gift-related-corp-45-3.ui.mockup.md` §10~§11 참조.
