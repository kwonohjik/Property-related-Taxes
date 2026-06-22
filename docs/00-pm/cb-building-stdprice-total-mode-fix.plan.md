# 상업용 건물 보충평가 — 건물 기준시가 입력 토지식 혼동 수정 계획

> 작성일: 2026-06-22
> 범위: 상속·증여 보충적 평가(`EstateBodySupplementaryValuation`)의 **상업용 건물(real_estate_building)** 상단 건물 기준시가 입력
> 성격: **UI-only 수정** (엔진 input/result·Zod·API·validate 변경 없음)

---

## 1. 문제 정의

상업용 건물 "경로 B"(건물 기준시가 §61①2호 + 부수토지 개별공시지가 §61①1호 분리)에서, **상단 건물 섹션**과 **하단 부수토지 섹션**이 시각적으로 거의 동일하게 보인다.

- 상단 건물 섹션의 단가 입력 placeholder가 **"공시지가 단가"** 로 표시됨 → 건물인데 토지 용어 노출.
- 상단 "공시가격 조회" 버튼이 **토지 개별공시지가를 조회**함 (건물 기준시가가 아님).
- 결과적으로 상단·하단 두 입력이 동작상 거의 같아 사용자가 무엇을 입력해야 하는지 혼동.

---

## 2. 원인 (검증 완료, file:line)

| # | 원인 | 위치 |
|---|---|---|
| C-1 | `real_estate_building` → `propertyKind = "building_non_residential"` | `EstateBodyHelpers.ts:19-24` (`resolvePropertyKind`) |
| C-2 | `building_non_residential`이 토지와 동일한 **area-mode**(㎡당 단가 + 면적)로 렌더 | `StandardPriceInput.tsx:77-78` (`isAreaMode`) |
| C-3 | area-mode 단가 placeholder가 **"공시지가 단가"** 하드코딩 | `StandardPriceInput.tsx:197-201` |
| C-4 | `toPropertyType()`가 `building_non_residential` → **"land"** 매핑 → 조회가 토지 개별공시지가 호출 | `StandardPriceInput.tsx:55-57`, `:135-152` |
| C-5 | 건물 기준시가 조회 API 부재 — Vworld NED는 `housing`/`land`만 지원 | `useStandardPriceLookup.ts:20`, `app/api/address/standard-price/route.ts:254-271` |

→ 건물 기준시가(§61①2호)는 area-mode 단가×면적·토지 조회로 산출 불가. **올바른 입력 경로는 ① "건물 기준시가 계산" 모달(소법 §99 산정식) 또는 ② 총액 직접 입력**뿐이다. 모달은 이미 존재한다 (`EstateBodySupplementaryValuation.tsx:221-230`, `BuildingStdPriceModalButton` → `onApply` → `standardPrice` 저장).

---

## 3. 영향 범위 (검증 완료)

### 영향 받음 (수정 대상)
- `EstateBodySupplementaryValuation.tsx:206-220` — 상단 `StandardPriceInput` 호출 (building일 때 area-mode·토지조회 제거)
- `StandardPriceInput.tsx` — total-only 모드 지원 프롭 추가 (하위호환, 기본 off)

### 영향 없음 (검증 완료)
- **미임대(§61⑤) 계산**: `calcVacantPortionStandardPrice`는 `appurtenantLandStandardPrice`(부수토지 총액)만 참조. 상단 `standardPricePerSqm` local state 미참조 → 안전 (`property-valuation.ts:106-114`).
- **엔진 평가**: `standardPrice` 총액만 사용 (`property-valuation.ts:284-290`). 단가는 엔진 미도달.
- **토지·아파트 보충평가**: `real_estate_land`→"land"(area-mode 적절), `real_estate_apartment`→"house_apart"(총액 모드)로 정확. 변경 없음.
- **하단 부수토지(경로 B)**: `propertyKind="land"` → area-mode + 토지 조회가 **정상**. 변경 없음 (`:237-254`).

### 비범위 — 별도 과제 (이번에 손대지 않음)
- 재산세 `property/Step0.tsx`, 양도세 `CompanionAcqPurchaseBlock.tsx`도 `building_non_residential`을 area-mode로 사용하나 **세목 맥락이 다름** → 본 수정과 무관, 별도 검토.
- `toPropertyType` building→land 매핑 자체는 유지 (상증 building은 조회를 끄므로 미도달).

---

## 4. 수정 방안

### 설계 원칙
상속·증여 상업용 건물 상단 입력을 **total-only(총액 직접 입력) + "건물 기준시가 계산" 모달**로 단일화. 토지식 area grid(㎡당 단가·면적)와 토지 조회 버튼을 제거하여 혼동 차단.

### 변경 1 — `StandardPriceInput.tsx`: total-only 모드 프롭 추가 (하위호환)
- Props에 `forceTotalMode?: boolean` 추가 (기본 `false`).
- `isAreaMode` 계산 수정:
  ```ts
  const isAreaMode =
    !forceTotalMode &&
    (propertyKind === "land" || propertyKind === "building_non_residential");
  ```
- 기존 모든 호출부는 프롭 미전달 → 동작 불변.

### 변경 2 — `EstateBodySupplementaryValuation.tsx:206-220`: 건물 분기
```tsx
<StandardPriceInput
  propertyKind={propertyKind}
  referenceDate={valuationDate}
  totalPrice={item.standardPrice != null ? String(item.standardPrice) : ""}
  onTotalPriceChange={(v) => set({ standardPrice: parseAmount(v) || undefined })}
  pricePerSqm={standardPricePerSqm}
  onPricePerSqmChange={setStandardPricePerSqm}
  jibun={addrValue.jibun}
  forceTotalMode={cat === "real_estate_building"}      // ← 추가: 건물은 총액 모드
  enableLookup={cat !== "real_estate_building"}        // ← 변경: 건물은 토지조회 숨김
  label={
    cat === "real_estate_building"
      ? separateLandMode
        ? "건물 기준시가"     // 경로 B (라디오 설명에 §61①2호 이미 표기 — 중복 인용 금지)
        : "기준시가"          // 경로 A 일괄고시 (라디오 설명에 §61①3호 이미 표기)
      : ""
  }
/>
```
- 건물: area grid·토지 조회 사라지고 **총액 입력 + (아래) "건물 기준시가 계산" 버튼**만 노출. placeholder "공시지가 단가" 자동 제거.
- 토지/아파트: `forceTotalMode=false`·`enableLookup=true` → **현행 유지**.
- `standardPricePerSqm` state는 토지 카테고리에서 계속 사용되므로 제거하지 않음 (surgical).
- **[재검토 정정]** 라벨에 §61 조문을 다시 넣지 않는다. 경로 라디오(`CB_ROUTE_OPTIONS`, `EstateBodySupplementaryValuation.tsx:41-55`)의 description이 이미 §61①3호·§61①2호·§61①1호를 명시하므로 총액 필드 라벨에 재인용하면 중복. 라벨은 "건물 기준시가"/"기준시가"로 최소화.

### 변경 3 — `EstateBodySupplementaryValuation.tsx:221`: 경로 A에서 §99 모달 숨김
"건물 기준시가 계산"(§99 건물 단독 산정) 모달은 **경로 B(분리)에서만** 노출하도록 조건을 좁힌다. 경로 A(일괄고시 §61①3호)는 정부 일괄고시 가액을 총액 직접 입력하는 방식이므로 §99 건물 단독 모달과 맞지 않는다.
```tsx
{(cat === "real_estate_building" ? separateLandMode : propertyKind !== "land") && (
  <div className="flex justify-end">
    <BuildingStdPriceModalButton ... />
  </div>
)}
```
- 건물: **경로 B에서만** 모달 노출 (경로 A에서는 총액 직접 입력만).
- 아파트(`house_apart`): `propertyKind !== "land"` 유지 → **동작 불변**.
- 토지: 기존과 동일하게 미노출.

### (옵션, 경량 대안)
전체 동작을 바꾸지 않고 **placeholder만 "건물 기준시가 단가" 등으로 교정**하는 최소 수정도 가능하나, 토지 조회 발동(C-4)·산정방식 불일치는 해소되지 않으므로 **권장하지 않음**. 본 계획은 변경 1·2(권장안)를 채택.

---

## 5. 변경 파일 요약

| 파일 | 변경 |
|---|---|
| `components/calc/inputs/StandardPriceInput.tsx` | `forceTotalMode` 프롭 추가 + `isAreaMode` 조건 1줄 수정 |
| `components/calc/inheritance/estate-card/variants/EstateBodySupplementaryValuation.tsx` | 상단 `StandardPriceInput`에 `forceTotalMode`·`enableLookup`·`label` 분기 + `:221` 모달 노출 조건 경로 B 한정 (변경 3) |

엔진·타입·Zod·API·validate **변경 없음** (`standardPrice`·`appurtenantLandStandardPrice` 기존 필드 그대로).

---

## 6. 검증 계획

1. **typecheck**: `npx tsc --noEmit` → 0건.
2. **Pre-Do anchor (E2E, Playwright)** — 신규/갱신 spec:
   - 상속·증여 상업용 건물 보충평가에서 **경로 B 선택 시**:
     - 상단에 "㎡당 단가" 라벨/입력 **없음**, "건물 기준시가 (§61①2호)" 총액 입력 **존재**, "건물 기준시가 계산" 버튼 **존재**.
     - 하단 "부수토지 개별공시지가 (§61①1호)" 섹션은 ㎡당 단가 + 면적(area-mode) **유지**.
   - **경로 A 선택 시**: 상단 "기준시가" 총액 입력만, 부수토지 섹션 없음, **"건물 기준시가 계산" 모달 버튼 부재** (변경 3).
   - **경로 B 선택 시**: "건물 기준시가 계산" 모달 버튼 **존재**.
   - 토지 자산 보충평가: area-mode + 조회 **유지**(회귀 확인).
3. **기존 E2E 회귀**: 관련 spec = `e2e/commercial-building-appurtenant-land-61.spec.ts`, `e2e/rental-vacancy-portion.spec.ts`.
   - **[재검토 확인됨]** 두 spec은 라디오 노출·부수토지/미임대 섹션 등장만 검증하고 **상단 건물 ㎡당 단가 입력은 채우지 않음** → 본 수정으로 자동으로 깨지지 않음 (회귀 위험 낮음).
   - 그러나 신규 동작(상단에 ㎡당 단가 칸 부재)을 명시적으로 단언하는 assertion이 없으므로 **검증 2의 신규 spec에서 명시적 단언 추가 필요**.
4. **Validation 확인**: 상증 보충평가 validate(`lib/calc/inheritance-validate.ts`·`estate-item-vacancy-validate`)가 `standardPricePerSqm`(상단 단가 local state)를 참조하지 않음을 재확인 — 참조 시에만 동기화 필요. (D 검증상 단가는 store/엔진 미도달이므로 validate도 미참조 예상, 단 구현 시 grep 확정)
5. **전체 회귀**: `npm test` (vitest 엔진 테스트는 UI 변경과 무관하나 베이스라인 통과 확인).
6. **수동 확인**: 상단 placeholder "공시지가 단가" 미노출, 모달로 건물 기준시가 산출 → 총액 자동 반영, 결과뷰 "건물 기준시가" + "부수토지 개별공시지가" 합산 표시.

---

## 7. 성공 기준 (Definition of Done)

- [ ] 상단 건물 섹션에서 "공시지가 단가" placeholder·㎡당 단가 칸·토지 조회 버튼 제거 (건물 한정).
- [ ] 건물 기준시가는 총액 직접 입력 또는 "건물 기준시가 계산" 모달로만 입력.
- [ ] "건물 기준시가 계산" 모달은 경로 B에서만 노출 (경로 A·아파트 검증). (변경 3)
- [ ] 토지·아파트 보충평가, 하단 부수토지 섹션 동작 불변 (회귀 0).
- [ ] `npx tsc --noEmit` 0건 / 관련 E2E 통과 / 기존 E2E 회귀 0.

---

## 8. 재검토 결과 (2026-06-22, 독립 검증)

| # | 검토 항목 | 결과 | 조치 |
|---|---|---|---|
| A | E2E 회귀 | 기존 spec(`commercial-building-appurtenant-land-61`·`rental-vacancy-portion`)은 상단 단가 입력을 단언하지 않음 → 자동 파손 없음 | §6.2에 신규 단언 추가 / §6.3 명문화 |
| B | **라벨 §61 중복 인용 (오류)** | 경로 라디오 description이 이미 §61①2호·3호 명시 → 총액 필드 라벨에 재인용은 중복 | **§4 변경 2 라벨을 "건물 기준시가"/"기준시가"로 정정** ✅ |
| C | **경로 A §99 모달 불일치 (누락)** | "건물 기준시가 계산"(§99 건물 단독)이 경로 A(일괄고시 §61①3호)에서도 노출 → 의미상 부적합 (엔진 영향은 없음) | **범위 결정 필요 → 아래 미결 항목** |
| D | 엔진 영향 | `standardPrice` 총액만 엔진 도달, `standardPricePerSqm`는 local state → 입력방식 변경 무영향 | 변경 없음 (안전 확인) |
| E | 카테고리/호출부 | 변이체는 land/building/apartment 3종 고정, `building_non_residential`은 building에서만 | 변경 없음 (안전 확인) |
| F | 누락 점검 | validate 단가 미참조 재확인 필요 / 다크모드·결과뷰 무영향 | §6.4 validate 확인 추가 |

### 결정됨 — 경로 A §99 모달 (A안 채택, 2026-06-22)
- **결정**: 본 수정에 포함. 건물 모달 노출 조건을 `cat === "real_estate_building" ? separateLandMode : propertyKind !== "land"`로 좁혀 **경로 B에서만** 노출. 아파트 동작 불변. → **§4 변경 3**으로 반영 완료.
