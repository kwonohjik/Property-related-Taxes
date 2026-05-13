# 재개발/재건축 양도소득세 — UI 디자인 (사례 44)

**작성일**: 2026-05-13
**작성자**: transfer-tax-ui-senior
**계획서**: `.claude/plans/users-mynote-downloads-pdf-users-mynote-vivid-lerdorf.md`
**엔진 디자인**: `transfer-tax-redevelopment.engine.design.md`
**PDCA 단계**: Design

본 PR UI 범위: **사례 44(APT-환산-납부-주택출자)** 만 노출. 엔진은 사례 36~46 매트릭스 전체 처리 가능.

---

## 1. 사용자 시나리오 (7단계)

사례 44 (양도코리아 xlsx): **2005-04-09 개별주택 취득 → 2009-10-23 관리처분 인가 → 2023-02-16 완공 APT 양도** (보유 약 17년 10개월). 청산금 92,781,500원 납부분 포함. 취득가액 환산(주택분 기준시가 비율).

**법령 근거**: 시행령 §166②1호(APT+납부 양도차익 산식) + §166③(취득가액 환산) + §166⑤2호(LTHD 보유기간 분기) + §176의2②2호(환산 산식) + §164⑦(최초공시 전 취득 단서).

| 단계 | 사용자 행동 | UI 반응 |
|---|---|---|
| 1 | Step1 → "자산 추가" → 자산종류 **"재개발/재건축 APT"** 선택 | `assetKind: "redevelopment_apt"` 설정. RedevelopmentBlock 노출. 양도가액·취득일·양도일 기본 필드 + redev 12필드 표시 |
| 2 | 양도대상 ToggleCard **"완공 APT 양도"** 선택 | `redevSubject: "apt"`. 출자대상 ToggleCard 노출 |
| 3 | 출자대상 ToggleCard **"주택 출자"** 선택 | `redevOriginalAssetType: "housing"`. 청산금 방향 RadioCardGroup 노출 |
| 4 | 청산금 방향 **"납부"** 선택 + 관리처분 인가일 2009-10-23, 권리가액 219,218,500, 청산금 92,781,500, 인가전 필요경비 2,551,049 입력 | 미리보기 카드: 분양가 312,000,000 + 안분 비율(70.26%/29.74%) 자동 산출 |
| 5 | 환산취득가 ToggleCard ON (`useEstimatedAcquisition: true`) | 환산 기준시가 카드 노출: **취득시 기준시가·관리처분일 기준시가** 2필수 + **최초공시일(DateInput)·최초고시 기준시가** 2선택(§164⑦ 단서 대비) — 총 4필드 |
| 6 | 기준시가 입력: 취득시 85,034,988 / 관리처분일 132,000,000 / 최초공시일·최초고시 기준시가(§164⑦ 단서 대비, 선택) | 미리보기: 인가전 환산취득가 = `floor(219,218,500 × 85,034,988 / 132,000,000) = 141,221,532` 자동 계산 + §164⑦ 단서 배지 (`취득일 < 최초공시일 시 발동`) 표시 |
| 7 | "다음" → 계산 결과 화면 | 3분할 결과 카드(인가전/인가후 기존주택/청산금 납부) + LTHD 3줄 + **산출세액 56,799,400 / 지방세 5,679,940 / 합계 62,479,340** 표시. FilingFormTable 3열. |

---

## 2. 케이스 인벤토리 (행 ≥ 3, 필수)

| # | 케이스 | assetKind | redevSubject | originalAssetType | useEstimated | settlementDir | 비고 |
|---|---|---|---|---|---|---|---|
| C-01 ★ | 사례 44 (PR primary anchor) | redevelopment_apt | apt | housing | true | pay | 산출 56,799,400 anchor |
| C-02 | §164⑦ 단서 분기 (가공 케이스) | redevelopment_apt | apt | housing | true | pay | **취득일 < 최초공시일** → §164⑤ 준용 대체 산식, valuationMeta 배지 검증 (트리거 정정 반영) |
| C-03 | 실가 모드 회귀 (UI 안전망) | redevelopment_apt | apt | housing | false | pay | 환산 4필드 숨김. 실가 actualAcquisitionPrice 단일 입력 |
| C-04 | (엔진만, UI 미노출) — 사례 36~43, 45, 46 | (다양) | (다양) | (다양) | (다양) | (다양) | UI 토글에서 강제 비활성. 후속 PR로 노출 |

> C-01이 Do 단계 primary anchor. C-02·C-03은 UI 분기 회귀. C-04는 엔진 일반화 검증용(UI 미노출).

---

## 3. 폼 상태 타입 변경 명세 (14개 동기화 지점)

### 지점 ① AssetForm 신규 필드

**위치**: `lib/stores/calc-wizard-asset.ts` → `AssetForm` 끝에 추가 + `assetKind` enum 확장

```typescript
assetKind:
  | "housing" | "land" | "building"
  | "right_to_move_in" | "presale_right"
  | "commercial_building" | "general_building"
  | "redevelopment_apt";  // ★ 신규

// ── 재개발/재건축 (사례 44, 소법 §95② / 시행령 §176의2②2호 / 도정법 §74) ──

/** 양도 대상 — UI: "right"(입주권) | "apt"(완공 APT). 본 PR UI 는 "apt" 만 노출 */
redevSubject: "right" | "apt" | "";

/**
 * 인가 법령 근거 — "urban_renovation_§74"(도정법) | "small_housing_§29"(빈집소규모정비법).
 * 본 PR UI 는 §74 만 노출. §29 슬롯은 후속 PR 마이그레이션 회피용 사전 도입.
 */
redevApprovalLawBasis: "urban_renovation_§74" | "small_housing_§29" | "";

/** 출자 자산 — "land"(토지출자) | "housing"(주택출자). 본 PR UI 는 "housing" 만 노출 */
redevOriginalAssetType: "land" | "housing" | "";

/** 청산금 방향 — "pay"(납부) | "receive"(수령). 본 PR UI 는 "pay" 만 노출 */
redevSettlementDirection: "pay" | "receive" | "";

/** 관리처분/사업시행계획 인가일 (§74 또는 §29). DateInput (YYYY-MM-DD) */
redevApprovalDate: string;

/**
 * 청산금 수령 시 양도일 — 소유권이전 고시일의 다음날 (NTS 집행기준 + 소법 §95④).
 * redevSettlementDirection === "receive" 시 필수.
 * DateInput.
 */
redevSettlementSaleDate: string;

/** 권리가액 (원, 인가전 분 양도가액으로 의제). CurrencyInput */
redevRightsValue: string;

/** 청산금 (원, 절댓값). CurrencyInput */
redevSettlementAmount: string;

/** 인가전 분 필요경비 (원). CurrencyInput */
redevPreApprovalExpenses: string;

// ── 환산 케이스 (useEstimatedAcquisition=true 시만) ──

/** 취득시 기준시가 (주택분 토지+건물 합산, 원) */
redevAcquisitionStdPrice: string;

/** 관리처분 인가일 기준시가 (= 양도 의제 시점 기준시가, 원) */
redevManagementDisposalStdPrice: string;

/**
 * 개별주택가격/공동주택가격 최초 공시일 (§164⑦ 단서 트리거).
 * redevAcquisitionDate(=asset.acquisitionDate) < redevFirstDisclosureDate 시 단서 발동.
 * DateInput. ★ 정정: 이전 안 "취득전기 기준시가" 비교 폐기.
 */
redevFirstDisclosureDate: string;

/** 최초고시 시점 기준시가 (§164⑦ 단서 발동 시 대체값, 원). 선택 입력 */
redevFirstDisclosureStdPrice: string;
```

### 지점 ② initial values

`createInitialAssetForm()` 에 12개 신규 필드 빈 문자열로 초기화 + `assetKind: ""` (기존 패턴).

### 지점 ③ normalize

AssetForm → 정규화 시 12개 필드를 string → number 변환:
- 빈 문자열 → undefined (optional)
- 숫자 변환 후 `Number.isFinite` 검증

### 지점 ④ API 변환 (`lib/calc/transfer-tax-api.ts`)

```typescript
// buildAssetPayload() 내부
if (asset.assetKind === "redevelopment_apt") {
  payload.propertyType = "redevelopment_apt";
  payload.redevelopment = buildRedevelopmentInfo(asset);  // helper 함수
}
```

### 지점 ⑤ UI 위젯 — RedevelopmentBlock.tsx (신규)

**위치**: `components/calc/steps/blocks/RedevelopmentBlock.tsx`

레이아웃 (sky/emerald/amber/violet/rose 5색 카드 패턴):

```
┌─ ① sky 카드: 양도대상 선택 (ToggleCard) ─────────────┐
│  [ 입주권 양도 ] [ ✓ 완공 APT 양도 ]                  │
│  hint: 사례 44는 완공 APT 양도분                       │
└────────────────────────────────────────────────────┘

┌─ ② emerald 카드: 출자대상 (ToggleCard) ──────────────┐
│  [ 토지 출자 ] [ ✓ 주택 출자 ]                        │
└────────────────────────────────────────────────────┘

┌─ ③ amber 카드: 청산금 방향 (RadioCardGroup) ──────────┐
│  ● 청산금 납부  ○ 청산금 수령                         │
│  hint: 분양가 vs 권리가액 차액 방향                    │
└────────────────────────────────────────────────────┘

┌─ ④ violet 카드: 재개발 일정·금액 [시행령 §166②1호 배지] ─┐
│  인가 법령 근거 (ToggleCard): [✓ 도정법 §74] [§29 disabled]│
│  관리처분/사업시행계획 인가일 (DateInput): [2009-10-23]    │
│  hint: 도정법 §74 인가일자 (§29 인가는 후속 PR)            │
│                                                            │
│  ★ 권리가액 (= 인가전 분 양도가액으로 의제, §166①)        │
│  권리가액 (CurrencyInput):    [219,218,500]                │
│  청산금 (CurrencyInput):      [92,781,500]                 │
│  인가전 필요경비:              [2,551,049]                 │
│                                                            │
│  ─ 미리보기 (useMemo, 순수 계산, §166②1호 산식) ─         │
│  분양가 = 권리가액 + 납부청산금                            │
│        = 219,218,500 + 92,781,500                          │
│        = 312,000,000                                       │
│  기존건물분 비율 = 219,218,500 / 312,000,000 = 70.26%      │
│  청산금분 비율   =  92,781,500 / 312,000,000 = 29.74%      │
│  (인가후 양도차익 = 525,000,000 − 312,000,000              │
│                  = 213,000,000 — 웃돈 원천)                │
└────────────────────────────────────────────────────────────┘

┌─ ⑤ rose 카드: 환산취득가 (useEstimatedAcquisition ON 시만) ─┐
│  취득시 기준시가(주택분):  [85,034,988]                       │
│  관리처분일 기준시가:      [132,000,000]                       │
│  ─ §164⑦ 단서 대비 (선택 입력) ─                              │
│  최초공시일 (DateInput):    [2005-04-30]                       │
│  최초고시 기준시가:         [86,000,000]                       │
│                                                                │
│  ─ 미리보기 (useMemo, 순수 계산) ─                            │
│  환산취득가 = floor(219,218,500 × 85,034,988 / 132,000,000)   │
│            = 141,221,532                                       │
│  §164⑦ 단서: [미적용 / 발동 — 최초공시일 < 취득일이므로]      │
│              ※ 발동 시 §164⑤ 준용 대체 산식 적용              │
└──────────────────────────────────────────────────────────────┘
```

**가시성 규칙**:
- 본 PR: ① 양도대상은 "완공 APT" 고정 (입주권 disabled + 후속 PR 안내 텍스트)
- 본 PR: ② 출자대상은 "주택 출자" 고정 (토지출자 disabled)
- 본 PR: ③ 청산금 방향은 "납부" 고정 (수령 disabled)
- ⑤ 환산 카드는 기존 `useEstimatedAcquisition` 토글 ON 시만 노출 (실가 모드는 ⑤ 숨김 + actualAcquisitionPrice 단일 필드)

### 지점 ⑥ 사이드바 합계 — **변경 없음**

CLAUDE.md "사이드바 합계는 계산 가능한 항목만" 규칙 준수.
**권리가액·청산금은 사이드바에 추가하지 않음** (단일 입력 변수 — 합계 산정 비대상).
사이드바는 기존대로 양도가액·환산취득가·필요경비·양도차익만 표시.
권리가액·청산금은 ④ 미리보기 카드 + 결과 카드에 노출.

### 지점 ⑦ 결과 카드 (ResultCard.tsx)

3분할 분기별 카드:

```
┌─ 시행령 §166②1호 배지 ─ "재개발/재건축 APT 양도 (청산금 납부)" ─┐
│ 분양가 = 권리가액 + 납부청산금                                   │
│        = 219,218,500 + 92,781,500 = 312,000,000                  │
│ 인가후 양도차익 = 양도가액 − 분양가                              │
│                = 525,000,000 − 312,000,000 = 213,000,000 (웃돈) │
└──────────────────────────────────────────────────────────────────┘

┌─ 인가전 분 (관리처분 인가일 이전) ─────────────────┐
│ ★ 의제 양도가액 = 권리가액 = 219,218,500           │
│ 환산취득가     = 141,221,532 [§176의2②2호]        │
│   = floor(219,218,500 × 85,034,988 / 132,000,000)  │
│ 필요경비       =   2,551,049                       │
│ 양도차익       =  75,445,917                       │
│ LTHD (취득일 2005-04-09 ~ 양도일 2023-02-16,      │
│       17년 10개월, §166⑤2호나목, 표1 30%):        │
│              22,633,775                            │
└────────────────────────────────────────────────────┘

┌─ 인가후 기존건물분 [§166②1호 안분] ────────────────────┐
│ 양도가액 안분 = 525,000,000 × 70.26%                   │
│             ≈ 368,865,000                              │
│ 분양가 안분  = 312,000,000 × 70.26% = 219,218,500      │
│ 양도차익     = 인가후 213,000,000 × (219,218,500/312,000,000) │
│             = 149,658,784                              │
│ LTHD (취득일 ~ 양도일, 17년 10개월,                    │
│       §166⑤2호나목, 표1 30%):                         │
│              44,897,635                                │
└────────────────────────────────────────────────────────┘

┌─ 청산금 납부분 [§166②1호 안분] ────────────────────────┐
│ 양도가액 안분 = 525,000,000 × 29.74% ≈ 156,135,000     │
│ 분양가 안분  =  92,781,500                             │
│ 양도차익     = 인가후 213,000,000 × ( 92,781,500/312,000,000) │
│             =  63,341,216                              │
│ LTHD (인가일 2009-10-23 ~ 양도일 2023-02-16,           │
│       13년 3개월, §166⑤2호가목, 표1 26%):             │
│              16,468,716                                │
└────────────────────────────────────────────────────────┘

┌─ 합계 ─────────────────────────────────────┐
│ 양도차익 합계: 288,445,917                  │
│ LTHD 합계:      84,000,126                  │
│ 양도소득금액: 204,445,791                   │
│ 기본공제:       2,500,000                   │
│ 과세표준:     201,945,791                   │
│ ───────────────────────────────────────    │
│ 산출세액:    56,799,400                     │
│ 지방소득세:   5,679,940                     │
│ 세액합계:    62,479,340                     │
└────────────────────────────────────────────┘
```

**산식 표기**: 한국어 풀어쓰기. 변수 약어·`floor()` 금지.
**"원" 단위 미표기**: feedback_no_won_suffix 정책 준수.

### 지점 ⑧ Validation (`lib/calc/transfer-tax-validate.ts`)

```typescript
if (asset.assetKind === "redevelopment_apt") {
  if (!asset.redevSubject) errors.push("양도대상(입주권/완공 APT) 선택 필수");
  if (asset.redevSubject === "apt" && !asset.redevOriginalAssetType) {
    errors.push("출자대상(토지/주택) 선택 필수");
  }
  if (!asset.redevSettlementDirection) errors.push("청산금 방향 선택 필수");
  if (!asset.redevApprovalLawBasis) errors.push("인가 법령 근거(§74 / §29) 선택 필수");
  if (!asset.redevApprovalDate) errors.push("관리처분/사업시행계획 인가일 입력 필수");
  if (!asset.redevRightsValue || Number(asset.redevRightsValue) <= 0) {
    errors.push("권리가액 입력 필수");
  }
  // 인가일 < 취득일 차단 (승계조합원 인가 후 취득 — 후속 PR)
  if (new Date(asset.redevApprovalDate) < new Date(asset.acquisitionDate)) {
    errors.push("인가일은 취득일 이후여야 합니다 (승계조합원 인가 후 취득은 후속 지원 예정)");
  }
  // 청산금 수령 시 settlementSaleDate 필수 (소유권이전 고시일 다음날)
  if (asset.redevSettlementDirection === "receive" && !asset.redevSettlementSaleDate) {
    errors.push("청산금 수령 시 소유권이전 고시일 다음날(settlementSaleDate) 입력 필수");
  }
  // 환산 모드 + 기준시가 필수
  if (asset.useEstimatedAcquisition) {
    if (!asset.redevAcquisitionStdPrice) errors.push("환산 모드 취득시 기준시가 필수");
    if (!asset.redevManagementDisposalStdPrice) errors.push("환산 모드 관리처분일 기준시가 필수");
  }
  // §164⑦ 단서 — 최초공시일 입력 시 최초고시 기준시가 동반 필수
  if (asset.redevFirstDisclosureDate && !asset.redevFirstDisclosureStdPrice) {
    errors.push("최초공시일 입력 시 최초고시 기준시가도 필수 (시행령 §164⑦ 단서 §164⑤ 준용 대체 산식용)");
  }
  // ★ §164⑦ 단서 차단 — 취득일 < 최초공시일이면 firstDisclosureStdPrice 필수 (C-02 회귀 차단)
  if (
    asset.useEstimatedAcquisition &&
    asset.redevFirstDisclosureDate &&
    new Date(asset.acquisitionDate) < new Date(asset.redevFirstDisclosureDate) &&
    !asset.redevFirstDisclosureStdPrice
  ) {
    errors.push(
      "취득일이 개별주택가격/공동주택가격 최초공시일 이전인 경우 최초고시 기준시가 입력 필수 (시행령 §164⑦ 단서 발동)"
    );
  }
}
```

### 지점 ⑨⑩⑪⑫⑬⑭ API/Route 6개 동기화

**⑨ Zod enum 메인** (`app/api/calc/transfer/route.ts`):
```typescript
propertyType: z.enum([
  "housing", "land", "building",
  "right_to_move_in", "presale_right",
  "mixed-use-house",
  "commercial_building", "general_building_unit", "general_building",
  "redevelopment_apt",  // ★
])
```

**⑩ Zod enum 컴패니언** (`addPropertyRefines`): redevelopment_apt 분기 refine 추가.

**⑪ assetForm acquisitionDate fallback**: 기존 패턴 재사용 (영향 없음).

**⑫ Zod 입력 객체 정의**:
```typescript
const RedevelopmentSchema = z.object({
  subject: z.enum(["right", "apt"]),
  approvalLawBasis: z.enum(["urban_renovation_§74", "small_housing_§29"]),
  approvalDate: z.coerce.date(),
  rightsValue: z.number().int().min(0),
  settlementDirection: z.enum(["pay", "receive"]),
  settlementAmount: z.number().int().min(0),
  settlementSaleDate: z.coerce.date().optional(),  // 수령 시 필수 — refine 검증
  preApprovalExpenses: z.number().int().min(0),
  postApprovalExpenses: z.number().int().min(0).optional(),  // B-1: 인가후 분 필요경비 (기본 0)
  originalAssetType: z.enum(["land", "housing"]).optional(),
  acquisitionStdPrice: z.number().int().min(0).optional(),
  managementDisposalStdPrice: z.number().int().min(0).optional(),
  firstDisclosureDate: z.coerce.date().optional(),  // §164⑦ 단서 트리거
  firstDisclosureStdPrice: z.number().int().min(0).optional(),
  acquisitionRounding: z.enum(["floor", "round"]).optional(),  // 기본 floor
})
  .refine(
    (v) => v.settlementDirection !== "receive" || v.settlementSaleDate != null,
    { message: "청산금 수령 시 settlementSaleDate(소유권이전 고시일 다음날) 필수" },
  )
  // ★ API 직접 호출 우회 차단 — subject="apt" 시 originalAssetType 필수
  .refine(
    (v) => v.subject !== "apt" || v.originalAssetType != null,
    { message: "subject='apt' (완공 APT 양도) 시 originalAssetType ('land' | 'housing') 필수" },
  )
  // ★ 환산 모드 일관성 — 환산 기준시가 입력 시 두 시점(취득시·관리처분일) 모두 필수
  .refine(
    (v) =>
      (v.acquisitionStdPrice == null && v.managementDisposalStdPrice == null) ||
      (v.acquisitionStdPrice != null && v.managementDisposalStdPrice != null),
    { message: "환산 모드: 취득시 기준시가와 관리처분일 기준시가는 함께 입력해야 함" },
  );

// TransferRequestSchema 확장
redevelopment: RedevelopmentSchema.optional(),
```

**⑬ callTransferTaxAPI body spread** (`transfer-tax-api.ts`):
```typescript
body: JSON.stringify({
  ...rest,
  redevelopment: input.redevelopment,  // ★ 누락 시 silent stripping
}),
```

**⑭ Route handler 엔진 input 매핑**:
```typescript
const parsed = TransferRequestSchema.parse(body);
const coerced = coerceDates(parsed.redevelopment, [
  "approvalDate",
  "settlementSaleDate",
  "firstDisclosureDate",
]);
const engineInput: TransferTaxInput = {
  ...rest,
  redevelopment: coerced,
};
```

### Store 마이그레이션 (지점 외 — DoD 항목)

**위치**: `lib/stores/calc-wizard-migration.ts`

```typescript
const CURRENT_VERSION = N + 1;  // bump

export const migrations = {
  [N + 1]: (state: any) => ({
    ...state,
    assets: state.assets.map((a: any) => ({
      ...a,
      // 12개 redev 필드 default
      redevSubject: a.redevSubject ?? "",
      redevApprovalLawBasis: a.redevApprovalLawBasis ?? "",
      redevOriginalAssetType: a.redevOriginalAssetType ?? "",
      redevSettlementDirection: a.redevSettlementDirection ?? "",
      redevApprovalDate: a.redevApprovalDate ?? "",
      redevSettlementSaleDate: a.redevSettlementSaleDate ?? "",
      redevRightsValue: a.redevRightsValue ?? "",
      redevSettlementAmount: a.redevSettlementAmount ?? "",
      redevPreApprovalExpenses: a.redevPreApprovalExpenses ?? "",
      redevAcquisitionStdPrice: a.redevAcquisitionStdPrice ?? "",
      redevManagementDisposalStdPrice: a.redevManagementDisposalStdPrice ?? "",
      redevFirstDisclosureDate: a.redevFirstDisclosureDate ?? "",
      redevFirstDisclosureStdPrice: a.redevFirstDisclosureStdPrice ?? "",
    })),
  }),
};
```

---

## 4. UI 컴포넌트 패턴 준수

- DateInput (`type="date"` 금지) — `feedback_date_input`
- CurrencyInput (전체 선택 onFocus 내장) — `feedback_select_on_focus`
- ToggleCard / RadioCardGroup (native 금지) — `feedback_toggle_card_visibility`
- 미리보기 카드는 useEffect 미러링 금지 → useMemo 순수 계산 — `feedback_useeffect_store_mirror_forbidden`
- 결과 카드 산식은 한국어 풀어쓰기 — `feedback_result_view_korean_formula`
- 숫자 "원" 단위 표기 금지 — `feedback_no_won_suffix`
- 법조문 링크 (`LawArticleModal` 배지):
  - ④ violet 카드 헤더: **시행령 §166②1호** (재개발 양도차익 산정 본문) + 도정법 §74 (관리처분 인가)
  - ⑤ rose 카드 헤더: **시행령 §176의2②2호** (환산 산식) + §164⑦ (단서) + §164⑤ (단서 대체 준용)
  - ⑦ 결과카드 헤더 (전체): **시행령 §166②1호·§166⑤2호** (양도차익·LTHD 분기 법령 근거)
  - ⑦ 결과카드 인가전 분: §166③ + §176의2②2호
  - ⑦ 결과카드 인가후 기존건물분: §166②1호 안분
  - ⑦ 결과카드 청산금 분: §166②1호 안분 + §166⑤2호가목 (LTHD 보유기간)

---

## 5. 14개 동기화 지점 체크리스트

| # | 지점 | 파일 | 상태 |
|---|---|---|---|
| ① | 폼 상태 타입 | `lib/stores/calc-wizard-asset.ts` AssetForm | ☐ |
| ② | initial | `createInitialAssetForm()` | ☐ |
| ③ | normalize | `normalizeAssetForm()` | ☐ |
| ④ | API 변환 | `lib/calc/transfer-tax-api.ts` buildAssetPayload | ☐ |
| ⑤ | UI 위젯 | `RedevelopmentBlock.tsx` (신규) | ☐ |
| ⑥ | 사이드바 합계 | **변경 없음 — 추가 금지** | ✅ |
| ⑦ | 결과 카드 | `ResultCard.tsx` + `FilingFormTable.tsx` 3열 | ☐ |
| ⑧ | validation | `lib/calc/transfer-tax-validate.ts` | ☐ |
| ⑨ | Zod enum 메인 | `app/api/calc/transfer/route.ts` propertyType | ☐ |
| ⑩ | Zod enum 컴패니언 | `addPropertyRefines` | ☐ |
| ⑪ | acquisitionDate fallback | 기존 패턴 | ✅ |
| ⑫ | Zod 입력 객체 | `RedevelopmentSchema` | ☐ |
| ⑬ | callTransferTaxAPI body spread | `transfer-tax-api.ts` | ☐ |
| ⑭ | Route handler 매핑 | route.ts + coerceDates | ☐ |
| + | Store 마이그레이션 | `calc-wizard-migration.ts` version bump | ☐ |
| + | finalize LTHD 3줄 ↔ FilingFormTable 3열 1:1 매칭 | anchor 검증 | ☐ |
| + | **§166 LawArticleModal 배지 4개 위치** (④/⑤/⑦ 헤더 + 결과카드 분기별) | 위 §4 명시 | ☐ |
| + | **§164⑦ 단서 차단 validation** (취득일<최초공시일+최초고시 미입력) | transfer-tax-validate.ts | ☐ |
| + | **Zod refine 4건** (수령 시 SaleDate / apt+originalAssetType / 환산 기준시가 쌍 / §164⑦ 트리거) | route.ts RedevelopmentSchema | ☐ |

---

## 6. 후속 PR (UI 측)

- 사례 36~43 UI 노출 (입주권 / APT 토지출자 / 청산금 수령) — 토글 disabled 해제
- 사례 45 1세대1주택 12억 안분 UI (기존 housing 분기 통합)
- 사례 46 비과세 미달 UI 처리 (시행령 §154 통합)
- 권리가액 토지·건물 분리 평가 UI (PDF 제7절)
- 인가일 < 취득일 (승계조합원 인가 후 취득) 분기 UI
