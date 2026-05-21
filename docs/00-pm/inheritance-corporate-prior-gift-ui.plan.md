# 영리법인 사전증여 UI 노출 계획서 (v3)

> 2026-05-21 · feature: `inheritance-corporate-prior-gift-ui`
> 소관 시니어: `inheritance-gift-tax-ui-senior` (UI 전담) · `inheritance-gift-tax-senior` (엔진 확인 협업)
> 변경 이력: v1 → v2 (E1~E9) → v3 (E10~E17) → v4 (M1~M6 통합 정정, 2026-05-21)

## 1. 배경 (사용자 보고)

> "상속개시일로부터 5년 내 영리법인에게 증여한 재산도 상속세 과세가액에 산입해야 하고, 납부한 증여세는 증여세 상당액으로 공제한다. UI에서 입력할 수 없다."

**현행**: 사전증여 입력 카드(`PriorGiftInput.tsx`)의 "수증인과의 관계" 드롭다운에 자연인 관계만 노출. 영리법인을 표현할 옵션 없음 → 사용자가 §13①2호 영리법인 사전증여를 입력할 경로가 차단됨. 엔진·타입·Zod·validate는 이미 완전 지원하지만 **UI 위젯과 결과 노출만 누락**.

## 2. 법령 근거 (Plan v2 진입 전 KoreanLaw MCP 검증 강제)

| 조문 | 내용 |
|---|---|
| 상증법 §4의2 ③ | 영리법인이 증여받은 재산은 증여세를 부과하지 않음 (법인세 과세 대상). |
| **상증법 §13 ① 2호** (정정 E1) | 상속개시일 전 5년 이내 피상속인이 **상속인이 아닌 자**에게 증여한 재산가액을 상속세 과세가액에 가산. 「상속인 아닌 자」에 영리법인 포함(통설·집행기준). v1의 §13②2호 인용은 오기. |
| **상증법 §3의2 ② + 국세청 집행기준 28-0-1** (정정 E2) | §13에 따라 가산된 영리법인 사전증여재산에 대해 상속세 면제. 한도 = 상속세 산출세액 × (영리법인 증여 과세표준 ÷ 상속세 과세표준). 면제액 = Min(영리법인 증여세 산출세액 상당액, 한도). |
| 상증법 §28 ① | 사전증여 가산분에 대한 증여세액공제. 영리법인은 실제 증여세 납부 없음 → `giftTaxPaid=0` 강제 시 §28 공제 0 → §3의2② 면제와 중복 무발생 (정정 E8). |
| 상증법 시행령 §3의2 (미정) | §3의2② 시행령 세부 — v2 진입 전 본문 확인 후 인용 첨부. |
| 서서이-1447 (2008.6.17.) | §27 ① 세대생략 할증 분모 "총상속재산가액"에서 영리법인 사전증여 차감. 엔진 line 76-78 이미 반영. |

**검증 절차**: `mcp__claude_ai_KoreanLaw__get_law_text(법령ID="상속세 및 증여세법", 조문번호="제13조"·"제3조의2"·"제28조")` 실행 후 본문 인용 첨부.

## 3. 현행 자산 점검 (엔진은 100% 구현 완료)

### 3-1. 엔진

| 파일·위치 | 동작 |
|---|---|
| `types/inheritance-gift.types.ts:261-263` | `PriorGift.beneficiaryType?: "heir" \| "legatee" \| "corporate"` + `corporateGiftComputedTax?: number` |
| `inheritance-gift-common.ts:298-308` | `aggregatePriorGiftsForInheritance` — **`gift.isHeir ? 10 : 5`로 컷오프 결정** (정정 E3). `beneficiaryType` 미참조. 따라서 corporate 입력 시 `isHeir=false` 강제 필수. |
| `inheritance-tax.ts:361-385` | STEP 10 — corporate 필터 → `corporateGiftTaxBase = Σ (g.giftTaxBase ?? g.giftAmount)` (정정 E4) → `calcCorporateExemption` 호출. `corporateGiftComputedTax > 0`일 때만 발동. |
| `inheritance-corporate-exemption.ts` | §3의2② + 집행기준 28-0-1. 한도 산식 + Min(산출세액, 한도). PDF 종합사례 1866 ⑩ 인용 — anchor 재현 대상 (정정 E7). |
| `inheritance-gift-tax-credit.ts:59-75` | §28 증여세액공제 = Σ giftTaxPaid. corporate 행은 `giftTaxPaid=0`이므로 §28 합산에서 자연 배제 — §3의2② 면제와 중복 없음 (정정 E8). |
| `lib/stores/inheritance-summary.ts:133` | `priorGiftTotal = Σ giftAmount` — corporate 포함. 사이드바 ⑥ 이미 동작 (정정 E9). |

### 3-2. 검증·API (구현 완료)

- Zod `priorGiftSchema` (`lib/validators/property-valuation-input.ts:158-159`): `beneficiaryType` enum 3종 + `corporateGiftComputedTax` optional
- `lib/calc/inheritance-validate.ts:88-95`: `beneficiaryType==="corporate"` 시 `corporateGiftComputedTax>0` 강제 차단

### 3-3. UI (누락 — 본 PR 범위)

- `components/calc/PriorGiftInput.tsx` — 영리법인 옵션·corporateGiftComputedTax 입력 없음
- `components/calc/results/InheritanceTaxResultView.tsx` (또는 상응) — `corporateExemption?.amount` 표시 없음 (정정 E6)

## 4. 작업 범위 (Phase 1 — 본 PR)

엔진 변경 0. **UI 입력 위젯 + 결과 노출** 동시 구현.

### 4-1. PriorGiftInput.tsx UI 신규

**옵션 A 확정** — ToggleCard 분기 + 의존 필드 disabled/활성화

#### 4-1-a. 상단 ToggleCard "수증인 = 영리법인"

- tone: `violet`
- title: "수증인 = 영리법인 (상증법 §13①·§3의2②)"
- description: "영리법인은 5년 이내 합산 (§13①2호). 증여세 비과세이므로 증여세 산출세액 상당액을 §3의2②로 공제."
- 위치: "수증인과의 관계" 드롭다운 **위** (관계·상속인 토글이 corporate ON에 의존하기 때문)

#### 4-1-b. ON/OFF 상태머신 (정정 E3·E5)

| 필드 | corporate ON | corporate OFF |
|---|---|---|
| `beneficiaryType` | `"corporate"` set | `undefined` (legacy 모드 — engine이 isHeir로 자동 추론) |
| `isHeir` | **`false` 강제 자동 set** (엔진 5년 컷오프 활성) | 사용자 선택값 복원 (ON 진입 직전 저장) |
| `doneeRelation` | `undefined` + 드롭다운 `disabled`(`disabledReason="영리법인 — 자연인 관계 미적용"`) | 사용자 선택값 복원 |
| `giftTaxPaid` | **`0` 강제 자동 set** + CurrencyInput `disabled`(`disabledReason="영리법인은 증여세 비과세 (§4의2③) — §3의2②로 공제"`) | 사용자 선택값 복원 |
| `corporateGiftComputedTax` | 신규 CurrencyInput 활성·required | `undefined` 클리어 |
| `giftTaxBase` (선택 입력, Phase 1.5) | 사용자 입력 시 분자 override. 미입력 시 엔진이 `giftAmount` fallback. | `undefined` |
| 상속인 ToggleCard (`isHeir`) | `disabled`(`disabledReason="영리법인 — 상속인 분류 미적용 (§13①2호 5년)"`) + Switch off | 사용자 선택값 복원 |

**상태 보존 전략 (정정 E12 — 단일화)**: corporate ON 진입 시 `{prevIsHeir, prevDoneeRelation, prevGiftTaxPaid}` 를 **`GiftRowEditor` 컴포넌트 local React state(`useRef` 또는 `useState`)에만** 보존. OFF 복귀 시 restore.

- ❌ PriorGift 메타 필드 신설 금지 — Zod 스키마·엔진 입력 타입 영향 발생
- ❌ store 글로벌 보존 금지 — 다중 행 간 상태 오염 위험
- ✅ 카드-local state — 컴포넌트 unmount 시 자연 폐기, 엔진/타입 영향 0

#### 4-1-c. 신규 corporateGiftComputedTax 입력

```tsx
{gift.beneficiaryType === "corporate" && (
  <CurrencyInput
    label="증여세 산출세액 상당액"
    value={gift.corporateGiftComputedTax ? String(gift.corporateGiftComputedTax) : ""}
    onChange={(v) => set({ corporateGiftComputedTax: parseAmount(v) })}
    required
    hint="영리법인에 증여세가 부과된다고 가정한 산출세액 (§3의2② 면제 한도)."
    trailing={<LawArticleLink article="§3의2②" />}
  />
)}
```

#### 4-1-d. 카드 헤더 라벨

corporate ON 시 카드 헤더에 `🏢 영리법인 (§13① · §3의2②)` 배지(violet) 표시.

### 4-2. 결과 화면 영리법인 면제액 노출 (정정 E6·E13·E14·E15 — Phase 1 포함)

사용자 핵심 요구 "공제됩니다"의 검증 가능성 확보를 위해 **Phase 1에 포함**.

#### 4-2-a. 결과 타입 확인 (정정 E14)

- `types/inheritance-gift.types.ts:758` — `InheritanceTaxResult.corporateExemption?: CorporateExemptionResult` 이미 공개. UI에서 `result.corporateExemption?.amount` 안전 접근 가능.
- `CorporateExemptionResult = { amount: number; limit: number; breakdown: CalculationStep[] }`

#### 4-2-b. 표시 위치 (정정 E13)

- **확정 변경 파일**: `components/calc/results/InheritanceTaxResultView.tsx` (line 188 `priorGiftAggregated` 표시부 인접에 corporate 면제 행 신규)
- 사전증여 표(별도 컴포넌트 있으면) — corporate 행 배지 표시

#### 4-2-c. 산식 표시 정책 (정정 E15)

- 한국어 풀어쓰기 — `floor()`·변수 약어 금지 ([[feedback_result_view_korean_formula]])
- "원" 단위 미표기 ([[feedback_no_won_suffix]])
- 산식: **"영리법인 면제액 = Min(증여세 산출세액 상당액, 한도)"**
- 한도 산식: **"한도 = 상속세 산출세액 × 영리법인 증여 과세표준 ÷ 상속세 과세표준"**
- `breakdown` 그대로 노출 — 엔진이 이미 한국어 라벨 작성(`inheritance-corporate-exemption.ts:87-102`)

#### 4-2-d. 결과 화면 사전증여 표 — 부재 확인 (정정 M3)

`InheritanceTaxResultView.tsx:188-192` 에 사전증여 표 없음 — 단일 합계 행만 존재.

→ corporate 행 배지는 **입력 화면 `PriorGiftInput.tsx` 합산 요약 박스**(line 411-440 확장)에서 처리 (디자인 §2-2-a).

→ 결과 화면의 사전증여 표 신설은 **Phase 3 (신고서 별지 11호서식 부표)** 에서 일괄 적용.

### 4-3. 14 동기화 지점 점검 (지점 ⑤·⑦ 만 실 변경)

| # | 지점 | 변경 사유 | 작업 |
|---|---|---|---|
| ① | `PriorGift` 타입 | 이미 존재 | 확인 |
| ② | 신규 행 initial | `beneficiaryType` 미설정 — 기존 동작 보존 | 확인 |
| ③ | normalize | sessionStorage 마이그레이션 — 누락 키 무영향 | 확인 |
| ④ | API 변환 | `inheritance-api.ts` 이미 spread 통과 | 확인 |
| **⑤** | **UI 위젯** | **신규 ToggleCard + CurrencyInput + disabled 상태머신** | **본 PR** |
| ⑥ | 사이드바 합계 | `priorGiftTotal`이 corporate 포함 (line 133) — 확인 (정정 E9). **Phase 1 (정정 M1)**: `WizardSidebar` 변경 0 — `WizardSidebar` 컴포넌트의 hint prop 미지원 위험 + 입력 화면 합산 요약 박스로 충분. `PriorGiftInput.tsx` 합산 요약 박스(line 411-440)에 corporate 분해 행 추가는 ⑤에 포함. | 변경 없음 (요약 박스 corporate 행은 ⑤에서 처리) |
| **⑦** | **결과 카드** | **영리법인 면제 행 + 사전증여 표 corporate 배지** | **본 PR** (정정 E6) |
| ⑧ | Validation | `inheritance-validate.ts:92-95` 이미 차단 | 확인 |
| ⑨~⑪ | Zod·route fallback | 이미 통과 | 확인 |
| ⑫ | Zod 객체 정의 | `priorGiftSchema:158-159` 이미 정의 | 확인 |
| ⑬ | body spread | `inheritance-api.ts` 이미 spread | 확인 |
| ⑭ | route 엔진 매핑 | `app/api/calc/inheritance/route.ts:79-80` 이미 spread | 확인 |

**실 변경 파일 2개 (정정 M1·M2)**:
1. `components/calc/PriorGiftInput.tsx` (≤+120줄) — ToggleCard + CorporateGiftFields + 상태머신 + 합산 요약 박스 corporate 분해 행 + hasCorporatePriorGift 헬퍼
2. `components/calc/results/InheritanceTaxResultView.tsx` (≤+40줄) — corporate 면제 행 (breakdown 직접 노출)

**Phase 1.5 (옵션)**: `WizardSidebar` 컴포넌트 hint prop 확장 후 사이드바 라벨 hint 적용 — 컴포넌트 인터페이스 변경 필요 시 분리.

## 5. Pre-Do Anchor (강제 — [[feedback_pre_anchor_verification]])

### ANCHOR-CORP-1 — 5년 이내 영리법인 사전증여 합산

```ts
it("ANCHOR-CORP-1: 영리법인 4년 전 5억 증여 → 과세가액 가산", () => {
  const result = calculateInheritanceTax({
    deathDate: "2026-05-21",
    /* 자녀 1명, 상속재산 20억 */
    preGiftsWithin10Years: [{
      giftDate: "2022-05-21",
      giftAmount: 500_000_000,
      giftTaxPaid: 0,
      isHeir: false,
      beneficiaryType: "corporate",
      corporateGiftComputedTax: 80_000_000,
    }],
  });
  expect(result.priorGiftAggregated).toBe(500_000_000);
});
```

### ANCHOR-CORP-2 — 5년 초과 영리법인 컷오프

```ts
it("ANCHOR-CORP-2: 6년 전 영리법인 증여는 §13① 5년 도과 → 가산 제외", () => {
  // isHeir=false → engine line 305 limitYears=5 → elapsedYears=6 → continue
  const result = calculateInheritanceTax({
    deathDate: "2026-05-21",
    preGiftsWithin10Years: [{
      giftDate: "2020-05-20",
      giftAmount: 500_000_000,
      giftTaxPaid: 0,
      isHeir: false,
      beneficiaryType: "corporate",
      corporateGiftComputedTax: 80_000_000,
    }],
  });
  expect(result.priorGiftAggregated).toBe(0);
  expect(result.corporateExemption).toBeUndefined();
});
```

### ANCHOR-CORP-3 — PDF 종합사례 책 1866 ⑩ 재현 (정정 E7)

엔진 파일(`inheritance-corporate-exemption.ts:11-14`)이 명시한 예시값 재현.

```ts
it("ANCHOR-CORP-3: PDF 책 1866 ⑩ — corporate 면제 150,000,000", () => {
  // 영리법인 증여세 산출세액 150M, 한도 272,874,251 → Min = 150M
  const result = calcCorporateExemption({
    corporateGiftComputedTax: 150_000_000,
    corporateGiftTaxBase: 700_000_000,
    totalComputedTax: 1_627_500_000,
    totalTaxBase: 4_175_000_000,
  });
  expect(result.limit).toBe(272_874_251);
  expect(result.amount).toBe(150_000_000);
});
```

### ANCHOR-CORP-4 — 5년 경계일 처리 (정정 E11)

```ts
// 엔진 line 302: differenceInYears(death, giftDate) — 만 5년 0일 = 5 (포함)
it("ANCHOR-CORP-4a: 정확히 5년 전 영리법인 증여 → 합산 (경계 포함)", () => {
  const result = calculateInheritanceTax({
    deathDate: "2026-05-21",
    preGiftsWithin10Years: [{
      giftDate: "2021-05-21", isHeir: false, beneficiaryType: "corporate",
      giftAmount: 500_000_000, giftTaxPaid: 0, corporateGiftComputedTax: 80_000_000,
    }],
  });
  expect(result.priorGiftAggregated).toBe(500_000_000);
});

it("ANCHOR-CORP-4b: 5년 + 1일 전 영리법인 증여 → 컷오프", () => {
  const result = calculateInheritanceTax({
    deathDate: "2026-05-21",
    preGiftsWithin10Years: [{
      giftDate: "2021-05-20", isHeir: false, beneficiaryType: "corporate",
      giftAmount: 500_000_000, giftTaxPaid: 0, corporateGiftComputedTax: 80_000_000,
    }],
  });
  // differenceInYears(2026-05-21, 2021-05-20) = 5 → 5 <= 5 → 합산?
  // 실제 동작 검증 후 anchor 확정 (Pre-Do 단계에서 측정)
  // 본 anchor는 엔진 경계 동작 명세화가 목적 — 결과값은 Pre-Do 실행 후 확정
});
```

### ANCHOR-CORP-5 — 자연인 사전증여 회귀 보호 (정정 E17)

```ts
it("ANCHOR-CORP-5 (회귀): 영리법인 OFF 행 — 기존 자연인 사전증여 동작 보존", () => {
  const result = calculateInheritanceTax({
    deathDate: "2026-05-21",
    preGiftsWithin10Years: [{
      giftDate: "2022-05-21",
      giftAmount: 500_000_000,
      giftTaxPaid: 50_000_000,
      isHeir: true, // 자연인 상속인 자녀
      // beneficiaryType 미설정 — legacy 동작
    }],
  });
  expect(result.priorGiftAggregated).toBe(500_000_000);
  expect(result.corporateExemption).toBeUndefined(); // 영리법인 면제 미발동
  // §28 증여세액공제는 정상 발동 (giftTaxPaid=50M 합산)
});
```

**anchor 실패 시**: 엔진/validate 갭 발견 → 엔진 시니어 위임 후 UI PR 보류.

## 6. 케이스 인벤토리 ([[feedback_ui_input_path_enumeration]])

| # | 분기 | 입력 조합 | 기대 동작 |
|---|---|---|---|
| C0 (회귀) | 자연인 상속인 (기존) | OFF, isHeir=true | priorGift 합산 + §28 공제 정상 |
| C1 | 영리법인 5년 이내 + 산출세액>0 | corp ON, giftDate=4년전, computedTax=80M | 가산 + §3의2② 면제 |
| C2 | 영리법인 5년 이내 + 산출세액=0 | corp ON, computedTax=0 | **validate 차단** ("산출세액 필수") |
| C3 | 영리법인 5년 초과 | corp ON, giftDate=6년전 | 엔진 컷오프 (priorGiftAggregated=0) |
| C4 | heir → corporate 전환 | isHeir=true → ToggleCard ON | isHeir 0 강제·기납부 0 강제·드롭다운 disabled |
| C5 | corporate → heir 복귀 | ToggleCard OFF | 진입 직전 prev 상태 restore (isHeir·doneeRelation·giftTaxPaid) |
| C6 | 영리법인 다수 행 | 행 2개 corp ON | corporateGiftTaxBase 합산·corporateGiftComputedTax 합산 (엔진 line 364-371) |
| C7 (혼합, 정정 M4) | 자연인 + 영리법인 동시 | 행1 heir(isHeir=true) + 행2 corp | §28 공제와 §3의2② 면제 동시 발동 |
| C8 (회귀) | 영리법인 0건 | 전체 OFF | 기존 흐름 완전 동일 |
| C9 (이력 모달 import) | history 자동 채움 후 corporate | history import → 사용자 수동 ON | beneficiaryType 미설정으로 import (`prior-gift-lookup.ts:308`) — 사용자 수동 ON 필요. Phase 2 자동 추론. |

C0·C1·C2·C4·C5·C6·C7·C8 브라우저 수동 시뮬 후 완료 보고. C9는 후속 PR 명시.

## 7. 모호 분기 / 후속 PR

1. **신고서 별지 11호서식 부표 영리법인 행 표시** — Phase 3 분리
2. **history 모달 자동 채움 시 corporate 자동 추론** — Phase 3 (`prior-gift-lookup.ts` 확장)
3. **giftTaxBase 명시 입력 위젯** — Phase 1.5 옵션. 사용자가 정밀 분자를 지정해야 할 때만. 미입력 시 `giftAmount` fallback 동작 정상.
4. **§28 vs §3의2② 산출 순서 검증 anchor** — Phase 1 ANCHOR-CORP-3 외 별도 회귀 anchor 추가 여부
5. **`addPriorGift` factory 의 isHeir 기본값** — `:462 isHeir: true`. corporate ON 진입 시 ON 액션이 즉시 false로 set → 첫 행 추가 후 곧바로 corporate ON 누르는 케이스는 prev=true 보존 후 OFF 시 true 복귀 (자연 동작).
6. **validate 정책 강화**: corporate + isHeir=true 동시 입력 시 validate 차단 메시지 추가 여부 — Phase 1.5 (UI 상태머신으로 충분하나 API 직접 호출 차단용)

## 8. Definition of Done

- [ ] KoreanLaw MCP §13·§3의2·§28 본문 검증 + 인용 첨부 (E1·E2)
- [ ] ANCHOR-CORP-1·2·3·4 작성 + 통과
- [ ] `PriorGiftInput.tsx` ToggleCard + corporateGiftComputedTax CurrencyInput + 상태머신 (정정 E3·E5)
- [ ] 결과 카드 영리법인 면제 행 + 사전증여 표 corporate 배지 (정정 E6 — Phase 1 포함)
- [ ] C1~C6 브라우저 수동 확인
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/inheritance/` 회귀 0
- [ ] `ui-engine-sync-checker` 호출 0 누락
- [ ] 사이드바 합계 영리법인 포함 확인 (정정 E9)
- [ ] Phase 2/3 후속 PR 항목 명시 (신고서·history 자동화·giftTaxBase 입력·validate 강화)

## 9. 단계·우선순위

- **Phase 1 (완료, commit c48826a)**: UI 위젯 + 결과 노출 + anchor 7건. 변경 파일 2개
- **Phase 1.5 (완료, 본 후속 PR)**: WizardSidebar corporate hint + giftTaxBase 입력 + validate 정책 강화 + anchor V1~V4
- **Phase 2**: history 모달 corporate 자동 추론
- **Phase 3**: 신고서 별지 11호서식 부표 영리법인 행 표시
- **엔진 후속**: STEP 10 corporate cutoff 필터 통합 (ANCHOR-CORP-2 NOTE 참조)
