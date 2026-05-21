# 영리법인 사전증여 UI 디자인 문서 (v2)

> 2026-05-21 · feature: `inheritance-corporate-prior-gift-ui`
> 계획서: [`docs/00-pm/inheritance-corporate-prior-gift-ui.plan.md`](../../00-pm/inheritance-corporate-prior-gift-ui.plan.md) v3
> 소관: `inheritance-gift-tax-ui-senior`
> 변경 이력: v1 → v2 (D1~D12) → v3 (D13·D15·D18) → v4 (M1~M6 통합 정정, 2026-05-21)

## 0. 디자인 원칙

- 14 동기화 지점 중 **⑤ UI 위젯·⑥ 사이드바·⑦ 결과 카드** 만 신 구현. ①~④·⑧~⑭ 모두 사전 구현됨 (계획서 §3·§4-3).
- 토글은 `ToggleCard` (tone=violet) — native checkbox 금지 ([[feedback_toggle_card_visibility]])
- 결과 산식은 한국어 풀어쓰기, 변수 약어·`floor()` 금지 ([[feedback_result_view_korean_formula]])
- 사이드바 합계 라벨 정책 → `[[feedback_section_card_numbering]]` 위반 없음 (기존 카드 활용)
- 엔진·Zod·validate 변경 0 — UI 컴포넌트 3개만 변경 (계획서 §4-3)

## 1. 사용자 시나리오

### 시나리오 S1 — 영리법인 단일 증여 (정상 흐름)

1. 사용자 상속세 마법사 진입 → "사전증여재산 (§13)" 카드까지 도달
2. "증여 추가" 클릭 → 신규 행 생성 (기본 `isHeir=true`, beneficiaryType 미설정)
3. **신규**: 행 최상단 `🏢 영리법인 (§13①·§3의2②)` ToggleCard ON 클릭
4. **자동 처리**: `isHeir=false` 강제 · `giftTaxPaid=0` 강제 · 자연인 관계 드롭다운·상속인 토글 disabled
5. 증여일 / 증여재산가액 / **증여세 산출세액 상당액** 입력
6. 다음 단계 → 결과 화면에서 영리법인 면제 행 + 사전증여 표 corporate 배지 확인

### 시나리오 S2 — 자연인 ↔ 영리법인 전환

1. 사용자 자연인 행 입력 완료 (관계=자녀, 상속인=true, 기납부=50M)
2. 영리법인 ToggleCard ON 클릭
3. **상태 보존**: `prevIsHeir=true · prevDoneeRelation='lineal_descendant' · prevGiftTaxPaid=50,000,000` 카드-local state에 저장
4. 자동 처리(시나리오 S1 단계 4)
5. ToggleCard OFF 복귀 시 prev 3필드 자동 복원

### 시나리오 S3 — 5년 경계 검증

1. 영리법인 ToggleCard ON, 증여일 = 상속개시일 −5년 +1일
2. 결과 화면: `priorGiftAggregated` 에서 해당 행 제외 (엔진 컷오프), `corporateExemption` undefined
3. UI 별도 차단 없음 — 입력은 허용, 결과로 검증

### 시나리오 S4 — 영리법인 + 산출세액 0 차단

1. 영리법인 ToggleCard ON, 증여세 산출세액 = 0 (또는 미입력)
2. "다음" 클릭 시 `inheritance-validate.ts:92-95` 차단 메시지: "영리법인 사전증여 YYYY-MM-DD — corporateGiftComputedTax(증여세 산출세액)는 필수입니다."
3. 사용자 입력 후 진행

### 시나리오 S5 — 영리법인 다수 행

1. 행 2개 모두 ToggleCard ON, 각 산출세액 입력
2. 엔진: corporateGiftTaxBase = Σ giftTaxBase ?? giftAmount · corporateGiftComputedTax = Σ 산출세액
3. 결과: 단일 corporate 면제 행 (합계 기준)

### 시나리오 S6 — 회귀 보호: 영리법인 0건

기존 자연인 사전증여 흐름 무변화. corporate 면제 행·배지 모두 미표시.

## 2. UI 위젯 명세

### 2-1. PriorGiftInput.tsx — `GiftRowEditor` 변경

#### 신규 ToggleCard (위치: 행 헤더 직하, "증여일" 위)

```tsx
<ToggleCard
  tone="violet"
  variant="card"
  title="🏢 수증인 = 영리법인"
  description="상증법 §13①2호 5년 합산 · §3의2② + 집행기준 28-0-1 공제"
  checked={gift.beneficiaryType === "corporate"}
  onCheckedChange={handleCorporateToggle}
>
  {/* children — ON 시에만 렌더 (ToggleCard variant="card" 동작) */}
  <CorporateGiftFields gift={gift} set={set} />
</ToggleCard>
```

**description 모바일 줄바꿈 (정정 D4)**: 38자 한국어 → 모바일 320px 폭에서 2줄 표시. 줄바꿈 자연. 길이 단축 (v1 50자 → v2 38자).

**children 펼침 패턴 (정정 D10)**: `ToggleCard variant="card"` 의 children prop을 활용하여 corporate ON 시 신규 입력 필드를 카드 내부에 자연 노출. 별도 violet 카드 중첩 불필요.

#### `handleCorporateToggle` 상태머신 (계획서 §4-1-b · 정정 D1·D2)

```tsx
// 카드-local state (정정 E12)
// 초기값은 mount 시점이 아닌 ON 클릭 직전에 갱신 (D1·D2 — stale closure 차단)
const prevRef = useRef<{
  isHeir: boolean;
  doneeRelation?: DonorRelation;
  giftTaxPaid: number;
} | null>(null);

function handleCorporateToggle(on: boolean) {
  if (on) {
    // ON 클릭 시점의 최신 gift 값을 캡처 — 이력 모달 import 후에도 정확
    prevRef.current = {
      isHeir: gift.isHeir,
      doneeRelation: gift.doneeRelation,
      giftTaxPaid: gift.giftTaxPaid,
    };
    set({
      beneficiaryType: "corporate",
      isHeir: false,          // 엔진 5년 컷오프 강제 (line 305 isHeir 참조)
      doneeRelation: undefined,
      giftTaxPaid: 0,         // §28 공제 중복 방지 (line 60 Σ giftTaxPaid)
    });
  } else {
    // 복귀: prev 없으면 기본 자연인값 (isHeir=true)
    const prev = prevRef.current ?? {
      isHeir: true,
      doneeRelation: undefined,
      giftTaxPaid: 0,
    };
    set({
      beneficiaryType: undefined,
      corporateGiftComputedTax: undefined,
      isHeir: prev.isHeir,
      doneeRelation: prev.doneeRelation,
      giftTaxPaid: prev.giftTaxPaid,
    });
    prevRef.current = null;
  }
}
```

**stale closure 방지**: `prevRef`는 ON 클릭 이벤트 핸들러 내에서 직접 `gift` prop을 읽음. React 렌더-스코프의 최신 `gift`가 보장됨. 별도 dependency 추적 불필요.

**OFF→ON→OFF 사이클 동작 (정정 D18)**:
- mount 직후 ON 클릭: `prevRef.current = { isHeir: gift.isHeir(=true 기본), doneeRelation: undefined, giftTaxPaid: 0 }` 저장 → ON 액션 적용
- OFF 클릭: `prevRef.current` 의 보존값으로 복원 → `isHeir=true·doneeRelation=undefined·giftTaxPaid=0` 으로 되돌아옴 → 사용자가 이전에 입력한 값이 없었다면 자연 동작. **사용자가 ON 진입 직전 수동 입력했던 자연인 값은 정확히 복원**.
- ON→OFF→ON: prev 초기화(`= null`) 후 다음 ON 클릭 시 다시 캡처 — OFF 사이의 사용자 수정값을 새 prev로 인식.

#### 의존 필드 disabled 처리 (corporate ON 시)

| 필드 | disabled | disabledReason |
|---|---|---|
| 수증인과의 관계 (`<select>` → `disabled` 속성) | yes | "영리법인 — 자연인 관계 미적용" |
| 상속인 ToggleCard (`isHeir`) | yes (`disabled` prop 추가 필요) | "영리법인 — §13①2호 5년 합산 자동 적용" |
| 기납부 증여세 CurrencyInput | yes (`disabled` prop) | "영리법인 — 증여세 비과세 (§4의2③). §3의2②로 공제" |

#### `<CorporateGiftFields>` — ToggleCard children 영역 (정정 D3·D10)

```tsx
// 위치 (정정 D15): components/calc/PriorGiftInput.tsx 파일 내 module-scope.
// 별도 파일 분리 안 함 — 컴포넌트 50줄 미만, PriorGiftInput 800줄 정책 여유.
function CorporateGiftFields({ gift, set }: { gift: PriorGift; set: (p: Partial<PriorGift>) => void }) {
  const value = gift.corporateGiftComputedTax;
  const isMissing = !value || value <= 0;
  return (
    <div className="space-y-2 pt-2">
      <CurrencyInput
        label="증여세 산출세액 상당액"
        value={value && value > 0 ? String(value) : ""}
        onChange={(v) => set({ corporateGiftComputedTax: parseAmount(v) })}
        required
        hint="영리법인에 증여세가 부과된다고 가정한 산출세액. 시가 기준 §26 누진세율 적용."
      />
      {isMissing && (
        <p className="text-[11px] text-rose-600">
          ⚠ 입력 필수 — 미입력 시 §3의2② 면제 한도를 계산할 수 없습니다.
        </p>
      )}
    </div>
  );
}
```

**즉시 피드백 (정정 D3)**: 빈 값일 때 rose 경고 메시지 표시 — Step 진행 전 시각 신호. validate 차단 메시지는 "다음" 클릭 시 alert.

#### 카드 헤더 배지

```tsx
<div className="flex items-center gap-2">
  <span className="font-semibold text-sm">증여 {index + 1}</span>
  {gift.beneficiaryType === "corporate" && (
    <span className="inline-flex items-center gap-1 text-[10px] bg-violet-100 text-violet-800 rounded px-2 py-0.5">
      🏢 영리법인
    </span>
  )}
  {gift.sourceCalculationId && (/* 기존 이력 배지 유지 */)}
</div>
```

### 2-2. 사이드바 + 입력 합산 요약 (정정 E16·D6·D7·D11·M1)

**D6 결과 화면 사전증여 표 부재** — `InheritanceTaxResultView.tsx:188-192` 는 단일 합계 행만 존재. 별도 사전증여 표 없음. 따라서 corporate 행 배지는 입력 화면 `PriorGiftInput.tsx:411-440` "사전증여 합산 요약" 박스에 추가.

#### 2-2-a. PriorGiftInput "사전증여 합산 요약" 박스 (line 411-440 확장)

기존 행: 상속인 합계 / 비상속인 합계 / 총합 / 기납부 합계
**추가 행**: corporate 행 1건 이상 시 — `영리법인 증여 합계 (5년 합산, §13①2호)` + `영리법인 증여세 산출세액 합계 (§3의2②)`

```tsx
const corporateGifts = gifts.filter((g) => g.beneficiaryType === "corporate");
const corporateTotal = corporateGifts.reduce((s, g) => s + g.giftAmount, 0);
const corporateComputedTaxTotal = corporateGifts.reduce(
  (s, g) => s + (g.corporateGiftComputedTax ?? 0), 0
);

{mode === "inheritance" && corporateTotal > 0 && (
  <>
    <div className="flex justify-between text-xs text-indigo-700 dark:text-indigo-300 border-t border-indigo-200/50 pt-1">
      <span>↳ 🏢 영리법인 증여 (5년, §13①2호)</span>
      <span>{formatKRW(corporateTotal)}</span>
    </div>
    {corporateComputedTaxTotal > 0 && (
      <div className="flex justify-between text-xs text-indigo-700 dark:text-indigo-300">
        <span>↳ 영리법인 증여세 산출세액 합계 (§3의2②)</span>
        <span>{formatKRW(corporateComputedTaxTotal)}</span>
      </div>
    )}
  </>
)}
```

**비상속인 5년 합계와의 관계**: 기존 `nonHeirTotal` (line 408)은 `gifts.filter(!isHeir)` — corporate 행도 isHeir=false이므로 자연 포함됨. 영리법인 행 신규 표시는 **세부 분해(detail breakdown)** 성격 → "↳" prefix + indigo 색 유지로 박스 내부 톤 일관성 보존 (정정 D13). violet 텍스트로 분리하지 않음 — corporate 강조는 입력 행 헤더 배지·면제 결과 카드에만 한정.

#### 2-2-b. `WizardSidebar` (Phase 1.5로 분리 — 정정 M1)

Phase 1에서 `WizardSidebar` 변경 **없음**. 합산 요약 박스(§2-2-a)로 사용자 가시성 충분히 확보.

Phase 1.5: `WizardSidebar` 의 SummaryRow 컴포넌트에 hint prop 확장 → "사전증여 가산가액" 옆 `🏢 일부 영리법인` 인라인 표시.

#### 2-2-c. corporate 판정 헬퍼 (정정 D11)

```tsx
// components/calc/PriorGiftInput.tsx 파일 내 module-scope 함수
function hasCorporatePriorGift(gifts: PriorGift[]): boolean {
  return gifts.some((g) => g.beneficiaryType === "corporate");
}
```

- 위치: PriorGiftInput.tsx 파일 내 module-scope (별도 helper 파일 신설 안 함, 800줄 정책 여유)
- 사용 위치: 합산 요약 박스 + (Phase 1.5) 사이드바 hint

### 2-3. 결과 카드 — `InheritanceTaxResultView.tsx` (정정 D5·D6)

#### 2-3-a. 영리법인 면제 행 (line 188 인접)

`result.corporateExemption` 노출이 결과 카드의 유일한 신규 변경 (D6 — 사전증여 표 부재로 §2-3-b 폐기).

```tsx
{result.corporateExemption && result.corporateExemption.amount > 0 && (
  <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-4 space-y-2">
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1 text-[10px] bg-violet-200 text-violet-800 rounded px-2 py-0.5">
        🏢 §3의2②
      </span>
      <p className="text-sm font-semibold text-violet-700">영리법인 사전증여 면제 (§3의2② · 집행기준 28-0-1)</p>
    </div>
    {/* breakdown 직접 노출 — 엔진이 한국어 라벨 작성 (corporate-exemption.ts:87-102) */}
    {result.corporateExemption.breakdown.map((step, i) => (
      <div key={i} className="flex justify-between text-xs">
        <span className="text-gray-700">{step.label}</span>
        <span className="font-mono">{formatKRW(step.amount)}</span>
      </div>
    ))}
    <div className="flex justify-between text-sm font-bold text-violet-800 border-t border-violet-200 pt-2">
      <span>상속세 산출세액에서 차감 (면제)</span>
      <span>− {formatKRW(result.corporateExemption.amount)}</span>
    </div>
  </div>
)}
```

**산식 표시 출처 (정정 D5)**: `result.corporateExemption.breakdown` 을 그대로 노출. 엔진 `inheritance-corporate-exemption.ts:87-102` 가 이미 한국어 라벨로 산식 3행 출력:
1. "영리법인 증여세 산출세액"
2. "면제 한도 — 산출세액 × 영리법인 과세표준 ÷ 상속세 과세표준"
3. "영리법인 면제세액 Min(증여세 산출세액, 한도)"

→ UI에서 `corporateGiftComputedTax` 합계를 별도 계산하지 않아도 breakdown[0]에 노출됨. **D5 해소**.

산식 표시 정책 준수 ([[feedback_result_view_korean_formula]] · [[feedback_no_won_suffix]]):
- "원" 단위 미표기 (`formatKRW` 가 콤마만 표시)
- `Math.floor()` 묵시 처리
- 한국어 풀어쓰기 — 엔진 breakdown 그대로

#### 2-3-b. 결과 화면 사전증여 표 — 부재 확인 (정정 D6)

`InheritanceTaxResultView.tsx:188-192` 에는 사전증여 표 없음. 단일 합계 행 `priorGiftAggregated` 만 존재.

→ corporate 행별 배지는 **입력 화면 합산 요약 박스 (§2-2-a)** 에서 노출. 결과 화면은 면제 행만 추가 (위 §2-3-a).

→ 향후 사전증여 표를 결과 화면에 추가하는 PR(Phase 3 신고서 별지 11호서식 부표)에서 corporate 배지 일괄 적용.

## 3. 14 동기화 지점 매트릭스

| # | 지점 | 파일 | 변경 |
|---|---|---|---|
| ① | `PriorGift` 타입 | `types/inheritance-gift.types.ts:223-279` | ✅ 사전 구현 |
| ② | 신규 행 initial | `PriorGiftInput.tsx:462` | ✅ 변경 없음 |
| ③ | normalize | sessionStorage hydrate | ✅ 변경 없음 |
| ④ | API 변환 | `lib/calc/inheritance-api.ts` | ✅ spread 통과 |
| **⑤** | **UI 위젯** | **PriorGiftInput.tsx** | **신규: ToggleCard + 상태머신 + CurrencyInput + 배지** |
| ⑥ | 사이드바 | inheritance-summary.ts / WizardSidebar | Phase 1.5 분리 (정정 M1). Phase 1은 합산 요약 박스만 변경 (⑤ 범위) |
| **⑦** | **결과 카드** | **InheritanceTaxResultView.tsx** | **신규: 면제 행 + 사전증여 표 배지** |
| ⑧ | Validation | `inheritance-validate.ts:88-95` | ✅ 사전 구현 |
| ⑨ | Zod enum 메인 | `priorGiftSchema:158` | ✅ |
| ⑩ | Zod enum 컴패니언 | n/a — 상속세에 컴패니언 분기 없음 (정정 D12) | n/a |
| ⑪ | 자산-수준 fallback | n/a — 양도세 자산-수준 패턴 전용 (정정 D12) | n/a |
| ⑫ | Zod 입력 객체 정의 | `priorGiftSchema:136-160` | ✅ |
| ⑬ | call*API body spread | `inheritance-api.ts` | ✅ |
| ⑭ | route 엔진 매핑 | `app/api/calc/inheritance/route.ts:79-80` | ✅ |

## 4. 케이스 매트릭스 (입력 분기 전수)

| # | 시나리오 | ToggleCard | isHeir | doneeRelation | giftTaxPaid | corpGiftComputedTax | 기대 결과 |
|---|---|---|---|---|---|---|---|
| C0 | 회귀: 자연인 상속인 | OFF | true | lineal_descendant | 50M | undefined | priorGift 합산 + §28 공제 |
| C1 | 영리법인 5년 이내 | ON | false 강제 | undefined | 0 강제 | 80M | 합산 + §3의2② 면제 |
| C2 | 영리법인 산출세액 0 | ON | false | — | 0 | 0 또는 미입력 | validate 차단 |
| C3 | 영리법인 5년 초과 | ON | false | — | 0 | 80M | 엔진 컷오프 (합산 0) |
| C4 | heir → corporate 전환 | OFF→ON | true→false | 보존→undefined | 50M→0 | undefined→입력 | 시나리오 S2 |
| C5 | corporate → heir 복귀 | ON→OFF | false→true 복원 | undefined→lineal_descendant 복원 | 0→50M 복원 | 입력값→undefined | prev 복원 |
| C6 | 영리법인 다수 행 | 행2 모두 ON | 모두 false | — | 모두 0 | 각 행 입력 | 합산 corporate 면제 |
| C7 | 영리법인 + 자연인 혼합 | 일부 ON | 혼합 | 자연인만 입력 | 자연인만 입력 | 영리법인만 입력 | §28 + §3의2② 동시 |
| C8 | 영리법인 0건 (회귀) | 전체 OFF | 사용자 선택 | 사용자 선택 | 사용자 선택 | 미정의 | 기존 흐름 무변화 |

C0·C8은 회귀 보호 anchor 대상 (ANCHOR-CORP-5). C7 혼합 케이스 (정정 D9) 는 통합 시나리오 — 자연인 §28 공제와 영리법인 §3의2② 면제가 동시 발동되는지 브라우저 수동 확인 + cross-cutting anchor 1건 권장.

## 4-1. Anchor 참조 (정정 M5)

엔진·계산 검증 anchor 5건은 **계획서 §5 (ANCHOR-CORP-1~5)** 에 정의. UI 측 검증은 §1 시나리오 S1~S6 + §4 케이스 매트릭스 C0~C9 브라우저 수동 시뮬로 보완.

## 5. 결과 화면 산식 표 (정정 E15)

| 라벨 | 표시값 출처 | 산식 (한국어) |
|---|---|---|
| 사전증여 합산가액 | `result.priorGiftAggregated` | (자연인 + 영리법인 합계) |
| 영리법인 증여세 산출세액 상당액 | `Σ gift.corporateGiftComputedTax` (corporate 행만) | — (사용자 입력 합계) |
| 면제 한도 | `result.corporateExemption.limit` | 상속세 산출세액 × 영리법인 증여 과세표준 ÷ 상속세 과세표준 |
| 영리법인 면제세액 | `result.corporateExemption.amount` | Min(증여세 산출세액 상당액, 면제 한도) |
| 증여세액공제 (§28) | `result.giftTaxCredit` | Σ 기납부 증여세 (corporate 제외 — giftTaxPaid=0이므로 자연 배제) |

## 6. 색상·tone 가이드

- 모든 영리법인 관련 UI 요소 → `violet` tone 통일
  - ToggleCard: `bg-violet-50/70 border-violet-300 ring-violet-200/50`
  - 배지: `bg-violet-100 text-violet-800`
  - 결과 카드 섹션: `bg-violet-50/40 border-violet-200`
- 이유: 사전증여(violet 기존) + 영리법인 특수 분기 일관성. amber(취득·분리)·rose(지역)와 의미 충돌 없음

## 7. 접근성·키보드

- ToggleCard: 기본 Switch 컴포넌트 키보드 지원 (Space·Enter)
- disabled 입력은 `aria-disabled="true"` + `title={disabledReason}` 자동 처리
- 결과 카드 배지: `aria-label="영리법인 사전증여 — 상증법 §13① · §3의2② · 집행기준 28-0-1"`

## 8. 테스트 시나리오 (브라우저 수동)

C1~C6 모두 브라우저에서 수동 확인:
1. /calc/inheritance 진입
2. 사전증여 행 추가 → ToggleCard ON
3. 상태머신 작동 확인 (disabled·자동 set)
4. 산출세액 입력 → 다음 → 결과 화면 면제 행 확인
5. ToggleCard OFF 복귀 → prev 복원 확인
6. Network 탭 request body — `beneficiaryType: "corporate"` · `corporateGiftComputedTax` 전송 확인

## 9. Out-of-Scope (Phase 2~)

- 신고서 별지 11호서식 부표 영리법인 행 (Phase 3)
- history 모달 자동 채움 시 corporate 자동 추론 (Phase 2)
- giftTaxBase 명시 입력 위젯 (Phase 1.5 옵션)
- 사이드바 corporate 별도 행 분리 (현재 hint만, Phase 3 검토)
- validate 정책 강화 (corporate + isHeir=true 조합 명시 차단, Phase 1.5)
