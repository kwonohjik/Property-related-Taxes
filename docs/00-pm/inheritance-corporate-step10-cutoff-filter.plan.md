# 엔진 후속 계획서 — STEP 10 영리법인 cutoff 필터 통합

> 2026-05-21 · feature: `inheritance-corporate-step10-cutoff-filter`
> 선행: Phase 1 (commit `c48826a`) + Phase 1.5 (commit `bc3f8b3`)
> 소관: `inheritance-gift-tax-senior` (주) · `inheritance-gift-tax-ui-senior` (UI 영향 검토)
> 참조 정책: [[feedback_anchor_correction_legal_priority]] · [[feedback_engine_comment_vs_impl_drift]] · [[feedback_korean_law_82_vs_81_2_drift]]

## 1. 배경 — Phase 1 anchor 에서 발견된 엔진 결함

`ANCHOR-CORP-2` 작성 중 발견:

```ts
// 6년 전 영리법인 증여 — §13①2호 5년 도과
const result = calcInheritanceTax(...);
expect(result.priorGiftAggregated).toBe(0);        // ✅ aggregatePriorGiftsForInheritance 컷오프 정상
expect(result.corporateExemption?.amount).toBe(0); // ❌ 실제로는 80M 발동
```

**원인**: `lib/tax-engine/inheritance-tax.ts:361-385` STEP 10 의 corporate 필터가 **5년 cutoff 미적용**.

```ts
// inheritance-tax.ts:361 — 현행 (cutoff 미적용)
const corporateGifts = (input.preGiftsWithin10Years ?? []).filter(
  (g) => g.beneficiaryType === "corporate",
);
const corporateGiftTaxBase = corporateGifts.reduce(
  (s, g) => s + (g.giftTaxBase ?? g.giftAmount), 0,
);
const corporateGiftComputedTax = corporateGifts.reduce(
  (s, g) => s + (g.corporateGiftComputedTax ?? 0), 0,
);
// ↓ §13 시기 cutoff 거치지 않고 §3의2② 면제 발동
```

결과:
- 가산은 정상 차단 (`priorGiftAggregated = 0`)
- 그러나 면제는 발동 (`corporateExemption.amount = 80M`)
- → **상속세 부당 감액** (가산은 0인데 면제만 작동)

## 2. 법령 근거 (KoreanLaw MCP 검증 강제)

| 조문 | 결정적 해석 |
|---|---|
| 상증법 §3의2 ② | "§13에 따라 가산된 증여재산"에 대해 면제. 가산되지 않은 증여재산은 면제 대상 아님 — **명문 |
| 집행기준 28-0-1 | 동일 취지 — §13 가산 전제 |
| §13 ① 2호 | 상속개시일 전 5년 이내 상속인 아닌 자 증여 합산 |

→ **명백한 엔진 결함**. §3의2② 발동 전제는 §13 가산이며, 5년 도과 영리법인 행은 면제 적용 대상이 아님.

## 3. 작업 범위

### 3-1. 엔진 변경 — `inheritance-tax.ts` STEP 10

```ts
// 변경 후 (cutoff 적용)
import { differenceInYears } from "date-fns";

const corporateGifts = (input.preGiftsWithin10Years ?? []).filter((g) => {
  if (g.beneficiaryType !== "corporate") return false;
  // §13①2호 5년 cutoff — aggregatePriorGiftsForInheritance 와 동일 로직
  // (engine line 305: g.isHeir ? 10 : 5. corporate는 isHeir=false이므로 5년)
  const elapsedYears = differenceInYears(
    new Date(input.deathDate),
    new Date(g.giftDate),
  );
  return elapsedYears <= 5;
});
```

또는 더 안전하게 — `aggregatePriorGiftsForInheritance` 의 cutoff 로직을 **헬퍼 함수로 export** 후 양쪽에서 재사용 ([[feedback_single_source_engine_helper]] 정책).

#### 3-1-a. 권장 — 헬퍼 함수 추출

`lib/tax-engine/inheritance-gift-common.ts` 에 다음 추가:

```ts
/**
 * §13 cutoff 판정 — 상속인 10년 / 비상속인(영리법인 포함) 5년
 * @param gift 사전증여 항목
 * @param deathDate 상속개시일
 * @returns true: 합산 대상 / false: cutoff
 */
export function isWithin13Cutoff(gift: PriorGift, deathDate: string): boolean {
  const elapsedYears = differenceInYears(new Date(deathDate), new Date(gift.giftDate));
  const limitYears = gift.isHeir ? 10 : 5;
  return elapsedYears <= limitYears;
}
```

`aggregatePriorGiftsForInheritance` 와 STEP 10 corporate 필터 양쪽에서 이 헬퍼 사용. 단일 진실.

### 3-2. 영향 분석

#### 회귀 영향 — 기존 PDF 종합사례 anchor

| Fixture | 영리법인 사전증여 시기 | 영향 |
|---|---|---|
| `comprehensive-case-pdf.fixture.ts` | 책 1866 ⑩ — 영리법인 증여일·상속개시일 조합 확인 필요 | 5년 이내면 무변화. 5년 초과면 결과 변동 (상속세 증가) |
| 기타 inheritance 회귀 anchor 96건 | 대부분 자연인 사전증여 | 영향 없음 |

**Pre-Do 강제 검증**: 종합사례 PDF의 영리법인 증여일 확인 후 anchor 영향 산정.

#### UI 영향 — InheritanceTaxResultView

- Phase 1 결과 카드 (`result.corporateExemption.amount > 0`) 가 5년 도과 영리법인 행에서 미발동
- 사용자가 "왜 면제가 안 보이지?" 의문 → 안내 메시지 또는 합산 요약 박스에서 "5년 도과 — 면제 대상 아님" 안내 추가 권장

## 4. 검증 (anchor)

### 4-1. 기존 anchor 갱신

- `ANCHOR-CORP-2` NOTE 제거 — `expect(result.corporateExemption?.amount).toBe(0)` 강제
- `ANCHOR-CORP-1`·`4a`·`4b` (5년 이내·경계) — 무변화 확인
- `ANCHOR-CORP-3` PDF 책 1866 ⑩ — 영리법인 시기 5년 이내인지 확인 후 anchor 보존

### 4-2. 신규 anchor

- `ANCHOR-CORP-CUTOFF-1`: 6년 전 영리법인 → priorGiftAggregated=0 AND **corporateExemption=undefined or amount=0**
- `ANCHOR-CORP-CUTOFF-2`: 5년 0일 + 5년 1일 경계 — `isWithin13Cutoff` 헬퍼 직접 테스트
- `ANCHOR-CORP-CUTOFF-3`: isHeir=true (legacy 영리법인 오분류) — 정책상 validate 차단되지만 엔진 직접 호출 시 10년 cutoff. 방어 로직 검토

### 4-3. cross-cutting anchor 영향

`__tests__/tax-engine/inheritance/comprehensive-case-pdf.test.ts` 의 PDF 책 1866 ⑩ 종합사례 — 영리법인 시기 확인 후 영향 없음 보장. 영향 발견 시 [[feedback_anchor_correction_legal_priority]] 적용.

## 5. 14 동기화 지점

| # | 지점 | 변경 |
|---|---|---|
| ① | 폼 상태 | 변경 없음 |
| ② | initial | 변경 없음 |
| ③ | normalize | 변경 없음 |
| ④ | API 변환 | 변경 없음 |
| ⑤ | UI 위젯 | 변경 없음 (UI는 5년 이내 데이터만 입력하므로 정상 케이스) |
| ⑥ | 사이드바 | 변경 없음 |
| ⑦ | 결과 카드 | 5년 도과 영리법인 안내 메시지 (옵션) |
| ⑧ | Validation | 변경 없음 (5년 도과 자체는 cutoff 처리 — validate 차단 안 함) |
| ⑨~⑭ | Zod/route | 변경 없음 |

**실 변경 파일 1~2개**: `inheritance-tax.ts` + `inheritance-gift-common.ts` (헬퍼 추출 시)

## 6. 모호 분기 / 결정 필요

1. **헬퍼 추출 vs inline**: `aggregatePriorGiftsForInheritance` 와 STEP 10 양쪽에서 cutoff 로직을 inline 중복 vs `isWithin13Cutoff` 헬퍼 추출. **헬퍼 추출 권장** ([[single-source-engine-helper]] 정책).
2. **5년 도과 영리법인 행 UI 안내**: 별도 안내 카드 추가 vs 사이드바 hint 변경 vs 무변화. **별도 안내 카드 권장** — Phase 3 부표 정책과 연동.
3. **`isWithin13Cutoff` 의 `beneficiaryType` 기반 분기 확장**: 현재 `isHeir` 만 보지만, 향후 `beneficiaryType="legatee"` (비상속인 자연인) 도 5년 — 이미 isHeir=false 로 표현되므로 호환. 그러나 명시적 enum 분기로 리팩터링 옵션 검토.
4. **단일 source of truth**: STEP 10 의 `corporateGiftTaxBase` 합산도 cutoff 후 필터링된 corporate 만 사용해야 함. 한 곳에서만 필터 후 두 reduce 모두 동일 배열 참조.

## 7. 작업량 예상

| 항목 | 변경 |
|---|---|
| `isWithin13Cutoff` 헬퍼 추출 | ~20줄 |
| `aggregatePriorGiftsForInheritance` 호출부 치환 | ~5줄 |
| `inheritance-tax.ts:361` STEP 10 corporate 필터 적용 | ~10줄 |
| Pre-Do anchor 종합사례 영향 검증 | 0줄 (테스트만) |
| 신규 anchor CUTOFF-1~3 | ~80줄 |
| **합계** | **~115줄** |

## 8. 우선순위·일정

- **Pre-Do**: 종합사례 PDF 책 1866 ⑩ 영리법인 시기 확인 (anchor cross-cutting 영향 산정)
- **본 PR**: 헬퍼 추출 + STEP 10 cutoff 통합 + anchor 갱신
- **(분리)**: 5년 도과 안내 UI — Phase 3 부표 작업과 동반

## 9. Definition of Done

- [ ] KoreanLaw MCP §3의2② + §13 본문 검증 + 인용 첨부
- [ ] 종합사례 PDF 영리법인 시기 확인 (Pre-Do)
- [ ] `isWithin13Cutoff` 헬퍼 추출 + 양쪽 호출부 치환
- [ ] STEP 10 corporate 필터에 cutoff 적용
- [ ] ANCHOR-CORP-2 NOTE 제거 + 강제 차단 확인
- [ ] ANCHOR-CORP-CUTOFF-1·2·3 통과
- [ ] cross-cutting: PDF 종합사례 anchor 영향 0 또는 [[feedback_anchor_correction_legal_priority]] 적용
- [ ] `npx tsc --noEmit` 0건
- [ ] 전체 inheritance 회귀 0
- [ ] 5년 도과 안내 UI는 후속 PR로 분리

## 10. 위험·되돌리기 계획

- **위험**: 종합사례 PDF anchor 의 면제액이 변동되어 회귀 발생 가능
- **완화**: Pre-Do 단계에서 시기 확인 후 영향 없음 확정 후 진입
- **되돌리기**: 단일 헬퍼만 변경했으므로 revert 용이
- **법령 정합성 우선** ([[feedback_anchor_correction_legal_priority]]) — 회귀 발생 시 잘못된 anchor 가 아니라 법령 정합 값으로 재산정
