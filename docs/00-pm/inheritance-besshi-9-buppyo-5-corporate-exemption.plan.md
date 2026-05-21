# 별지 제9호서식 부표 5 — 영리법인 상속세 면제 및 납부 명세서 계획서 (v2)

> 2026-05-21 · feature: `inheritance-besshi-9-buppyo-5-corporate-exemption`
> 선행: Phase 1·1.5·2·3 (`c48826a` ~ `479b94c`)
> 변경 이력: v1 → v2 (비판 검토 C2-1~C2-7 + KoreanLaw 본문 재검증 반영)
> 소관: `inheritance-gift-tax-ui-senior` (UI) · `inheritance-gift-tax-senior` (엔진) · `inheritance-gift-nontax-teacher` 자문 (법령 해석)

## ⚠️ 0. **중대 사전 검증** (v2 — C2-1)

### 0-1. KoreanLaw MCP §3의2② 본문 재인용 (2026-05-21 검증)

```
제3조의2(상속세 납부의무)
② 특별연고자 또는 수유자가 영리법인인 경우로서 그 영리법인의 주주 또는
   출자자(이하 "주주등"이라 한다) 중 상속인, 상속인의 배우자, 상속인의
   직계비속 또는 그 직계비속의 배우자가 있는 경우에는 대통령령으로 정하는
   바에 따라 계산한 지분상당액을 그 상속인, 상속인의 배우자, 상속인의
   직계비속 또는 그 직계비속의 배우자가 납부할 의무가 있다.
```

### 0-2. 결정적 발견 — §3의2② 적용 범위

**§3의2② 본문은 "특별연고자 또는 수유자가 영리법인인 경우"만 명문 규정**.

→ 즉:
1. **유증을 받은 영리법인** (수유자)
2. **상속재산 분여를 받은 영리법인** (특별연고자)

**사전증여 (§13 합산) 영리법인은 §3의2② 명문 적용 대상이 아님**.

### 0-3. 본 프로젝트 Phase 1 인용 재검증 필요

- `lib/tax-engine/inheritance-corporate-exemption.ts:1-5` 주석: "§3의2② + 집행기준 28-0-1"
- Phase 1 anchor (`ANCHOR-CORP-3`): PDF 책 1866 ⑩ 영리법인 사전증여 면제 150M 재현
- → **현행 엔진이 사전증여 영리법인에 §3의2② 면제를 적용**하는 것이 법령 근거가 명확한지?

→ **본 PR 진입 전 강제 검증** (`inheritance-gift-nontax-teacher` 자문):
- [ ] 사전증여 영리법인 면제의 명문 근거 확정 — §3의2② 직접 인용 vs §28 ① 단서 vs 집행기준 28-0-1 별도 해석
- [ ] PDF 책 1866 ⑩ 사례의 영리법인이 **수유자(유증)** vs **사전증여 수증자** 중 어느 쪽인지 재확인
- [ ] **본 결과에 따라 본 PR(부표 5) 적용 범위 재정의**

### 0-4. 두 시나리오 분기

#### 시나리오 A: 사전증여 영리법인도 §3의2② 적용 (현행 엔진 전제)

- 본 PR 부표 5 = 사전증여 + 유증 영리법인 모두 표시
- 작업량 유지

#### 시나리오 B: 사전증여 영리법인은 §3의2② 부적용 (본 KoreanLaw 본문 직역)

- 본 PR 부표 5 = **유증 영리법인 전용** (현재 시스템에 유증 영리법인 데이터 모델 미존재)
- **현행 엔진의 사전증여 영리법인 면제는 별도 법령 근거 명시 필요** (재검토 항목)
- Phase 1 commit (`c48826a`) 정정 가능성

**시나리오 A·B 결정 후 본 PR v3 작성**. v2는 시나리오 A 가정 하 골격 유지.

## 1. 배경 (v2 보정)

PR-D (`e87be7c`)에서 별지 제9호서식 부표 5 (영리법인 상속세 면제 및 납부 명세서) 양식 KoreanLaw MCP 검증 완료. 현행 시스템은 결과 카드의 `corporateExemption.breakdown` 만 노출 — 부표 5 의 ⑩ 지분율·⑪ 면제분 납부세액 매핑 미구현.

본 PR은 §3의2② 적용 범위 확정 후 (시나리오 A·B) 부표 5 양식 재현.

## 2. 비판 검토 반영 사항 (v2)

### 2-1. §3의2② 적용 범위 (C2-1) — §0 사전 검증

본 비판의 핵심 사안. §0 에서 결정 후 진입.

### 2-2. 데이터 모델 확장 vs PriorGift 메타 (C2-2)

**v1 제안**: `Heir.shareholders` · `ShareholderInfo` 신설.

**v2 대안 평가**:

| 옵션 | 장점 | 단점 |
|---|---|---|
| (A) Heir 확장 | 부표 5 양식 정합 (영리법인 별 정보) | 데이터 모델 비대화. corporate Heir 미사용 시 dead field |
| (B) PriorGift 메타 확장 | 사전증여 행에 inline | 유증 영리법인 케이스 미지원 (Heir 단위만) |
| (C) 신규 별도 타입 `CorporateBeneficiary` | 명확한 분리 | 또 다른 데이터 모델 추가 |

**v2 권장**: 옵션 A — **단, `corporate` Heir에만 의미 있는 옵션 필드**로 명시. 다른 Heir 영향 없음 ([[feedback_store_default_vs_ui_display_fallback]] 충실).

### 2-3. 다수 영리법인 안분 산식 명시 (C2-4)

**v1**: 산식 미명세.

**v2**: 시행령 §3의2 (KoreanLaw MCP 본문 인용 후 확정). 가정 산식:

```
각 영리법인 ⑤ 면제세액 = 전체 면제세액 × (해당 영리법인 과세표준 / 영리법인 합계 과세표준)
```

→ **본문 인용 검증 후 산식 확정**.

### 2-4. ShareholderInfo 지분율 합 범위 (C2-3)

**v2**: 부표 5 작성방법 6 — "**상속인과 그 직계비속이 보유하고 있는 영리법인의 주식등의 비율**".
- 외부 주주(상속인 아닌 자) 보유분 제외
- 합 ≤ 1.0 (1 미만 정상 — 외부 주주 존재 시)
- validate: 0 ≤ 각 행 ≤ 1, 합 ≤ 1

### 2-5. CorporateHeirInput vs HeirComposition 통합 (C2-6)

**v2 결정**: **HeirComposition 내부에 통합**.
- 별도 컴포넌트는 데이터 모델·UI 불일치 위험
- HeirComposition 의 행 추가 시 `relation === "corporate"` 분기로 추가 입력 위젯 노출
- 기존 자연인 Heir 입력 흐름과 일관

### 2-6. PR 분할 회귀 위험 (C2-5)

**v1 3 PR 분할** → 중간 단계 데이터 모델만 적용·UI 미적용 노출.

**v2**: **2 PR 통합 분할**:
1. **PR-1 (엔진 + 데이터 모델 + 결과 노출)**: Heir 확장 + corporateExemption.perCorporateBreakdown + 결과 카드 일부 노출
2. **PR-2 (UI 입력)**: HeirComposition 영리법인 분기 + CorporateExemptionFilingFormTable

PR-1 완료 후 UI 미적용 상태에서도 결과 카드의 새 필드는 안전하게 표시 (옵션 필드). PR-2 가 사용자 입력 경로 활성화.

### 2-7. 14 동기화 지점 형식적 (C2-7) — 구체화

§7 매트릭스에 구체 변경 라인·파일 명시.

### 2-8. anchor 코드 스켈레톤 추가 (CC-3)

§8 에 코드 명시.

## 3. 양식 (부표 5 KoreanLaw 검증된 본문)

### 가. 상속세 면제대상 영리법인

| 칸 | 항목 | 출처 (시나리오 A 가정) |
|---|---|---|
| ① | 법인명 | `Heir.name` (relation="corporate") |
| ② | 사업자등록번호 | `Heir.businessRegistrationNumber` (신규) |
| ③ | 사업장 소재지 | `Heir.businessAddress` (신규) |
| ④ | 받았거나 받을 상속 재산가액 | 시나리오 A: 사전증여 합산 또는 유증분 |
| ⑤ | 면제세액 | `corporateExemption.amount` |
| ⑥ | ④ × 10% | 계산 |

### 나. 상속세 납부 대상자

| 칸 | 항목 | 출처 |
|---|---|---|
| ⑦ | 구분 (상속인 / 직계비속) | `ShareholderInfo.relation` (신규) |
| ⑧ | 성명 | `ShareholderInfo.name` |
| ⑨ | 주민등록번호 | `ShareholderInfo.residentNumber` (옵션) |
| ⑩ | 지분율 | `ShareholderInfo.shareRatio` (0~1) |
| ⑪ | 면제분 납부세액 = (⑤−⑥) × ⑩ | 계산 |

## 4. 데이터 모델 확장 (옵션 A — v2 결정)

```ts
export interface Heir {
  // ... 기존 ...
  /** corporate Heir 전용 — 부표 5 ② */
  businessRegistrationNumber?: string;
  /** corporate Heir 전용 — 부표 5 ③ */
  businessAddress?: string;
  /** corporate Heir 전용 — 부표 5 나. 주주 명세 */
  shareholders?: ShareholderInfo[];
}

export interface ShareholderInfo {
  id: string;
  /** 상속인 / 상속인의 배우자 / 상속인의 직계비속 / 직계비속의 배우자 */
  relation: "heir" | "heir_spouse" | "lineal_descendant_of_heir" | "spouse_of_lineal_descendant";
  name: string;
  residentNumber?: string;
  shareRatio: number; // 0 ≤ r ≤ 1
}

export interface CorporateExemptionResult {
  amount: number;
  limit: number;
  breakdown: CalculationStep[];
  /** v2 — 영리법인 별 분배 명세 (시나리오 A 적용 시) */
  perCorporateBreakdown?: PerCorporateExemptionDetail[];
}

export interface PerCorporateExemptionDetail {
  corporateId: string; // Heir.id
  inheritedAmount: number; // ④
  exemptionAmount: number; // ⑤ (해당 영리법인분)
  tenPercentBaseline: number; // ⑥ = ④×10%
  shareholderPayments: {
    shareholderId: string;
    shareRatio: number;
    paymentAmount: number; // ⑪ = (⑤-⑥) × shareRatio
  }[];
}
```

## 5. 엔진 변경

### 5-1. `inheritance-corporate-exemption.ts`

```ts
// 시나리오 A 가정 — 사전증여·유증 영리법인 양쪽 적용
export function calcCorporateExemption(input: CorporateExemptionInput, opts: {
  perCorporateInputs?: PerCorporateInput[]; // v2 신규
}): CorporateExemptionResult {
  // 기존 산식 + perCorporateBreakdown 분배
  // 다수 영리법인 시 면제세액을 corporateGiftTaxBase 비례 안분
}
```

### 5-2. `inheritance-tax.ts` STEP 10

```ts
// 신규 — Heir.shareholders 와 corporateGifts 매핑
const perCorporateInputs = corporateGifts.map((g) => ({
  corporateId: g.doneeId!,
  giftTaxBase: g.giftTaxBase ?? g.giftAmount,
  giftAmount: g.giftAmount,
  computedTax: g.corporateGiftComputedTax!,
  shareholders: input.heirs.find((h) => h.id === g.doneeId)?.shareholders ?? [],
}));

corporateExemption = calcCorporateExemption({...}, { perCorporateInputs });
```

## 6. UI 신규

### 6-1. `HeirComposition` 확장 (v2 결정 — 통합)

- 행 추가 시 relation 드롭다운에 "corporate" 옵션 노출
- corporate 선택 시 businessRegistrationNumber·businessAddress 입력 + 주주 동적 행 (`ShareholderInfo[]`)

### 6-2. `CorporateExemptionFilingFormTable.tsx` (신규)

- 부표 5 가. 표 (영리법인 별)
- 부표 5 나. 표 (주주별 ⑪ 면제분 납부세액)
- 인쇄 토글 ([[print-only-css-toggle]])
- `InheritanceTaxResultView` 의 corporateExemption 카드 다음 위치에 배치

## 7. 14 동기화 지점 (v2 구체화 — C2-7)

| # | 지점 | 파일·라인 | 변경 |
|---|---|---|---|
| ① 폼 상태 | `types/inheritance-gift.types.ts` Heir | `businessRegistrationNumber`·`businessAddress`·`shareholders` 추가 (옵션) |
| ② initial | `inheritance/factory.ts` 또는 HeirComposition factory | corporate Heir 추가 시 빈 shareholders=[] |
| ③ normalize | sessionStorage hydrate | 기존 Heir 호환 (옵션 필드 누락 OK) |
| ④ API 변환 | `lib/calc/inheritance-api.ts` | spread 자동 |
| ⑤ UI 위젯 | HeirComposition + CorporateExemptionFilingFormTable | 본 PR-2 |
| ⑥ 사이드바 | 변경 없음 | — |
| ⑦ 결과 카드 | InheritanceTaxResultView corporateExemption | 본 PR-1 |
| ⑧ Validation | `inheritance-validate.ts` | ShareholderInfo 지분율 0~1·합 ≤1, corporate Heir 의 doneeId 일관성 |
| ⑨ Zod | `property-valuation-input.ts` heirSchema | Heir 신규 필드 + ShareholderInfo 스키마 |
| ⑩~⑪ | n/a | — |
| ⑫ Zod 입력 객체 | inheritanceTaxInputSchema | Heir 확장 자동 적용 |
| ⑬ body spread | inheritance-api.ts | 자동 |
| ⑭ route 매핑 | route.ts heirs 전달 | 자동 |

## 8. anchor 검증 (코드 스켈레톤 — CC-3)

```ts
describe("부표 5 영리법인 면제 명세", () => {
  it("ANCHOR-F5-1: PDF 책 1866 ⑩ 영리법인 면제 150M + 주주 시뮬", () => {
    const result = calcInheritanceTax({
      // ... PDF 사례 입력 ...
      heirs: [
        {
          id: "corporate_msa",
          relation: "corporate",
          name: "M사",
          shareholders: [
            { id: "s1", relation: "heir", name: "자녀1", shareRatio: 0.6 },
            { id: "s2", relation: "lineal_descendant_of_heir", name: "손자", shareRatio: 0.2 },
          ],
        },
        // ... 자연인 상속인 ...
      ],
    });
    const detail = result.corporateExemption!.perCorporateBreakdown![0];
    expect(detail.exemptionAmount).toBe(150_000_000);
    expect(detail.tenPercentBaseline).toBe(70_000_000); // ④ × 10%
    // ⑪ = (150M - 70M) × 0.6 = 48M (자녀1)
    expect(detail.shareholderPayments[0].paymentAmount).toBe(48_000_000);
    expect(detail.shareholderPayments[1].paymentAmount).toBe(16_000_000);
    // 외부 주주(0.2) 보유분은 환원 없음
  });

  it("ANCHOR-F5-2: 다수 영리법인 안분 (corporateGiftTaxBase 비례)", () => {
    // 영리법인 2개 — 각각 과세표준 7억 / 3억 → 면제 안분 70:30
  });

  it("ANCHOR-F5-3: shareholders 지분율 합 > 1.0 → validate 차단", () => {
    const err = validateHeirReferences(/* ... */);
    expect(err).toContain("지분율 합");
  });

  it("ANCHOR-F5-4 (회귀): 영리법인 미존재 — 기존 corporateExemption.amount 무변화", () => {
    // 자연인만 → perCorporateBreakdown undefined 또는 빈 배열
  });

  it("ANCHOR-F5-5: corporate Heir + shareholders=[] (주주 없음)", () => {
    // 부표 5 나. 표 빈 행 — 면제는 발동, 주주 환원 없음
  });
});
```

## 9. 케이스 매트릭스

| # | 시나리오 | 입력 | 기대 |
|---|---|---|---|
| F5-1 | 단일 영리법인 + 주주 매핑 | PDF 책 1866 ⑩ | 면제 150M + 주주 환원 |
| F5-2 | 다수 영리법인 | 2개 | 안분 + 각 perCorporateBreakdown 행 |
| F5-3 | 주주 없음 | shareholders=[] | 면제 발동 + 나. 표 빈 행 |
| F5-4 | 외부 주주 존재 | sharePercent 합 0.8 | 0.2 부분은 환원 없음 (정상) |
| F5-5 | 지분율 합 > 1.0 | 잘못된 입력 | validate 차단 |
| F5-6 (회귀) | 영리법인 미존재 | 자연인만 | 부표 5 표 미렌더 |
| F5-7 | PR-1 단독 완료 (UI 미적용) | shareholders 미입력 | 결과 카드는 perCorporateBreakdown 없이 안전 표시 |

## 10. Definition of Done (v2 강화)

- [ ] **§3의2② 적용 범위 확정** (§0) — 시나리오 A·B 결정
- [ ] KoreanLaw MCP 시행령 §3의2 본문 인용 후 다수 영리법인 안분 산식 확정
- [ ] PDF 책 1866 ⑩ 사례의 영리법인 시점(유증 vs 사전증여) 재확인
- [ ] Heir 확장 (corporate 전용 옵션 필드 3종)
- [ ] CorporateExemptionResult.perCorporateBreakdown 노출
- [ ] HeirComposition 통합 (corporate 분기)
- [ ] CorporateExemptionFilingFormTable 신규
- [ ] anchor F5-1~F5-7 통과
- [ ] sessionStorage 마이그레이션 — 기존 Heir 호환
- [ ] `npx tsc --noEmit` 0건
- [ ] **브라우저 수동 확인** — 미수행 시 명시
- [ ] PR-1·PR-2 분할 회귀 보호

## 11. 작업량 (v2)

| 항목 | PR-1 | PR-2 |
|---|---|---|
| Heir 확장 + Zod | 30 | — |
| inheritance-corporate-exemption.ts 분배 | 100 | — |
| inheritance-tax.ts STEP 10 매핑 | 30 | — |
| validate 확장 | 30 | — |
| 결과 카드 perCorporateBreakdown 일부 노출 | — | 50 |
| HeirComposition 통합 | — | 200 |
| CorporateExemptionFilingFormTable | — | 250 |
| anchor (PR-1·PR-2 분리) | 150 | 100 |
| **합계** | **~340** | **~600** |

총 ~940 → 2 PR 분할 (각 800 미만).

## 12. Out-of-Scope (CC-5 셀프 참조 순환 해소)

- 부표 1 재산종류코드 정합화 — **독립 PR** (계획서 3)
- 상속세 모드 모달 활성화 — **독립 PR** (계획서 1)
- 본 PR 의 분리 항목은 위 2 계획서를 본 PR 와 평행 진행 가능

## 13. 위험·되돌리기

- **최대 위험**: §0 §3의2② 적용 범위 결정에서 시나리오 B 확정 시 **Phase 1 commit `c48826a` 정정 필요**. 본 PR 진입 전 결정 강제.
- **데이터 모델 변경**: corporate 전용 옵션 필드 — 기존 Heir 무영향. 마이그레이션 위험 낮음
- **되돌리기**: PR-1 / PR-2 분리되어 부분 revert 가능
