# 금양임야·묘토 비과세 면적/금액 한도 — UI 설계

> 엔진 설계: [`gravesite-forest-area-limit-fix.engine.design.md`](./gravesite-forest-area-limit-fix.engine.design.md)
> 계획서: [`docs/00-pm/gravesite-forest-area-limit-fix.plan.md`](../../00-pm/gravesite-forest-area-limit-fix.plan.md)
> 범위: **상속세 전용** (금양임야·묘토·족보는 `category:"inheritance"` — 증여 카테고리에 없음)

## Context / 사용자 시나리오

1. 상속세 마법사 비과세 단계에서 사용자가 "금양임야" 비과세를 "여"로 선택.
2. (현재) 금액 칸만 있어 면적을 입력할 수 없음 → 면적 한도가 작동하지 않아 입력 금액 전액이 비과세됨.
3. (개선) 면적(㎡)을 입력 → 한도(9,900㎡) 초과 시 비율 안분, 금양임야+묘토 합산 2억 초과 시 한도 적용. 결과 화면에서 항목별 비과세액·과세 전환분 확인.

**현재 화면 경로**: `components/calc/inheritance/steps.tsx` → `ExemptionChecklist`(`category="inheritance"`) → `ExemptionRow`(금양임야·묘토·족보·제구 포함 전 룰 렌더).

---

## UI 명세

### ① 면적 입력 위젯 (B-1) — `ExemptionChecklist.tsx`

현재 `ExemptionRow`(`:88~168`)는 `limitType==="area"`일 때 `:129~133`에서 "(면적 한도 N㎡)" **라벨만** 표시. 면적 입력 필드 부재.

**변경:**
```tsx
// ExemptionRowProps 확장 (:46~52)
interface ExemptionRowProps {
  rule; checked; amount;
  areaM2: number | undefined;                                  // 추가
  onToggle; onAmountChange;
  onAreaChange: (ruleId: string, areaM2: number | undefined) => void;  // 추가
}

// limitType==="area" 블록: 기존 "해당 자산 가액"(금액) 입력 아래에 면적 입력 추가
// ★ D-2: 기존 ExemptionRow는 raw <label>+CurrencyInput 패턴(FieldCard 미import) → 면적도 동일 raw 패턴
<label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">해당 면적 (㎡)</label>
<DecimalInput value={areaM2 ?? ""} onChange={(v) => onAreaChange(rule.id, parseDecimal(v) || undefined)} placeholder="분묘에 속한 면적 (㎡)" />
{areaM2 != null && rule.limitAreaM2 && areaM2 > rule.limitAreaM2 && (
  <p className="text-xs text-amber-700">한도 {rule.limitAreaM2}㎡ 초과 — 초과 면적 비율로 금액 안분 과세</p>
)}
```
- **`DecimalInput` + `parseDecimal` 필수** (CurrencyInput 금지 — 소수점 면적 333.06→33306 버그). `DecimalInput.tsx:37/88` export 확인.
- `claimedAreaM2`에 저장(deprecated `areaM2` 아님).
- **D-2**: 기존 raw `<label>` 패턴 유지(FieldCard 미사용) — 금액 입력과 시각 일관.
- **D-4**: 금양임야/묘토는 **가액(claimedAmount)+면적(claimedAreaM2) 둘 다 입력** — "해당 자산 가액"(비과세 대상 금액)·"해당 면적"(한도 판정용) 두 라벨로 역할 구분. placeholder 숫자 예시 금지(한국어 설명만).

```tsx
// 메인 컴포넌트 (:189~201)
const handleAreaChange = (ruleId, areaM2) =>
  onChange(value.map(v => v.ruleId === ruleId ? { ...v, claimedAreaM2: areaM2 } : v));
// toggle 초기 객체(:193): { ruleId, claimedAmount: 0, claimedAreaM2: undefined }  // 0 금지 — "미입력" 구분
// ExemptionRow에 areaM2={checkedMap.get(rule.id)?.claimedAreaM2} onAreaChange={handleAreaChange} 전달
```

### ② 금액 한도 안내 (B-5)
- 금양임야 또는 묘토 checked 시 섹션 수준 안내(violet tone, ExemptionChecklist 카드 톤 일치):
  > "금양임야·묘토 비과세 합계는 2억원 한도입니다(상증령 §8③). 족보·제구는 별도 1천만원 한도."
- 족보·제구 라벨: `limitType` fixed 변경으로 기존 `:125~128` `limitType==="fixed"` 분기가 "(최대 N" 노출.
- ⚠️ **D-1 선재 버그**: `:127` `(최대 {rule.limitAmount.toLocaleString()}` 뒤 **닫는 괄호 ")" 누락**(현재 장애인신탁서 "(최대 500,000,000" 깨져 노출 중). 족보·제구 fixed 전환 시 동일하게 깨짐 → **`:127`에 ")" 추가** 동반 필수.

### ③ 결과 카드 (B-6) — `InheritanceTaxResultView.tsx`
- 현재 `:293~294`는 `result.exemptAmount > 0` 시 "비과세 차감" 합계 한 줄만.
- 기존 `ExemptionSummaryCard`(`components/calc/exemption/ExemptionSummaryCard.tsx`, **import 사이트 0건** — 정의만 존재) 연결. **props(`:62~64`)는 `result: ExemptionResult` + `itemResults?: ExemptionItemResult[]` 둘 다** (D-7):
```tsx
{result.exemptionDetail && (
  <PrintSection id="exemption-detail" selectedIds={selectedPrintIds}>
    <ExemptionSummaryCard result={result.exemptionDetail} itemResults={result.exemptionDetail.itemResults} />
  </PrintSection>
)}
```
- **선택 출력 통합 (R2-2)**: `corporateExemption` 패턴(`:208`/`:329`/`:415`) — 섹션 id `exemption-detail`을 `selectedPrintIds`(`:208`)에 add + `PrintSection` 래핑. memory `project_selective_print_6tax_series` 8결과뷰 통일.
- **사유 구분 (D-6)**: `ItemRow`(`:39~53`)가 `taxableOverflow`(한도 초과 일반 과세) + `warnings`(면적 초과/2억 합산 초과 사유별) 표시 → 엔진이 warning을 사유별 push.

---

## 14개 동기화 지점 (상속 기준)

| # | 지점 | 위치 | 현행 | 변경 |
|---|---|---|---|---|
| ① 폼 상태 | `ExemptionCheckedItem` (엔진 타입 공유) | `claimedAreaM2?` 존재 | 없음 |
| ② initial | `ExemptionChecklist.tsx:193` toggle | `{ruleId,claimedAmount:0}` | `claimedAreaM2: undefined` |
| ③ normalize | — | optional이라 OK | 없음 |
| ④ API 변환 | `lib/calc/inheritance-api.ts:78` | `exemptions: input.exemptions` pass-through | 없음(자동) |
| ⑤ UI 위젯 | `ExemptionChecklist.tsx` | **면적 입력 없음** | DecimalInput + onAreaChange + 안내 |
| ⑥ 사이드바 | — | 비과세 합계만 | 없음 |
| ⑦ 결과 카드 | `InheritanceTaxResultView.tsx:293` | 합계만·SummaryCard 미연결 | `exemptionDetail`(ExemptionResult&itemResults) echo + SummaryCard + PrintSection (D-7) |
| ⑧ validation | `lib/calc/inheritance-validate.ts` | 면적 검증 없음 | `validateExemptionAreaInput` |
| ⑨⑩⑫ Zod | `property-valuation-input.ts:444` | `claimedAreaM2` 스키마 존재 | 없음 |
| ⑪⑬⑭ | — | input 구조 불변 | result 필드만(⑦) |

> 증여(`gift-tax-form-shared.tsx:423`)도 `ExemptionChecklist`를 렌더하나 `category="gift"`라 금양임야/묘토/족보 미노출 → 면적 위젯·validation 무영향. `lib/calc/gift-validate.ts` 부재.

---

## Validation (⑧) — 상속 전용

`lib/calc/inheritance-validate.ts`:
```ts
function validateExemptionAreaInput(exemptions?: ExemptionCheckedItem[]): string | null {
  for (const it of exemptions ?? []) {
    if ((it.ruleId === "inh_forest_burial" || it.ruleId === "inh_grave_land")
        && (it.claimedAreaM2 == null || it.claimedAreaM2 <= 0)) {
      const name = it.ruleId === "inh_forest_burial" ? "금양임야" : "묘토";
      return `${name} 비과세 선택 시 면적(㎡)을 입력해야 합니다.`;
    }
  }
  return null;
}
// validateInheritanceTaxInput 내 호출 추가
```
- memory `feedback_validation_sync_8th_point`: UI 통과 ↔ validate 차단 모순 방지. UI에서 면적 입력 위젯 제공(⑤)하므로 validate 차단과 정합.

---

## 공통 UI 규칙 점검

- [x] `DecimalInput`+`parseDecimal` (면적 소수점) — CurrencyInput 금지
- [x] placeholder 숫자 예시 금지 → `hint`
- [x] select-on-focus — `SelectOnFocusProvider` 전역 (개별 onFocus 불필요)
- [x] ToggleCard/RadioCardGroup — 본 변경은 YesNo 버튼 기존 패턴 유지(신규 native 토글 없음)
- [x] 결과 산식 한국어·`원` 단위 표기 금지·내부 id 노출 금지
- [x] 800줄 — `ExemptionChecklist.tsx` 255줄 → 면적 위젯 추가 후에도 여유
