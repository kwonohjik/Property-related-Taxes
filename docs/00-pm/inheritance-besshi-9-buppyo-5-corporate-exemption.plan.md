# 별지 제9호서식 부표 5 — 영리법인 상속세 면제 및 납부 명세서 계획서

> 2026-05-21 · feature: `inheritance-besshi-9-buppyo-5-corporate-exemption`
> 선행: Phase 1·1.5·2·3 (`c48826a` ~ `479b94c`)
> 소관: `inheritance-gift-tax-ui-senior` (UI) · `inheritance-gift-tax-senior` (엔진 결과 노출) · `bkit:enterprise-expert` 자문 (데이터 모델 확장 검토)

## 1. 배경 — KoreanLaw MCP 검증된 양식

PR-D (`e87be7c`)에서 KoreanLaw MCP `get_annexes(상속세 및 증여세법 시행규칙, annexNo="9", knd="2")` 검증 결과, **별지 제9호서식 부표 5** 가 영리법인 §3의2② 면제 전용 양식임을 확인.

현행 시스템:
- 결과 카드의 `corporateExemption.breakdown` 만 노출 — 면제액·한도 산식 3행
- 부표 5의 ⑩ 지분율 · ⑪ 면제분 납부세액(⑤-⑥)×⑩ 등 **상속인·직계비속 책임 매핑 미구현**

## 2. 부표 5 양식 (KoreanLaw 본문)

### 가. 상속세 면제대상 영리법인

| 칸 | 항목 | 출처 |
|---|---|---|
| ① | 법인명 | `Heir.name` (relation="corporate") |
| ② | 사업자등록번호 | **신규 필드** `Heir.businessRegistrationNumber` |
| ③ | 사업장 소재지 | **신규 필드** `Heir.businessAddress` |
| ④ | 영리법인이 받았거나 받을 상속 재산가액 (유증 등 재산가액) | 사전증여 가산 `gift.giftAmount` 또는 유증분 |
| ⑤ | 영리법인에게 면제된 상속세액 (면제세액) | `corporateExemption.amount` |
| ⑥ | ④ × 10% | 계산 |

### 나. 상속세 납부 대상자

| 칸 | 항목 | 출처 |
|---|---|---|
| ⑦ | 구분 (상속인 / 상속인의 직계비속) | **신규 데이터** `ShareholderInfo.relation` |
| ⑧ | 성명 | `ShareholderInfo.name` |
| ⑨ | 주민등록번호 | `ShareholderInfo.residentNumber` (옵션) |
| ⑩ | 지분율 (%) | **신규 데이터** `ShareholderInfo.sharePercent` |
| ⑪ | 면제분 납부세액 = `[(⑤ − ⑥) × ⑩]` | 계산 |

### 작성방법 6 (KoreanLaw 본문)

```
[⑤ 면제세액 − ④ × 10%] × 상속인과 그 직계비속의 영리법인 주식 보유 비율(⑩)
```

→ **§3의2②의 핵심**: 상속인·직계비속이 영리법인 주주인 경우, 그 비율에 따라 면제분을 납부해야 함. 면제는 절대 면제가 아닌 "주주 책임 환원".

## 3. 데이터 모델 확장 (핵심)

### 3-1. `Heir` 타입 확장 (`lib/tax-engine/types/inheritance-gift.types.ts`)

```ts
export interface Heir {
  // ... 기존 필드 ...

  /** 영리법인 — 사업자등록번호 (부표 5 ② 컬럼). relation="corporate" 시 사용. */
  businessRegistrationNumber?: string;
  /** 영리법인 — 사업장 소재지 (부표 5 ③ 컬럼). relation="corporate" 시 사용. */
  businessAddress?: string;
  /**
   * 영리법인 주주 중 상속인·직계비속 명세 (부표 5 가. 나. 표).
   * §3의2② 면제분 납부세액 = (면제세액 − 유증가액×10%) × 지분율
   * relation="corporate" 시 사용.
   */
  shareholders?: ShareholderInfo[];
}

export interface ShareholderInfo {
  /** 식별자 (UI key) */
  id: string;
  /** 상속인 / 상속인의 직계비속 */
  relation: "heir" | "lineal_descendant_of_heir";
  /** 성명 */
  name: string;
  /** 주민등록번호 (옵션 — 신고서 표시용) */
  residentNumber?: string;
  /** 지분율 (0~1 decimal) */
  shareRatio: number;
}
```

### 3-2. 엔진 결과 확장 (`InheritanceTaxResult.corporateExemption`)

```ts
export interface CorporateExemptionResult {
  amount: number;          // ⑤ 면제세액 (기존)
  limit: number;           // 한도 (기존)
  breakdown: CalculationStep[]; // 기존
  // 신규 — 부표 5 분배 명세
  perCorporateBreakdown?: PerCorporateExemptionDetail[];
}

export interface PerCorporateExemptionDetail {
  /** Heir.id — 영리법인 식별자 */
  corporateId: string;
  /** ④ 유증·증여 재산가액 (해당 영리법인분) */
  inheritedAmount: number;
  /** ⑤ 면제세액 (해당 영리법인분) — 다수 영리법인 시 안분 */
  exemptionAmount: number;
  /** ⑥ ④ × 10% */
  tenPercentBaseline: number;
  /** 상속인·직계비속별 ⑪ 면제분 납부세액 */
  shareholderPayments: {
    shareholderId: string;
    sharePercent: number;
    paymentAmount: number; // = (⑤ - ⑥) × shareRatio
  }[];
}
```

### 3-3. 엔진 변경 — `inheritance-corporate-exemption.ts`

기존 단일 면제액 계산 → 영리법인별 분배 + 주주별 책임 환원 계산. STEP 10 (`inheritance-tax.ts:361`)에서 `Heir.shareholders` 참조.

## 4. UI 신규 — `CorporateExemptionFilingFormTable.tsx`

위치: `components/calc/results/CorporateExemptionFilingFormTable.tsx`

```tsx
interface Props {
  result: InheritanceTaxResult;
  heirs: Heir[];
}
```

### 표 구조

**가. 영리법인별 면제 명세 (부표 5 가)**

| 영리법인 | 사업자번호 | 소재지 | ④ 유증·증여가액 | ⑤ 면제세액 | ⑥ ④×10% |
|---|---|---|---|---|---|

**나. 상속인·직계비속 납부 책임 (부표 5 나)**

| 구분 | 성명 | 주민번호 | ⑩ 지분율 | ⑪ 면제분 납부세액 |
|---|---|---|---|---|

기존 `InheritanceTaxResultView` 의 corporateExemption 카드는 유지(요약). 본 표는 별도 섹션 — 인쇄 토글 적용 ([[print-only-css-toggle]]).

## 5. PriorGiftInput 확장 — 영리법인 Heir 입력 UI

상속인 입력 단계 (Step 0)에서 `relation="corporate"` Heir 행 추가 가능해야 함. 현재 `HeirComposition` 컴포넌트 확인 후:

- 영리법인 행 추가 버튼
- `businessRegistrationNumber` · `businessAddress` 입력
- `shareholders` 동적 행 추가 — 상속인/직계비속 선택 + 지분율 입력

→ **별도 컴포넌트 권장**: `CorporateHeirInput.tsx` (≤300줄)

## 6. 14 동기화 지점

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 상태 | Heir 타입 `businessRegistrationNumber`·`businessAddress`·`shareholders` 추가 | 본 PR |
| ② initial | 영리법인 Heir 추가 시 기본값 + ShareholderInfo 빈 배열 | 본 PR |
| ③ normalize | sessionStorage 마이그레이션 — 기존 Heir 호환 (모두 optional) | 본 PR |
| ④ API 변환 | `lib/calc/inheritance-api.ts` Heir spread | 자동 |
| ⑤ UI 위젯 | CorporateHeirInput 신규 + CorporateExemptionFilingFormTable 신규 | 본 PR |
| ⑥ 사이드바 | 변경 없음 | — |
| ⑦ 결과 카드 | corporateExemption.perCorporateBreakdown 노출 | 본 PR |
| ⑧ Validation | 영리법인 Heir — businessRegistrationNumber 옵션 / shareholders 지분율 합 ≤1 | 본 PR |
| ⑨ Zod enum | ShareholderInfo schema 신규 | 본 PR |
| ⑩~⑭ | route handler 자동 spread | 자동 |

## 7. 케이스 매트릭스

| # | 시나리오 | 입력 | 기대 |
|---|---|---|---|
| F5-1 | 영리법인 + 주주 없음 | shareholders=[] | 면제는 발동되나 부표 5 나. 빈 행 |
| F5-2 | 영리법인 1 + 주주 1 (상속인, 지분 100%) | sharePercent=1.0 | ⑪ 면제분 납부 = (⑤−⑥)×1 |
| F5-3 | 영리법인 1 + 주주 2 (상속인 50% + 직계비속 30%) | 합 0.8 | ⑪ 각 행 분배 + 20% 주주 외 → 환원 없음 |
| F5-4 | 영리법인 2 + 각 주주 다름 | 행 2개 | perCorporateBreakdown[2] |
| F5-5 (회귀) | 영리법인 미존재 (자연인만) | — | 부표 5 표 미렌더 |
| F5-6 | 지분율 합 > 1.0 | sharePercent 합 1.2 | validate 차단 |

## 8. anchor 검증

- ANCHOR-F5-1: PDF 책 1866 ⑩ 영리법인 면제 150M + 주주 시뮬레이션
- ANCHOR-F5-2: 다수 영리법인 안분 (perCorporateBreakdown)
- ANCHOR-F5-3: shareholders 지분율 합 ≤1 validate
- ANCHOR-F5-4: 회귀 — 기존 corporateExemption.amount 동일

## 9. Out-of-Scope

- 부표 1 재산종류코드 정합화 (별도 계획서)
- 상속세 모드 모달 활성화 (별도 계획서)
- 영리법인 Heir 입력 UI 의 자동 prefill (Heir.businessRegistrationNumber DB 조회 등)

## 10. 작업량 예상

| 항목 | 변경 |
|---|---|
| Heir 타입 확장 + Zod | ~30줄 |
| inheritance-corporate-exemption.ts 분배 로직 | ~100줄 |
| CorporateHeirInput.tsx 신규 | ~300줄 |
| CorporateExemptionFilingFormTable.tsx 신규 | ~250줄 |
| InheritanceTaxResultView 통합 | ~30줄 |
| validate 확장 | ~30줄 |
| anchor 4건 | ~200줄 |
| **합계** | **~940줄** |

→ 800줄 정책상 별도 PR 분할 권장: (1) 엔진·타입 (2) UI 입력 (3) UI 표시.

## 11. Definition of Done

- [ ] KoreanLaw MCP §3의2② 본문 + 시행령 §3 (안분 비율) 인용 검증
- [ ] Heir 확장 (businessRegistrationNumber·businessAddress·shareholders)
- [ ] CorporateExemptionResult.perCorporateBreakdown 노출
- [ ] CorporateHeirInput 컴포넌트 (영리법인 행 추가·주주 입력)
- [ ] CorporateExemptionFilingFormTable 컴포넌트 (가·나 두 표)
- [ ] anchor F5-1~F5-4 통과
- [ ] F5-5 회귀 보호
- [ ] sessionStorage 마이그레이션 (기존 Heir 호환)
- [ ] `npx tsc --noEmit` 0건
- [ ] 브라우저 수동 확인 + 인쇄 미리보기
- [ ] 800줄 정책 준수 (PR 3분할)
