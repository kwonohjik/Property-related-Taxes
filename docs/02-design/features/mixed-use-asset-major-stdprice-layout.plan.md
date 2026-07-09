# 겸용주택 기준시가 입력 UI — 시점-우선 → 자산-우선 재편 (Plan)

- 상태: **Do + E2E 검증 완료 ✅ (커밋 대기)**
  - 단위/통합: tsc 0 · 3031 테스트 통과 · baseline anchor 불변
  - E2E: 신규 asset-major 상가 통합모달 spec 통과 · 겸용 회귀(T4·T5·T6) 통과 · 모달 사용 스펙 전부 통과. (BSP-06 2건은 사전존재 실패 — stash 대조로 무관 확인)
- 작성일: 2026-07-09
- 유형: **UI-only 재구성** (엔진·Zod·API·validation 필드 변경 없음)
- 대상: `assetKind === "housing" && isMixedUseHouse === true` 양도세 자산 카드의 기준시가 입력 영역

> **검토 이력**: STEP 1 3-fork 병렬 검토(오류+누락 / 모순+정책위반 / 개선+UI누락) → 정정 12건(High 2·Medium 4·Low 6) 반영. 정책 위반 0건 확인. 상세: §13.

---

## 1. 배경 · 문제

겸용주택(주택+상가) 양도는 취득·양도 각 시점의 **주택부분 기준시가**와 **상가부분 기준시가**를 모두 입력해 안분한다. 현재 UI는 **시점-우선(양도시 / 취득시)** 으로 묶여 있어, 각 시점 안에 주택과 상가가 섞인다. 사용자가 다음 세 가지 이유로 복잡함·입력 오류를 호소:

1. **같은 값을 두 번 계산·입력해야 함** — 건물 기준시가 계산 모달은 한 번의 계산으로 취득·양도 두 값을 동시에 산출하는데(이미지2: 취득당시 95,370,017 / 양도당시 143,506,350), 양도시 섹션 모달은 양도 필드에만, 취득시 섹션 모달은 취득 필드에만 적용되어 **같은 계산을 두 번** 돌려야 한다.
2. **오적용 footgun** — 양도시 섹션에서 연 모달에서 "취득시 적용"을 누르면 취득 필드로 가지 않고 **양도 필드(143,506,350)를 95,370,017로 조용히 덮어씀**. `onApply`가 열린 섹션의 단일 필드에 하드 바인딩되기 때문. (`BuildingStdPriceModalButton.tsx:58-65,113-122`)
3. **주택·상가가 시점마다 섞여** 눈이 따라가기 어렵다.

### 근거 (실측 file:line)

- `MixedUseStandardPriceInputs.tsx` — 한 파일에 ② 양도시(emerald, `:100-244`) + ③ 취득시(amber, `:246-376`)가 함께 있고, 각 시점 안에 주택(개별주택공시가격)·상가(상가건물+상가토지)가 혼재.
- 양도시 상가건물 모달 `onApply={(v)=>onChange({mixedTransferCommercialBuildingPrice:...})}` (`:213`), 취득시 상가건물 모달 `onApply={(v)=>onChange({mixedAcqCommercialBuildingPrice:...})}` (`:321`) — 각기 단일 필드.
- 모달은 `result.acquisition`·`result.transfer` 두 값을 모두 계산하지만 두 "적용" 버튼이 같은 `apply(v)`를 호출 (`BuildingStdPriceModalButton.tsx:113-122`).

---

## 2. 목표

기준시가 입력을 **자산-우선(주택 섹션 / 상가 섹션)** 으로 재편하고, 각 섹션 안에 취득·양도를 나란히 둔다. 상가 섹션은 **한 번의 계산으로 취득·양도 두 필드를 동시 입력**(모달 `onApplyBoth`)하여 이중 계산·오적용 footgun을 제거한다.

### 성공 기준 (verify)

1. 용도변경 없는 겸용주택에서 상가건물 기준시가를 **한 번 계산 → 취득·양도 두 필드 동시 입력**된다. (E2E)
2. **겸용 상가 섹션 모달 한정** 오적용 footgun 제거 — 이 모달에서 반대편 필드를 덮어쓸 경로가 없다(`onApplyBoth` 지정 시 개별 취득/양도 버튼 숨김). *(주의: `CommercialBuildingBlock`·`GeneralBuildingBlock`의 동일 footgun은 §3 Out — 전역 "footgun 소멸"이 아님. STEP 1-C 정정.)*
3. 재편 전후로 **동일 입력 → 동일 엔진 결과** (anchor 회귀 0건). API 페이로드 무변경.
4. `npx tsc --noEmit` 0건, `npx vitest run __tests__/tax-engine/transfer/` 통과, 겸용주택 E2E 통과.

---

## 3. 범위 (Scope) — STEP 1-A 정정

**분리 기준 = `hasPartialUsageChange`.** 코드 분리 단위였던 `!isCaseA`는 용도변경 Case B·방향 분기를 포함하므로 스코프 경계로 부적합(아래 근거). Phase 1 자산-우선 재편은 **용도변경이 전혀 없는 경우(`hasPartialUsageChange === false`)에만** 적용한다.

### In (Phase 1)

- **`isMixedUseHouse === true && hasPartialUsageChange === false`** 겸용주택의 기준시가 입력 영역을 자산-우선으로 재편.
- 대상: 주택 섹션(양도시 개별주택공시가격 + 취득시 직접입력/PHD 3-시점), 상가 섹션(상가건물 취득·양도 통합 모달 + 상가부수토지 개별공시지가 취득·양도).
- `BuildingStdPriceModalButton`에 `onApplyBoth?: (acq, transfer) => void` 추가.

### Out (현행 레이아웃 유지 · 별도 후속)

- **보유 중 일부 용도변경(`hasPartialUsageChange === true`) 전체** — Case A(4부분 안분, `splitHousingCommercialForAcqAndFirst`·`hideTransferColumn`, `ThreePointStandardPriceInput.tsx:454,724`)뿐 아니라 Case B(최초공시 ≥ 용도변경일)·방향 분기(`commercial_to_house` 시 취득 개별주택공시가격 hide `:288`, 안내 배너 `:340/:354`)까지 **모두 현행 시점-우선 레이아웃 유지**. Phase 1은 손대지 않음.
- `CommercialBuildingBlock`·`GeneralBuildingBlock`의 동일 footgun — `onApplyBoth`로 개선 가능하나 범위 밖. Phase 1에서 prop만 추가해두면 후속 저비용 적용.
- 엔진 산식·안분 로직·Zod·API·validation 필드 — **일절 변경 없음**.

### 스코프 경계 근거 (실측)

- `isCaseA` ⊂ `hasPartialUsageChange`(isCaseA는 `hasPartialUsageChange && house_to_commercial && 최초공시<용도변경일`) → `hasPartialUsageChange === false` ⟹ `!isCaseA`. 즉 새 경계는 기존보다 **엄격(작은 스코프)**, 용도변경 관련 렌더 분기를 전부 회피.

---

## 4. 핵심 안전성 근거 (왜 저위험인가)

**API 변환은 UI 위치가 아니라 공유 폼 필드에서만 읽는다.** UI를 어떻게 재배치해도 같은 필드에 쓰기만 하면 엔진 입력이 동일하다.

`transfer-tax-api.ts:145-226` 실측:

| 엔진 입력 | 소스 필드 (공유) |
|---|---|
| `transferStandardPrice.housingPrice` | `mixedTransferHousingPrice` (`:146`) |
| `transferStandardPrice.commercialBuildingPrice` | `mixedTransferCommercialBuildingPrice` (`:147`) |
| `transferStandardPrice.landPricePerSqm` | `mixedTransferLandPricePerSqm` (`:148`) |
| `acquisitionStandardPrice.housingPrice` | `mixedAcqHousingPrice` (`:151`) |
| `acquisitionStandardPrice.commercialBuildingPrice` | `mixedAcqCommercialBuildingPrice` (direct) → Case A PHD 자동안분 fallback (`:152-164`) |
| `acquisitionStandardPrice.landPricePerSqm` | `mixedAcqLandPricePerSqm \|\| phdLandPricePerSqmAtAcq \|\| pre1990` (`:166-169`) |
| `preHousingDisclosure` (PHD 페이로드) | `phd*` 필드 + `mixed*` fallback (`:174-226`) |

- 이미 `mixedAcqCommercialBuildingPrice`↔`phdCommercialBuildingStdPriceAtAcq`(`:213-219`), `mixedAcqLandPricePerSqm`↔`phdLandPricePerSqmAtAcq`(`:167-168,177-178`) 양방향 fallback이 존재 → **"같은 필드 두 위치" 패턴이 이미 성립**. 재편은 이 패턴의 위치를 정리·통합할 뿐 계약을 바꾸지 않는다.
- **validation 무변경 실측 근거(STEP 1-H)**: `transfer-tax-validate-asset.ts:313`의 `if (asset.isMixedUseHouse === true) { … return }` 가 겸용주택을 **early-return** → 엄격 phd land 검증(`:555·565`)에 미도달. 겸용 PHD 검증은 `:331-341`(`phdFirstDisclosureDate` + housingPrice + `phdTransferHousingPrice||mixedTransferHousingPrice` fallback)만. 취득 개별공시지가 단일화(§6)가 validation-safe.
- 따라서 **Zod(⑨⑩⑫)·API body(⑬)·Route(⑭)·validation(⑧) 변경 불필요.** 14 동기화 지점 중 UI 위젯(⑤)만 이동.

**결론: 순수 프리젠테이션 재배치.** 쓰기 대상 필드는 그대로, 배치만 자산-우선으로.

---

## 5. 현행 구조 실측

```
MixedUseSection.tsx  (MixedUseExpandedPanel)
├─ ① 면적 정보                 MixedUseAreaInputs (sky)                 :137
├─ 1-A 용도변경(조건부)        PartialUsageChangeInputs                 :140
├─ ② 양도시 / ③ 취득시         MixedUseStandardPriceInputs              :145
│    ├─ 개별주택공시가격(양도)  ★ isCaseA 삼항 밖 공용 렌더             :111-118
│    ├─ ② 양도시 (emerald)  {isCaseA ? 4부분 : 상가건물+상가토지}      :120-243
│    │     └ non-CaseA: 상가건물 모달(→mixedTransfer…)               :209-215
│    └─ ③ 취득시 (amber)    PHD 토글 + {!isCaseA: 취득 상가건물/토지}  :246-376
│          ├ PHD 토글(§164⑤) → MixedUsePreHousingDisclosureSection   :257-281
│          │     └ 주택 3-시점 환산 (ThreePointStandardPriceInput)
│          │        · non-CaseA: 주택 land+building만 렌더 (splitMode=false → 상가컬럼 없음)  ⭐
│          │        · 양도시 개별주택가격 read-only 참조 (:176-191)
│          └ !isCaseA 블록(:284-375): 취득 개별주택공시가격(직접, commercial_to_house 시 hide :288)
│                                     + 취득 상가건물 모달(→mixedAcq…) + 취득 상가토지 + 방향 안내(:340/:354)
├─ ④ 거주 기간                MixedUseResidencyInput (violet)          :156
└─ ⑤ 수도권                   (rose)                                   :159-172
```

⭐ **결정적 사실 1**: PointBlock의 상가건물 입력은 `splitMode`(=Case A)에서만 렌더(`ThreePointStandardPriceInput.tsx:454`). non-Case A에서는 PHD 위젯이 **주택 3-시점만** 표시하므로 상가와 이미 분리.

★ **결정적 사실 2 (STEP 1-A)**: 양도시 개별주택공시가격(`:111-118`)은 `isCaseA` 삼항(`:120`) **밖**에서 렌더 → Case A·non-A 공용. 재편 시 두 분기 각각에 보존해야 Case A 회귀 없음.

---

## 6. 목표 레이아웃 (용도변경 없음 경로)

**tone 규칙(STEP 1-B)**: 자산 섹션 헤더는 자산 구분용 중립 라벨. **섹션 내부의 취득/양도 sub-block이 기존 시간-tone을 인디케이터로 유지** — 양도 sub-block=`emerald`, 취득 sub-block=`amber`(components/calc/CLAUDE.md tone 표: emerald=양도·평가확정 / amber=취득·분리계산 의미 그대로). 거주=violet 보존(충돌 회피). **sub-block 순서는 양도→취득으로 통일**(현행 emerald→amber 계승, STEP 1-D). 개별공시지가는 **`LandPriceLookupField` 필수 유지**(STEP 1-E). 공용 입력 컴포넌트(CurrencyInput/DecimalInput/DateInput/select-on-focus) 유지.

```
겸용주택 분리계산  (hasPartialUsageChange === false)
├─ ① 면적 정보                          (그대로, MixedUseAreaInputs, sky)
├─ ② 주택 기준시가  [헤더 중립 · "주택"]
│    ├─ [양도 sub-block · emerald]  개별주택공시가격  mixedTransferHousingPrice (주택건물+주택부수토지 일괄)
│    └─ [취득 sub-block · amber]
│         ├ [개별주택가격 미공시 §164⑤ 토글]  (usePreHousingDisclosure, ON 시 환산모드 자동전환)
│         │    OFF → 취득시 개별주택공시가격 직접 입력  mixedAcqHousingPrice
│         │    ON  → 3-시점 환산 위젯(주택 land+building)  MixedUsePreHousingDisclosureSection
│         └ (PHD 위젯이 같은 섹션의 양도 개별주택가격 참조 — 자연스러움)
├─ ③ 상가 기준시가  [헤더 중립 · "상가"]
│    ├─ 상가건물 기준시가
│    │    [양도 emerald  mixedTransferCommercialBuildingPrice] [취득 amber  mixedAcqCommercialBuildingPrice]
│    │    └ [건물 기준시가 계산] 버튼 — 두 필드 사이(또는 하단), 라벨 "건물 기준시가 계산"
│    │         → 모달 onApplyBoth → 취득·양도 두 필드 동시 입력
│    └─ 상가부수토지 개별공시지가 (LandPriceLookupField)
│         [양도 emerald  mixedTransferLandPricePerSqm] [취득 amber  mixedAcqLandPricePerSqm]
│         └ 자동합계 카드: 양도 상가부분(emerald-100/60) / 취득 상가부분(amber-100/60)
├─ ④ 거주 기간                          (그대로, violet)
└─ ⑤ 수도권                            (그대로, rose)
```

### 설계 노트

- **취득시 개별공시지가는 지번-단위 단일 값** — 주택부수토지·상가부수토지가 같은 필지·같은 원/㎡. 현재도 `mixedAcqLandPricePerSqm`↔`phdLandPricePerSqmAtAcq` fallback으로 공유. 재편 시 상가 섹션의 취득 개별공시지가가 PHD 주택 환산에도 소비되도록 유지. **⚠️ landAutoSync가 read-only 표시인지 편집형인지 미검증(STEP 1-I) — Design에서 `MixedUsePreHousingDisclosureSection.tsx:272-273,303-309` 실측 후 확정.**
- **양도시 개별주택공시가격은 토글 무관 항상 필요** (PHD 역산이 이 값을 참조, `MixedUsePreHousingDisclosureSection.tsx:186`). 주택 섹션에서 양도 sub-block을 취득 sub-block보다 위에 배치.
- **PHD 토글 = 환산취득가 모드 전환**(`MixedUseStandardPriceInputs.tsx:268-273`)은 그대로 유지. 주택 섹션 취득 sub-block으로 이동만.
- **순서정책(STEP 1-G)**: 엔진 input은 time-major(`transferStandardPrice`·`acquisitionStandardPrice` 각각 housing+commercial)지만, 본 재편은 **grouping 축(시점→자산) 변경이지 sequence 변경이 아니다**. 시점 안분에 필요한 값은 sub-field(양도/취득) 순서로 보존되므로 `feedback_ui_order_follows_logic` 위반 아님.

---

## 7. 변경 파일 계획

| 파일 | 변경 |
|---|---|
| `components/calc/building-std-price/BuildingStdPriceModalButton.tsx` | `onApplyBoth?: (acq:number, transfer:number)=>void` prop 추가. 지정 && `result.acquisition && result.transfer` 시 **단일 "취득·양도 모두 적용" 버튼**만 노출(개별 취득/양도 버튼 숨김 → footgun 차단). 미지정 or 한쪽만 계산 시 기존 동작 유지(하위호환). |
| `components/calc/transfer/mixed-use/MixedUseStandardPriceInputs.tsx` | **최상위를 `{hasPartialUsageChange ? <현행 레이아웃 전체 보존> : <자산-우선 레이아웃>}`로 래핑**(STEP 1-A). 자산-우선 분기: 주택 섹션(양도/취득 sub-block) + 상가 섹션(상가건물 통합모달 + 상가토지). 공용요소 **개별주택공시가격(`:111-118`, 현재 삼항 밖 공용)** 을 **두 분기 각각에 명시 배치**. `hasPartialUsageChange===true` 분기는 **현행 JSX 무손상 이관**. *(면적 ①은 이 파일 밖 — 상위 `MixedUseExpandedPanel:137`이 렌더하므로 재편 무관. STEP 3.)* |
| (검토) `MixedUseSection.tsx` | 섹션 번호(`transferSectionNum`/`acqSectionNum`) prop이 자산-우선에서 의미가 바뀜 → 라벨/번호 전달 조정(②주택 ③상가). |
| (신규 가능성) `mixed-use/MixedUseHousingStdPrice.tsx` · `MixedUseCommercialStdPrice.tsx` | 800줄 정책·가독성. 재편 후 `MixedUseStandardPriceInputs.tsx`(현 379줄)가 커지면 주택/상가 섹션을 하위 컴포넌트로 분리. |

**미변경(명시)**: `lib/calc/transfer-tax-api.ts`, `lib/calc/transfer-tax-validate-asset.ts`, `lib/calc/multi-transfer-tax-validate.ts`, Zod 스키마, 엔진 `mixed-use-*.ts`, `lib/stores/calc-wizard-asset*.ts`(필드 정의), **`lib/stores/calc-wizard-store.ts:472-475`(⑥ 사이드바 합계 — 동일 mixed* 필드 읽음, 무영향, STEP 1-J)**.

---

## 8. 리스크 · 조심할 것

1. **Case A/용도변경 공용요소 보존(STEP 1-A)** — 개별주택공시가격(`:111-118`)은 현재 `isCaseA` 삼항 밖 공용 렌더. 최상위 분기 도입 시 **두 분기 각각에 존재**해야 `hasPartialUsageChange===true`(Case A/B/방향) 회귀 없음. Do에서 diff로 현행 분기 무변경 확인. *(면적 ①은 상위 `MixedUseExpandedPanel:137` 렌더 → 이 재편과 무관, STEP 3.)*
2. **필드 미러링 보존** — `mixedAcqCommercialBuildingPrice` 등은 여러 위치 read/write. 재편 후에도 **useEffect→store 미러링 금지**, 동일 필드 직접 read/write 유지(`components/calc/CLAUDE.md`). *(STEP 1 정책검토: 계획에 미러링 도입 없음 확인)*
3. **면적 반올림 일관성** — 상가부수토지 면적 `parseFloat(x.toFixed(2))` 후 단가 곱셈(`MixedUseStandardPriceInputs.tsx:41-44`). 이동 시 그대로 유지.
4. **pre-1990 토지 래치** — `MixedUsePreHousingDisclosureSection.tsx:87-91` 수렴 boolean 래치는 의도적 예외. 주택 섹션 이동 시 그대로 유지(제거·리팩터 금지).
5. **스냅샷 키** — 상가 모달 `onApplyBoth` 통합 시 snapshotKey 규약(`bsp-${assetId}-phd-transfer-commercial` 등) 충돌·유실 주의. 통합 버튼 단일 키.
6. **display↔engine 자기일관** — 상가 자동합계(표시전용)는 API raw 재계산과 별도. 이동 시 산식 자기일관 보존 확인(`feedback_engine_result_display_drift`).
7. **회귀 함정 다수** — 겸용주택은 메모리에 다수 함정 기록. E2E 회귀 필수.

---

## 9. 케이스 매트릭스 (STEP 1-A 재정렬)

| # | `hasPartialUsageChange` | 방향 | PHD(주택 미공시) | 대상 | 비고 |
|---|---|---|---|---|---|
| 1 | false | — | OFF | ✅ 자산-우선 | 주택 직접·상가 직접 |
| 2 | false | — | ON(§164⑤) | ✅ 자산-우선 | 주택 3-시점, 상가 환산 |
| 3 | true | house_to_commercial | ON, 최초공시 < 용도변경 (Case A) | ⛔ 현행 유지 | splitMode 4부분 |
| 4 | true | house_to_commercial | Case B(최초공시 ≥ 용도변경) | ⛔ 현행 유지 | |
| 5 | true | commercial_to_house | — | ⛔ 현행 유지 | 취득 개별주택공시가격 hide(:288) |

> Phase 1 verify는 케이스 1·2 anchor(용도변경 없음). 케이스 3·4·5는 **현행 회귀만 보장**(재편 분기 밖).

---

## 10. 회귀 anchor · E2E 계획

- **엔진 anchor(불변 보장)**: 재편은 UI-only이므로 기존 `__tests__/tax-engine/transfer/` 겸용주택 anchor가 그대로 통과해야 함(엔진 입력 무변경). 신규 엔진 테스트 불필요.
- **API 변환 anchor**: 재편 전후 동일 폼 → `buildAssetPayload`/`callTransferTaxAPI` 페이로드 diff 0 (스냅샷 비교 테스트 1건 신규 검토).
- **기존 E2E 셀렉터 파급(STEP 1-F)**: 섹션 헤딩 "양도시/취득시 기준시가"→"주택/상가 기준시가" 변경 시, 그 텍스트로 네비게이트하는 **기존** 겸용 E2E spec이 깨질 수 있음. Do 전 `e2e/` 겸용 spec의 헤딩 기반 셀렉터 목록 확인·갱신.
- **E2E(필수)**: 겸용주택 위저드 — 케이스 1·2 각각 (a) 상가 모달 1회 계산→취득·양도 동시 입력, (b) 계산 결과가 재편 전 값과 동일, (c) footgun 경로 부재. `feedback_e2e_togglecard_setchecked`·`feedback_browser_verify_with_playwright` 준수.
- **bundled(다자산) 겸용(STEP 1-K)**: MixedUseSection은 asset-level이라 다자산에서도 렌더·`multi-transfer-tax-validate.ts`가 검증. bundled 겸용 자산 1건 회귀 포함(단건과 동일 컴포넌트라 위험 낮으나 1건 확인).
- **Pre-Do anchor**(`pre-do-anchor-verification`): Do 진입 전 케이스 2(PHD) 폼→페이로드 anchor 1건 우선 작성해 "현행 일치" 가정 대신 실패로 배선 확인.

---

## 11. 미해결 · Design(UI 디자인 문서, STEP 12)에서 확정할 항목

1. **취득시 개별공시지가 배치 + landAutoSync 형태** — 지번-단위 단일 값. 상가 섹션에 두되 PHD 주택 환산이 자동 소비하게 할지, landAutoSync가 read-only인지 편집형인지 `MixedUsePreHousingDisclosureSection.tsx:272-273,303-309` 실측 후 확정(STEP 1-I).
2. **주택/상가 섹션 하위 컴포넌트 분리 여부** — 800줄·가독성 기준.
3. **자산 섹션 헤더 중립 tone 구체값** — sub-block amber/emerald와 대비되는 헤더 컨테이너 색(slate/신규). tone 표 동결.
6. **취득 sub-block(amber) 안 PHD 위젯 tone 중첩(STEP 3)** — PHD 3-시점 위젯은 자체 amber(취득 `:676`)+violet(최초공시 `:702`)+emerald(양도 `:728`) PointBlock을 포함 → 취득 sub-block wrapper를 amber로 두면 amber-in-amber + emerald(양도) 역방향 중첩. **해소안: PHD ON일 때 취득 sub-block wrapper를 tone-중립으로 두고 위젯 자체 tone에 위임**(OFF 단일 필드일 때만 amber). Design에서 확정.
4. **상가 취득·양도 `LandPriceLookupField` 2개 레이아웃** — 각자 기준연도 드롭다운(취득 1997/양도 2025) → 세로 스택 vs 2열 폭 확인(STEP 1-L).
5. **섹션 번호 체계** — ①면적 ②주택 ③상가 ④거주 ⑤수도권.

---

## 12. 단계별 실행 계획

1. **plan-design-self-review-loop(진행 중)** — 계획 검토×2 + 통합비교 + UI 디자인 생성·검토. *(verify: 정정 누적·재검토)*
2. **Pre-Do anchor** — 케이스 2 폼→페이로드 anchor 1건. *(verify: 재편 전 baseline 페이로드 확보)*
3. **Do-1** `BuildingStdPriceModalButton` `onApplyBoth` 추가. *(verify: tsc 0, 기존 사용처 무영향)*
4. **Do-2** `MixedUseStandardPriceInputs` 최상위 `hasPartialUsageChange` 분기 + 자산-우선 레이아웃 + 상가 모달 통합. *(verify: tsc 0, `hasPartialUsageChange===true` 분기 diff 무변경)*
5. **Check** — API 페이로드 diff 0, `ui-engine-sync-checker`, 엔진 anchor 통과. *(verify: vitest 통과)*
6. **E2E** — 겸용 케이스 1·2 + bundled 1건 + 기존 셀렉터 갱신. *(verify: Playwright 통과)*
7. **브라우저 수동 확인** — 상가 1회 계산→동시입력·footgun 부재·계산결과 동일. *(verify: Network 탭 페이로드)*

---

## 13. 검토 이력 (STEP 1 반영)

| ID | 우선순위 | 정정 요지 | 반영 위치 |
|---|---|---|---|
| A | High | 스코프 `!isCaseA`→`hasPartialUsageChange===false`. 최상위 분기 래핑, 공용요소 두 분기 보존 | §3·§5★·§7·§8-1·§9 |
| B | High | tone: 주택violet/상가amber 폐기 → 자산 헤더 중립 + 취득amber/양도emerald sub-block | §6 tone 규칙 |
| C | Medium | footgun "소멸"(전역)→"겸용 상가 섹션 모달 한정" | §2-2 |
| D | Medium | 취득/양도 순서 양도→취득 통일 | §6 |
| E | Medium | 개별공시지가 `LandPriceLookupField` 필수 명시 | §6 |
| F | Medium | 기존 겸용 E2E 셀렉터 확인·갱신 | §10 |
| G | Medium | 순서정책(time-major↔asset-major) grouping≠sequence 근거 | §6 설계노트 |
| H | Low | validation 무변경 실측 근거(early-return :313) | §4 |
| M | Low | 자동합계 라벨 "기준시가 합계" 유지(E2E `transfer-p3-hybrid:41` 방어)·인용 정밀화 | UI §2·§3·§6·§7 (STEP 13) |
| I | Low | landAutoSync 계승 "확정"→"확인필요" | §6 노트·§11-1 |
| J | Low | ⑥ 사이드바 `calc-wizard-store.ts` 미변경 명시 | §7 |
| K | Low | bundled 다자산 겸용 E2E | §10 |
| L | Low | 상가 통합모달 버튼 위치·라벨, 자동합계 색조 | §6 |

**정책 위반 0건**(mirror-pattern·useEffect 미러링·no-silent-apportion·dual-truth 전부 무결 — STEP 1 실측 확인).

---

## 부록 — 관련 메모리

- `components/calc/CLAUDE.md` "같은 의미 폼 필드의 양방향 read/write 통합" · tone 매핑 표
- `feedback_useeffect_store_mirror_forbidden`, `mirror-pattern`
- `feedback_area_rounding_consistency`, `feedback_engine_result_display_drift`
- `feedback_ui_order_follows_logic`, `feedback_tailwind_static_tone_mapping`
- `project_transfer_phd_3point_batch_stdprice`, `project_transfer_inheritance_house_val_building_std_batch`
- `feedback_browser_verify_with_playwright`, `feedback_e2e_togglecard_setchecked`
