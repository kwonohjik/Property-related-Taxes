# 양도소득세 — 기본사항 면적 단일 소스화 (감사 + 계획)

> 작성일: 2026-07-30
> 브랜치: `feat/basic-info-area-single-source`
> 목표(사용자 확정): 기준시가 계산 · 건축물 기준면적 초과 비사업용토지 판정 등 **면적이 필요한 모든 지점이 기본사항 면적을 참조**하게 한다. 본 문서는 그 **기초 작업 + 누락 감사**.
> 선행: [`transfer-asset-area-basic-info.plan.md`](transfer-asset-area-basic-info.plan.md) (PR #907·#908) · 정본 [`area-taxonomy.md`](../../02-design/area-taxonomy.md)

---

## 0. 요약

`AssetForm` 면적 필드는 **46개**다(`calc-wizard-asset*.ts` 실측). 이를 단일 소스로 묶으려면 먼저 **면적이 3개 독립 축**임을 인정해야 한다 — 하나로 합칠 수 없다.

| 축 | 법령 개념 | 기본사항 현황 |
|---|---|---|
| **A. 토지 면적** | 대지·부수토지 면적 | ✅ `acquisitionArea`/`transferArea` (land·housing) |
| **B. 건물 연면적** | 각 층 바닥면적의 합 — 건물 기준시가 ㎡당 곱셈 인자 | ⚠️ `building`만 이번에 추가, 상가·GB·겸용은 전용 필드 |
| **C. 건물 바닥면적(정착면적)** | **"주택이 정착된 면적"**(법 §104의3①5호) · **"건축물 바닥면적"**(동항 6호 단서) — NBL 배율 판정 기준 | 🔴 **기본사항에 없음** · 폼 필드 산재 · 일부 미배선 |

사용자 확인(2026-07-30): **"건축물 기준면적"은 바닥면적 기준.** 법령 원문이 이를 확증한다(§3.1).

---

## 1. 이번 PR에서 한 것 (A안 — `building` 승격)

`assetKind === "building"`(건물, 토지 제외)을 기본사항 면적 섹션에 추가했다.

**근거**: `toPropertyKind`(`CompanionAcqPurchaseBlock.types.ts:132~138`)가 `housing`·`land` 외 **전부** `building_non_residential`로 매핑 → `StandardPriceInput.isAreaMode = true`(`:98~100`) → 기준시가가 **단가 × 면적**으로 산출된다. 즉 `building`도 `acquisitionArea`를 쓴다.

그런데 그 입력 칸은 **기준시가 위젯 내부에만** 있었다(`CompanionAcqPurchaseBlock.tsx:600,645`) → 취득가액 산정방식이 실거래가면 위젯이 사라져 **입력 경로 소멸**. Phase 2 이전 주택과 같은 구조 갭.

| 변경 | 내용 |
|---|---|
| `AREA_SCENARIOS_BY_ASSET_KIND` | `building: ["same", "partial"]` 추가 (환지는 토지 제도라 제외) |
| `AREA_LABEL_BY_ASSET_KIND` 신설 | land "면적" · housing "토지 면적" · building "**건물 연면적**" — 인라인 삼항 제거 |
| RTL | 3건 추가(렌더·라벨·환지 미노출), 기존 13건 유지 |

`presale_right`·`right_to_move_in`은 **권리이지 물건**이라 면적 개념이 없다 → 제외 유지(기준시가 총액 직접 입력).

---

## 2. 🔴 누락 1 — 라벨이 법문과 다르다 (과소과세 방향)

`components/calc/transfer/nbl/HousingLandDetailSection.tsx:68`

```tsx
<FieldCard label="주택 연면적" unit="㎡">
  <DecimalInput value={asset.nblHousingFootprint} … />
```

- 필드명은 `Footprint`(정착면적), 엔진도 정착면적으로 소비한다(`housing-land.ts:71` `allowedArea = footprint × multiplier`, step label "주택/건물 정착면적").
- **라벨만 "연면적"**이다.

**법령 원문** (KoreanLaw 실측 — 소득세법 MST 280405, 시행일 2026-07-01):

> 법 §104의3①**5호**: "주택부속토지 중 **주택이 정착된 면적**에 지역별로 대통령령으로 정하는 배율을 곱하여 산정한 면적을 초과하는 토지"

→ **정착면적(바닥면적)이 맞고 연면적은 틀렸다.** 사용자가 라벨대로 연면적(층 합계)을 입력하면 허용면적이 층수 배로 과대 산정되어 **비사업용 판정을 놓친다(과소과세)**.

**조치**: 라벨 → "주택 정착면적(바닥면적)", hint에 법문 인용. 3층 건물이면 연면적이 바닥면적의 3배이므로 영향이 크다.

---

## 3. 🔴 누락 2 — `building_site` 정착면적이 폼→엔진 미배선 (과다과세 방향)

`housing-land.ts:36~37`:
```ts
const footprint =
  (input.landType === "building_site" ? input.buildingFootprint : input.housingFootprint) ?? 0;
```

| 엔진 입력 | 폼 필드 | 매핑 |
|---|---|---|
| `housingFootprint` (`types.ts:503`) | `nblHousingFootprint` | ✅ `form-mapper.ts:166` |
| `buildingFootprint` (`types.ts:502`) | **없음** | 🔴 **없음** |

→ `landType === "building_site"`면 항상 `footprint = 0` → 허용면적 0 → **전량 비사업용**.

**추가로 UI 게이트도 막혀 있다**: `NblSectionContainer.tsx:200`이 `nblLandType === "housing_site"`에서만 `HousingLandDetailSection`을 렌더 → `building_site` 선택 시 정착면적 입력 UI 자체가 없다.

### 실측 (throwaway probe)

토지 1,000㎡ · 정착면적 100㎡ · 도시지역 주거 · 비수도권 동일 입력:

| landType | 판정 |
|---|---|
| `housing_site` | `NBL=false` (사업용) |
| `building_site` | **`NBL=true` (비사업용 → 기본세율 +10%p 중과 + 장특공제 배제)** |

**과다과세 방향**이다.

---

## 4. 🟠 누락 3 — `building_site`에 §168의12를 적용하는 것 자체가 법령상 의문

법 §104의3①**5호**는 **"주택부속토지"** 한정이다(§2 인용). 건물 부수토지는 같은 항 **4호 나목**("지방세법 §106①2호 별도합산과세대상")으로 처리되는 구조다.

그런데 엔진은 `landType === "building_site"`를 5호 배율 경로로 보낸다(`housing-land.ts:37`). §3을 "배선 누락"으로 고치기 전에 **이 분기 자체가 옳은지 확정**해야 한다 — 아니라면 `building_site`는 4호나목(별도합산 판정) 경로여야 하고, `buildingFootprint` 필드를 만드는 것이 오히려 잘못된 구조를 고착시킨다.

**§3보다 §4를 먼저 결론내야 한다.** KoreanLaw로 §168의11(4호 다목 위임)·지방세법 §106①2호 체인 추적 필요.

---

## 5. 면적 축별 소비 지점 전수 (단일 소스 대상 지도)

### 5.1 축 A — 토지 면적

| 소비처 | 참조 필드 | 기본사항 참조? |
|---|---|---|
| NBL 자산 전체 면적 | `NonBusinessLandInput.landArea` ← `acquisitionArea` (`form-mapper.ts:70`) | ✅ |
| 토지 기준시가 | ㎡당 × `acquisitionArea` (`transfer.types.ts:543,551`) | ✅ |
| PHD §164⑤ | `acquisitionArea` (`validate-asset.ts:472` 요구) | ✅ |
| Pre1990 토지등급 환산 | `acquisitionArea` | ✅ |
| 상가 대지 | `cbLandArea` | ❌ 전용 필드 |
| GB 토지 | `gbLandArea` | ❌ 전용 필드 |
| 겸용 토지 전체 | `mixedUseTotalLandArea` | ❌ 전용 필드 |
| 재개발 토지 | `redevLandArea` | ❌ 전용 필드 |
| 다필지 | `parcels[].acquisitionArea/transferArea` | ❌ (taxonomy가 "최종 형태"로 판정 — §6.1) |

### 5.2 축 B — 건물 연면적

| 소비처 | 참조 필드 | 기본사항 참조? |
|---|---|---|
| `building` 기준시가 | `acquisitionArea` (isAreaMode) | ✅ **이번 PR** |
| GB 연면적 | `gbBuildingArea` | ❌ 전용 필드 |
| 상가 전용+공유 | `cbExclusiveArea` + `cbSharedArea` (§164⑥ 3축) | ❌ **통합 금지** |
| 겸용 주거·비주거 연면적 | `residentialFloorArea` · `nonResidentialFloorArea` | ❌ 용도별 안분 정본 |
| 증축 연면적 | `extensionFloorArea` · `gbExtensionArea` | ❌ 별개(가산세 게이트) |
| NBL 별장 건물 연면적 | `nblVillaBuildingFloorArea` (§168의13①1호 150㎡) | ❌ 법정 요건 면적 |
| NBL 기타토지 복합용도 | `nblOtherMixedUseSpecificFloorArea` / `TotalFloorArea` (§168의11⑥1호) | ❌ 법정 요건 면적 |

### 5.3 축 C — 건물 바닥면적(정착면적)

| 소비처 | 참조 필드 | 상태 |
|---|---|---|
| NBL 주택부수토지 배율 (법 §104의3①5호) | `nblHousingFootprint` | ⚠️ 라벨 오류(§2) |
| NBL 건물부수토지 배율 | `buildingFootprint` | 🔴 **미배선**(§3) + 법령 의문(§4) |
| NBL 기타토지 §101①2호나목 | `nblOtherBuildingFloorArea` | 확인 필요 |
| NBL 기타토지 복합용도 바닥면적비 (§168의11⑥2호) | `nblOtherMixedUseSpecificFootprint` / `TotalFootprint` | 확인 필요 |
| NBL 연접 다필지 ⑤2호 | `parcels[].buildingFootprintArea` | 확인 필요 |
| GB 수평투영면적 (§168의12) | `gbBuildingFootprintArea` | 확인 필요 |
| 겸용 정착면적 | `buildingFootprintArea` | 확인 필요 |
| 별장 부속토지 10배 (법 §104의3①6호 단서) | **미확인** | 확인 필요 |

**축 C가 단일 소스화의 핵심 대상**이다 — 같은 "바닥면적"을 7개 필드가 나눠 갖고 있고, 그중 하나는 미배선이며 하나는 라벨이 틀렸다.

---

## 6. 통합 금지 원칙 (전제)

법령상 요건이 다른 면적은 **하나로 합치면 침묵 오답**이 된다. 이미 확립된 근거:

- 상가 §164⑥: 대지·전유·공용이 **서로 다른 단가**에 곱해진다(`commercial-building-valuation.ts:196,245`).
- `non-business-land/types.ts:213`: "자산 전체 landArea와 **별개**(부속토지 전용)".
- §22 금융재산공제 ↔ §73⑤ 물납 금융재산이 정의가 달라 flag로 분리한 선례(PR #910).

→ 단일 소스화는 **"축 안에서 통합"**이지 축을 넘는 통합이 아니다. 축 C의 7개 필드가 정말 같은 법령 개념인지 필드별로 확인해야 한다(§5.3 "확인 필요" 6건).

---

## 7. 단계 계획

```
Phase 0  ✅ 완료 — 46필드 인벤토리 + 3축 분류 + 누락 3건 실증
Phase A  ✅ 완료 — building assetKind 기본사항 승격 (이번 PR)
Phase B  §2 라벨 정정 "주택 연면적" → "주택 정착면적(바닥면적)" + 법문 hint
         → verify: 라벨 anchor + §168의12 배율 계산 무변경 확인
Phase C  §4 법령 확정 — building_site가 5호인가 4호나목인가 (KoreanLaw 체인)
         → 결론 없이는 §3 착수 금지
Phase D  §3 배선 — Phase C 결론에 따라 buildingFootprint 필드+UI 신설 또는 4호나목 경로 정정
Phase E  §5.3 "확인 필요" 6건 실측 → 축 C 단일 소스 대상 확정
Phase F  기본사항에 축 C(바닥면적) 입력 추가 + 소비처 참조 전환
```

**Phase B는 독립적이고 즉시 가능**(라벨만, 계산 무변경). Phase C가 D·E·F의 전제다.

---

## 8. 리스크

| # | 리스크 | 완화 |
|---|---|---|
| R1 | 축 C 통합 시 법정 요건 면적을 뭉개 침묵 오답 | §6 원칙 — 필드별 법령 개념 확인 후에만 통합 |
| R2 | Phase B 라벨 정정이 기존 E2E 셀렉터 파손 | "주택 연면적" 셀렉터 사용처 grep 선행 (PR #908 선례) |
| R3 | Phase D에서 `buildingFootprint` 신설이 잘못된 구조 고착 | Phase C 선행 강제 |
| R4 | 기본사항 면적 칸이 자산유형별로 늘어나 폼 과밀 | 축별 조건부 노출(현행 `AREA_SCENARIOS_BY_ASSET_KIND` 패턴 확장) |

---

## 9. 변경 이력

| 날짜 | 버전 | 변경 |
|---|---|---|
| 2026-07-30 | v1.0 | 최초 작성 — 46필드 인벤토리·3축 분류·누락 3건 실증(라벨 오류·building_site 미배선·법령 의문)·Phase A 완료 |
