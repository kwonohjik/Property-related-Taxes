# 상속세 결과 집계표 정합 수정 — UI 설계

> 엔진 설계: [`inheritance-result-table-reconciliation.engine.design.md`](./inheritance-result-table-reconciliation.engine.design.md)
> 계획서: [`docs/00-pm/inheritance-result-table-bugfix.plan.md`](../../00-pm/inheritance-result-table-bugfix.plan.md)
> 성격: **신규 입력 필드 없음** — 결과뷰 집계표의 표시 정합·경고·검증 메시지 중심 UI.

## 1. 개요

상속인별 집계표(image18·19·20)에서 합계열↔인별열이 서로 다른 기준으로 산출돼 사용자 혼란/오해를 유발. 본 UI 작업은 (a) 근본 수정(T2·T7·T10) 후 표가 정합하게 표시되도록 하고, (b) 정합이 깨진 경우/특수 상태를 **명시적으로 안내**하여 "조용한 불일치"를 제거한다.

### 1.1 변경 대상 (컴포넌트 · lib)

| 파일 | 역할 | 변경 |
|---|---|---|
| `components/calc/results/HeirAllocationSummaryTable.tsx` | 33행 per-heir 집계표 | rose 배지(allocationMismatch)·§28 안내·doneeId 안내·*5/㉡ 표시 |
| `lib/calc/heir-allocation-summary.ts` (`buildSummaryTable`) | 행 데이터 조립 | T3(b) 표 단위 reconciliation 플래그·*5 total |
| `components/calc/results/source-summary/EstateAllocationTable.tsx` | 자산 분류 표 | T4 합계열 평가 통일 |
| `components/calc/results/source-summary/source-summary-helpers.ts` | `resolveValuation` | T4 교체 |
| `components/calc/results/InheritanceTaxResultView.tsx` | 결과뷰 컨테이너 | §28 세액공제 합계 가시성 유지 확인 |
| `components/calc/PriorGiftInput.tsx` / `prior-gift/GiftRowEditor.tsx` | 사전증여 입력 | doneeId 미지정 검증 경고·giftTaxPaid 안내(T5·T9) |
| `lib/calc/inheritance-validate.ts` | 검증 | T2 expected 통일 차단 메시지 |

### 1.2 UI 설계 핵심 원칙

- **정합이 깨지면 침묵 금지** — rose 배지로 명시(어느 행이 신뢰 불가인지 사용자가 알 수 있게).
- **표시 vs 실제 세액 구분** — §28 인별 0이어도 집계 반영 시 "이미 반영됨" 안내(오인 방지).
- 자동 보정/안분 금지 — 검증 차단·안내로 사용자 명시 입력 유도.
- 정적 tone(rose=오류/불일치, sky=정보 안내, amber=확인 필요).

## 2. 결과 집계표 표시 명세 (행별)

근본 수정(T2·T7·T10) 후 정상 상태에서 **모든 Pattern A 행의 합계 == Σ인별**. 아래는 잔존/특수 상태 표시.

### 2.1 자산 분류 4행 + ① 총상속재산 (R1·T2 영역)
- 정상: 합계(엔진 평가) == Σ인별(협의분할). 일치.
- 불일치(검증 우회 시): 해당 자산이 속한 행 합계 셀 옆 **rose ⚠️ 배지** + tooltip "인별 합 {actual} ≠ 평가액 {expected} (협의분할 합계 재확인 필요)". 데이터: `result.heirAllocationResult.allocationMismatch[]`(assetId 기준, T3a echo).

### 2.2 ㉡ 채무·공과·장례비 (R3·T7 영역)
- T7 후: 합계 = 인별 합 = `deductedBeforeAggregation`(capped). 장례비 한도 적용된 값 표시.
- 행 hint(sky): 장례비 한도 적용 시 "장례비 §14 한도(식대 1천만·봉안 5백만) 적용 후 금액" 1회 안내.

### 2.3 ② 사전증여재산 + ⑩/⑫ §28 (R2·R4·T5·T8 영역)
- **doneeId 미지정 + 사전증여 존재**: 기존 배지(`prior-gift-donee-missing-badge`) **확장** —
  - ② 행: "사전증여 합계는 과세가액에 반영됨. 인별 배부는 수증자 지정 필요."
  - ⑫ 행(자연인 §28 사전증여세액공제): **giftTaxPaid > 0 시** "집계 §28 증여세액공제는 **세액공제 합계에 이미 반영됨** — 인별 배부는 수증자 지정 필요"(sky). **giftTaxPaid = 0 시** "기납부 증여세 미입력 — §28 공제 미적용(이중과세 가능), 사전증여 입력에서 기납부 증여세 확인"(amber).
  - ⑩ 행(영리법인 §3의2② 면제 한도): 영리법인 수증자(corporate) doneeId 미지정 시 동일 패턴 — 단 ⑩은 §28 아닌 §3의2② 면제이므로 안내 문구 "영리법인 증여세액(§3의2②)" 으로 구분.
- doneeId 지정 후: ②·⑩·⑫ per-heir 동시 표시(엔진 자동).

### 2.4 ⑥·⑪·⑬·⑮·*5 세액 배부행 (N4·T10 영역)
- T10 후: Σ인별 == 엔진 권위값(잔차 0). *5 부담비율 Σ == 1.0000.
- **표 단위 가드(T3b) — ⚠️ 비교 대상 주의**: 이 행들은 Pattern B(합계열 = Σ인별)라 `행.total == Σ인별`이 **항상 성립**(자기정합) → `행.total` 비교로는 검출 불가. 가드는 **Σ인별을 엔진 권위 총계와 대조**해야 한다:
  - ⑥㉡/⑥㉢ → `result.taxBase`(또는 indirectNumerator)
  - ⑪ → distributableTax(=⑦ 산출세액 − 영리법인 면제)
  - ⑮ → aggregate `result.finalTax`
  - ㉡ → `deductedBeforeAggregation`
  - *5 → `1.0`
- 불일치(>1원) 시 합계 셀 rose ⚠️ + "배부 합 {Σ} ≠ 엔진 {권위값}" (정상 빌드에서는 T10 후 미발생 — 방어용).

## 3. 신규 UI 요소 명세

### 3.1 allocationMismatch rose 배지 (T3a)
```
조건: result.heirAllocationResult.allocationMismatch?.length > 0
위치: 해당 assetId가 속한 자산 분류 행(또는 표 상단 요약 배너)
스타일: rose-50 배경 / rose-600 텍스트 / ⚠️
내용: "자산 '{name}' 협의분할 합 {actual} ≠ 평가액 {expected} — 입력 재확인"
정책: Tailwind 정적 tone(feedback_tailwind_static_tone_mapping)
```

### 3.2 §28 가시성 안내 (T8) — 2-state
| giftTaxPaid | doneeId | 표시 |
|---|---|---|
| > 0 | 미지정 | sky "집계 §28 세액공제 합계에 반영됨 · 인별 배부는 수증자 지정 필요" |
| = 0 | (무관) | amber "기납부 증여세 미입력 — §28 미적용. 입력 확인" |
| > 0 | 지정 | 안내 없음(인별 정상 표시) |

### 3.3 doneeId 미지정 검증 경고 (T5, 입력 단계)
- `PriorGiftInput`/`GiftRowEditor`: heirs 존재 + 사전증여 입력 + doneeId 미지정 시, 행 하단 amber 경고 "수증자(상속인)를 지정하면 인별 배부·§28 인별 공제가 표시됩니다"(차단 아님 — `feedback_no_silent_apportion_fallback`).

### 3.4 검증 차단 메시지 (T2, ⑧)
- `validateEstateItemAllocations` 차단 시: "자산 '{name}' 협의분할 합계 {sum} ≠ 평가액 {engineValue}" — **engineValue는 T2 통일 함수(담보 하한·주식 평가 포함)** 값으로 표시(기존 resolveEstateItemValue 값과 다를 수 있음 — 사용자에게 정확한 목표액 제시).

## 4. 동기화 지점 (result echo → 표시)

신규 입력 필드 없음 → 14지점 중 입력측(①~⑥) 변경 없음. 변경은 **⑦ 결과·⑧ validation**:

| 지점 | 변경 |
|---|---|
| ⑦ 결과 카드 | `allocationMismatch[]` 읽어 rose 배지 / §28 2-state 안내 / doneeId 안내 / ㉡ capped·*5 1.0 표시 |
| ⑧ validation | `validateEstateItemAllocations` expected를 엔진 통일값으로(T2) + doneeId 경고 |

> result 타입에 `allocationMismatch?` 추가(엔진 설계) → 결과뷰가 optional 안전 접근(`?.`). JSON Record/array(Map 금지).

## 5. 구현 순서 (Do 단계, 엔진 수정 후)

1. 엔진 T2·T7·T10·T3a 완료 → result echo 확정.
2. `buildSummaryTable`: ㉡ capped·*5 total·표 단위 reconciliation 플래그(T3b).
3. `HeirAllocationSummaryTable`: rose 배지·§28 2-state·doneeId 안내 확장.
4. `EstateAllocationTable`/source-summary: T4 합계열 평가 통일.
5. `PriorGiftInput`: doneeId 경고·giftTaxPaid 안내.
6. e2e(T6): 입력→결과→이력→수정 복원→재계산 + 표 정합 검증.

## 6. Definition of Done 자가 점검표

- [ ] 정상 케이스: 모든 Pattern A 행 합계 == Σ인별 화면 확인
- [ ] *5 부담비율 합계 1.0000 표시
- [ ] ㉡ 행 capped 값(= deductedBeforeAggregation) 표시 + 한도 hint
- [ ] doneeId 미지정 시 ②·⑩·⑫ 안내 배지(giftTaxPaid 유무별 2-state)
- [ ] doneeId 지정 시 ②·⑩·⑫ per-heir 정상 표시
- [ ] allocationMismatch rose 배지(검증 우회 fixture)
- [ ] T2 차단 메시지가 엔진 통일 평가액 표시
- [ ] §28 세액공제 합계(`TaxCreditBreakdownCard`)와 per-heir ⑫ 안내가 모순 없이 공존
- [ ] Tailwind 정적 tone 매핑(dynamic class 금지)
- [ ] e2e 통과
