# 면적(Area) Taxonomy — 설계 기준 문서

> 작성일: 2026-04-24
> 대상 범위: 양도소득세 계산기 (향후 상속·증여·재산세 등 토지 자산 공통)
> 목적: 여러 화면과 엔진에서 혼재하는 "면적" 개념을 **3종 기본 필드 + 시나리오 파생 규칙**으로 통일하여 사용자·개발자 모두의 혼동을 제거한다.

---

## 1. 배경 — 현재의 문제

현재 시스템은 의미상 다른 "면적" 값이 7개 필드에 분산되어 있으며, UI 상에서는 대부분 단순히 `면적` 또는 `토지 면적`으로만 표시된다.

| 현 필드 | 현 UI 라벨 | 실제 용도 | 세법상 역할 |
|---|---|---|---|
| `landAreaM2` | 토지 면적 (㎡) | 공시지가 ㎡ 단가 × 면적 = 기준시가 자동계산 | **세법 개념 없음** (계산 편의용) |
| `AssetForm.acquisitionArea` (추가 예정) | — | 취득 기준시가 산정 | 취득 당시 면적 |
| `AssetForm.transferArea` (추가 예정) | — | 양도 기준시가 산정 | 양도 당시 면적 |
| `parcels[].acquisitionArea` | 취득 면적 (㎡) | 다필지 취득 기준시가 산정 | 취득 당시 면적 |
| `parcels[].transferArea` | 양도 면적 (㎡) | 다필지 양도 기준시가 산정·안분 | 양도 당시 면적 |
| `parcels[].entitlementArea` | 권리면적 (㎡) | 감환지 의제 산식 분모 | 환지예정지 지정 면적 |
| `parcels[].allocatedArea` | 교부면적 (㎡) | 감환지 산식 분자·실 양도면적 | 환지처분 후 수령 면적 |
| `parcels[].priorLandArea` | 종전토지면적 (㎡) | 감환지 산식 종전 | 환지 전 원래 면적 |
| `pre1990AreaSqm` | 면적 (㎡) | 1990.8.30. 이전 토지등급가 환산 | **세법 개념 없음** (취득 면적과 동일) |

### 주요 모순

1. **라벨 불일치**: 같은 필드가 화면마다 서로 다른 라벨로 표시됨.
2. **세법에 없는 개념의 필드화**: `landAreaM2`, `pre1990AreaSqm` 는 계산 편의를 위한 중간값일 뿐, 세법상 독립 개념이 아니다. 사용자는 이 값이 무엇인지 몰라서 실제 취득·양도 면적과 다른 값을 입력하는 사고가 발생한다.
3. **중복 입력**: 99%의 단필지 일반 케이스에서 `landAreaM2 = acquisitionArea = transferArea` 여야 하지만 사용자가 세 곳에 각각 입력해야 한다.

---

## 2. 설계 원칙

### 원칙 A — 세법이 정의하는 면적만 필드로 둔다

세법상 면적의 정의:

- **양도소득세 양도가액** (소득세법 §96) → **양도 당시 양도 대상 면적**
- **양도소득세 취득가액** (소득세법 §97) → **취득 당시 취득한 면적**
- **환지처분에 의한 의제 취득면적** (소득령 §162의2) → 종전 × (교부 / 권리)
- **환지처분확정일 익일 취득일 의제** (소득령 §162 ① 6호) → 면적 개념과 무관

즉 세법상 면적 개념은 본질적으로 **① 취득 당시 면적 ② 양도 당시 면적** 2종이고, 환지 케이스에서만 권리/교부/종전 3필드가 보조적으로 사용된다.

### 원칙 B — 계산 편의용 중간값은 필드로 두지 않는다

`landAreaM2` (공시지가 총액 계산용) 과 `pre1990AreaSqm` (Pre1990 환산 총액 계산용) 은 세법 개념이 아니다. 이들은 기존 취득·양도 면적 필드에서 자동 파생시키거나, UI에서 적절한 시점의 면적을 주입하는 방식으로 제거한다.

### 원칙 C — 화면 라벨은 "역할 + 시점" 규칙으로 통일

`면적` / `토지 면적` 같은 모호한 라벨 금지. 모든 면적 라벨은 다음 규칙을 따른다:

```
[세법 역할] + [기준 시점] + "면적 (㎡)"
```

- `취득 당시 면적 (㎡)` — acquisitionArea
- `양도 당시 면적 (㎡)` — transferArea
- `환지 권리면적 (㎡)` — entitlementArea
- `환지 교부면적 (㎡)` — allocatedArea
- `환지 이전 종전 면적 (㎡)` — priorLandArea

### 원칙 D — 사용자는 시나리오만 선택하면 된다

사용자가 세법 개념을 모두 이해할 필요가 없도록, 상위 UI에서 **면적 시나리오 드롭다운**을 제공하고 선택값에 따라 내부 필드를 자동 파생·노출/숨김한다.

---

## 3. 최종 면적 필드 체계 (3종)

### 3.1 기본 2종 — 모든 자산에 공통

| 필드 | 표준 라벨 | 의미 | 세법 근거 |
|---|---|---|---|
| `acquisitionArea` | 취득 당시 면적 (㎡) | 취득일 시점에 소유했던 면적 | 소득세법 §97 |
| `transferArea` | 양도 당시 면적 (㎡) | 양도일 시점에 실제 양도한 면적 | 소득세법 §96 |

### 3.2 환지 파생 3종 — 감환지/증환지 시나리오에서만

| 필드 | 표준 라벨 | 의미 | 세법 근거 |
|---|---|---|---|
| `entitlementArea` | 환지 권리면적 (㎡) | 환지예정지 지정 시 받기로 한 면적 | 소득령 §162의2 |
| `allocatedArea` | 환지 교부면적 (㎡) | 환지처분 확정 후 실제 교부받은 면적 | 소득령 §162의2 |
| `priorLandArea` | 환지 이전 종전 면적 (㎡) | 환지 전 원래 보유 면적 | 소득령 §162의2 |

### 3.3 제거되는 필드

| 제거 필드 | 대체 |
|---|---|
| `AssetForm.landAreaM2` | 시나리오에 따라 `acquisitionArea` 또는 `transferArea` 로 분기 |
| `TransferFormData.pre1990AreaSqm` | `acquisitionArea` (Pre1990 환산은 취득 당시 면적 기반) |
| UI "토지 면적" 별도 입력 | 자산 카드 내 단일 "면적 정보" 섹션으로 흡수 |

---

## 4. 시나리오 매트릭스 — 필드 파생 규칙

자산 카드 내 `areaScenario` 드롭다운 선택값에 따른 내부 필드 값과 엔진 전달값 규칙이다.

| 시나리오 | UI 입력 | acquisitionArea | transferArea | 환지 3필드 | 비고 |
|---|---|---|---|---|---|
| `same` (일반) | [면적] 1개 | 입력값 | 입력값 (=acq) | — | 99% 케이스 |
| `partial` (일부양도) | [총 취득면적] [이번 양도면적] | 총취득 | 양도분 | — | 분할 후 일부 양도 |
| `reduction` (감환지) | [권리] [교부] [종전] | 종전 × (교부/권리) | 교부 | 모두 저장 | 소득령 §162의2 |
| `increase` (증환지) — *향후* | [권리] [교부] [종전] + [증환지 별건 처리] | 권리면적분 = 종전 (변동 없음) | 교부 | 모두 저장 | 증가분은 별건 취득 parcel로 분리 |
| `mixed-acquisition` (취득시기 상이) — *향후* | 각 필지별 독립 | 필지별 | 필지별 | — | parcels 이미 지원 |

### 4.1 제약 조건

- `same` 시나리오: 내부적으로 `acquisitionArea === transferArea` 불변식 유지.
- `partial` 시나리오: `acquisitionArea >= transferArea` 검증 필수.
- `reduction` 시나리오: `entitlementArea > allocatedArea` 검증 필수 (증환지와 구분).
- `reduction` 시나리오 저장 시 `transferArea = allocatedArea` 자동 동기화.

### 4.2 환산취득가 수식에서의 면적 사용

```
환산취득가 = 양도가액 × (취득시 기준시가 / 양도시 기준시가)
취득시 기준시가 = ㎡ 단가(취득시) × acquisitionArea
양도시 기준시가 = ㎡ 단가(양도시) × transferArea
```

- `same`: acquisitionArea = transferArea → 비율이 단가만의 비율
- `partial`: 취득·양도 면적이 달라 면적비까지 반영됨
- `reduction`: 의제취득면적과 교부면적을 각각 사용

---

## 5. UI 설계 원칙

### 5.1 자산 카드 내 단일 "면적 정보" 섹션

자산당 면적 관련 입력을 한 블록으로 통일. 이전까지 흩어져 있던:
- "토지 면적" 필드 (자산 카드 상단)
- "취득 면적 / 양도 면적" (다필지 모드)
- "권리/교부/종전" (감환지 체크박스 안)
- "pre1990AreaSqm" (Pre1990 환산 안)

이 모두를 하나의 **면적 정보** 섹션에 흡수한다. 섹션 구조:

```
면적 정보
└─ [시나리오 드롭다운]
    ├─ 일반 (취득=양도)
    │   └─ [면적 (㎡)] 단일 입력
    ├─ 일부 양도
    │   └─ [총 취득 면적] [이번 양도 면적] 2개 입력
    ├─ 감환지
    │   ├─ [권리면적] [교부면적] [종전토지면적] 3개 입력
    │   └─ (의제취득면적 자동계산 뱃지 표시)
    ├─ 증환지 — *향후*
    └─ 취득시기 상이 — *향후* (다필지 토글로 이동)
```

### 5.2 라벨 · 툴팁 규칙

모든 면적 입력 옆에 `ⓘ` 툴팁으로 **"이 값이 어떤 세액 계산에 쓰이는가"** 를 한 줄로 표시:

| 필드 | 툴팁 예시 |
|---|---|
| 취득 당시 면적 | 취득 기준시가 = ㎡ 단가 × 이 면적. 환산취득가액의 분자 계산에 사용됩니다. |
| 양도 당시 면적 | 양도 기준시가 = ㎡ 단가 × 이 면적. 환산취득가액의 분모 및 일괄양도 안분에 사용됩니다. |
| 환지 권리면적 | 환지예정지 지정 시 받기로 한 면적. 감환지 판단 기준. |
| 환지 교부면적 | 환지처분 확정 후 실제 수령 면적. 양도 당시 면적으로 자동 적용됩니다. |
| 환지 이전 종전 면적 | 환지 전 보유했던 원래 면적. 의제 취득면적 산식의 분자. |

### 5.3 기존 UI 입력과의 호환

- 단필지 자산 카드: `same` 시나리오 기본값, 사용자는 단일 "면적" 입력만 보이도록.
- 다필지 자산 카드 (parcelMode): 각 필지 카드마다 시나리오 드롭다운 독립.

---

## 6. 엔진 연계 규칙

### 6.1 변경 전 / 후 비교

**변경 전** (현행):
```ts
// AssetForm
interface AssetForm {
  landAreaM2: string;           // 계산 편의용
  // acquisition/transfer area 없음 (단필지는 기준시가 총액 직접 입력)
}
// ParcelFormItem
interface ParcelFormItem {
  acquisitionArea: string;
  transferArea: string;
  entitlementArea: string;
  allocatedArea: string;
  priorLandArea: string;
  areaScenario: "same" | "reduction" | "partial";
}
// TransferFormData (루트)
interface TransferFormData {
  pre1990AreaSqm: string;  // 계산 편의용
}
```

**변경 후**:
```ts
// AssetForm (단필지 모드에서도 시나리오 기반 면적 입력 사용)
interface AssetForm {
  areaScenario: "same" | "reduction" | "partial";
  acquisitionArea: string;   // 세법 개념
  transferArea: string;      // 세법 개념
  entitlementArea: string;   // 감환지 전용
  allocatedArea: string;     // 감환지 전용
  priorLandArea: string;     // 감환지 전용
  // landAreaM2 제거
}
// ParcelFormItem: 기존과 동일 (이미 최종 형태)
// TransferFormData: pre1990AreaSqm 제거 (acquisitionArea 재사용)
```

### 6.2 엔진 인터페이스

엔진(`multi-parcel-transfer.ts`, `inheritance-acquisition-price.ts`, `pre-1990-land-valuation.ts`) 은 이미 `acquisitionArea` 기반으로 계산하므로 **엔진 로직 변경 없음**. 변경은 API 어댑터·UI 레이어에 국한된다.

### 6.3 API 스키마

- `landAreaM2` 필드 제거 (단, 과도기에 optional alias로 2 릴리즈 유지 가능)
- `acquisitionArea` / `transferArea` 를 `AssetForm` 수준 Zod 스키마에 추가

---

## 7. 데이터 마이그레이션

기존 sessionStorage / DB에 저장된 구형 데이터 처리:

```ts
function migrateAsset(asset: any): AssetForm {
  // landAreaM2 → acquisitionArea (비어있을 때만)
  if (asset.landAreaM2 && !asset.acquisitionArea) {
    asset.acquisitionArea = asset.landAreaM2;
    asset.transferArea = asset.landAreaM2;  // same 시나리오 가정
    asset.areaScenario = "same";
  }
  delete asset.landAreaM2;
  return asset;
}

function migrateFormRoot(form: any): TransferFormData {
  // pre1990AreaSqm → acquisitionArea (대표 자산)
  if (form.pre1990AreaSqm && !form.assets?.[0]?.acquisitionArea) {
    form.assets[0].acquisitionArea = form.pre1990AreaSqm;
  }
  delete form.pre1990AreaSqm;
  return form;
}
```

적용 위치:
- `calc-wizard-store.ts` rehydrate (`migrate` 또는 `persist` 콜백)
- Server Action 이력 조회 시 (과거 저장 결과 재계산)

---

## 8. 테스트 전략

### 8.1 단위 테스트

- `__tests__/tax-engine/` 기존 테스트는 엔진 로직 변경 없으므로 통과 유지.
- 신규 테스트 추가:
  - 마이그레이션 함수 단위 (`migrateAsset`, `migrateFormRoot`)
  - 시나리오별 API 매핑 (`partial`, `reduction` 에서 `acquisitionArea` / `transferArea` 올바른 값)

### 8.2 수동 검증 시나리오

| # | 시나리오 | 확인 포인트 |
|---|---|---|
| 1 | 신규 일반 계산 (same) | "면적" 1개 입력으로 취득·양도·Pre1990 모두 정상 |
| 2 | 신규 일부양도 (partial) | 취득·양도면적 분리 입력 시 환산취득가 분모·분자 비율 정확 |
| 3 | 신규 감환지 (reduction) | 3필드 입력 → 의제취득면적 자동 계산 → 엔진 결과 일치 |
| 4 | 구형 데이터 rehydrate | sessionStorage에 `landAreaM2`만 있는 레거시 → `acquisitionArea` 로 자동 복사 |
| 5 | 1990 이전 취득 토지 | `pre1990AreaSqm` 입력 필드 사라지고 `acquisitionArea` 로 대체되어도 Pre1990 환산 결과 동일 |

---

## 9. 구현 로드맵

### Phase 2-1 — 필드 제거 (리팩터링)

- [ ] `AssetForm`에 `acquisitionArea`, `transferArea`, `areaScenario` 및 환지 3필드 추가
- [ ] `AssetForm.landAreaM2` 제거
- [ ] `TransferFormData.pre1990AreaSqm` 제거
- [ ] 마이그레이션 함수 추가 (rehydrate 시 자동 변환)
- [ ] `CompanionAssetCard.tsx`, `Step1.tsx` 에서 "토지 면적" 입력 제거 (시나리오 섹션으로 대체)
- [ ] `useStandardPriceLookup`/`StandardPriceLookup` 의 `landAreaM2` prop → 시점별 면적 prop
- [ ] `Pre1990LandValuationInput` 의 `pre1990AreaSqm` 로컬 필드 제거, `acquisitionArea` 외부 주입
- [ ] `inheritance-acquisition-price.ts` 엔진 인터페이스 확인 (`landAreaM2` 이름만 유지하거나 `acquisitionArea`로 rename)
- [ ] API Zod 스키마 정리 (`landAreaM2` 하위호환 처리)
- [ ] 테스트 회귀 확인

### Phase 2-2 — 시나리오 섹션 자산 카드 레벨로 확장

- [ ] 단필지 자산 카드에 면적 시나리오 드롭다운 UI 추가 (다필지에는 이미 반영됨)
- [ ] 자산 카드·다필지 간 시나리오 전환 로직 정비
- [ ] 일괄양도 안분 엔진에서 시나리오별 안분 규칙 확정

### Phase 3 — 라벨 일괄 교체 · 툴팁 추가

- [ ] 모든 UI의 "면적" / "토지 면적" 라벨을 표준 라벨로 일괄 교체
- [ ] 툴팁 컴포넌트로 각 면적 필드에 `ⓘ` 도움말 추가
- [ ] 결과 화면에도 "취득 당시 면적" / "양도 당시 면적" 표기 적용

---

## 10. 참고 — 세법 조문 요약

| 조문 | 내용 |
|---|---|
| 소득세법 §96 | 양도가액의 산정 — 양도 당시 실지거래가액 또는 기준시가 |
| 소득세법 §97 | 취득가액의 산정 — 실지·매매사례·감정·환산·기준시가 |
| 소득세법 §100 | 양도차익 산정 시 기준시가와 실지가액의 적용 (양도·취득 기준 일치) |
| 소득령 §162 ① 6호 | 환지처분 확정일 익일을 취득일로 의제 |
| 소득령 §162의2 | 환지처분에 따른 면적 변동 시 의제 취득면적 = 종전 × (교부 / 권리) |
| 소득규칙 §80 ⑥ | 1990.8.30. 이전 취득 토지 기준시가 토지등급 환산 |

---

## 11. 변경 이력

| 날짜 | 버전 | 변경 |
|---|---|---|
| 2026-04-24 | v1.0 | 최초 작성 — 3종 면적 필드 + 시나리오 매트릭스 확정 |
