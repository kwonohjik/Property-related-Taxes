# 겸용주택 취득시 기준시가 시점 혼합 결함 (Phase B0) — UI 설계

- 상태: **UI Design (2026-10-06) — 엔진 설계 §5 확정 전 가칭 필드 기준**
- base `88f7bf67`, 브랜치 `fix/mixed-use-acq-std-date-mismatch`
- 계획서: `docs/00-pm/transfer-split-acq-per-part-method.plan.md` §2.3 M-0 · §5 B0 · §7 V-1·V-10 · Q-4(독립 선행 PR 확정)
- 엔진 설계(병행): `mixed-use-acq-std-date-mismatch.engine.design.md` — **작성 중 상태에서 본 문서를 쓴다.** 엔진 필드명·필수 조건은 그쪽 §5를 따르고, 본 문서의 폼 필드명은 제안이다.
- 근거 표기: 모든 file:line은 워크트리(base `88f7bf67`)에서 직접 열어 확인한 것. 화면 실측은 **미수행**(설계 단계 — Do 단계 Playwright 확인 대상, §7).

---

## §0 요약

### 결함 (재확인)
겸용주택에서 토지·건물 취득일이 다르면 (`acquisitionDate`=건물, `landAcquisitionDate`=토지 — `lib/stores/calc-wizard-asset-gb.ts:136` 주석·`calc-wizard-asset-migrate-phase3.ts:16` 규약),

| 값 | 화면 입력 위치 | 조회 기준일 |
|---|---|---|
| 취득시 개별주택공시가격 `mixedAcqHousingPrice` | ② 주택 취득 sub-block (`MixedUseAssetMajorStdPrice.tsx:238-247`, Legacy `MixedUseLegacyStdPrice.tsx:168-177`) | `acqReferenceDate = asset.acquisitionDate` = **건물 취득일** (`:115`, `:244`) |
| 취득시 ㎡당 공시지가 `mixedAcqLandPricePerSqm` | ③ 상가 "상가부수토지 개별공시지가" (`:405-414`, Legacy `:221-235`) | `acqLandReferenceDate = landAcquisitionDate \|\| acquisitionDate` = **토지 취득일** (`:118`, `:410`) |

엔진은 `acqBuildingStd = max(housingPrice − landPricePerSqm × 주택부수토지, 0)`(`transfer-tax-mixed-use-housing.ts:273-276`)로 두 값을 뺀다. 서로 다른 날짜의 값끼리의 뺄셈이다. 그리고 이 `landPricePerSqm`은 ④에서 단 1개(`transfer-tax-api-mixed-use.ts:154-157`)라 **화면에 "건물 취득일 기준 공시지가"를 넣는 칸 자체가 없다** (입력 경로 부재).

### 수정 방향 (UI 측 결정)
1. **신규 입력칸 1개** — 「주택부수토지 개별공시지가 — 건물 취득일 기준」. `LandPriceLookupField` + `referenceDate = 건물 취득일`. 폼 필드 `mixedAcqLandPricePerSqmAtBuildingAcq`(가칭, 엔진 `acquisitionStandardPrice.landPricePerSqmAtBuildingAcq` 가칭과 1:1).
2. 기존 `mixedAcqLandPricePerSqm`은 **토지 취득일 기준 그대로 유지**(상가부수토지 토지분·주택 토지분용). 라벨·동작 무변경.
3. **노출·전송·필수 술어를 단일 leaf 함수 하나**(`needsMixedAcqLandPriceAtBuildingAcq`)로 만들어 ⑤·④·⑧이 같은 함수를 호출한다(3중 패턴). 술어 = 「payload 기준 두 날짜가 다름 ∧ PHD OFF ∧ 용도변경 방향이 상가→주택 아님 ∧ 취득시 개별주택공시가격 > 0」.
4. **자동 대체 금지** — 미입력일 때 `mixedAcqLandPricePerSqm`(토지일 값)·PHD 값·1990 환산값으로 메우지 않는다. ⑧이 막는다. 날짜가 같아지면 칸을 렌더하지 않고 값은 store에 둔 채 **보내지도 요구하지도 않는다**(useEffect 정리 금지).
5. ⑥ 사이드바·⑦ 결과는 **엔진이 낸 echo를 읽는 구조**라 신규 입력으로 자동 추종한다(§6 실측). 산출근거 표시 보강(건물분 = 개별주택가격 − 공시지가×면적)은 엔진 echo 추가가 필요한 **선택 항목**으로 분리(Q-6).

### 배치 결정 (지시문과의 차이 — Q-1)
지시문은 「토지 취득일 공시지가 칸과 나란히」였으나, 두 칸은 현행 화면에서 **서로 다른 섹션**에 있다(② 주택 vs ③ 상가). 신규 칸은 **② 주택 취득 sub-block의 개별주택공시가격 바로 아래**에 둔다 — 근거: (a) UI 순서 = 계산 순서(개별주택공시가격(건물일) → 같은 날의 토지분 → 뺄셈), (b) 두 값이 같은 날짜 축이라 한 박스 안에서 짝이 보인다, (c) ③의 기존 칸에 붙이면 토지일 값 칸과 건물일 값 칸이 한 줄에 서서 오입력(서로 바꿔 넣기) 위험이 커진다. 대신 ③ 기존 칸 아래에 **한 줄 캡션**(토지 취득일 기준임을 명시)으로 대조 가능하게 한다. 이동은 컴포넌트 1개의 렌더 위치 변경이라 비용이 작다 — 사용자가 「나란히」를 고수하면 §2.5 대안 B 적용.

### 변경 파일 요약 (Do 단계 예정 — 본 문서 단계에서 소스 수정 없음)
| 구분 | 파일 | 변경 |
|---|---|---|
| 신규 leaf | `lib/calc/mixed-use-acq-date-split.ts` | 술어 2개 + 값 helper 1개 (~45줄) |
| 신규 컴포넌트 | `components/calc/transfer/mixed-use/MixedUseAcqHousingLandPriceField.tsx` | 신규 칸 (~85줄) |
| ① | `lib/stores/calc-wizard-asset-gb.ts` (:340 아래) | 필드 선언 |
| ②③ | `lib/stores/calc-wizard-asset-mixed-use.ts` (:92·:179 부근, `Pick` 목록) | initial·backfill |
| ⑤ | `MixedUseAssetMajorStdPrice.tsx` · `MixedUseLegacyStdPrice.tsx` | 컴포넌트 1줄 삽입 + 기존 칸 캡션 |
| ④ | `lib/calc/transfer-tax-api-mixed-use.ts` (:154-158) | 조건부 전송 |
| ⑧ | `lib/calc/transfer-tax-validate-mixed-use-asset.ts` (:122 부근) | 필수 검증 |
| ⑫⑬⑭ | 엔진 시니어 영역 | Zod(`transfer-tax-schema-mixed-use.ts:51-53`)에 필드 추가 필수 — 안 하면 **침묵 strip**(§4.3) |

---

## §1 현행 구조·목업

### 1.1 레이아웃 분기 — 2개 컴포넌트
`MixedUseStandardPriceInputs.tsx:45-70`: `hasPartialUsageChange`이면 `MixedUseLegacyStdPrice`(시점-우선 ②취득/③양도), 아니면 `MixedUseAssetMajorStdPrice`(자산-우선 ②주택/③상가). **둘 다 같은 폼 필드를 읽고 쓰므로 결함은 두 경로에 모두 존재**한다(엔진 분기가 같다: 아래 1.3).

### 1.2 `MixedUseAssetMajorStdPrice.tsx`(476줄) 취득 블록 — 날짜 규칙 실측
| 변수 | 정의 (줄) | 값 | 쓰임 |
|---|---|---|---|
| `acqReferenceDate` | `:115` | `asset.acquisitionDate` (건물) | 개별주택공시가격 `referenceDate` (`:244`) |
| `acqLandReferenceDate` | `:118` | `asset.landAcquisitionDate \|\| asset.acquisitionDate` (토지) | 상가부수토지 공시지가 `referenceDate` (`:410`) |
| `canPrefillAcqLandPrice` | `:124` | `acqLandReferenceDate === asset.acquisitionDate` | 상가건물 기준시가 모달 prefill 게이트(`:385`) — 두 날짜가 다르면 prefill 끔 |
| `acqLandPerSqm` | `:103-106` | `mixedAcq \|\| phdAtAcq \|\| pre1990 derive` | 상가부분 합계 표시(`:107`) — ④와 같은 3단 |

**이미 이 파일은 「두 날짜가 다르면 서로 다른 연도의 값」임을 인지**해 모달 prefill만 막았고(`:119-124` 주석), 주택분 뺄셈 경로는 막지 않았다.

PHD 분기: `usePreHousingDisclosure` ON이면 `:236` `{!asset.usePreHousingDisclosure && …}`가 개별주택공시가격 칸 자체를 숨기고(PHD 3시점 위젯이 대신), `:253`이 양도시 칸도 숨긴다. 즉 **PHD ON에서는 `mixedAcqHousingPrice` 입력이 없다.**

용도변경 분기: Legacy `:166-177` — `partialChangeDirection !== "commercial_to_house" && !PHD`일 때만 개별주택공시가격 칸 노출(`commercial_to_house`는 「취득시 주택이 없었다」). Case A(`isMixedUseCaseA`, PHD ON 필수 — `lib/calc/mixed-use-case.ts:34-37`)는 모든 입력을 PHD ① 블록으로 통합.

### 1.3 엔진 소비 분기 (UI 노출 조건의 근거)
`transfer-tax-mixed-use-housing.ts`:
- `:247-270` `commercial_to_house` → 취득시 상가 기준시가를 면적비로 주택분에 안분. **개별주택공시가격을 쓰지 않는다** → 신규 칸 불필요.
- `:271-277` 그 외(일반 겸용 + `house_to_commercial`) → `acqLandStd = landPricePerSqm × effectiveAcqDerived.residentialLandArea`, `acqBuildingStd = max(housingPrice − acqLandStd, 0)`. **여기가 결함 지점.**
- PHD 분기(`:135` `if (housingAcqResult.phdResult)` ~ `:246`) → `phd.landHousingAtAcquisition` 등 PHD 산출값. 뺄셈 경로를 타지 않는다.
- 이 `acqLandStd/acqBuildingStd`가 `:279-301`에서 (a) 취득가액 토지:건물 안분 비율 `acqLandRatio`, (b) 개산공제 base, (c) 상속·증여·실가 필요경비 `splitDeemedExpense` 비율의 입력이 된다 → **환산·실가·감정·매매사례·상속·증여(비PHD) 전 모드가 영향**. 따라서 신규 칸은 취득방식과 무관하게 같은 술어로 노출한다.
- 면적 `effectiveAcqDerived` = `computeAcqDerivedAreas`(`transfer-tax-mixed-use-helpers.ts:63-96`) — 용도변경 없으면 양도시 derived 그대로, 있으면 취득시 면적. **UI는 취득시 면적을 재계산하지 않는다**(dual-truth 회피) — Legacy에서는 면적 미전달(§2.3).

### 1.4 현행 목업 (용도변경 없음, PHD OFF, 날짜 다름)
```
┌ ② 주택 기준시가 ───────────────────────────────────────────────────────┐
│  (취득)                                                                    │
│  [토글 amber] 취득 당시 개별주택가격 미공시 (§164⑦ 3-시점 환산)   [ OFF ] │
│  ┌ amber-50/40 ────────────────────────────────────────────────────┐    │
│  │ 개별주택공시가격   [ 공시연도 ▼ ][조회]   [ 300,000,000 ]            │    │  ← 기준일 = 건물 취득일 (2010-03-15)
│  │   hint: 미공시 시 비워두세요 — 위 §164⑦ 토글 사용                    │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│  ┌ emerald-50/40 ─ 양도시 ─────────────────────────────────────────┐    │
│  │ 개별주택공시가격 …                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────────────┘
┌ ③ 상가 기준시가 ───────────────────────────────────────────────────────┐
│  상가건물 기준시가 (토지 제외)   [취득][양도]   [건물 기준시가 계산]      │
│  상가부수토지 개별공시지가                                                 │
│  ┌ amber ─ 취득시 ─────────────────────────────────────────────────┐    │
│  │ 공시지가 연도(자동) | 개별공시지가(원/㎡) [ 2,500,000 ] | 토지기준시가 │    │  ← 기준일 = 토지 취득일 (2005-06-10)
│  └─────────────────────────────────────────────────────────────────┘    │
│  ┌ emerald ─ 양도시 ─ …                                              ┐    │
└────────────────────────────────────────────────────────────────────────┘
```
→ ②의 주택가격(2010 기준)에서 엔진이 ③의 공시지가(2005 기준)×주택부수토지를 뺀다. 사용자는 이 뺄셈이 일어나는 것도, 두 값이 다른 해라는 것도 화면에서 알 수 없다.

### 1.5 변경 후 목업 (날짜 다름 ∧ PHD OFF ∧ 주택가격 입력됨)
```
┌ ② 주택 기준시가 ───────────────────────────────────────────────────────┐
│  (취득)                                                                    │
│  [토글 amber] 취득 당시 개별주택가격 미공시 …                     [ OFF ] │
│  ┌ amber-50/40 ────────────────────────────────────────────────────┐    │
│  │ 개별주택공시가격 (건물 취득일 2010-03-15 기준)  [ 300,000,000 ]      │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│  ┌ ToneCard amber (신규) ─ data-testid="mixed-acq-land-price-at-building-acq" ┐
│  │ 주택부수토지 개별공시지가 — 건물 취득일 기준                  [법령 모달*]  │
│  │ 토지 취득일(2005-06-10)과 건물 취득일(2010-03-15)이 달라, 개별주택공시가격과  │
│  │ 같은 날짜의 토지 공시지가가 따로 필요합니다.                                 │
│  │ ┌ 공시지가 연도 ──┬ 개별공시지가 (원/㎡) ────────┬ 토지기준시가 ─┐        │
│  │ │ 2010년 (자동) ▼ │ [          ] 건물 취득일 기준 …│ 주택부수토지 ×면적 │        │
│  │ └─────────────────┴───────────────────────────┴───────────────┘        │
│  │ hint: 개별주택공시가격은 토지+건물 일괄가액이라 건물분을 구하려면 같은 날짜의     │
│  │       토지분(공시지가×주택부수토지 면적)을 빼야 합니다. ③의 토지 취득일 기준 값으로  │
│  │       대신하지 않습니다.                                                    │
│  └───────────────────────────────────────────────────────────────────────┘  │
│  ┌ emerald ─ 양도시 ─ …                                                  ┐    │
└────────────────────────────────────────────────────────────────────────┘
┌ ③ 상가 기준시가 ───────────────────────────────────────────────────────┐
│  상가부수토지 개별공시지가  (토지 취득일 기준)        ← 캡션 1줄 신규 (날짜 다를 때만) │
│  …(기존 칸 무변경)…                                                         │
└────────────────────────────────────────────────────────────────────────┘
```
*법령 모달: 엔진 설계 §8 확정 전에는 **삽입 금지**(미확인 인용 금지 — 루트 CLAUDE.md 검증 기준). 확정되면 `LawArticleModal`을 `titleExtra`에 단다.

---

## §2 ⑤ 신규 입력칸 명세

### 2.1 노출 술어 (단일 소스) — 3중 패턴의 핵심
신규 leaf `lib/calc/mixed-use-acq-date-split.ts`:

```ts
/** ④가 엔진에 보내는 두 취득일과 같은 규칙 — 토지일 미입력이면 건물일로 폴백(transfer-tax-api-mixed-use.ts:142). */
export function isMixedAcqDatesSeparate(a: Pick<AssetForm,"acquisitionDate"|"landAcquisitionDate">): boolean
/** ⑤ 노출 · ④ 전송 · ⑧ 필수의 **같은 술어**. */
export function needsMixedAcqLandPriceAtBuildingAcq(a: AssetForm): boolean
/** ④·⑧이 쓰는 값 — needs=false면 0(미사용), needs=true면 parseAmount(필드). 폴백 없음. */
export function mixedAcqLandPricePerSqmAtBuildingAcq(a: AssetForm): number
```

`needsMixedAcqLandPriceAtBuildingAcq` = 다음 **전부**:
| 조건 | 근거 |
|---|---|
| `a.assetKind === "housing" && a.isMixedUseHouse` | ④ `buildMixedUsePayload` 게이트(`transfer-tax-api-mixed-use.ts:56`) |
| `isMixedAcqDatesSeparate(a)` — `(land \|\| building) !== building`, 둘 다 비어있지 않음 | ④:142가 보내는 값과 동일(플래그 `hasSeperateLandAcquisitionDate`는 ④가 보지 않으므로 술어도 보지 않는다 — Q-4) |
| `!a.usePreHousingDisclosure` | PHD ON은 개별주택공시가격 칸이 없고(`:236`) 엔진이 뺄셈 경로를 안 탄다(`housing.ts:135-246`) — 단 PHD 3시점 입력 자체의 같은 결함은 Q-3 |
| `!(a.hasPartialUsageChange && a.partialChangeDirection === "commercial_to_house")` | 엔진 `housing.ts:247-270`이 개별주택공시가격을 안 씀 |
| `parseAmount(a.mixedAcqHousingPrice) > 0` | 뺄셈의 피감수가 없으면 소비처 없음. 상속·증여에서 신고가액 override만 쓰고 보충적평가가를 비운 경우(`transfer-tax-validate-mixed-use-inheritance.ts:49` 허용 경로)에 불필요한 필수화 방지. **입력 순서도 계산 순서와 일치**(주택가격 → 같은 날 토지분) |

> 용도변경 `house_to_commercial`(Legacy, PHD OFF)은 술어가 **참**이 될 수 있다 — 엔진이 같은 `else` 분기(`housing.ts:271`)를 타기 때문(§1.3). Case A는 PHD ON 필수라 술어 거짓.

### 2.2 렌더 위치·컴포넌트
- 신규 컴포넌트 `MixedUseAcqHousingLandPriceField.tsx`(props: `asset`, `onChange`, `jibun`, `area?`, `areaKnown`). 두 레이아웃에서 **1줄로 import·삽입**해 중복 방지(Legacy·AssetMajor 이중 복사 금지 — 본 저장소가 이 중복으로 여러 번 어긋남: `Legacy:81-85` 취득 합계가 1990 환산 fallback 누락된 채 남은 사례, AssetMajor `:96-102` 주석).
- **AssetMajor**: `:236-249` `!PHD` 블록 안, `<StandardPriceInput … 개별주택공시가격>`의 amber 박스 **바로 아래**(같은 `!asset.usePreHousingDisclosure` 가드 안). 술어는 컴포넌트 내부에서 호출하고 false면 `null` 반환 — 호출부는 무조건 렌더.
- **Legacy**: `:166-177` 개별주택공시가격 블록 바로 아래(`!isCaseA` 가드 안 — 이미 `:166-167`이 PHD OFF·방향 가드).
- 컨테이너는 `<ToneCard tone="amber" title="…">`(루트 CLAUDE.md: 안내·섹션 카드는 ToneCard, 인라인 톤 하드코딩 금지). tone = **amber**(취득 시점 축, `AssetMajor`의 취득 sub-block과 동일 — 지시문 tone 매핑표).

### 2.3 `LandPriceLookupField` 인자
| prop | 값 | 근거 |
|---|---|---|
| `pricePerSqm` | `asset.mixedAcqLandPricePerSqmAtBuildingAcq ?? ""` | stale sessionStorage 방어(§3.3) — 폴백은 `""`뿐, 다른 필드로 대체 **금지** |
| `onPricePerSqmChange` | `(v) => onChange({ mixedAcqLandPricePerSqmAtBuildingAcq: v })` | 단일 키 patch |
| `referenceDate` | `asset.acquisitionDate` (**건물 취득일**) | 추천 연도 `recommendLandPriceYear`(`lib/utils/land-price-year.ts:22`: 5월 이하 전년도) |
| `jibun` | 상위에서 받은 `jibun` | 기존 칸과 동일 |
| `area` | AssetMajor: `computeDerivedAreas(...).residentialLandArea`(`:71-85`의 `derived` 재사용, 0이면 `undefined`) / **Legacy: 미전달 + `hideLandStdPrice`** | Legacy `house_to_commercial`의 면적은 엔진이 취득시 면적(`computeAcqDerivedAreas`, 사용자 입력 `partialChangeAcqResidentialArea`)으로 산정 — UI가 재계산하면 dual-truth(memory `feedback_ui_engine_dual_truth_avoidance`). 사용자가 보는 것은 ㎡당 단가이고 곱셈은 엔진·결과 화면(⑦)이 한다 |
| `label` | `"주택부수토지 개별공시지가 (원/㎡) — 건물 취득일 기준"` | 기존 칸 라벨 `"개별공시지가 (원/㎡)"`(`:412`)와 **전체 문자열이 다르다** — `getByLabelText`·`getByPlaceholderText` exact 매칭 충돌 방지(memory `feedback_new_widget_breaks_uniqueness_selectors`) |
| `placeholder` | `"건물 취득일 기준 개별공시지가 /㎡"` | 숫자 예시 금지 규칙(루트 CLAUDE.md). 기존 `"취득시 개별공시지가 /㎡"`(`:413`)와 다른 전체 문자열 — 기존 anchor 2건(`mixed-use-stdprice-point-order.anchor.test.tsx:75-76`·`mixed-use-transfer-landprice-fallback.anchor.test.tsx:142`)이 이 문자열을 exact `getByPlaceholderText`로 잡으므로 **이 문자열을 재사용하지 말 것** |
| `hint` | 아래 2.4 | |
| `data-field` | `"mixedAcqLandPricePerSqmAtBuildingAcq"` | ⑧ `fieldError` 앵커 — 술어 참일 때만 마운트되므로 오류가 나는 순간 항상 DOM에 있다(「막다른 길」 방지 — memory `feedback_blocked_message_is_not_missing_input_path`) |
| `pricePerSqmTestId` | `"mixed-acq-land-price-at-building-acq-input"` | E2E (`LandPriceLookupField.tsx:66`) |
| `landStdPriceTestId` | `"mixed-acq-land-std-at-building-acq"` (AssetMajor만) | 같은 화면 인스턴스 3개 공존 → 고정 testid 박지 말고 호출부가 부여(`:61` 주석) |
| 래퍼 testid | ToneCard 안쪽 `<div data-testid="mixed-acq-land-price-at-building-acq">` | ToneCard는 testid 미전달(memory `feedback_shared_card_testid_not_forwarded`) → 내부 div에 부여 |

**1990.8.30. 이전 환산 폴백을 두지 않는다.** 이 칸이 필요한 경로는 「개별주택공시가격이 공시된 건물 취득일」이다 — 개별주택가격은 2005년부터 공시되므로(미공시는 PHD ON → 술어 거짓) 건물일 기준 공시지가는 항상 조회 가능한 시기다. 기존 `mixedAcqLandPricePerSqm()`의 `phd`·`pre1990` 폴백(`api-mixed-use.ts:47-53`)을 이 칸에 확장하면 「토지일 값으로 메우기」가 된다.

### 2.4 문구
- ToneCard title: `주택부수토지 개별공시지가 — 건물 취득일 기준`
- 안내문(본문 `p.text-caption`): `토지 취득일({landDate})과 건물 취득일({buildingDate})이 달라, 위 개별주택공시가격과 같은 날짜의 토지 공시지가가 따로 필요합니다.` — **두 날짜를 문구에 직접 표기**한다(상속·증여에서 보이지 않는 stale 토지일이 술어를 켜는 경우에도 사용자가 이유를 알 수 있다 — Q-2).
- hint(`LandPriceLookupField hint`): `개별주택공시가격은 토지+건물 일괄가액이라, 건물분을 구하려면 같은 기준일의 토지분(공시지가 × 주택부수토지 면적)을 빼야 합니다. ③ 상가부수토지 개별공시지가(토지 취득일 기준)로 대신하지 않습니다.`
- 법령 인용: **보류**(엔진 설계 §8 확인 후). 「소득세법 시행령 §164⑤·§166⑥」 등 후보를 지금 박지 않는다.
- 금지어: 납세자 유리/불리·절감 표현 없음. 「원」 접미 표기 없음(memory `feedback_no_won_suffix`) — 단위는 라벨의 `(원/㎡)`만.

### 2.5 대안 B (사용자가 「나란히」 고수 시)
③ 「상가부수토지 개별공시지가」 취득 amber 박스(`:403-415`) **바로 아래**에 같은 컴포넌트를 둔다(술어 동일). 단점은 §0 (c). 컴포넌트가 위치 무관이라 이동 비용은 삽입 줄 이동뿐이다. 이 경우 ⑧ 오류 이동 시 사용자가 ③까지 스크롤해야 하므로 ② 주택가격 입력 직후 흐름이 끊긴다.

### 2.6 ③ 기존 칸 캡션 (날짜 다를 때만)
`:402` 소제목 `상가부수토지 개별공시지가` 옆에 `<span className="text-caption text-slate-500">토지 취득일 기준</span>`을 `isMixedAcqDatesSeparate(asset)`일 때만 추가. **기존 라벨·placeholder·testid·소제목 텍스트는 변경하지 않는다.** 역방향 grep(`상가부수토지 개별공시지가`): 소스 2건(`MixedUseAssetMajorStdPrice.tsx`·`MixedUseLegacyStdPrice.tsx`) + 테스트는 `__tests__/lib/calc/mixed-use-asset-major-baseline.anchor.test.ts:49` **주석 1건뿐**이고 e2e 선택자로는 쓰이지 않는다 — 그래도 span은 별도 요소로 추가해 소제목 텍스트 노드를 그대로 둔다.

### 2.7 활성화 시나리오 매트릭스
| # | 시나리오 | 날짜 | PHD | 용도변경 | 주택가격 | 칸 |
|---|---|---|---|---|---|---|
| 1 | 겸용·매매·실가/환산/감정/매매사례 | 같음 | OFF | 없음 | 입력 | 숨김 |
| 2 | 위와 동일 | **다름** | OFF | 없음 | 입력 | **노출·필수** |
| 3 | 위와 동일 | 다름 | OFF | 없음 | 미입력 | 숨김(주택가격 ⑧이 먼저 차단) |
| 4 | 겸용·PHD ON | 다름 | ON | — | (칸 없음) | 숨김 (Q-3) |
| 5 | 겸용·`house_to_commercial` Case B(PHD OFF) | 다름 | OFF | house_to_commercial | 입력 | **노출·필수**(Legacy) |
| 6 | 겸용·`house_to_commercial` Case A | 다름 | ON(필수) | — | — | 숨김 |
| 7 | 겸용·`commercial_to_house` | 다름 | OFF | commercial_to_house | (칸 없음) | 숨김 |
| 8 | 겸용·상속/증여, 보충적평가가 입력 | 다름(stale 포함) | OFF | 없음 | 입력 | **노출·필수** (Q-2) |
| 9 | 겸용·상속/증여, 신고가액 override만 | 다름 | OFF | 없음 | 미입력 | 숨김 |
| 10 | 일반 주택(비겸용)·일반건물 | — | — | — | — | 렌더 경로 없음(컴포넌트가 `isMixedUseHouse` 게이트) |
| 11 | 겸용·다자산(companion) | 자산별 | 자산별 | 자산별 | 자산별 | 자산 카드마다 독립(`asset` prop 기준 — 폼-전역 상태 금지) |

---

## §3 ①②③ 폼 타입·initial·normalize

### 3.1 ① 타입
`lib/stores/calc-wizard-asset-gb.ts:340` `mixedAcqLandPricePerSqm: string;` 바로 아래:
```ts
/**
 * 취득시 ㎡당 개별공시지가 — **건물 취득일 기준** (원/㎡, 문자열). 토지·건물 취득일이 다를 때만 쓰인다.
 * 개별주택공시가격(건물 취득일 기준)에서 같은 날짜의 주택부수토지분을 빼는 용도 — 토지 취득일 기준인
 * `mixedAcqLandPricePerSqm`과 **다른 값**이며 서로 대체하지 않는다. 노출·전송·필수 술어:
 * `lib/calc/mixed-use-acq-date-split.ts` `needsMixedAcqLandPriceAtBuildingAcq`.
 */
mixedAcqLandPricePerSqmAtBuildingAcq: string;
```
non-optional 선언(기존 `mixed*` 필드와 동일). `AssetForm`은 이 slice를 extend(`calc-wizard-asset.ts:66`) — `calc-wizard-asset.ts` 자체는 929줄이라 **그 파일에 직접 추가하지 않는다**(slice 파일 400줄).

### 3.2 ② initial
`lib/stores/calc-wizard-asset-mixed-use.ts`:
- `MIXED_USE_DEFAULTS: Pick<AssetForm, …>`(`:40-77`)의 키 목록에 `| "mixedAcqLandPricePerSqmAtBuildingAcq"` 추가 + 값 `mixedAcqLandPricePerSqmAtBuildingAcq: ""`(`:92` 아래). `Pick` 목록에 빠뜨리면 컴파일러가 객체 리터럴 excess property로 잡는다. factory는 `...MIXED_USE_DEFAULTS` 스프레드(`calc-wizard-asset-factory.ts:387`)라 별도 변경 없음.

### 3.3 ③ normalize + stale sessionStorage 가드
- `migrateMixedUseFields`(`:179` 아래): `if (!a.mixedAcqLandPricePerSqmAtBuildingAcq) a.mixedAcqLandPricePerSqmAtBuildingAcq = "";`
- **그러나 이 backfill은 현행 포맷으로 저장된 sessionStorage에는 안 돈다**(memory `feedback_new_asset_field_stale_sessionstorage_guard` — `migrateAsset`는 legacy 포맷일 때만). 따라서 **접근부 2종을 모두 방어**한다:
  1. UI READ: `LandPriceLookupField pricePerSqm={asset.mixedAcqLandPricePerSqmAtBuildingAcq ?? ""}` (컴포넌트 내부)
  2. leaf `mixedAcqLandPricePerSqmAtBuildingAcq(a)`는 `parseAmount(a.mixedAcqLandPricePerSqmAtBuildingAcq)` — `parseAmount`는 `null/undefined`를 0으로 돌려주므로(`CurrencyInput.tsx:22-23` 확인) stale undefined에도 안전하다. ④·⑧ 모두 이 leaf를 경유하므로 한 곳에서 방어된다.
- **새 필드를 읽는 모든 곳은 leaf 또는 컴포넌트 둘뿐**이다(직접 `asset.mixedAcqLandPricePerSqmAtBuildingAcq` 참조 금지) — 가드가 한 곳에 모이는 설계.
- `STEP_MIGRATION`·`migrateLegacyForm` 변경 없음(단계 인덱스 불변).

### 3.4 날짜를 같게 되돌릴 때의 값 처리
- **store 값을 지우지 않는다.** 지우려면 날짜 onChange(`CompanionAcqDateSection`, 공용 컴포넌트·타 자산 종류와 공유)나 `useEffect → store`가 필요한데, 전자는 14지점 밖의 공용 컴포넌트 오염, 후자는 **금지 정책 1번**이다.
- 대신 **술어가 거짓이면 칸 미렌더 · ④ 미전송 · ⑧ 미요구** — 값이 남아 있어도 엔진에는 닿지 않는다(「범위 밖이면 보내지 않는다」 — `transfer-tax-api-mixed-use.ts:200-207` 주석의 Q20 규약과 동일).
- 알려진 한계(수용): 날짜를 다른 값으로 바꿔 술어가 다시 참이 되면 **이전에 입력한 값이 다른 연도 기준으로 다시 나타난다**. 형제 필드 `mixedAcqHousingPrice`(건물일 기준)도 날짜 변경 시 지워지지 않는 현행과 같은 성질이라 일관 — 대신 칸 상단 안내문이 현재 날짜를 표기해 확인을 유도한다. 지우는 UX가 필요하면 별건(`CompanionAcqDateSection` 날짜 핸들러 일괄 정리)으로.

### 3.5 TypeScript 미감지 지점
`mixedAcqLandPricePerSqm`을 참조하는 비테스트 파일을 grep(`app components lib`)으로 전수 확인함: `components/calc/transfer/mixed-use/{AssetMajor,Legacy,PreHousingDisclosureSection}.tsx`, `lib/stores/calc-wizard-asset-{gb,mixed-use}.ts`, `lib/calc/{transfer-tax-api-mixed-use,transfer-tax-validate-mixed-use-asset,transfer-tax-validate-mixed-use-inheritance,phd-acq-land-price-track}.ts`. 이 중 필드를 **개별 나열(initial·backfill)** 하는 곳은 `calc-wizard-asset-mixed-use.ts` 하나뿐이고 나머지는 읽기 전용이다. 자산 복사·세션 시드 helper가 필드를 열거하는지는 이 grep에 안 걸렸다(구조 스프레드 사용으로 보이나 Do 단계에서 `makeDefaultAsset` 스프레드 경로 1회 재확인).

---

## §4 ④ API 변환

### 4.1 전송 (`lib/calc/transfer-tax-api-mixed-use.ts:154-158`)
```ts
acquisitionStandardPrice: {
  housingPrice: parseAmount(primary.mixedAcqHousingPrice) || undefined,
  commercialBuildingPrice: mixedAcqCommercialBuildingStd(primary),
  landPricePerSqm: mixedAcqLandPricePerSqm(primary, form.transferDate),
  // 신규 — 술어 참일 때만 키를 싣는다. 거짓이면 키 자체 없음.
  ...(needsMixedAcqLandPriceAtBuildingAcq(primary)
    ? { landPricePerSqmAtBuildingAcq: mixedAcqLandPricePerSqmAtBuildingAcq(primary) }
    : {}),
},
```
- **키 이름 `landPricePerSqmAtBuildingAcq`는 가칭 — 엔진 설계 §5·§6 확정 따름.** 객체 위치(`acquisitionStandardPrice` 안 vs 최상위)도 엔진 결정.
- **자동 대체 없음**: 술어 참인데 값이 0이면(⑧이 이미 차단하므로 도달 불가지만) 0을 그대로 보낸다 — `mixedAcqLandPricePerSqm`·PHD·pre1990 값으로 메우지 않는다. 엔진 쪽에서 `undefined`(날짜 같음)와 `0`(날짜 다른데 미입력)이 구별되어야 한다 → 엔진 시니어에 요구(§9 맞출 것 ①).
- 공유지분 스케일: 단가는 절대금액 아님(기준시가 전부 스케일 안 함 — `:88-97` 표, `:94`행). 변경 없음.
- `form.transferDate`는 이 값에 필요 없다(폴백 없음).

### 4.2 ⑬ body spread
`buildMixedUsePayload`가 `mixedUse` 객체를 **통째로** 만들어 반환하므로(`:61`) callTransferTaxAPI body에 별도 필드 추가 불필요. 단 명시 매핑(spread 아님)이라 위 `acquisitionStandardPrice` 안에 **직접 적어야** 한다(`:1-9` 헤더 경고 — 신규 필드를 여기 안 쓰면 침묵 strip).

### 4.3 ⑫ Zod (엔진 시니어 영역 — UI 관점 필수 사항 고지)
`lib/api/transfer-tax-schema-mixed-use.ts:51-53` `acquisitionStandardPrice: mixedUseStandardPriceSchema.extend({ housingPrice })` — `mixedUseStandardPriceSchema`(`:32-36`)는 비엄격 `z.object`(확인함)라 **알 수 없는 키를 조용히 제거**한다. 이 스키마는 `transferStandardPrice`와 공유되므로(`:50`) 추가한다면 취득측 `.extend`(`:51-53`)에만 넣어야 한다(양도시에 필드가 생기지 않게 — 엔진 판단). 엔진 설계에서 필드를 추가하지 않으면 UI가 보낸 값이 엔진에 도달하지 못해 **결과가 바뀌지 않는데 화면은 정상**으로 보인다(memory `feedback_api_zod_schema_sync`). 신규 anchor는 **Route 레벨(Zod 경유)** 로 써야 한다(leaf 직접 호출 anchor는 ⑫ 미경유 — memory `feedback_leaf_anchor_skips_zod_layer`).

### 4.4 API 호출 지점의 3중 일치 표
| 소비처 | 함수 | 같은 술어? |
|---|---|---|
| ⑤ 노출 | `MixedUseAcqHousingLandPriceField` → `needsMixedAcqLandPriceAtBuildingAcq` | ✔ |
| ④ 전송 | `buildMixedUsePayload` → 동일 | ✔ |
| ⑧ 필수 | `validateMixedUseAsset` → 동일 | ✔ |
| ⑨~⑫ Zod 필수 refine(엔진 결정 시) | 서버 — 날짜 비교는 payload의 `landAcquisitionDate`·`buildingAcquisitionDate`로 | 의미 일치 확인 필요(§9) |

---

## §5 ⑧ validate

### 5.1 위치·규칙 (`lib/calc/transfer-tax-validate-mixed-use-asset.ts`)
`:116-122`(상가건물 기준시가·공시지가 필수) 직후, `:123` `// PHD 전용 검증` 직전에 추가:
```ts
if (needsMixedAcqLandPriceAtBuildingAcq(asset) && mixedAcqLandPricePerSqmAtBuildingAcq(asset) <= 0)
  return fieldError(
    "mixedAcqLandPricePerSqmAtBuildingAcq",
    `${label}: 건물 취득일(${asset.acquisitionDate}) 기준 주택부수토지 개별공시지가(원/㎡)를 입력하세요. 토지 취득일(${landDate})과 달라 토지 취득일 기준 공시지가로 대신할 수 없습니다. (개별주택공시가격에서 같은 날짜의 토지분을 뺍니다)`,
  );
```
- **배치 근거**: ① 주택가격 필수(`:87-89`·`:104-115`)가 먼저 차단 → 그 뒤에 이 검사(술어가 `mixedAcqHousingPrice > 0`을 포함하므로 순서가 어긋나도 모순·막다른 길 없음). ② 실거래가·감정·매매사례 블록(`:55-102`)은 **오류를 반환하거나 통과(흐름 계속)** 하고, 상속·증여 검증(`:51-52`)도 오류가 없으면 `null`로 흐름을 계속하므로 모든 취득방식이 `:116-121` 다음 줄에 도달한다.
- `landDate` = `asset.landAcquisitionDate || asset.acquisitionDate` 문자열(날짜 포맷 가공 없음 — 기존 메시지들이 날짜를 안 쓰므로 로컬 헬퍼 불필요, 문자열 그대로 표시).
- **3중 패턴 점검**: 신규 필드엔 UI display fallback이 **없다**(`?? ""`뿐) → ⑧도 폴백 없음. 기존 `mixedAcqLandPricePerSqm`의 PHD·pre1990 폴백(헬퍼 호출 `:120`·`:135`, 용도변경 `:193-199`)은 **이 칸에 인정하지 않는다**(자동 대체 금지 정책 2번).
- 1줄 중복 import 금지: `mixedAcqLandPricePerSqm`를 이미 `transfer-tax-api-mixed-use`에서 import하는 `:11-12`와 달리 신규는 leaf에서 import(순환 방지·UI에서도 import 가능).

### 5.2 앵커·E2E registry
- `data-field="mixedAcqLandPricePerSqmAtBuildingAcq"`가 `LandPriceLookupField :227`에서 ㎡당 단가 `<input>`에 붙는다. 칸이 술어 참일 때만 마운트되므로 ⑧ 오류 ⟺ 앵커 존재.
- `e2e/_helpers/validation-field-jump-cases-mixed.ts`에 **케이스 1건 추가**(§7): `field: "mixedAcqLandPricePerSqmAtBuildingAcq"`, `step: 0`, `form: mixed({ hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2005-06-10" })`, message `/^자산: 건물 취득일\(2010-03-15\) 기준 주택부수토지/`.

### 5.3 기존 ⑧ 중 영향받는 지점 — 없음 확인
- `:27-34`(토지 취득일 필수)는 `landAcquisitionDate`가 비어 있어야 같은 날짜 → 신규 술어 거짓. 날짜 입력 완료 후에야 신규 검사에 도달.
- 상속·증여(`transfer-tax-validate-mixed-use-inheritance.ts:62`)의 `mixedAcqLandPricePerSqm` 사용은 **상가분 평가 존재 플래그**일 뿐이라 불변.

---

## §6 ⑥⑦ 사이드바·결과·신고서

### 6.1 ⑥ 사이드바 — 변경 없음 (실측)
- 입력 단계 겸용 미리보기 `lib/stores/calc-wizard-store.ts:402-445`: 양도시 기준시가(`mixedTransfer*`)·면적만 읽는다. **취득시 값(`mixedAcq*`) 참조 0건** → 신규 필드 무관.
- 계산 후 `lib/stores/transfer-per-asset-summary.ts:544-548`: `mixedResult.housingPart.estimatedAcquisitionPrice + commercialPart.estimatedAcquisitionPrice` — **엔진 echo 직접 소비**. 엔진이 새 값으로 계산하면 자동 추종.
- 따라서 `computeTransferSummary`·`computeTransferPerAssetSummary` 수정 없음. (사이드바에 「주택 건물분 기준시가」를 입력 단계에서 미리 보여주지 않는다 — 재산식 금지, memory `feedback_aggregate_display_rederives_engine_value`.)

### 6.2 ⑦ 결과 카드 — 자동 추종 + 선택 보강
- `components/calc/results/mixed-use/MixedUseCalculationSections.tsx:328·340`(주택분 토지/건물 산식)은 `h.landStdPriceAtAcq`·`h.buildingStdPriceAtAcq`를 읽고, 이 echo는 엔진이 `acqLandStd`·`acqBuildingStd`로 채운다(`housing.ts` 반환부 `landStdPriceAtAcq: acqLandStd`, `buildingStdPriceAtAcq: acqBuildingStd`). **엔진이 건물일 공시지가로 뺄셈하면 개산공제 괄호 `(취득시 건물 기준시가 X × 3%)`의 X가 자동으로 새 값**이 된다. 재도출 코드 없음 — 표시가 산식을 다시 쓰는 곳은 발견되지 않았다(`components`·`lib/calc`에서 `housingPrice − landPricePerSqm×면적`을 재계산하는 코드 grep 0건).
- 신고서 4열(`FilingFormTableFinancials.ts`)·인쇄 섹션(`lib/print/mixed-use-print-sections.ts`)은 **취득시 기준시가를 직접 표기하지 않음**(grep: 기준시가 표기는 `building-std-report` 섹션 라벨 1건뿐). 취득가액·개산공제 금액만 엔진 결과에서 가져온다 → 수정 없음.
- **선택 보강 ⑦-b (엔진 echo 필요 — Q-6)**: 별개 취득에서 결과 화면이 `취득시 주택 건물분 기준시가 = 개별주택공시가격 A − 개별공시지가 B(건물 취득일 기준) × 주택부수토지 C㎡` 한 행을 보여주면 사용자가 이 수정의 효과를 검증할 수 있다. 필요한 echo: 엔진 사용 `housingPrice`·`landPricePerSqm`(어느 날짜 값을 썼는지)·`residentialLandArea`(취득시). 엔진 결과 타입 확장은 엔진 시니어 영역 — 요청만 한다. 표기 규칙: 한국어 풀어쓰기, 변수 약어·`floor` 금지, 숫자 옆 변수명 라벨(`components/calc/CLAUDE.md` 결과 산식 규칙).
- 결과 산식 행 추가 시 **공용 카드 렌더 ≠ 필드 공급**(memory `feedback_shared_card_rendered_is_not_field_fed`)·**양도세 결과뷰는 4개**(`feedback_transfer_result_view_is_not_one`)를 점검: 겸용 결과는 `MixedUseResultCard` 계열 + `DetailedCalculationStatementCard` 경로가 따로 있다 — ⑦-b를 하려면 두 곳 모두 확인(현 설계 범위 밖, 선택 항목으로만 분리).

### 6.3 `MixedUseAssetMajorStdPrice` 자동합계 박스 — 변경 없음
`:430-472` 박스는 **상가분**(토지+건물)만 계산한다. 주택 건물분 미리보기를 이 박스에 신설하지 않는다(재산식 금지).

---

## §7 E2E · 단위 anchor

### 7.1 신규 E2E spec 1건 계획 — `e2e/mixed-use-acq-landprice-at-building-acq.spec.ts`
시드 패턴: `e2e/mixed-use-filing-form-4col.spec.ts:135-173`(sessionStorage 시드 + reload) 재사용 — 포트 하드코딩 금지, `page.goto("/calc/transfer-tax")` 상대경로.

| # | 단언 | 방법 |
|---|---|---|
| E-1 | **칸 노출**: 겸용 + 토지 `2005-06-10` / 건물 `2010-03-15` + 개별주택가격 입력 + PHD OFF → `mixed-acq-land-price-at-building-acq` 보임 | 자산 카드 단계(단계 0)에서 `getByTestId` + `toBeVisible` |
| E-2 | **칸 미노출**: 같은 시드에서 토지일을 건물일과 동일하게 → 칸 `toHaveCount(0)` | `acq-date-land` 입력 → `toHaveCount(0)` (display:none이 아닌 **미렌더**임을 단언 — memory `feedback_unmounted_to_hidden_widens_every_selector`) |
| E-3 | **미입력 차단**: E-1 상태에서 "다음/계산" → 오류 문구 `/건물 취득일\(2010-03-15\) 기준 주택부수토지/` + **포커스가 신규 칸으로 이동** | `validation-field-jump-cases-mixed.ts` registry 케이스로 흡수(별도 spec 중복 금지) + spec에선 문구·포커스 1회 직접 확인 |
| E-4 | **request body 단언**: 값 입력 후 계산 → `page.waitForRequest("/api/calc/transfer")`의 JSON에서 `mixedUse.acquisitionStandardPrice.landPricePerSqmAtBuildingAcq === <입력값>` **그리고** `…landPricePerSqm === <토지일 값>` 이 서로 다른 값으로 각각 전달됨 | 키 이름은 엔진 §5 확정 후 반영 |
| E-5 | **날짜 같을 때 미전송**: 같은 시드, 토지일=건물일 → body에 해당 키 **부재**(`toBeUndefined`) | 값이 store에 남아 있는 상태에서 확인(stale 미전송 보증 — §3.4) |
| E-6 | **PHD ON 미노출**: PHD 토글 ON → 칸 부재 | |
| E-7 | **결과 반영(선택)**: 같은 시드에서 신규 칸 값을 바꾸면 결과의 `주택 건물분` 개산공제 괄호 수치가 바뀜 | Phase B0 엔진 anchor의 authoritative 값 사용 — 입력 부재로 인한 vacuous 통과 금지(memory `feedback_empty_fixture_understates_the_defect`) |

주의: **미노출 단언(E-2·E-6)에는 대응 긍정 단언(E-1)이 같은 spec에 있어야 한다**(memory `feedback_negative_anchor_needs_positive_twin`).

### 7.2 단위 anchor (vitest)
- `__tests__/calc/mixed-use-acq-date-split.anchor.test.ts` — 술어 격자(§2.7 11행 전수) + **leaf 3함수의 ④·⑧ 동일 호출 단언**(같은 입력에서 ④ 전송 여부 ⇔ ⑧ 요구 여부 일치 — 3중 패턴 회귀 가드).
- `__tests__/components/mixed-use-acq-housing-landprice-field.anchor.test.tsx` — 컴포넌트 렌더(술어 참/거짓), `referenceDate`=건물일(추천 연도 라벨 `${year}년 (자동)` — `:49` 기존 anchor 패턴), placeholder·label exact 문자열이 기존 칸과 불충돌.
- ⑧ 격자: PHD OFF·날짜 다름·값 비어 있음 → 차단 / 값 있음 → 통과 / 날짜 같음 → 통과 / PHD ON → 통과 / `commercial_to_house` → 통과 / 주택가격 비어 있음 → 주택가격 오류가 **먼저** 나옴.

### 7.3 영향받는 기존 테스트 — 역방향 grep 결과 (head로 자르지 않음)
검색어: `mixedAcqLandPricePerSqm`, `acq-date-land`·`landAcquisitionDate` 조합, `isMixedUseHouse`. **필드명 기준**(문구 기준 grep 금지 — memory `feedback_e2e_reverse_grep_by_field_not_phrase`).

**깨질 가능성 있음 (1건)**
| 파일 | 이유 | 조치 |
|---|---|---|
| `e2e/mixed-use-filing-form-4col.spec.ts:145-151` (2번째 test "토지≠건물 취득일") | 토지 `2005-06-10` ≠ 건물 `2010-03-15`, `mixedAcqHousingPrice: "300000000"`(`:34`), PHD OFF → **술어 참** → ⑧이 계산을 막아 결과 화면(신고서 4열 DOM)에 도달 못 함 | 시드에 `mixedAcqLandPricePerSqmAtBuildingAcq` 추가. ⚠️ **기존 `mixedAcqLandPricePerSqm: "2500000"`과 다른 값**을 넣어 이후 값 구분 단언 가능하게 |

**영향 없음 확인 (술어 거짓 또는 해당 화면 미경유)**
- e2e 시드 11건(`mixed-use-*.spec.ts`, `transfer-companion-mixed-use.spec.ts`, `transfer-calc-count-exclusion-row.spec.ts`)은 `landAcquisitionDate`를 두지 않음(factory 기본 `""` — `calc-wizard-asset-factory.ts:195`) → 같은 날짜 → 술어 거짓. (위 4col 2번째 test만 예외 — grep으로 e2e 전체에서 `landAcquisitionDate` + 겸용 시드 조합은 이 1건뿐.)
- `e2e/_helpers/validation-field-jump-cases-mixed.ts:61-62`: `landAcquisitionDate: ""` → 같은 날짜 → 거짓. 단 **신규 케이스를 추가**(§5.2).
- vitest 컴포넌트 anchor 4건(`mixed-use-commercial-land-price-year`·`-stdprice-modal-landprice-prefill`·`-transfer-landprice-fallback`·`-stdprice-point-order`): 토지일≠건물일인 시드가 있으나(`land-price-year :26`, `prefill :150`) **`mixedAcqHousingPrice`를 시드하지 않음**(`__tests__/components/*.tsx`에서 `mixedAcqHousingPrice` grep 0건) → 술어 거짓 → 칸 미렌더 → 영향 없음. 신규 칸 placeholder·label이 기존 칸과 **전체 문자열이 달라** exact `getByPlaceholderText`(`stdprice-point-order :75-76`, `landprice-fallback :142`) 충돌 없음.
- API route 테스트 12건(`mixed-use-merge-deeming-d9`·`surcharge-fallback`·`unregistered-reduction-d15`·`reduction-penalty-f17b`·`89-2-e7`·`win-win-rental`·`house-count-exclusion`·`surcharge-155-15ho…e14`·`unavoidable-outside-capital`·`pre-designation-contract`·`temp-two-house-oh09`·`bundled-swallows-special`): 전부 `landAcquisitionDate === buildingAcquisitionDate`(각 파일 :57~:330 직접 확인) → 엔진 쪽이 「날짜 다르면 필수」 refine을 ⑫에 걸어도 **영향 없음**. 다른 날짜 fixture는 `__tests__/api/transfer.route.zod-required-2-ex-sp-pd.anchor.test.ts` 일부(land `2010-06-01`/`2015-06-01`)가 겸용 payload인지 **확인 필요**(엔진 시니어가 ⑫ refine을 정할 때 같이 확인할 것 — 본 UI 단계에서 미확인).
- `__tests__/tax-engine/**` 엔진 fixture 중 토지일≠건물일인 파일(`mixed-use-fixture.ts` 외)은 **엔진 시니어 영역**(본 설계 범위 밖) — 엔진 필수 refine 시 영향 파악은 엔진 설계 §7.

### 7.4 수동 확인 (Do 단계 필수 · 본 설계 단계 미수행)
dev 서버 포트 3115 → 겸용 자산 추가 → 토지·건물 취득일 다르게 → 개별주택공시가격 입력 → 신규 칸 노출 → 입력 → Network 탭에서 request body 신규 키 확인(⑬ 침묵 strip 여부 — 엔진 Zod 반영 후).

---

## §8 800줄

| 파일 | 현재 | 예상 증가 | 예상 | 판단 |
|---|---|---|---|---|
| `components/calc/transfer/mixed-use/MixedUseAssetMajorStdPrice.tsx` | 476 | +10 (import 2줄·삽입 1줄·캡션 4줄·`derived` 재사용 0) | ~486 | 여유 |
| `components/calc/transfer/mixed-use/MixedUseLegacyStdPrice.tsx` | 379 | +6 | ~385 | 여유 |
| `components/calc/transfer/mixed-use/MixedUseAcqHousingLandPriceField.tsx` | 신규 | ~85 | 85 | — |
| `lib/calc/mixed-use-acq-date-split.ts` | 신규 | ~45 | 45 | — |
| `lib/calc/transfer-tax-validate-mixed-use-asset.ts` | 215 | +12 | ~227 | 여유 |
| `lib/calc/transfer-tax-api-mixed-use.ts` | 355 | +6 | ~361 | 여유 |
| `lib/stores/calc-wizard-asset-gb.ts` | 400 | +9 | ~409 | 여유 |
| `lib/stores/calc-wizard-asset-mixed-use.ts` | 199 | +4 | ~203 | 여유 |
| `lib/stores/calc-wizard-asset.ts` | 929 | 0 | 929 | ⚠️ 기존 초과(이번 작업 무관 — 건드리지 않음, 언급만) |

분리 필요 파일 없음. 신규 컴포넌트·leaf는 위 두 레이아웃 중복을 막으려는 **실사용 2곳**(AssetMajor·Legacy)이 있어 단일 사용 추상화가 아니다.

---

## §9 미결·확인 필요 (Q-n) · 엔진 시니어와 맞출 것

### 엔진 시니어와 맞출 것 (설계 확정 전 대조 항목)
1. **필드명·위치**: 엔진 `landPricePerSqmAtBuildingAcq`(가칭)와 ④ 전송 키 1:1, 객체 위치(`acquisitionStandardPrice` 내부 가정).
2. **필수 조건**: 엔진이 「날짜 다름 → 필수(없으면 throw/Zod 400)」인지 「optional, 없으면 종전 동작」인지. **UI 술어(§2.1 5조건)와 서버 refine 조건이 일치해야 한다** — 특히 (a) `mixedAcqHousingPrice > 0` 조건, (b) PHD ON·`commercial_to_house` 제외, (c) 날짜 비교가 `landAcquisitionDate || buildingAcquisitionDate`(문자열) 기준. 미입력(`undefined`)과 입력 0이 엔진에서 구별되어야 한다(날짜 다른데 미입력을 `undefined`로 보내면 종전 결함 경로로 조용히 회귀 — 이를 막으려면 ⑫ refine이 필요, UI 차단(⑧)만으로는 API 직접 호출을 못 막는다).
3. **Zod ⑫**: `mixedUseStandardPriceSchema`(`:32-36`) 또는 `acquisitionStandardPrice` extend(`:51-53`)에 필드 추가 — 누락 시 침묵 strip(§4.3).
4. **엔진이 `acqLandStd`를 어느 날짜 값으로 쓰는지**: 본 설계는 「기존 `landPricePerSqm`(토지일)은 주택 토지분·상가 토지분에 그대로, 신규 값은 주택 **건물분 뺄셈에만**」을 전제로 UI를 만들었다. 그러면 `acqTotal = acqLandStd + acqBuildingStd ≠ housingPrice`가 될 수 있다(엔진 `:278-279` `acqLandRatio` 분모 — `:279-280`). 이 전제가 틀리면(예: 토지 파트도 건물일 값 사용) UI 라벨·hint 문구를 바꿔야 한다.
5. **echo(선택, Q-6)**: 결과 산출근거 행용(`housingPrice`·사용한 `landPricePerSqm`·취득시 `residentialLandArea`).
6. **법령 근거(§8)**: hint·모달에 인용할 조문 확정 — 미확정 동안 UI는 인용 없음.

### Q-n
| Q | 내용 | 영향 | 권고 |
|---|---|---|---|
| **Q-1** | 신규 칸 **배치**: ② 주택 개별주택공시가격 바로 아래(본 설계) vs ③ 기존 토지 공시지가 칸 옆(「나란히」) | ⑤ 위치만 | ②안 — 계산 순서·오입력 방지(§0). 사용자 선호 시 §2.5 대안 B |
| **Q-2** | **상속·증여에서 stale 토지 취득일**: 이 두 취득원인은 토지 취득일 입력란이 없다(`CompanionAcqInheritanceBlock`은 `CompanionAcqDateSection` 미사용 — 확인함, `transfer-tax-validate-mixed-use-asset.ts:21-26` 주석). 사용자가 매매에서 토지일을 넣었다가 취득원인을 상속으로 바꾸면 `landAcquisitionDate`가 남아 ④(`:142`)가 그대로 엔진에 보낸다. 본 설계의 술어는 **payload 기준(④와 동일)** 이라 이 경우 신규 칸이 켜진다(칸에서 값을 넣을 수 있어 막다른 길은 아님, 안내문에 두 날짜 표기) | 술어 정의 | payload 기준 유지(3중 패턴 안전). 대안=취득원인 게이트(`purchase`만)는 stale 상태에서 엔진 refine과 어긋나 400 위험. **stale 토지일이 엔진 보유기간·LTHD에 미치는 영향 자체는 별건 조사 필요**(미실측) |
| **Q-3** | **PHD ON의 같은 계열 결함**: PHD 3시점 위젯의 취득시 토지 공시지가는 `acqLandReferenceDate`=토지일(`MixedUsePreHousingDisclosureSection.tsx:85`·`:274`)이고 취득시 건물 기준시가는 건물일인데, 엔진이 이 둘을 한 「취득시」로 합산해 P_A_est를 역산한다(`transfer-tax-pre-housing-disclosure.ts:201-216` `sumAtAcq4` — 확인). PHD 환산식(§164⑦)이 요구하는 「취득 당시」가 단일 일자인지 법령 확인 필요 | B0 범위 | 본 B0는 PHD OFF만. **PHD는 별건 후보 — 엔진 설계 §4(B0 범위 결정)에서 포함 여부 결정 필요.** 포함 시 신규 칸은 PHD 위젯 안 `acqLandReferenceDate` 처리와 함께 재설계 |
| **Q-4** | **분리 토글 OFF 후 stale 토지일**: `onHasSeperateLandAcquisitionDateChange`(`CompanionAcquisitionCauseSection.tsx:233-246`)는 OFF 시 `landAcquisitionDate`를 비우지 않고, ④(`:142`)는 `hasSeperateLandAcquisitionDate` 플래그를 보지 않는다. migrate는 새로고침 때만 정규화(`calc-wizard-asset-migrate.ts:566-568`). → 화면은 단일 날짜인데 엔진엔 stale 토지일이 간다(기존 동작, B0 이전부터). 신규 술어도 플래그를 보지 않아 ④와 일치시켰다 | 술어·별건 | 별건 버그로 분리(토글 OFF patch에 `landAcquisitionDate` 정리 or ④의 날짜 도출을 플래그 반영). **이 별건을 B0에 끼우지 말 것** — 세액이 바뀌는 별개 변경 |
| **Q-5** | **같은 달력 연도 내 다른 날짜**: 예) 토지 2010-01-05 / 건물 2010-11-20 → 날짜는 다르나 공시지가 기준 연도는 같을 수 있다. 술어는 날짜 문자열이 기준이라 칸이 켜진다(사용자가 같은 값을 다시 입력). 연도 기준 판정은 불가 — 연도는 `LandPriceLookupField` 내부 `selectedYear`(수동 변경 가능)라 store에 없다 | UX | 수용. 「토지일 값 복사」 버튼은 **명시적 사용자 클릭**이라 정책 2번(자동 안분 금지)에 저촉되지 않으나 B0 범위 밖 — 필요하면 후속 |
| **Q-6** | 결과 산출근거 행 ⑦-b(건물분 = 개별주택가격 − 공시지가×면적) 신설 여부 + 엔진 echo | ⑦ | 사용자 검증성 측면에서 권고. 엔진 결과 타입 확장 필요 → 엔진 시니어 결정 |
| **Q-7** | **상가분 합계의 날짜 혼합(V-10)**: 상가분은 `상가부수토지(토지일) + 상가건물 기준시가(건물일)`(`transfer-tax-mixed-use-helpers.ts:179-182`, `AssetMajor :103-109`)을 합산한다 — 주택분과 **동형의 날짜 혼합**이다. 다만 상가 토지분은 토지 값, 건물분은 건물 값이라 각 항목이 자기 날짜 값을 쓰는 점에서 **뺄셈이 아닌 합산**이고 각 항이 별개 자산분이다 | B0 범위 | 엔진 설계 §3(V-10)이 판정. UI는 상가 칸 변경 없음(기존 칸이 이미 각자 자기 날짜 기준). 판정이 「상가 합계도 문제」로 나오면 신규 칸 불필요(상가는 토지·건물이 이미 분리 입력)이나 합계 표시의 의미 주석 정도 |
| **Q-8** | **`house_to_commercial` Legacy에서 신규 칸 면적 미전달**(§2.3): 면적을 안 보이면 「토지기준시가 = 단가×면적」 확인 열이 빠진다 | UX | `hideLandStdPrice`로 2열 축소. 취득시 면적을 보이려면 엔진 `computeAcqDerivedAreas` 재사용(UI→엔진 import 허용 여부는 기존 `computeDerivedAreas` 선례 있음 — `MixedUseAssetMajorStdPrice.tsx:5`) — 필요 시 후속 |
| **Q-9** | ✅ 해소 — `parseAmount(undefined)`=0 (`CurrencyInput.tsx:22-23`). 컴포넌트 `pricePerSqm` prop(string 필수)에만 `?? ""` 필요 | ③ | 단위테스트로 stale undefined 1건 고정 |

### 정책 점검 (완료 보고 전 체크리스트 초안)
- [x] **useEffect → store 미러링 금지**: 날짜 변경 시 값 정리·기본값 주입을 모두 술어(display/④/⑧)로 처리 — store 쓰기 effect 없음.
- [x] **자동 안분 fallback 금지**: 신규 칸 미입력을 `mixedAcqLandPricePerSqm`·PHD·pre1990 값으로 메우지 않음. ⑧이 차단. 예외(PHD §166⑥ 면적 안분)와 무관.
- [x] **Validation 동기화**: UI display fallback 없음(`?? ""`뿐) → ④·⑧도 폴백 없음. 노출·전송·필수가 같은 leaf 함수. UI 통과 ↔ ⑧ 차단 모순 구조적으로 불가.
- [ ] 14지점: ①②③④⑤⑥(무변경 확인)⑦(무변경, 선택 보강 Q-6)⑧ — 본 문서 / ⑨⑩⑪⑫⑬⑭ — 엔진 시니어(⑬은 ④가 `mixedUse` 객체를 통째로 만들므로 별도 없음, ⑭ `...data.mixedUse` 스프레드 확인은 엔진 설계).
- [ ] 「자주 발생하는 누락 패턴」 9개 점검: 1(엔진 input→AssetForm 미반영) 방지=①, 2(API 변환)=④, 3·4(initial·normalize)=②③, 5(결과 노출)=⑦ 자동 추종·보강 Q-6, 7(활성화 조건)=§2.1, 8(토글)=해당 없음, 9(시점별 분기)=Legacy `house_to_commercial` 포함.
