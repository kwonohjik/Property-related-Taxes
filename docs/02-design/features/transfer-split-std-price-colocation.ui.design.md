# UI 설계 — 양도세 분리 축 기준시가 입력 배치

> 계획서: `transfer-split-std-price-colocation.plan.md`
> 담당: `transfer-tax-ui-senior` · 엔진 변경 0건(배치·게이트·validate 범위만)

## 1. 케이스 인벤토리 (입력 경로 전수 — memory `feedback_ui_input_path_enumeration`)

`isSeparateAcquisition = true` · `assetKind ∈ {housing, building}` · 겸용·부담부증여 제외.

| # | saleSplitMode | landMode | buildingMode | selfOwns | 축 A 카드 | ① 토지 섹션 | ② 건물 섹션 | 입력 가능 |
|---|---|---|---|---|---|---|---|---|
| 1 | apportioned | actual | actual | both | 토지+건물 | 취득시 | 취득시(bldg) | ✓ |
| 2 | apportioned | estimated | actual | both | 토지+건물 | 취득시 | 취득시(bldg) | ✓ |
| 3 | apportioned | estimated | estimated | both | 토지+건물 | 취득시 | 취득시(bldg) | ✓ |
| 4 | actual | actual | actual | both | – | – | – | ✓ (요구 없음) |
| **5** | actual | **estimated** | actual | both | – | 취득시 + **양도시** | 취득시(bldg) | ✓ **이미지 6** |
| **6** | actual | actual | **estimated** | both | – | 취득시 | 취득시(bldg) + **양도시** | ✓ **이미지 7** |
| 7 | actual | estimated | estimated | both | – | 취득시 + **양도시** | 취득시(bldg) + **양도시** | ✓ |
| 8 | actual | appraisal/salesCase | actual | both | – | 취득시 | 취득시(bldg) | ✓ |
| 9 | actual | (파생)estimated | (파생)estimated | building_only | – | 취득시 카드만(비소유 안내, `!landOwned` 경로 `:372-381`) | 취득시(bldg — **building 자산만**) + **양도시** | ✓ |
| 10 | actual | (파생)estimated | (파생)estimated | land_only | – | 취득시 + **양도시** | 섹션 없음 | ✓ |
| 11 | actual | (파생)actual | (파생)actual | ≠both | – | 취득시 카드만 | – | ✓ |
| 12a | apportioned | estimated | estimated | both, PHD | **토지+건물** | 취득시 숨김 | 취득시 숨김 | ✓ (후속 과제 §11) |
| 12b | actual | estimated | estimated | both, PHD | – | 취득시 숨김·**양도시** | 취득시 숨김·**양도시** | ✓ (후속 과제 §11) |

> 「취득시(bldg)」= 건물 취득시 기준시가 카드 — `assetKind === "building"`에서만(주택은 라목 역산).
> `showLandStdPrice` 기존 게이트(`isSeparateAcq && acqStdPriceRequired && !isPhdBothEstimated`)는 불변.

**가장 단순한 케이스 먼저 점검**(규칙 3): #4는 어떤 기준시가 카드도 뜨지 않고 양도가액 2칸만 있다 —
현행과 동일하며 회귀 대상이 아니다.

## 2. 화면 배치 (ASCII)

### 케이스 5 (이미지 6) — 구분양도 + 토지만 환산

```
┌ 이 자산의 토지·건물 양도가액 결정 방식 ─────────────────────────┐
│ (●) 구분양도 (직접입력)   ( ) 일괄양도 (양도시 기준시가 안분)     │
│ ┌ 토지 양도가액 ────────┐ ┌ 건물 양도가액 ────────┐            │
│ └───────────────────────┘ └───────────────────────┘            │
└─────────────────────────────────────────────────────────────────┘   ← 양도시 기준시가 카드 없음

┌ 취득가액 산정 방식 — 토지·건물 독립 선택  [§166⑥ 안분 ↗] ────────┐
│ ⑴ 토지 취득가액 방식                                             │
│   ( ) 실거래가  (●) 환산취득가  ( ) 감정가액  ( ) 매매사례가액     │
│   ┏ amber ▸ 토지 취득시 기준시가 (§99①1호 가목) ━━━━━━━━━━━━┓   │
│   ┃ 취득시 토지 공시지가 [        ] 원/㎡   토지기준시가 [ ]  ┃   │
│   ┃ 토지 면적 [      ] ㎡                                     ┃   │
│   ┃ (주택) 건물분은 결합 공시액 − 토지분으로 자동 도출 안내    ┃   │
│   ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛   │
│   ┏ emerald ▸ 토지 양도시 기준시가 (§99①1호 가목) ━━━━━━━━━━┓   │  ★ 신규
│   ┃ 양도시 토지 공시지가 [        ] 원/㎡   토지기준시가 [ ]  ┃   │
│   ┃ 토지 면적 (양도 당시) [      ] ㎡                          ┃   │
│   ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛   │
│   ┏ amber ▸ 토지 환산취득가 = 토지 양도가액 × (취득시 ÷ 양도시) ┓ │
│   ┃ · 취득시 기준시가 → 위 「토지 취득시 기준시가」 카드         ┃ │
│   ┃ · 양도시 기준시가 → 위 「토지 양도시 기준시가」 카드         ┃ │  ★ 문구 변경
│   ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛   │
│ ⑵ 건물 취득가액 방식                                             │
│   (●) 실거래가  ( ) 환산취득가  ( ) 감정가액  ( ) 매매사례가액     │
│   ※ 이미지 6은 **주택**이라 건물 취득시 기준시가 카드는 렌더되지  │
│      않는다(showBuildingStdPrice = … && !isHousingAsset).         │
│      building 자산이면 여기에 amber 취득시 카드 + 「취득시 건물   │
│      기준시가 계산」 런처가 온다                                  │
│   ┌ 건물 취득가액 [                  ] 원 ┐                      │
│ ┌ 토지 자본적지출 ┐ ┌ 건물 자본적지출 ┐                          │
└─────────────────────────────────────────────────────────────────┘
```

### 케이스 6 (이미지 7) — 구분양도 + 건물만 환산

```
│ ⑵ 건물 취득가액 방식                                             │
│   ( ) 실거래가  (●) 환산취득가  ( ) 감정가액  ( ) 매매사례가액     │
│   ┏ amber ▸ 건물 취득시 기준시가 (§99①1호 나목) ━━━ (building만) ┓│
│   ┃ 취득시 건물기준시가 [           ] 원                        ┃│
│   ┃                        [취득시 건물 기준시가 계산]  ★라벨변경 ┃│
│   ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛│
│   ┏ emerald ▸ 건물 양도시 기준시가 (§99①1호 나목) ━━━━━━━━━━━┓ │  ★ 신규
│   ┃ 양도시 건물 기준시가 [           ] 원                       ┃ │
│   ┃                        [양도시 건물 기준시가 계산]           ┃ │
│   ┃ hint: 환산취득가 분모 — 계산기로 산정. 위치지수·부속토지     ┃ │
│   ┃       값은 계산기 안에서 입력합니다                          ┃ │
│   ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ │
│   ┏ amber ▸ 건물 환산취득가 = 건물 양도가액 × (취득시 ÷ 양도시) ┓ │
│   ┃ · 취득시 기준시가 → 위 「건물 취득시 기준시가」 카드         ┃ │
│   ┃   (주택) 위 「취득시 기준시가(개별·공동주택가격)」에서       ┃ │
│   ┃         토지분을 뺀 값으로 자동 도출                        ┃ │
│   ┃ · 양도시 기준시가 → 위 「건물 양도시 기준시가」 카드         ┃ │
│   ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ │
```

## 3. 컴포넌트 트리 · props 시그니처

```
CompanionAcqDateSection
 └ LandBuildingSaleSplitSection            (props에서 landAcqMode·buildingAcqMode 제거)
     └ [saleAxis] TransferStdPriceCard     ← TransferStdPriceCards.tsx
          ├ TransferLandStdFields
          └ TransferBuildingStdFields

CompanionAcqPurchaseBlock
 └ LandBuildingSplitSection
     ├ ① PartAcqStdPrice(part="land")                       (기존)
     │  [landPart] TransferLandStdFields   ← ToneCard emerald wrapper
     │  PartAcqInputs(part="land", saleStdInPart)            (prop 신설)
     └ ② PartAcqStdPrice(part="building")                    (기존, buttonLabel 지정)
        [buildingPart] TransferBuildingStdFields ← ToneCard emerald wrapper
        PartAcqInputs(part="building", saleStdInPart)
```

```ts
// TransferStdPriceCards.tsx
export function TransferLandStdFields(p: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;   // 단일 배치 patch 필수
  transferDate?: string;
}): JSX.Element;

export function TransferBuildingStdFields(p: {
  asset: AssetForm;                                 // 값은 asset.buildingStandardPriceAtTransfer
  onChange: (patch: Partial<AssetForm>) => void;    // 별도 value/onValueChange 두지 않음(배선 단일화)
  transferDate?: string;
  /** hint 문안 분기 — 축 A(안분 분모 겸) vs 파트 섹션(환산 분모 전용) */
  placement: "saleAxis" | "part";
}): JSX.Element;

export function TransferStdPriceCard(p: {                  // 축 A 래퍼 (testid split-sale-std-card)
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
}): JSX.Element;
```

모든 `ToneCard`는 **`noDark`** 를 붙인다 — 현행 3카드(`:95`·`:121`·`:158`)와 다크모드 톤을 맞춘다.

**술어는 공통 조상이 1회 계산해 주입한다**: `CompanionAcqPurchaseBlock`이 `saleStdPlacement()`를
한 번 호출해 축 A(`:200-201` → `CompanionAcqDateSection`)와 축 B(`:685`) 양쪽에 `placement` prop으로
내려준다. 두 축이 각자 호출하면 인자 어긋남으로 상호배타 불변식이 깨진다. 하위 컴포넌트 내부 재파생
금지(dual-truth) — 기존 `acqStdPriceRequired` 주입(`:705-707`)과 동일 패턴이며, 이 방식이면
`LandBuildingSplitSection`에 `saleSplitMode` prop을 신설할 필요가 없다(현행 Props `:42-79`에 없음).
- `onChange`는 항상 **단일 배치 patch** — `writeLandStd(perSqm, area)`가 두 키를 한 번에 쓴다
  (`feedback_multikey_patch_stale_spread_overwrite`).
- `useEffect → store` 미러링 금지 — 카드 이동은 조건부 렌더만으로 구현한다.

## 4. testid 인벤토리

| testid | 위치 | 신규/기존 | 용도 |
|---|---|---|---|
| `split-sale-std-card` | 축 A 양도시 카드 wrapper | **신규** | 축 A 카드 존재 판정(§7 #1~#3 검증이 내부 필드 대리 판정으로 돌아가지 않도록) |
| `split-land-std-transfer-card` | 토지 양도시 ToneCard wrapper | **신규** | 카드 존재 판정(내부 필드 대리 판정 금지) |
| `split-building-std-transfer-card` | 건물 양도시 ToneCard wrapper | **신규** | 동상 |
| `split-land-std-transfer-persqm` | 양도시 ㎡당 공시지가 입력 | **신규** | `placeholder="원/㎡"` 중복 회피 |
| `split-land-std-transfer` | 토지기준시가 총액 div | 기존 | 자동계산 값 검증 |
| `split-land-std-transfer-area` | 양도 당시 면적 | 기존 | – |
| `split-building-std-transfer` | 양도시 건물 기준시가 input | 기존 | – |
| `split-land-std-acq-card` · `split-building-std-acq-card` | 취득시 카드 wrapper | 기존 | – |

**유일성 규약**: 모든 조합에서 각 testid는 화면에 **0 또는 1개**. `saleAxis ⊻ (landPart ∨ buildingPart)`
불변식이 보증하며, `queryAllByTestId(...).length <= 1`로 테스트한다.

## 5. 문구 리터럴 (전수 고정)

| 위치 | 문자열 |
|---|---|
| 축 A ToneCard title | `양도시 기준시가 (§99①1호 가목·나목)` (현행 유지) |
| 토지 파트 ToneCard title | `토지 양도시 기준시가 (§99①1호 가목)` |
| 건물 파트 ToneCard title | `건물 양도시 기준시가 (§99①1호 나목)` |
| 토지 공시지가 label | `양도시 토지 공시지가` (현행 유지) |
| 토지 공시지가 hint | `양도일 직전 고시 개별공시지가 (원/㎡) — 취득일이 아니다 (소득령 §164③)` |
| 면적 label / hint | `토지 면적 (양도 당시)` / `양도시 토지 기준시가 = ㎡당 공시지가 × 이 면적` |
| 건물 label | `양도시 건물 기준시가` |
| 건물 hint (축 A) | `안분 분모 겸 환산취득가 분모 — 계산기로 산정 (§99①1호 나목)` |
| 건물 hint (파트) | `환산취득가 분모 — 계산기로 산정 (§99①1호 나목). 위치지수·부속토지 값은 계산기 안에서 입력합니다` |
| 양도시 런처 | `양도시 건물 기준시가 계산` (현행 유지) |
| 취득시 런처 | `취득시 건물 기준시가 계산` (**신규 지정** — 기본값 "건물 기준시가 계산" 대체) |
| 환산 안내 · 파트 배치 | `· 양도시 기준시가 → 위 「{토지\|건물} 양도시 기준시가」 카드` |
| 환산 안내 · 축 A 배치 | `· 양도시 기준시가 → 위 「양도시 기준시가」 카드(양도가액 결정 방식 아래)` |

- placeholder에 숫자 예시 금지 — 형식 설명은 `hint`로.
- 라벨 크기: 필드 라벨 `text-sm` / hint `text-xs` / 카드 제목은 `ToneCard`가 관리. 임의 px 금지.
- 금액 표시 칸은 `text-right font-mono tabular-nums`(공용 컴포넌트가 이미 적용).

## 6. 클라이언트 8 동기화 지점

| # | 지점 | 조치 |
|---|---|---|
| ① 폼 상태 | 변경 없음 — 4필드 기존 유지 |
| ② initial | 변경 없음 |
| ③ normalize | 변경 없음 |
| ④ API 변환 | 변경 없음(`saleStdPriceActive = isSplitActive` 유지) |
| ⑤ UI 위젯 | §2·§3 — 배치 이동 + `saleStdPlacement` 게이트 |
| ⑥ 사이드바 합계 | 해당 없음(기준시가는 합계 항목 아님) |
| ⑦ 결과 카드 | 조건부 — 스냅샷 잔존 성질은 현행과 동형(계획서 §7 ⑦) |
| ⑧ validation | `needsSaleStdPart` 파트별 + `hasVisibleSaleRatio`(계획서 §5.5) |

## 7. UI 회귀 체크리스트 (브라우저/E2E)

- [ ] **A6 대응(핵심)**: #5에서 양도가액 2칸을 모두 비우면 차단 메시지가 뜬다 — 비가시 잔존값으로
      양도가액이 안분되지 않는다(계획서 §5.5 M1)
- [ ] 취득시 런처에 `"취득시 건물 기준시가 계산"` 문자열이 실제로 노출된다(양도시 런처와 구분)
- [ ] #8(appraisal/salesCase): 양도시 카드 0건
- [ ] #12a/#12b(PHD 양쪽 환산): 취득시 카드 숨김 + 양도시 카드 배치가 `saleSplitMode`대로
- [ ] #6 모달 prefill 공백: 「양도시 건물 기준시가 계산」 모달의 부속토지 면적·공시지가를
      **모달 안에서 입력**해 계산이 완결된다(계획서 §5.0 부수영향)
- [ ] #4: 어떤 기준시가 카드도 없고 양도가액 2칸만 (현행과 동일)
- [ ] #5: 토지 섹션에 취득시·양도시 2카드, 건물 계산 런처 화면 전체 0건
- [ ] #6: 건물 섹션에 취득시·양도시 2런처(라벨로 구분), 토지 양도시 카드 0건
- [ ] #7: 두 파트 모두 양도시 카드, 축 A 카드 0건
- [ ] #1~#3: 축 A 카드 유지, 파트 양도시 카드 0건
- [ ] 모드 왕복(apportioned ↔ actual, actual ↔ estimated) 후 입력값 보존
- [ ] #9·#10: 비소유 파트 섹션 없음 + validate가 그 파트를 요구하지 않음
- [ ] 각 testid `queryAllByTestId(...).length <= 1`
- [ ] 「양도시 건물 기준시가 계산」 모달이 단일 시점 모드로 열림(취득 구조·용도 미노출)
