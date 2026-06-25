# §45의3 일감몰아주기 증여의제 — 엔진 설계

> PDCA Design 단계 산출물. 계획서 `gift-related-corp-45-3.plan.md` v2를 단일 진실로 삼음.
> 법령: 본칙 mst=276123 (시행 20260102) / 시행령 mst=283637 (시행 20260227). KoreanLaw 조회기준 2026-06-25.

---

## Context

§45의3은 지배주주가 보유한 수혜법인이 특수관계법인에 일감을 몰아줌으로써 수혜법인의 기업가치가 상승하면, 그 이익을 지배주주 및 친족에게 증여한 것으로 의제하는 조문이다. Phase 3(PR#289)에서 계산식 박스 미렌더를 이유로 의도 보류됐으며, 교재 「2026 양도·상속·증여세」 사례 4(2023 귀속 2024 신고) 이미지를 동결 자료로 확보한 후 본 구현에 착수한다.

기존 `specific-corp.ts`(§45의5) 패턴과의 핵심 차이: §45의5는 스칼라 단순 곱셈 1건이지만 §45의3은 주주·간접출자법인·매출처 3개 roster, 2모드 간접보유 계산, 수증자별 과세제외매출 분리(§⑭3호), 한계보유비율 간접 우선차감 로직을 포함하는 복합 구조다.

---

## ★ 케이스 인벤토리 (필수)

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|----------|-------------|-----------|------|
| 1 | 중소기업 — 교재 사례 4 전체 재현 (갑 직접 20,520,000 + 을 직접 16,200,000 = 36,720,000) | §45의3①가목, §34의3①②⑦⑧⑨⑫⑬⑭⑱ | 교재 사례4 원단위 정확분수 정수연산 양 검토자 독립 재현 일치 | `__tests__/tax-engine/gift-deemed/related-corp.test.ts` | ☐ TODO |
| 2 | 지배주주 판정용 ruling 간접보유 (C경유 포함 갑 간10%) vs 수증자 §⑱ recipient 간접보유 (C경유 제외 갑 간9%) — 2모드 분기 | §34의3①②, §34의3⑱ | 계획서 §4 단계1·단계4 | (케이스1 내) | ☐ TODO |
| 3 | 수증자별 과세제외매출 상이 — 갑(§⑭3호 D매출×30%=3,000 추가 → 8,000) vs 을(5,000) → 세후영업이익·거래비율 분기 | §34의3⑭3호 | 계획서 §4 단계5·6 | (케이스1 내) | ☐ TODO |
| 4 | 한계보유비율 간접 우선차감 음수 방지 — 갑 간접9, 한계10: indirectDeduct=9, 잔여=1, 직접초과=19 / 을 간접6, 한계10: indirectDeduct=6, 잔여=4, 직접초과=6 | §34의3⑬ 후단 | 계획서 §4 단계7, RC-LIMIT-NONNEG | (케이스1 내) | ☐ TODO |
| 5 | 한계보유비율 캡 — min(영업이익/소득,1) = 갑 min(2500/1800,1)=1 → 법인세 전액(340M) 적용 | §34의3⑫2호나목 | 계획서 §4 단계5, RC-MINCAP | (케이스1 내) | ☐ TODO |
| 6 | 과세제외매출 ⑩1호 (중소-중소) vs ⑩5호 (수출) 동시 해당 → 큰 금액 선택 | §34의3⑩ 단서 | 계획서 §3.2 (B=3000 vs E=2000 → 별개 특수관계법인이므로 합산, 단서는 동일법인 동시해당) | (케이스1 내) | ☐ TODO |
| 7 | §⑱ 간접출자법인 자동판정 — B(지배주주등 갑30+을20=50%→⑱1호 충족) 포함 / C(지배주주등 갑10%→30%미만 미충족) 제외 | §34의3⑱1호 | 계획서 §4 단계4 | (케이스1 내) | ☐ TODO |
| 8 | 과세요건 미충족 — 거래비율 ≤ 정상거래비율(중소 50%) 시 applied=false | §45의3①1호가목 | 경계값 — anchor별도 | `related-corp.test.ts` | ☐ TODO |
| 9 | 중견·일반 기업규모 — 정상거래비율(40%/30%)·한계보유비율(10%/3%) 분기. 계산식 거래비율차감(20%/5%)은 법령 박스 미렌더 → **확인 필요**, 본 사례(중소) 제외 케이스 미구현 | §45의3①가(중견)/나(일반), §34의3⑦⑨ | (미확보 — Design 재확인 필요) | (TODO) | ☐ SCOPE_OUT 중견·일반 |
| 10 | §⑲ 단일법인 의제 확인 — B·D·E 복수 특수관계법인이어도 하나로 계산 | §34의3⑲ | 케이스1 결과 = 단일 deemedGiftValue | (케이스1 내) | ☐ TODO |
| 11 | 수증자 없음 (모든 주주 한계보유비율 이하) → applied=false, recipientBreakdown=[] | §45의3①, §34의3⑧⑨ | 경계값 | `related-corp.test.ts` | ☐ TODO |
| 12 | §⑮ 배당공제 — 사례 0, UI 기본 미노출·고급 토글. 음수 방지: max(0, …) | §34의3⑮ | 사례 0 확인 (RC-TOTAL 불변) | (케이스1 내) | ☐ TODO |

**규칙**: 행≥1 있음. "SCOPE_OUT 중견·일반"은 계획서 §10-4 YAGNI 확정. 중소(케이스1)만 anchor 확정, 중견·일반은 거래비율차감 본문 미확보 상태에서 미구현 명시.

---

## 법령 근거 (KoreanLaw 실측, 추정 없음)

### §45의3①2호 계산식 (본칙 — 박스 미렌더 확정)

```
KoreanLaw get_law_text mst=276123 §45의3 조회 결과:
  2호 가목: "수혜법인이 중소기업에 해당하는 경우:" → 계산식 박스 미렌더 (빈 텍스트)
  2호 나목: "수혜법인이 중견기업에 해당하는 경우:" → 계산식 박스 미렌더 (빈 텍스트)
  2호 다목: "수혜법인이 중소기업 및 중견기업에 해당하지 아니하는 경우:" → 계산식 박스 미렌더 (빈 텍스트)
```

⚠️ **계산식 박스 미렌더 — 흐름도 보충**. 교재 사례(중소)는 계획서 §2.1 확정값(anchor RC-GAP-DIRECT/RC-EUL-DIRECT 일치)으로 역산하면:

```
증여의제이익 = 세후영업이익 × (특수관계법인거래비율 − 거래비율차감) × (주식보유비율 − 보유비율차감)
```

계산식 내 4개 비율(계획서 §2.1 표) — 아래 "§3개 비율 상수" 절에서 분리 정의.

**중견·일반 거래비율차감(20%/5%)**: 법령 박스 미렌더로 직접 인용 불가. 교재 흐름도에서 확인. **Design 단계 법령집/유권해석 추가 확인 필요** — 미구현(SCOPE_OUT) 명시, 사례(중소 50%) anchor 영향 없음.

### §34의3 핵심 항 (시행령, KoreanLaw 실측 ✓)

**①② 지배주주 판정**:
- 최대주주등 중 직접보유 최고가 법인이면 → 직접+간접 합산 최고 개인.
- 간접보유비율 = 각 단계 직접보유율 곱. 복수 경로 합산.
- ①2호 단서 가목/나목: 해당 법인 주주이면서 최대주주등 미해당자 제외.

**⑤ 특수관계법인**: `§2의2①3~8호` 관계에 있는 자.

**§2의2①3~8호 (시행령, KoreanLaw 실측 ✓)**:
- 3호: 본인이 직접/1호 관계자가 경영에 사실상 영향력 행사하는 기업집단 소속 기업
- 4호: 본인/1~3호가 재산 출연하거나 이사 과반수 차지하는 비영리법인
- 5호: 3호 기업 임원·퇴직임원이 이사장인 비영리법인
- **6호: 본인/1~5호 또는 공동으로 발행주식총수등의 30% 이상 출자하고 있는 법인** ← D법인(갑 30% 출자) 해당
- **7호: 본인/1~6호 또는 공동으로 발행주식총수등의 50% 이상 출자하고 있는 법인**
- 8호: 본인/1~7호 또는 공동으로 재산 출연하거나 이사 과반수 차지하는 비영리법인

사례 적용: D법인 — 갑 30% 출자 → §2의2①6호 해당. E법인 — 교재에서 "특수관계" 명시, `isRelated=true` 입력으로 수령(엔진이 §2의2 자체판정 불요). B법인 — 갑 30% 출자 → §2의2①6호 해당.

**⑦ 정상거래비율**: 일반 30%, 중소 50%, 중견 40% (실측 ✓).

**⑧ 지배주주 친족의 수증자 판정**: 직접보유비율 + §⑱ 간접출자법인 경유 간접보유비율 합계 > 한계보유비율.

**⑨ 한계보유비율**: 일반 3%, 중소·중견 10% (실측 ✓).

**⑩ 과세제외매출액 8유형** (동시해당 시 큰 금액):
- 1호: 중소기업 수혜법인 ↔ 중소기업 특수관계법인 거래매출
- 2호: 수혜법인이 본인 주식보유비율 50% 이상 특수관계법인과 거래
- 3호: 수혜법인이 본인 주식보유비율 50% 미만 특수관계법인과 거래 × 수혜법인 주식보유비율 (`A의 B/D 보유=0` → 사례 미적용)
- 5호: 수출목적 거래매출 (부가세법 §21②)
- 5의2호, 5의3호, 6호, 7호, 8호 (사례 미해당)

**⑫ 세후영업이익 산식** (KoreanLaw §34의3⑫ 실측):
```
세후영업이익 = [영업손익 + 세무조정 − {(산출세액 − 공제감면) × min(세무조정영업이익 / 각사업연도소득, 1)}]
               × [1 − 과세제외매출액 / 과세제외매출액이 포함된 사업연도의 매출액]
```
- `corporateTaxNet` = 산출세액 − 공제감면 (§34의3⑫2호가목). 별도 필드로 수령 (계획서 F-10).
- min(1) 캡 적용 (§34의3⑫2호나목).
- 분모는 "과세제외매출액이 포함된 사업연도의 매출액" = 총매출액. ⑭3호 적용 후 수증자별 과세매출비율 분기.

**⑬ 증여의제이익 출자관계별 구분**:
- 간접보유비율 1/1000 미만 제외.
- 가목(중소) "한계보유비율을 초과하는 주식보유비율" / 나목(중견) "한계보유비율의 100분의 50을 초과하는 주식보유비율" → 보유비율차감.
- **간접보유비율에서 먼저 차감** → 간접출자관계 2개 이상이면 작은 것부터 차감.

**⑭ 출자관계별 과세제외매출 추가**:
- 3호: 수혜법인이 특수관계법인과 거래한 매출액 × **지배주주등의 그 특수관계법인에 대한 주식보유비율** (per 수증자 shareholderId 매칭)

**⑱ §45의3② 간접출자법인**:
- 1호: 지배주주등이 발행주식총수등의 30% 이상 출자 (실측 ✓)
- 2호: 지배주주등 + 1호법인이 50% 이상 출자
- 3호: 1호·2호 법인과 수혜법인 사이 개재 법인

**⑲** 특수관계법인 둘 이상이어도 하나의 법인으로부터 이익을 얻은 것으로 봄.

---

## §3개 비율 상수 분리 (혼동 금지)

> 중소기업은 우연히 거래 50% = 정상거래비율과 같고 보유 10% = 한계보유비율과 같아 사례만으로 구분 불가 → **반드시 3종 별개 상수**. 중견·일반 분기 구현 시 절대 혼용 금지.

```typescript
// lib/tax-engine/gift-deemed/related-corp.ts 내 선언 (DB 미사용, 정적 상수)

/** 비율 단위: 분자 정수 (분모 100 기준) */
const NORMAL_TRADE_RATIO = {
  small:  50,  // §34의3⑦ 중소 100분의50 ✓실측
  medium: 40,  // §34의3⑦ 중견 100분의40 ✓실측
  large:  30,  // §34의3⑦ 일반 100분의30 ✓실측
} as const;

const MARGINAL_OWNERSHIP_RATIO = {
  small:  10,  // §34의3⑨ 중소·중견 100분의10 ✓실측
  medium: 10,  // §34의3⑨ 중소·중견 100분의10 ✓실측
  large:   3,  // §34의3⑨ 일반 100분의3 ✓실측
} as const;

/**
 * 계산식 거래비율차감 (증여의제이익 계산식 내 — §45의3①2호 박스 미렌더)
 * 중소(50%)는 교재 사례로 확정. 중견(20%)·일반(5%)은 흐름도 확인.
 * ⚠️ 중견·일반 Design 단계 법령집 재확인 필요 — 현재 SCOPE_OUT.
 */
const TRADE_RATIO_DEDUCTION = {
  small:  50,  // §45의3①2호가목 박스 교재사례 역산·흐름도 확인 ✓
  medium: 20,  // §45의3①2호나목 박스 미렌더 → 흐름도 → ⚠️ 확인필요 / SCOPE_OUT
  large:   5,  // §45의3①2호다목 박스 미렌더 → 흐름도 → ⚠️ 확인필요 / SCOPE_OUT
} as const;

/**
 * 계산식 보유비율차감 (증여의제이익 계산식 내)
 * §34의3⑬ 실측: 가목=한계보유비율, 나목=한계보유비율×50%, 다목=미언급→0
 */
const OWNERSHIP_RATIO_DEDUCTION = {
  small:  10,  // §34의3⑬가목 "한계보유비율을 초과하는 주식보유비율" → 한계 10% ✓실측
  medium:  5,  // §34의3⑬나목 "한계보유비율의 100분의50을 초과하는 주식보유비율" → 10%×50%=5% ✓실측
  large:   0,  // §34의3⑬ 다목(일반) 미언급 → 흐름도 0% (추정 아님 — 미언급=차감없음 해석)
} as const;

/** 모든 비율 상수의 공통 분모 (High-2 정정: NORMAL_TRADE_RATIO_DENOM 미선언 수정) */
const RATIO_DENOM = 100 as const;
```

---

## 엔진 input 타입

```typescript
// lib/tax-engine/gift-deemed/types.ts 에 추가

/** §45의3 일감몰아주기 — 주주 1명 */
export interface RcShareholder {
  /** 식별자 (결과 표시 금지 — name 우선, feedback_no_internal_id_in_result) */
  id: string;
  name: string;
  /** 관계: "self"=지배주주 판정 대상 / "relative"=친족 / "other"=해당없음 */
  relation: "self" | "relative" | "other";
  /** 직접보유비율 분수. 예: 20% → { numer: 20, denom: 100 } */
  directRatio: { numer: number; denom: number };
  /** true면 법인주주 → intermediaryCorps에 대응 항목 있어야 함 */
  isCorporate: boolean;
}

/** §45의3 일감몰아주기 — 간접출자법인 1개 */
export interface RcIntermediaryCorpItem {
  /** 이 법인을 보유하는 법인주주 id (RcShareholder.id 매칭) */
  corpShareholderId: string;
  /** 이 법인의 수혜법인에 대한 직접보유비율 분수 */
  stakeInBeneficiary: { numer: number; denom: number };
  /** 이 법인의 개인 소유주 목록 (§⑱ 자동판정용: 합산≥30% 시 §⑱1호 충족) */
  owners: {
    /** RcShareholder.id 매칭 */
    individualId: string;
    /** 이 법인에 대한 지배주주등의 직접보유비율 분수 */
    ratio: { numer: number; denom: number };
  }[];
}

/** §34의3⑩ 과세제외유형 enum */
export type RcExclusionType =
  | "sec10_1"   // ⑩1호: 중소-중소
  | "sec10_2"   // ⑩2호: 수혜법인 50%↑ 출자 특수관계법인
  | "sec10_3"   // ⑩3호: 수혜법인 50%미만 출자 × 주식보유비율 (본 사례 미적용)
  | "sec10_4"   // ⑩4호: 지주회사-자회사·손자회사
  | "sec10_5"   // ⑩5호: 수출목적
  | "sec10_5_2" // ⑩5의2호: 국외용역
  | "sec10_5_3" // ⑩5의3호: 영세율용역
  | "sec10_6"   // ⑩6호: 법정의무거래
  | "sec10_7"   // ⑩7호: 프로스포츠 광고
  | "sec10_8";  // ⑩8호: 공공기관

/** §45의3 일감몰아주기 — 매출처 1개 */
export interface RcSalesPartner {
  id: string;
  name: string;
  /** 매출액(원) */
  salesAmount: number;
  /** 특수관계 여부 (사용자 입력 — 엔진이 §2의2 자체판정 불요) */
  isRelated: boolean;
  /** §⑩ 과세제외유형. 없으면 undefined */
  exclusionType?: RcExclusionType;
  /**
   * §⑭3호: 지배주주등의 이 법인에 대한 주식보유비율 목록 (per 수증자 매칭).
   * 복수 수증자(갑·을)가 서로 다른 보유비율을 가질 수 있으므로 배열.
   * 없으면 undefined (⑭3호 미적용).
   */
  rulingShareholderStakes?: {
    /** RcShareholder.id — 수증자별 매칭 키 */
    shareholderId: string;
    /** 이 수증자의 이 특수관계법인에 대한 주식보유비율 분수 */
    ratio: { numer: number; denom: number };
  }[];
}

/** §45의3 일감몰아주기 — 엔진 입력 (nested, 순수함수) */
export interface RelatedCorpInput {
  /** 기업규모 — 비율 3종 분기의 단일 분기점 */
  enterpriseSize: "small" | "medium" | "large";

  // ─── 수혜법인 재무 ───
  /** 총 매출액(원) = §34의3⑫ 분모 */
  totalSales: number;
  /** 세무조정 반영 후 영업손익(원) = §34의3⑫1호 */
  preTaxAdjOperatingIncome: number;
  /** 각 사업연도 소득금액(원) = §34의3⑫2호나목 분모 */
  taxableIncome: number;
  /**
   * 법인세 순세액(원) = 산출세액 − 공제감면 = §34의3⑫2호가목.
   * (계획서 F-10: 별도 필드로 수령, 엔진이 역산 금지)
   */
  corporateTaxNet: number;

  // ─── 3개 roster ───
  shareholders: RcShareholder[];
  intermediaryCorps: RcIntermediaryCorpItem[];
  salesPartners: RcSalesPartner[];

  // ─── §⑮ 배당공제 (기본 0) ───
  /** 수혜법인으로부터 받은 배당소득(원). 기본 0 */
  directDividendIncome?: number;
  /** 간접출자법인으로부터 받은 배당소득(원). 기본 0 */
  indirectDividendIncome?: number;
}

// ※ RcIntermediaryCorpItem 은 위에서 interface로 직접 정의됨.
//    types.ts 에 동일 이름으로 export.
```

---

## 엔진 result 타입 (Critical-1 정정)

### 구현 패턴: base `DeemedGiftResult` optional 필드 추가

**실측**: `router.ts:24` 반환 타입은 base `DeemedGiftResult`. `DeemedGiftResultView.tsx:306` prop도 `DeemedGiftResult`. 기존 6개 확장(contribution·merger·capital_decrease 등)은 모두 base의 optional 필드로 구현 후 존재 가드(`result.contributionBreakdown && ...`)로 분기 — `extends DeemedGiftResult` 선례 0건.

`RelatedCorpResult extends DeemedGiftResult` 패턴 폐기 → **base `DeemedGiftResult`(types.ts:33)에 optional 필드 추가** 방식을 채택. `RelatedCorpResult`는 내부 강조용 타입 별칭으로만 유지(실제 반환·prop 타입은 base).

```typescript
// lib/tax-engine/gift-deemed/types.ts — base DeemedGiftResult에 추가할 optional 필드 목록

/** §45의3 수증자 1명의 직접/간접 분해 명세 */
export interface RcRecipientBreakdown {
  /** 표시명: name.trim() || "주주" (feedback_no_internal_id_in_result) */
  recipientName: string;
  directGain: number;
  indirectGain: number;
  subtotal: number;
  pretaxProfit: number;
  tradeRatioOver: { numer: number; denom: number };
  /** 직접보유비율(차감 전 raw) — UI와 대칭 표시 (Medium-4: 제거 금지) */
  directRatioRaw: { numer: number; denom: number };
  /**
   * §⑱ recipient 간접보유비율 raw — RC-INDIRECT-ECHO 검증.
   * "미작동"과 "차감후 0"을 구분하기 위해 항상 echo.
   */
  indirectRatioRaw: { numer: number; denom: number };
  directOwnershipOver: { numer: number; denom: number };
  indirectOwnershipOver: { numer: number; denom: number };
  additionalExclusion: number;
  totalExclusion: number;
  dividendDeduction: number;
}

// ─── base DeemedGiftResult에 추가되는 optional 필드 (Critical-1) ───
//
// 기존 패턴 (types.ts:62~113):
//   contributionBreakdown?  →  DeemedGiftResultView: if (result.contributionBreakdown && ...)
//   mergerMatrix?           →  DeemedGiftResultView: if (result.mergerMatrix && ...)
//   capitalDecreaseMulti?   →  DeemedGiftResultView: if (result.capitalDecreaseMulti && ...)
//
// §45의3 신규 추가 (동일 패턴):
interface DeemedGiftResultExtension {
  /** §45의3 수증자별 명세 — Array(Map 금지, feedback_engine_result_map_json_loss) */
  recipientBreakdown?: RcRecipientBreakdown[];
  /** §45의3 판정된 지배주주 이름 */
  rulingShareholder?: string;
  /** §45의3 특수관계법인거래비율 분수 */
  tradeRatio?: { numer: number; denom: number };
  /** §45의3 특수관계매출 합계(원) — Medium-5: UI "15,000,000,000" 표시용 */
  relatedSales?: number;
  /** §45의3 수혜법인 단위 공통 과세제외매출(원) = ⑩항 */
  taxableExcludedSales?: number;
  /** §45의3 §⑫ 과세매출비율 적용 전 세후영업이익(원) */
  baseAfterTaxProfit?: number;
  /** §45의3 거래비율 분자(특수관계매출 − 과세제외) */
  tradeRatioNumer?: number;
  /** §45의3 거래비율 분모(총매출 − 과세제외) */
  tradeRatioDenom?: number;
  /** §45의3 과세요건 충족 여부 */
  taxRequirementMet?: boolean;
  /** §45의3 정상거래비율 분수 */
  normalTradeRatio?: { numer: number; denom: number };
  /** §45의3 한계보유비율 분수 */
  marginalOwnershipRatio?: { numer: number; denom: number };
}
// ★ Do 단계: 위 필드들을 types.ts DeemedGiftResult interface(L33~L113) 끝에 추가.
//   내부 강조용: type RelatedCorpResult = DeemedGiftResult (별칭만, extends 없음)

// 결과뷰/prefill 분기 패턴 (기존 일치):
// if (result.recipientBreakdown && result.type === "related_corp") { ... }
```

---

## 계산 알고리즘 (단계별 의사코드)

### 전체 파이프라인

```
calcRelatedCorpGift(input: RelatedCorpInput): DeemedGiftResult
  → 단계1: 지배주주 판정 (computeRulingShareholderInfo)
  → 단계2: 특수관계법인 식별 (입력 isRelated=true 사용)
  → 단계3: 거래비율·과세요건 (computeTradeRatioAndRequirement)
  → 단계3-부속: 과세요건 미충족 시 applied=false 조기반환
  → 단계4: 수증자 판정 (computeRecipients)
  → 단계5: 수증자별 세후영업이익 (computeAfterTaxProfit per recipient)
  → 단계6: 수증자별 거래비율차감후 (computeTradeRatioOverPerRecipient)
  → 단계7: 수증자별 보유비율차감후 간접우선 (computeOwnershipOverPerRecipient)
  → 단계8: 수증자별 직접/간접 증여의제이익 합산
  → 단계9: §⑮ 배당공제 (max(0, …))
  → 결과 조립: recipientBreakdown 배열 + echo 필드
```

### 단계1 — 지배주주 판정 (`computeRulingShareholderInfo`)

```typescript
// 목적: ruling 모드 간접보유 계산 (모든 간접출자법인 경유 합산, §⑱ 제한 없음)
function computeIndirectRatio(
  shareholderId: string,
  intermediaryCorps: RcIntermediaryCorpItem[],
  shareholders: RcShareholder[],
  mode: "ruling" | "recipient",
  // recipient 모드 전용: 이미 판정된 지배주주등 ids (갑+을)
  rulingGroupIds?: string[],
): { numer: number; denom: number }
```

**ruling 모드**: `intermediaryCorps` 전체 경유(§⑱ 판정 없이 전부).
- 각 간접출자법인에서 `shareholders[id].directRatio × intermed.stakeInBeneficiary` 곱.
- 복수 경유 합산.

**recipient 모드**: §⑱ 충족 법인 경유만.
- §⑱ 자동판정: 각 intermediaryCorps에서 `owners`의 지배주주등(rulingGroupIds) 합산 ratio ≥ 30% → §⑱1호 충족.
- 충족 법인만 경유하여 간접보유 계산.

**지배주주 판정 순서**: (순환 없음)
1. ruling 모드로 전체 직접+간접 합산.
2. 최다보유 개인 → 지배주주.
3. 지배주주 + relation="relative" 주주들 → 지배주주등(rulingGroupIds) 확정.
4. 그 후 recipient 모드에서 §⑱ 자동판정 (단계4에서 사용).

```typescript
// 지배주주 판정 로직
const rulingTotals = shareholders
  .filter(s => !s.isCorporate)  // 개인만
  .map(s => ({
    id: s.id,
    name: s.name,
    total: s.directRatio.numer / s.directRatio.denom
           + toDecimal(computeIndirectRatio(s.id, intermediaryCorps, shareholders, "ruling")),
  }));
// 법인주주 직접>개인이면 법인 소유 개인 중 합산 최고
const rulingShareholderId = rulingTotals.sort((a,b) => b.total - a.total)[0]?.id;
```

### [헬퍼] `computeCommonExclusion` (High-1 정정: 정의 추가)

```typescript
/**
 * §⑩ 공통 과세제외매출액 계산.
 * 규칙 1: 동일 법인이 ⑩호 복수 동시해당 → max 금액만 포함 (§⑩ 후단).
 * 규칙 2: 서로 다른 법인 간 합산.
 * 사례: B(⑩1호, 3,000M) + E(⑩5호, 2,000M) = 5,000M ✓
 */
function computeCommonExclusion(salesPartners: RcSalesPartner[]): number {
  const byPartner = new Map<string, number>();
  for (const p of salesPartners.filter(p => p.exclusionType != null)) {
    byPartner.set(p.id, Math.max(byPartner.get(p.id) ?? 0, p.salesAmount));
  }
  let total = 0;
  for (const amount of byPartner.values()) { total += amount; }
  return total;
}
```

### 단계3 — 거래비율·과세요건

```typescript
// 수혜법인 단위 1회 계산
const relatedSales = salesPartners
  .filter(p => p.isRelated)
  .reduce((a, p) => a + p.salesAmount, 0);  // B+D+E = 15,000M

// §⑩ 공통 과세제외매출 (위 computeCommonExclusion 헬퍼 사용)
// ★ 본 사례: B(⑩1호, 3000M) + E(⑩5호, 2000M) = 5,000M. 다른 법인이므로 합산.
const commonExclusion = computeCommonExclusion(salesPartners);  // 5,000M

const tradeRatioNumer = relatedSales - commonExclusion;  // 10,000M
const tradeRatioDenom = totalSales - commonExclusion;    // 15,000M

// 과세요건: 거래비율 > 정상거래비율
const taxRequirementMet =
  tradeRatioNumer * RATIO_DENOM > tradeRatioDenom * NORMAL_TRADE_RATIO[enterpriseSize];
  // (정확분수 비교: numer/denom > threshold/100 → numer*RATIO_DENOM > denom*threshold)
```

### 단계4 — 수증자 판정

```typescript
// recipient 모드 간접보유 사용 (C경유 제외)
// §34의3⑧: "§⑱ 간접출자법인을 통한 간접보유비율"
const recipients = shareholders
  .filter(s => !s.isCorporate && (s.relation === "self" || s.relation === "relative"))
  .filter(s => {
    const direct = s.directRatio;
    const indirect = computeIndirectRatio(s.id, intermediaryCorps, shareholders, "recipient", rulingGroupIds);
    const total = direct.numer * indirect.denom + indirect.numer * direct.denom;
    const denom = direct.denom * indirect.denom;
    // total/denom > MARGINAL_OWNERSHIP_RATIO[enterpriseSize]/100
    return total * 100 > denom * MARGINAL_OWNERSHIP_RATIO[enterpriseSize];
  });
```

### 단계5 — 수증자별 세후영업이익 (`computeAfterTaxProfit`)

```typescript
// 공통 앞부분 (수혜법인 단위)
const capRatio = Math.min(
  preTaxAdjOperatingIncome / taxableIncome,  // 분수 비교 우선, 부동소수 주의
  1,
);  // §34의3⑫2호나목: 1 초과→1
const baseAfterTax = preTaxAdjOperatingIncome - Math.floor(corporateTaxNet * capRatio);
// capRatio가 정확히 1인 경우(2500/1800→1): corporateTaxNet 전액 차감

// 수증자별 §⑭3호 추가 과세제외
for (const recipient of recipients) {
  let additionalExclusion = 0;
  for (const partner of salesPartners) {
    if (!partner.isRelated) continue;
    if (partner.exclusionType) continue;  // 이미 ⑩호 과세제외 → ⑭ 불요
    const stake = partner.rulingShareholderStakes?.find(
      s => s.shareholderId === recipient.id,
    );
    if (!stake) continue;
    // §⑭3호: 매출액 × 지배주주등 보유비율
    additionalExclusion += safeMultiplyThenDivide(
      partner.salesAmount, stake.ratio.numer, stake.ratio.denom,
    );
  }
  const totalExclusion = commonExclusion + additionalExclusion;
  // §34의3⑫ 과세매출비율 = 1 − totalExclusion / totalSales
  // 세후영업이익(수증자별) = baseAfterTax × (1 − totalExclusion/totalSales)
  // = baseAfterTax × (totalSales − totalExclusion) / totalSales
  const pretaxProfit = safeMultiplyThenDivide(
    baseAfterTax,
    totalSales - totalExclusion,
    totalSales,
  );
  // ...저장
}
```

### 단계6 — 수증자별 거래비율차감후

```typescript
// 수증자별 과세제외매출을 반영한 거래비율 재계산
for (const recipient of recipients) {
  const totalExclusion = commonExclusion + recipient.additionalExclusion;
  const recipientTradeNumer = relatedSales - totalExclusion;
  const recipientTradeDenom = totalSales - totalExclusion;
  // 거래비율 − 거래비율차감(중소 50%) = recipientTradeNumer/recipientTradeDenom − threshold/100
  // = (recipientTradeNumer * 100 − recipientTradeDenom * threshold) / (recipientTradeDenom * 100)
  const deduction = TRADE_RATIO_DEDUCTION[enterpriseSize];
  const tradeOverNumer = recipientTradeNumer * 100 - recipientTradeDenom * deduction;
  const tradeOverDenom = recipientTradeDenom * 100;
  // 음수 방지: max(0, …)
  const tradeOver = {
    numer: Math.max(0, tradeOverNumer),
    denom: tradeOverDenom,
  };
  // 저장: tradeRatioOver = tradeOver
}
// 갑: (15000-8000)*100 − (20000-8000)*50 = 700000 − 600000 = 100000 / 1200000 = 1/12 ✓
// 을: (15000-5000)*100 − (20000-5000)*50 = 1000000 − 750000 = 250000 / 1500000 = 1/6 ✓
```

### 단계7 — 보유비율차감후 간접 우선차감 (`computeOwnershipOver`) — 분수 정수연산 (High-3 정정)

**핵심: 음수 방지 min/max 로직 (계획서 §4 단계7, RC-LIMIT-NONNEG)**
**정책: `Math.round` 금지 (CLAUDE.md 정수연산 원칙 · memory `safemul_decimal_apportion_precision`)**

분수 비교는 교차곱(`a.numer * b.denom vs b.numer * a.denom`)으로, 차감·초과 모두 공통분모 정수연산.

```typescript
/**
 * 분수 min (교차곱 비교, 분모 상동 가정 불필요).
 * a ≤ b → a 반환 / a > b → b 반환. Math.round/부동소수 불사용.
 */
function fracMin(
  a: { numer: number; denom: number },
  b: { numer: number; denom: number },
): { numer: number; denom: number } {
  // a/b ≤ c/d  ↔  a*d ≤ c*b  (양수 분모 가정)
  return a.numer * b.denom <= b.numer * a.denom ? a : b;
}

/**
 * 분수 max(0, a - b) — 음수 방지.
 * 공통분모 = a.denom * b.denom 으로 통일 후 정수 뺄셈.
 */
function fracMaxZeroSub(
  a: { numer: number; denom: number },
  b: { numer: number; denom: number },
): { numer: number; denom: number } {
  // a/ad − b/bd = (a.numer*b.denom − b.numer*a.denom) / (a.denom*b.denom)
  const commonDenom = a.denom * b.denom;
  const diffNumer = a.numer * b.denom - b.numer * a.denom;
  return {
    numer: Math.max(0, diffNumer),  // max(0, …): 음수 방지 — floor 없이 정수로 사용
    denom: commonDenom,
  };
}

function computeOwnershipOver(
  directRatio: { numer: number; denom: number },    // 직접보유비율 분수
  indirectRatio: { numer: number; denom: number },   // recipient 간접보유비율 분수
  enterpriseSize: "small" | "medium" | "large",
): {
  directOver: { numer: number; denom: number };    // 직접 출자관계 보유비율차감후
  indirectOver: { numer: number; denom: number };   // 간접 출자관계 보유비율차감후
} {
  // 한계보유비율 분수 (RATIO_DENOM=100 기준)
  const deductionNumer = OWNERSHIP_RATIO_DEDUCTION[enterpriseSize];
  const marginalFrac = { numer: deductionNumer, denom: RATIO_DENOM };
  // 갑: { numer: 10, denom: 100 }

  // ── §⑬: 간접보유비율에서 먼저 차감 ──

  // 1) 간접에서 차감할 양 = min(간접보유비율, 한계보유비율) — 교차곱 비교
  //    갑: min(9/100, 10/100) = 9/100
  const indirectDeduct = fracMin(indirectRatio, marginalFrac);

  // 2) 잔여 한계 = max(0, 한계 − indirectDeduct) — 공통분모 = 100*indirectDeduct.denom
  //    갑: 100/10000 = 1/100 (수치 검증은 RC-LIMIT-NONNEG 블록 참조)
  const remaining = fracMaxZeroSub(marginalFrac, indirectDeduct);

  // 3) 간접초과 = max(0, 간접 − 한계)
  const indirectOver = fracMaxZeroSub(indirectRatio, marginalFrac);

  // 4) 직접초과 = max(0, 직접 − 잔여한계)
  const directOver = fracMaxZeroSub(directRatio, remaining);

  // ── 최종 증여의제이익 적용 시 (단계8): floor 1회 ──
  // tradeOver·directOver 두 분수를 단일 분수로 합성 후 safeMultiplyThenDivide 1회.
  // ★ 중첩 호출(floor 2회)은 일반케이스 1원 오차 → 금지
  //   (memory feedback_floor_residual_absorption · safemul_decimal_apportion_precision)

  return { directOver, indirectOver };
}
```

**RC-LIMIT-NONNEG 검증 (정수연산 경로)**:
- 갑: 간접9/100, 한계10/100 → indirectDeduct=9/100, remaining=100/10000=1/100, directOver=max(0,20/100−100/10000)=1900/10000≥0 ✓, indirectOver=max(0,9/100−10/100)=0/10000≥0 ✓
- 을: 간접6/100, 한계10/100 → indirectDeduct=6/100, remaining=400/10000=4/100, directOver=max(0,10/100−400/10000)=600/10000≥0 ✓, indirectOver=0 ✓
- 음수 불발생 확인 (Math.max(0,…) 정수 경로)

### 단계8 — 증여의제이익 / 단계9 — §⑮ 배당공제

```typescript
// §45의3②: 직접 + 간접 출자관계 각각 계산 → 합산
// ★ floor 1회: tradeOver × over 를 단일 분수로 합성 (중첩 = floor 2회 → 1원 오차 금지, P-3)
function applyTwoFractions(
  profit: number,
  f1: { numer: number; denom: number },
  f2: { numer: number; denom: number },
): number {
  // profit × (f1.numer*f2.numer) / (f1.denom*f2.denom) — safeMultiplyThenDivide 내부 BigInt·floor 1회
  return safeMultiplyThenDivide(profit, f1.numer * f2.numer, f1.denom * f2.denom);
}
const directGain = applyTwoFractions(pretaxProfit, tradeOver, directOver);
// 갑: 1,296,000,000 × (1×19) / (12×100) = 1,296,000,000 × 19 / 1200 = 20,520,000 ✓ (floor 1회)
const indirectGain = indirectOver.numer > 0
  ? applyTwoFractions(pretaxProfit, tradeOver, indirectOver)
  : 0;  // 갑: 0 ✓

// §34의3⑮ 배당공제 — 음수 방지 max(0, …). 사례: 0 → RC-TOTAL 불변
const directAfterDeduction = Math.max(0, directGain - computeDividendDeduction(...));
```

---

## Silent fallback / 자동 안분 후보 식별

- **`enterpriseSize` 미입력**: validate에서 오류 차단 (자동 fallback 금지).
- **`intermediaryCorps` 빈 배열**: 간접보유 0으로 처리 (자동안분 아님 — 입력 없으면 0이 정상).
- **`rulingShareholderStakes` 미입력**: §⑭3호 미적용 처리 (additionalExclusion=0). 자동추정 금지 — UI에서 입력 유도.
- **`corporateTaxNet` 미입력**: validate 차단 (0으로 silently 채우면 세후영업이익 과대 → 금지).
- **지분합 100% 미달**: validate 차단 (자동 안분 금지).

---

## 파일 분할 계획 (800줄 정책)

```
lib/tax-engine/gift-deemed/
├── related-corp.ts           ← Orchestrator: calcRelatedCorpGift() 메인함수
│                                + 비율 상수 3종 + 단계1~9 조합 + 결과 조립
│                                예상 줄수: ~350줄
├── related-corp-helpers.ts   ← 내부 헬퍼 함수들:
│   ├── computeIndirectRatio(mode: "ruling"|"recipient")
│   ├── computeCommonExclusion()      // §⑩ 법인별 max·합산 (High-1 추가)
│   ├── computeTradeRatioAndRequirement()
│   ├── computeAfterTaxProfit()       // 수증자별 세후영업이익
│   ├── computeTradeRatioOver()       // 수증자별 거래비율차감후
│   ├── computeOwnershipOver()        // 단계7 간접우선차감 분수정수연산 (High-3)
│   └── computeDividendDeduction()    // §⑮ 배당공제
│                                예상 줄수: ~400줄
```

**사용 헬퍼** (기존 파일에서 import):
- `safeMultiplyThenDivide(a, b, c)` — `lib/tax-engine/tax-utils.ts:104` (BigInt overflow 가드, floor)
- `applyRateFraction(amount, numer, denom)` — `lib/tax-engine/tax-utils.ts:121` (분수 세율 적용)

**부적합 헬퍼** (사용 금지):
- `computeWeightedPerShare` — §39 증자후 1주당 평가 전용. §45의3 비율곱에 맞지 않음 (계획서 §5-8).

---

## anchor 표 (원단위 toBe, 정확분수)

| ID | 검증 내용 | 기대값 | 비고 |
|---|---|---|---|
| RC-DOM-1 | 지배주주 판정 — 갑(직접20+ruling간접10=30) | isRuling=true | §34의3①②1호 |
| RC-RATIO-1 | 거래비율 분수 | numer=10000, denom=15000 (=2/3) | (15000−5000)/(20000−5000) |
| RC-BENE-1 | 수증자 수 — 갑·을 2명 (병 제외) | 2명 | §34의3⑧⑨ |
| RC-PRETAX-갑 | 갑 세후영업이익 (§⑭3호 D 3000 추가) | **1,296,000,000** | 2160M × (1−8000/20000) |
| RC-PRETAX-을 | 을 세후영업이익 | **1,620,000,000** | 2160M × (1−5000/20000) |
| RC-MINCAP | min(2500/1800,1) 캡 → 법인세 전액 340M 적용 | corporateTaxApplied=340,000,000 | §34의3⑫2호나목 |
| RC-GAP-DIRECT | 갑 직접 증여의제이익 | **20,520,000** | 1296M×(1/12)×(19/100) |
| RC-EUL-DIRECT | 을 직접 증여의제이익 | **16,200,000** | 1620M×(1/6)×(6/100) |
| RC-INDIRECT-ECHO | 갑 recipient 간접보유 9% echo — 차감후 0 (미작동 아님) | indirectRatioRaw.numer=9, indirectGain=0 | 코드검토 #12 |
| RC-LIMIT-NONNEG | 한계 간접우선차감 음수 불발생 (갑 간9, 한계10) | directOver≥0, indirectOver=0 | §34의3⑬ 단계7 |
| **RC-TOTAL** | **최종 합계 = 갑+을** | **36,720,000** | 정확분수 정수연산 |

> 교재 36.71백만(갑 20.51+을 16.20)은 8.33% 중간반올림 차이. 엔진은 1/12 정확분수로 20,520,000이 정답.
> 중견·일반 케이스 anchor는 거래비율차감 본문 확보 후 추가 — 현재 **확인 필요** 상태.

---

## 14지점 매핑

| # | 지점 | 파일 (file:line 실측) | 신규 작업 | 비고 |
|---|---|---|---|---|
| 엔진 | `DeemedGiftType` enum | `types.ts:30` (마지막 항 `specific_corp` 다음) | `"related_corp"` 추가 | |
| 엔진 | `RelatedCorpInput` 타입 | `types.ts` 신규 | `RcShareholder`·`RcIntermediaryCorpItem`·`RcSalesPartner`·`RelatedCorpInput` interface 추가 | |
| 엔진 | base result 필드 추가 (Critical-1) | `types.ts:33~113` (base `DeemedGiftResult`) | `recipientBreakdown?`·`rulingShareholder?`·`tradeRatio?`·**`relatedSales?`(Medium-5)**·`taxableExcludedSales?`·`baseAfterTaxProfit?`·`tradeRatioNumer?`·`tradeRatioDenom?`·`taxRequirementMet?`·`normalTradeRatio?`·`marginalOwnershipRatio?` optional 필드 추가. `RelatedCorpResult`는 내부 별칭(`type DeemedGiftResult`). router 반환·결과뷰 prop은 base 유지 | extends 선례 0건 — optional 필드 패턴 강제 |
| 엔진 | 계산기 | `related-corp.ts` + `related-corp-helpers.ts` 신규 2파일 | 800줄 사전 분할 | |
| 엔진 | 라우터 | `router.ts:24-67` | switch `"related_corp"` 분기 + import | |
| 엔진 | 법령상수 | `legal-codes/inheritance-gift.ts:152-170` | `GIFT.RELATED_CORP = "상증법 §45의3"` 추가 | grep `RELATED_CORP`=0건 확인 (계획서 §7) |
| 엔진 | `DeemedGiftInput` union | `types.ts:641-661` | `\| ({ type: "related_corp" } & RelatedCorpInput)` 추가 | |
| **⑫Zod** | **입력 스키마** | `lib/validators/gift-deemed-input.ts:344-367` | `relatedCorpSchema` — `z.array` **중첩 3종** (`shareholders`, `intermediaryCorps[].owners`, `salesPartners[].rulingShareholderStakes`) + `superRefine` (지분합·매출합 검증) | TS 미감지 → grep 필수 |
| **④⑬** | **API 변환·fetch body** | `lib/calc/gift-deemed-api.ts:26-482` | case `"related_corp"` — **roster 3배열 명시 매핑** | discriminated union 누락 TS 미감지 → **grep 자가점검** 필수 (계획서 #1 Critical) |
| **⑧** | **validate** | `lib/calc/gift-deemed-validate.ts` | 주주 직접지분 합계=100% / 매출처 합계 일치 / 3 roster 빈행 차단 | cd-multi 패턴 차용 |
| **⑭** | **route** | `app/api/calc/gift-deemed/route.ts:63-66` | `calcDeemedGift` 경유 dispatch | Date 필드 없음 → `coerceDates` 불요 |
| ① | 폼 상태 | `components/calc/deemed-gift/deemed-form-state.ts` | flat row 배열 + INITIAL_FORM | |
| ⑤ | UI 폼 | `related-corp-form.tsx` 신규 | **roster 3 테이블** (주주·간접출자·매출처) | §45의5 3필드와 차원 다름 |
| ⑦ | 결과뷰 | `DeemedGiftResultView.tsx` | 수증자별 직접/간접 표. `name.trim() \|\| "주주"` (id 비노출) | `:564`·`:632` 패턴 |
| **④-prefill** | **`related_corp` prefill 분기 신설** | `lib/calc/gift-deemed-api.ts` | `result.type === "related_corp"` **전용 분기** 신설 필요 (Low-11): `recipientBreakdown[0]`을 main 수증자로, 나머지를 `simultaneousGifts`로 매핑. 기존 `result.type === "contribution"` 게이트와 **별개 분기**(`contribution` 재사용 불가 — 타입 게이트 다름). | contribution 패턴 차용하되 게이트 `=== "related_corp"` 으로 신설 |
| − | 페이지 선택지 | `DeemedGiftCalculator.tsx` · `app/page.tsx:101` | 의제 선택지 추가 | |

**⑬ grep 자가점검 의무**: Do 완료 후 반드시 실행.
```bash
grep -n "related_corp" lib/calc/gift-deemed-api.ts
# → case "related_corp": 분기 + 3배열(shareholders/intermediaryCorps/salesPartners) 명시 확인
```

**⑫ Zod 중첩 배열 구조**:
```typescript
// gift-deemed-input.ts
const relatedCorpSchema = z.object({
  type: z.literal("related_corp"),
  enterpriseSize: z.enum(["small", "medium", "large"]),
  totalSales: z.number().int().min(1),
  preTaxAdjOperatingIncome: z.number().int(),
  taxableIncome: z.number().int().min(1),
  corporateTaxNet: z.number().int().min(0),
  shareholders: z.array(z.object({
    id: z.string(),
    name: z.string(),
    relation: z.enum(["self", "relative", "other"]),
    directRatio: z.object({ numer: z.number().int(), denom: z.number().int().min(1) }),
    isCorporate: z.boolean(),
  })),
  intermediaryCorps: z.array(z.object({
    corpShareholderId: z.string(),
    stakeInBeneficiary: z.object({ numer: z.number().int(), denom: z.number().int().min(1) }),
    owners: z.array(z.object({  // ← 중첩 배열 ①
      individualId: z.string(),
      ratio: z.object({ numer: z.number().int(), denom: z.number().int().min(1) }),
    })),
  })),
  salesPartners: z.array(z.object({
    id: z.string(),
    name: z.string(),
    salesAmount: z.number().int().min(0),
    isRelated: z.boolean(),
    exclusionType: z.enum([/* RcExclusionType */]).optional(),
    rulingShareholderStakes: z.array(z.object({  // ← 중첩 배열 ②
      shareholderId: z.string(),
      ratio: z.object({ numer: z.number().int(), denom: z.number().int().min(1) }),
    })).optional(),
  })),
  directDividendIncome: z.number().int().min(0).optional(),
  indirectDividendIncome: z.number().int().min(0).optional(),
}).superRefine((data, ctx) => {
  // 주주 직접지분 합계 = 분모 기준 100% 검증
  // 매출처 합계 = totalSales 일치 검증
  // 3 roster 빈행(id='' 등) 차단
});
```

---

## SCOPE_OUT 명시 (계획서 §10-4)

다음은 v1.2 미구현:
- **나목(일반) 1천억 초과 특수관계매출** 요건 (§45의3①1호나목2) — `taxRequirementMet`에서 일반 케이스 진입 시 경고 출력
- **다단계 간접출자** (3단계 이상, §34의3⑱3호 계층) — YAGNI 주석
- **간접 2경로 정렬** (작은 것부터 차감, §34의3⑬ 후단) — 사례 1경로라 무영향, YAGNI 주석

**Design 미해결 — 중견·일반 거래비율차감**: §45의3①2호나목(20%)·다목(5%)은 법령 박스 미렌더로 직접 인용 불가. 중소 사례(anchor RC-GAP-DIRECT/RC-EUL-DIRECT/RC-TOTAL) 영향 없음. **중견·일반 구현 착수 시 법령집/유권해석으로 거래비율차감 본문 재확보 필수.** 현재 SCOPE_OUT.

---

## 테스트 약속

```
__tests__/tax-engine/gift-deemed/related-corp.test.ts
```

- 케이스 인벤토리 표 #1~#12 대응 anchor 테스트.
- anchor 수치: 원단위 `toBe()`. 교재 반올림차 주석 명기.
- RC-INDIRECT-ECHO: `indirectRatioRaw.numer === 9` AND `indirectGain === 0` 동시 검증 (미작동 vs 차감후 0 구분).
- RC-LIMIT-NONNEG: 단계7 산출 `directOwnershipOver.numer >= 0`, `indirectOwnershipOver.numer >= 0`.
- RC-MINCAP: `corporateTaxApplied === 340_000_000` (min(2500/1800,1)=1 → 전액).
- RC-TOTAL: `result.deemedGiftValue === 36_720_000`.
- 과세요건 미충족 케이스: `applied === false`, `deemedGiftValue === 0`.

---

## UI 통합 위임

UI 측 명세는 `gift-related-corp-45-3.ui.design.md` 참조.

엔진 시니어 책임 경계:
- `RelatedCorpInput` / `RelatedCorpResult` 타입 정의 확정.
- 수증자별 다건 prefill: `recipientBreakdown[]` 배열에서 각 수증자를 `simultaneousGifts` 패턴으로 prefill (`gift-deemed-api.ts:511-563` 패턴 차용).
- `deemedGiftValue` = 전 수증자 합계(갑+을). 개별 증여세 계산은 UI/API 레이어에서 각 수증자별로 분리 처리.
