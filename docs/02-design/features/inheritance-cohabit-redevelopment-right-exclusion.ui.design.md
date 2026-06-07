# 동거주택 상속공제 §23의2 — 조합원입주권·분양권 미적용 UI 설계

> 생성: 2026-06-07 (plan-design-self-review-loop STEP 12)
> 엔진 설계: `inheritance-cohabit-redevelopment-right-exclusion.engine.design.md`
> 계획서 §11 정합본 — 엔진 정본 명명(`cohabitHouseRightType`/`house`/`one_plus_one_right`) 사용.

---

## Context

`isCohabitantHouse=true` 자산의 유형(일반주택/단일입주권/1+1입주권/분양권)을 사용자가 명시 선택하게 하여, 엔진이 미적용 케이스(1+1·분양권)를 차단하고 결과 카드에 사유를 표시한다. 현행 `CohabitRequirementBlock.tsx:251` 정적 안내문을 실제 입력 위젯+게이트로 승격.

---

## 입력 위젯 (⑤) — `EstateBodyRealEstate.tsx`

배치: `isCohabitantHouse` ToggleCard ON 펼침 영역 직후 (자산 수준 속성).

```
[ToggleCard violet: 동거주택 상속공제 대상 (isCohabitantHouse)]  ← 기존
  └ ON 펼침:
    ┌─ RadioCardGroup name="cohabitHouseRightType" layout="stack" tone=violet ─┐
    │ ( ) 일반주택 (공제 적용)                          house               │
    │ ( ) 1세대1주택 단일 조합원입주권 (적용 가능—확인 필요) single_redev_right │
    │ ( ) 1+1 조합원입주권 (미적용)                      one_plus_one_right  │
    │ ( ) 분양권 (미적용)                                sale_right          │
    └──────────────────────────────────────────────────────────────────────┘
    [one_plus_one_right / sale_right 선택 시]
      ┌ rose 안내 ───────────────────────────────────┐
      │ ⚠ 선택 자산 종류는 §23의2 동거주택 상속공제      │
      │   미적용입니다 (조심 2021중6665 등). 공제 0 처리.│
      └──────────────────────────────────────────────┘
    [single_redev_right 선택 시]
      ┌ amber 안내 ──────────────────────────────────┐
      │ 단일 조합원입주권 적용 여부는 사례별 확인 필요    │
      │ (NTS[113036]). 세무사 상담 권장.               │
      └──────────────────────────────────────────────┘
    [house / single_redev_right 일 때만 CohabitRequirementBlock(동거기간·부득이사유) 노출]
    [one_plus_one_right / sale_right 시 CohabitRequirementBlock 숨김]
```

- `RadioCardGroup` `name` 필수·`layout="stack"`(설명 김)·`tone="violet"`·미선택 옵션도 tone 배경 유지.
- 옵션 B 라벨 "적용 가능 — 확인 필요"(★"적용" 단정 금지 — 엔진 CA-02 needsVerification 정합, 계획 정정#4).
- 정적 tone 매핑(`Record<tone,string>`, dynamic class 금지).
- 2-state(undefined|enum) — 배열 아님(3-state Optional 미적용).

### G6 정적 안내문 처리
`CohabitRequirementBlock.tsx:251` "조합원입주권 미적용" 텍스트 **삭제** → RadioCardGroup C/D rose 카드로 대체. G6 카드는 겸용주택·오피스텔 항목만 유지.

---

## 결과 카드 (⑦) — `CohabitDeductionDetailCard`

엔진 echo 소비: `CohabitDeductionDetail.isExcluded`·`exclusionReason`·`cohabitNeedsVerification`.

```
동거주택공제 (§23의2)                              0
  [rose 배지] isExcluded=true:
     exclusionReason="one_plus_one_right" → "1+1 입주권 미적용"
     exclusionReason="sale_right"         → "분양권 미적용"
  ▼ 상세:
     선택 자산 종류는 §23의2 동거주택 상속공제 대상이 아닙니다.
  [amber 안내] cohabitNeedsVerification=true:
     "단일 조합원입주권 — 적용 여부 확인 필요(NTS[113036]).
      V-1 확정 전 현재 공제 미반영(0). 확정 시 적용 가능."  ← (정정 U1)
```

- `isExcluded=true` 시 기존 산식 행 대신 사유 행만. "원" 단위 금지·한국어.
- ★(정정 U2) `EstateItem.cohabitHouseRightType`은 폼/UI 입력 필드. 엔진 게이트는 `InheritanceDeductionInput.cohabitHouseRightType`(deriveCohabitHouseStdPrice가 전달) 경유 — ⑬ estateItems strip 점검은 폼 보존용, 게이트 차단과는 별개 경로.

---

## Validation (⑧) — `inheritance-validate.ts`

- CV-1: `isCohabitantHouse=true` + `cohabitHouseRightType` 미선택 → **경고**(차단 아님).
- CV-3: `cohabitHouseRightType ∈ {one_plus_one_right, sale_right}` + 동거주택공제 금액(cohabitDirectAmount 등) 입력 → 경고("미적용·공제 0").
- ★EN-3 택일과 동기화: (A) `"house"` fallback 채택 시 normalize·API·validate 3중 일치 / (B) fallback 없이 CV-1 경고. 본 설계 권장 (B).

---

## 7 + 6 동기화 지점

| # | 지점 | 위치 | 내용 |
|---|---|---|---|
| ① | 폼 | `InheritanceTaxForm.tsx` EstateItem | `cohabitHouseRightType?` |
| ② | initial | 동 | undefined |
| ③ | normalize | 동 | string 보존(fallback EN-3) |
| ④ | API 변환 | `inheritance-deduction-suggest.ts` | EstateItem→deductionInput.cohabitHouseRightType 전달 |
| ⑤ | 위젯 | `EstateBodyRealEstate.tsx` | RadioCardGroup + C/D rose·B amber + CohabitRequirementBlock 숨김조건 |
| ⑥ | 사이드바 | — | 무관 |
| ⑦ | 결과 | `CohabitDeductionDetailCard` | isExcluded 배지·needsVerification |
| ⑧ | validation | `inheritance-validate.ts` | CV-1·CV-3 |
| ⑨⑫ | Zod | `property-valuation-input.ts:299 estateItemSchema` | `cohabitHouseRightType` enum |
| ⑩⑪ | — | N/A | 컴패니언·자산 acqDate fallback 상속세 무관 |
| ⑬ | body | route | estateItems spread — 신규 필드 strip 점검 |
| ⑭ | route | `route.ts` | deductionInput 매핑(string, Date 변환 불요) |

---

## Do 전 엔진 확인 (EN)

- EN-1 필드 배치: EstateItem(폼)+InheritanceDeductionInput(엔진) 양쪽(정정#1·R1).
- EN-2 엔진 직접 소비(deductionInput.cohabitHouseRightType) — UI 파생 플래그 주입 금지.
- EN-3 undefined 처리: (B) fallback 없이 CV-1 경고 권장 — Do 전 택일 확정.
- EN-4 isExcluded/exclusionReason/cohabitNeedsVerification echo — 엔진 설계 반영 완료.
- EN-5 single_redev_right 적용을 엔진 자동판정 vs 선택 신뢰 — V-1 결과 의존.

---

## 정책 준수 체크

- [ ] RadioCardGroup name 필수·미선택 tone 유지·정적 tone 매핑
- [ ] useEffect→store 미러링 없음(C/D 숨김은 props 조건 렌더)
- [ ] DateInput/DecimalInput 해당 없음(enum 선택만)
- [ ] 800줄 — EstateBodyRealEstate 증가분 점검, 초과 시 RadioCardGroup sub-component 분리
- [ ] "원" 단위 금지·결과 한국어 산식
