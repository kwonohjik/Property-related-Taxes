# 주식 상속·증여재산 합계 누락 교정 + 협의분할 귀속 — UI 디자인

> 엔진 설계: `stock-gross-estate-wiring.engine.design.md`
> 계획서: `docs/00-pm/inheritance-unlisted-simple-stock-gross-estate-wiring.plan.md`
> 작성: 2026-05-28 · 상태: UI Design

## 0. UI 변경 성격

신규 폼·신규 입력 위젯은 **없다**. 본 작업의 UI 측은:
1. **데이터-흐름 교정**: `isRealEstateHeavy`를 React local `heavyMap` → `unlistedStockData.isRealEstateHeavy`(store) 전환 (엔진 도달 보장).
2. **자동 동작 확인**: 엔진 배선 후 협의분할 토글 자동 활성화·결과 per-heir 표·사이드바 일치를 회귀로 확인.
3. **(선택) 토글 disabledReason 문구 보강.**

`StockValuationForm`은 **상속·증여 공용** → 1회 수정으로 양 폼 적용.

---

## 1. 사용자 시나리오

### 시나리오 A — 비상장 간편평가 협의분할 (사용자 보고 핵심)
1. 상속세 마법사 Step 0에서 상속인(배우자·자녀) 등록.
2. Step "재산" → 주식·지분 추가 → 비상장주식 → 간편평가 선택.
3. 회사명·총발행주식수·보유주식수·3년치 순손익·순자산가치 입력.
4. (부동산과다보유법인이면) rose 토글 ON.
5. 입력 완료 시 미리보기 평가액 표시 + **"상속인·수유자별 협의분할 입력" 토글이 자동 활성화**(`effectiveValuation > 0`).
6. 토글 ON → 첫 자연인 상속인에게 전액 자동 채움 → 상속인별 금액 조정.
7. 계산 → 결과 per-heir 표에 **주식이 해당 상속인에게 귀속**되어 finalTax 반영.

### 시나리오 B — 상장주식 상속
- 종목·전후 2개월 평균·주식수 입력 → grossEstate에 포함 → 협의분할 동일.

### 시나리오 C — 증여세 주식
- 증여재산에 주식 입력 → `grossGiftValue` 포함. **협의분할 UI 없음**(gift mode → `EstateCommonAttributesSection` null, per-donee).

---

## 2. 케이스 인벤토리 (엔진과 1:1)

엔진 설계 §케이스 인벤토리 C1~C9(C5b·C8a·C8b 포함) 참조. UI e2e는 시나리오 A(C2)·B(C5)·C(C7) 대표 커버.

---

## 3. 14 동기화 지점 — UI 매핑

| # | 지점 | 본 작업 변경 | 위치 |
|---|---|---|---|
| ① | 폼 상태 타입 | `UnlistedStockData.isRealEstateHeavy?: boolean` (엔진 타입 = 폼 타입 공용) | `inheritance-gift.types.ts:217` |
| ② | initial | `handleAdd`의 `unlistedStockData` 기본값에 `isRealEstateHeavy` 미설정(undefined=false) — 추가 불필요(optional) | `StockValuationForm.tsx:514-524` |
| ③ | normalize | **N/A** — 상속 useState 인메모리, 증여 resume hydration은 `?? false` | — |
| ④ | API 변환 | passthrough (estateItems/giftItems 통째) — 변경 없음 | `InheritanceTaxForm:254`·`GiftTaxForm:611` |
| ⑤ | UI 위젯 | rose ToggleCard `onChange` → `setStock({ isRealEstateHeavy })` (기존 `onUpdateHeavy` 제거) | `UnlistedStockSimpleFields.tsx:390-400` |
| ⑥ | 사이드바 | `computeStockValuation` 자동 반영 — 변경 없음 | `inheritance-summary`·`StockValuationForm:438` |
| ⑦ | 결과 카드 | per-heir 협의분할 표에 주식 `directEstateAmount` 자동 표시 — 회귀 확인 | `InheritanceTaxResultView` + 협의분할 결과 카드 |
| ⑧ | validation | §4-4: `validateEstateItemAllocations` 후보에 unlisted 추가 | `inheritance-validate.ts:59` |
| ⑫ | Zod | `unlistedStockDataSchema`에 `isRealEstateHeavy: z.boolean().optional()` 추가 (silent-strip 방지) | `property-valuation-input.ts:11` |
| ⑬⑭ | body/route | 변경 없음 (passthrough) | — |

---

## 4. heavyMap → store 전환 명세 (핵심 UI 리팩터)

### 4.1 현재 (제거 대상)
`StockValuationForm.tsx`:
- L506 `const [heavyMap, setHeavyMap] = useState<Record<string, boolean>>({});`
- L541 `handleHeavy(id, v)`
- L598·600 `isRealEstateHeavy={heavyMap[item.id] ?? false}` `onUpdateHeavy={(v)=>handleHeavy(...)}`
- L430·433·453·665 `TotalStockValue`의 `heavyMap` prop·인자
- `UnlistedStockCardProps.onUpdateHeavy`(L288·301·398), `UnlistedStockSimpleFieldsProps.onUpdateHeavy`

### 4.2 변경 후
- `isRealEstateHeavy`는 `item.unlistedStockData.isRealEstateHeavy ?? false`에서 read.
- rose ToggleCard `onCheckedChange={(v) => setStock({ isRealEstateHeavy: v || undefined })}` (UnlistedStockSimpleFields 내부).
- `UnlistedStockCard.effectiveValuation` useMemo(L310-332): `calcUnlistedStockPerShareValue(data, data.isRealEstateHeavy ?? false)`.
- `TotalStockValue`(L433-461): `heavyMap[item.id]` → `item.unlistedStockData?.isRealEstateHeavy ?? false`.
- `onUpdateHeavy` prop 체인 전면 삭제.
- **mirror-pattern 준수**: `useEffect → store` 미러링 금지 — onChange 직접 set. [[feedback_useeffect_store_mirror_forbidden]]

### 4.3 회귀 위험
- `heavyMap`은 현재 store 미반영(엔진 미도달) → 전환은 순기능. 단 기존 사용자가 토글한 heavy 상태는 어차피 계산에 반영 안 됐으므로 동작 변화 = 버그 수정.

---

## 5. 협의분할 토글 (변경 최소)

- `HeirAllocationToggleSection.tsx:41` 비활성 조건 **유지** (`!canDistribute || effectiveValuation === 0`).
- 엔진/UI 배선 후 `effectiveValuation > 0` 시 자동 활성화 → 사용자 보고 해소.
- (선택, P3) `disabledReason`을 비상장 맥락에 맞게: `effectiveValuation === 0` 시 "주식 수·순손익·순자산가치를 먼저 입력하세요" (현재 "평가액을 먼저 입력하세요" 유지 가능).
- ON 시 첫 자연인 상속인 전액 자동 채움(기존), 합계검증 rose 경고(§4-4로 비상장도 활성).

---

## 6. 결과 화면 (자동 — 회귀 확인)

- `grossEstateValue`/`grossGiftValue`에 주식 포함 → 요약 카드 총액 정상.
- 협의분할 결과 카드(`HeirAllocationResultCard` 등) per-heir `directEstateAmount`에 주식 자동 반영.
- 주식 평가 breakdown 1줄(상장/비상장 라벨 + 평가액) — `evaluateStockAsPropertyResult` breakdown이 결과 단계 목록에 노출.
- 산식 한국어·"원" 미표기 등 공통 규칙 준수 [[feedback_result_view_korean_formula]] [[feedback_no_won_suffix]].

---

## 7. e2e (Playwright)

`e2e/inheritance-stock-allocation.spec.ts`:
1. 상속인 2인 등록 → 비상장 간편 입력 → 토글 자동 활성 확인.
2. 토글 ON → 자녀 100% → 계산 → 결과 per-heir 자녀 finalTax > 0 + 주식이 grossEstate 반영.
3. 상장주식 grossEstate 포함.
4. (증여) 주식 → grossGiftValue 포함, 협의분할 토글 미노출.

[[feedback_browser_verify_with_playwright]]

---

## 8. 공용 컴포넌트·정책 준수 체크

- [ ] rose ToggleCard 유지(native checkbox 금지) — 기존 패턴
- [ ] CurrencyInput/IntegerInput/DecimalInput 적정 사용 (기존)
- [ ] `useEffect → store` 미러링 0건 (onChange 직접 set)
- [ ] zustand selector 새 객체 반환 금지 (useMemo)
- [ ] 800줄: StockValuationForm 현재 668줄(확인) — heavyMap 제거로 감소 방향, 여유
