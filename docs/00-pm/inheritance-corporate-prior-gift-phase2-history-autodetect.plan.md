# 영리법인 사전증여 Phase 2 계획서 — history 모달 자동 추론

> 2026-05-21 · feature: `inheritance-corporate-prior-gift-phase2-history-autodetect`
> 선행: Phase 1 (commit `c48826a`) + Phase 1.5 (commit `bc3f8b3`)
> 소관: `inheritance-gift-tax-ui-senior` (주) · `inheritance-gift-tax-senior` (자문)

## 1. 배경

Phase 1에서 영리법인 사전증여 UI 입력 경로를 구현했으나, 사용자가 **저장된 증여세 이력에서 import 시 영리법인 정보가 자동으로 채워지지 않음**.

- `lib/calc/prior-gift-lookup.ts:308` 주석: "doneeId / beneficiaryType / corporateGiftComputedTax: 이력 추론 불가 → 미설정"
- 결과: 영리법인 사전증여를 입력해두고 별도 상속세 계산 시 history에서 import → ToggleCard OFF로 들어옴 → 사용자가 수동으로 ON 재설정 필요

## 2. 법령 근거 — 영리법인 판정 가능성 분석

`PriorGiftCandidate` 가 보유한 정보로 영리법인 여부를 추론 가능한가?

| 필드 | 영리법인 추론 가능성 |
|---|---|
| `donorRelation` (수증인 관계) | ❌ 자연인만 enum — 영리법인 표현 없음 |
| `donor` (증여자 관계) | ❌ 자연인 enum |
| `propertyCategory` | ❌ 재산 종류만 (영리법인 무관) |
| 증여세 산출세액 / 과세표준 | ⚠️ 영리법인이면 실제 납부 없음(법인세). 그러나 증여세 계산기에서 산출세액은 시뮬레이션 가능 |
| 저장된 CalculationRecord 메타 | ⚠️ GiftTaxForm에 `beneficiaryType` 폼 필드 자체가 없음 — 저장 시 미보존 |

→ **현행 데이터로 자동 추론 불가**. Phase 2는 두 갈래 접근 필요.

## 3. 접근 방식 (옵션)

### 옵션 A — 증여세 계산기에 "수증자 = 영리법인" 모드 추가 (대규모)

- `GiftTaxForm` 에 `donee.beneficiaryType` 추가
- 증여세 계산 시 영리법인이면 실제 산출세액 0 + 메타에 산출세액 상당액 저장
- CalculationRecord 메타에 beneficiaryType 보존
- history 모달 import 시 자동 채움
- **작업량**: 大 (증여세 엔진·UI·DB 마이그레이션)
- **의문**: 영리법인 수증자 케이스 사용 빈도 낮음 — ROI 검토 필요

### 옵션 B — Import 후 모달 안내 + 1-클릭 재분류 버튼 (소규모, 권장)

- history 모달에서 candidate 선택 후 PriorGiftInput에 append되기 직전 또는 직후
- "수증자가 영리법인입니까?" 모달 또는 인라인 안내 카드 추가
- 사용자가 "예" 클릭 → handleCorporateToggle(true) 호출 + 산출세액 상당액 입력 필드 활성
- **작업량**: 小 (1~2 컴포넌트 + zustand 미사용)
- **장점**: 옵션 A 의 큰 마이그레이션 없이 사용자 경험 개선

### 옵션 C — 자동 추론 휴리스틱 (불완전)

- `c.finalTax === 0` AND `c.computedTax > 0` 조합이면 영리법인 가능성 안내
- 그러나 자연인 비과세 한도 내(증여재산공제 § 53) 케이스와 구분 불가 → false positive 위험
- **기각**

## 4. 권장: 옵션 B (소규모 1-클릭 재분류)

### 4-1. 변경 범위

| 파일 | 변경 |
|---|---|
| `components/calc/gift/PriorGiftHistoryModal.tsx` | candidate 카드에 "🏢 영리법인 사전증여로 import" 보조 옵션 추가 |
| `components/calc/PriorGiftInput.tsx` (GiftRowEditor) | sourceCalculationId 직후 행 헤더에 "🏢 영리법인 재분류" 칩 1-클릭 버튼 표시 (이미 ToggleCard 있으므로 옵션 — 단순화 가능) |
| `lib/calc/prior-gift-lookup.ts` `candidateToPriorGift` | 영리법인 옵션 파라미터 추가 — `candidateToPriorGift(c, { asCorporate: true })` 시 beneficiaryType="corporate"·isHeir=false·giftTaxPaid=0 으로 변환 |

### 4-2. UI 시나리오

1. 사용자 상속세 마법사 사전증여 카드 → "이력에서 가져오기" 클릭
2. `PriorGiftHistoryModal` 후보 목록 표시
3. 각 candidate 카드 하단에 "🏢 영리법인 사전증여로 가져오기" 보조 버튼 (기본 버튼 옆 작은 칩)
4. 사용자 영리법인 클릭 → `candidateToPriorGift(c, { asCorporate: true })` 호출 → append 시 ToggleCard ON 상태로 진입
5. corporate 산출세액 상당액 자동 채움 — candidate 의 `computedTax` 가 §3의2② 한도 분자로 적절. `c.computedTax` → `corporateGiftComputedTax` 매핑

### 4-3. 추론 매핑 (옵션 B 활성 시)

```ts
export function candidateToPriorGift(
  c: PriorGiftCandidate,
  options: { asCorporate?: boolean } = {},
): PriorGift {
  if (options.asCorporate) {
    return {
      giftDate: c.giftDate,
      isHeir: false,                          // §13①2호 강제
      giftAmount: c.grossGiftValue,
      giftTaxPaid: 0,                         // §4의2③ 비과세
      giftTaxBase: c.taxBase,
      beneficiaryType: "corporate",
      corporateGiftComputedTax: c.computedTax, // §3의2② 한도 분자
      sourceCalculationId: c.calculationId,
      propertyCategory: c.propertyCategory,
      propertyName: c.propertyName,
      // donorRelation/donor는 자연인 enum이므로 corporate 모드에서 set 안 함
    };
  }
  // 기존 동작 (자연인)
  return { /* ... 기존 코드 ... */ };
}
```

## 5. 케이스 매트릭스

| # | 시나리오 | 입력 | 기대 |
|---|---|---|---|
| H1 | 자연인 import (기존 회귀) | 일반 candidate 선택 | beneficiaryType undefined·isHeir=true·giftTaxPaid 보존 |
| H2 | 영리법인 import | "🏢" 버튼 클릭 | beneficiaryType="corporate"·isHeir=false·giftTaxPaid=0·corporateGiftComputedTax=c.computedTax |
| H3 | H2 후 사용자가 수정 | corporate 산출세액 변경 | `hasUserEditedFields` 가 sourceCalculationId 제거 |
| H4 | H2 후 ToggleCard OFF | corporate→자연인 복귀 | prevRef 가 isHeir=false·giftTaxPaid=0 보존 → OFF 시 복원 동작. 사용자 추가 수정 필요 |
| H5 | candidate 의 computedTax=0 | 영리법인 1-클릭 | corporateGiftComputedTax=0 → validate 차단. 사용자 수동 입력 안내 |

## 6. anchor 검증 (계획)

- ANCHOR-H2-1: `candidateToPriorGift({...}, { asCorporate: true })` 반환 객체 매핑 검증
- ANCHOR-H2-2: 회귀 — `candidateToPriorGift({...})` 기본 호출 시 기존 동작 (자연인) 보존
- ANCHOR-H2-3: corporate import 후 validate 통과 (산출세액>0 케이스)
- ANCHOR-H2-4: corporate import + computedTax=0 → validate 차단 (corporateGiftComputedTax 필수)

## 7. 14 동기화 지점 영향

| # | 지점 | 변경 |
|---|---|---|
| ① | 폼 상태 | 변경 없음 |
| ② | initial | 변경 없음 |
| ③ | normalize | 변경 없음 |
| ④ | API 변환 | 변경 없음 |
| ⑤ | UI 위젯 | PriorGiftHistoryModal "🏢" 버튼 + candidate 카드 |
| ⑥ | 사이드바 | 이미 corporate 인식 (Phase 1.5) |
| ⑦ | 결과 카드 | 이미 corporate 인식 (Phase 1) |
| ⑧ | Validation | 이미 corporate 정책 (Phase 1.5) |
| ⑨~⑭ | Zod/API/route | 변경 없음 |

**실 변경 파일 2개**: `PriorGiftHistoryModal.tsx` + `prior-gift-lookup.ts`

## 8. 모호 분기 / 결정 필요

1. **PriorGiftHistoryModal 영리법인 버튼 위치**: 각 candidate 카드 내부 vs 카드 외부 라디오. 카드 내부 보조 버튼 권장 (사용자 의도 명확).
2. **candidate의 `computedTax` vs `taxBase` 중 어떤 값을 산출세액 상당액으로 사용?**: `computedTax` 가 §3의2② 정의에 부합 — "영리법인에 증여세가 부과된다고 가정한 산출세액"
3. **doneeId 매핑**: 영리법인은 Heir.id 매핑 어떻게? — 현재 validatePriorGift line 117 doneeId 필수. 모달 import 시 doneeId 미설정 → validate 차단. **결정 필요**: Phase 2에 doneeId 입력 UI 동반 vs validate 완화
4. **GiftTaxForm 에 beneficiaryType 폼 필드 추가 (옵션 A 결합)** 여부 — 별도 미니 PR

## 9. Definition of Done

- [ ] `candidateToPriorGift` 옵션 파라미터 + corporate 매핑
- [ ] PriorGiftHistoryModal 영리법인 버튼·시각 분기
- [ ] anchor H2-1~4 통과
- [ ] H1 자연인 회귀 보호
- [ ] doneeId 결정 (Phase 2 동반 or 완화)
- [ ] `npx tsc --noEmit` 0건
- [ ] inheritance + lib/calc 회귀 0

## 10. 우선순위·일정

- **본 PR**: 옵션 B 1-클릭 재분류 — 1 PR (≤+150줄)
- **(별도)**: 옵션 A GiftTaxForm 영리법인 모드 — 큰 작업, ROI 검토 후 별도 PRD
- **(분리)**: doneeId 입력 UI 정리 — corporate·자연인 모두 영향 → 별도 PR 권장
