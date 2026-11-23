# 기타토지 상태 이력 E3-1b 「건축물 없는 구간(나대지)의 비종합합산 주장」 — 화면·클라이언트(①~⑧) 계획서

> 상태: **Plan v1 (2026-11-23 · 코드 변경 0 · 사용자 결정 대기 — UQ-1~UQ-7)**
> 범위: E3-① 결정 기록이 «V-6은 이번에 닫고 별도 후속 E3-1b로 연다»(`nbl-state-history-e3-1-tax-type-change.ui.plan.md:349` · 엔진 `…engine.plan.md:367`)고 한 것 — **건축물이 없는 구간**(신축 앞 나대지 · 철거 뒤 신축 앞 나대지 · tax-only 이력의 나대지)이 **종합합산이 아니라 별도합산(공지상태 등)·분리과세·비과세였다는 주장**을 입력받아 판정에 쓰는 화면.
> **범위 밖(재제안 금지)**: 철거 후 재산세 한시 지위(지방세법 시행령 §103의2 — **E3-⑤**, §4에서 «묶지 않음» 의견) · 부분 면적(Q-4 (나)) · 업종 개시·폐업(M9~M11) · 주택부수토지(Q-1) · 13호 × 이력 · 과세기준일 단위 접기(V-1 일 단위 확정) · Q-15 (가′).
> 엔진 쪽은 같은 시각 별도 문서(`nbl-state-history-e3-1b-bare-land-tax-type.engine.plan.md`)가 쓴다 — **이 문서의 엔진 모델명·필드명·함수명은 «제안»**이며 어긋나면 메인 세션이 합친다(UV-3).
> 정본: `nbl-other-land-state-history.plan.md`(통합 · UV-11 철거 후 한시 지위) · `…ui.plan.md` · E3-① UI·엔진 계획서(결정 기록·구현 기록 U4).
> 모든 file:line = 워크트리 `Property-related-Taxes-nbl-e3-1b`(origin/master f0344b694) grep·Read 실측. **tsc·vitest는 이 세션에서 실행하지 않았다 — 반전 규모는 파일 정독·grep 실측이며 vitest 실측이 아니다(UV-1).**

---

## 0. 한눈에

| 항목 | 내용 |
|---|---|
| 문제 | 신축 앞 나대지 구간은 «종합합산 고정»(V-6 닫힘 — `other-land-state-history.ts:77` 주석 · `:256` derive)이고 나대지 위 구분 변경은 ⑧·⑫가 막는다(`stateEventTaxChangeWithoutBuildingMessage` — `nbl-validation-messages.ts:73`). 공지상태 별도합산이던 나대지를 가진 납세자는 과대 과세 방향의 기능 제약(엔진 계획서 T9c/T9o 실측: 신축 2023-06-01 시료 닫힘 비사업용 253,960,000 / 열림 사업용 198,210,000 — 엔진 세션 실측 인용, 이 세션 재측정 아님) |
| **UI 추천 모델** | **(a-2) «나대지 구간을 닫는 모든 사건 행에 Before + 근거를 허용»** = 신축 행(+ 철거 뒤 신축 행)의 «신축 직전 나대지 기간의 재산세 구분» + **근거** · 나대지 위 «재산세 과세 구분 변경» 행 허용(⑧ 규칙 #9 삭제). 새 사건 종류 없음 · 새 필수 질문 없음. 철거 행·건축물 위 구분 변경 행은 byte-identical |
| 추천 근거 3줄 | ① E3-① Before 사슬(«각 사건은 직전 구간을 닫고 그 구간의 구분은 그 사건의 Before»)의 **빈 칸(신축 행)을 채우는 일반화**라 모델이 새로 늘지 않는다 ② 근거 라디오 선택지·라벨·법 인용은 엔진 leaf `property-tax-basis.ts`(V1-A)를 **그대로 재사용** — 건축물 없는 토지의 «근거 없는 비종합합산 선언 = 종합합산 + 확인 필요»(역버그 방지)를 구간에도 같은 규칙으로 ③ 신축 행의 `""` = «주장 없음 = 종합합산, 고지 없음»으로 두면 **기존 이력의 판정·경고·와이어가 byte-identical** → 83건급 픽스처 반전(U1 §19.3)이 재발하지 않는다 |
| 새 칸 | 행당 **«근거»** 1개(`propertyTaxBasisBefore`, optional · 부재 = `""`) + 신축 행·나대지 위 변경 행에 **재산세 구분 4지선다**(기존 `propertyTaxTypeBefore` 재사용). 새 질문 없음 · 기존 3지선다 문구 불변 |
| E3-⑤ 결합 | **묶지 않는다(§4)** — 근거 라디오의 `demolished`(철거ㆍ멸실 부속토지)는 **면적 일부**(종전 바닥면적 × 배율)만 별도합산이라 구간(일 단위·전량) 모델과 안 맞고, 이미 `changed` + 꼬리 `demolished`(면적 초과)는 «부분 면적 → 이력 미반영»(`other-land-state-history-apply.ts:111-112` `isPartialArea`)으로 빠진다. 같은 칸·같은 자리는 비워 두어 ⑤가 나중에 `demolished` 선택지만 열면 된다 |
| ⑫ | **Zod 행 스키마에 `propertyTaxBasisBefore` 1칸 추가 필수**(`transfer-tax-schema-nbl.ts:56-60` — 빠지면 중첩 칸 **침묵 strip**) + refine #9 삭제 + `tailHasBuilding` 호출은 그대로 |
| ⑥ | 변경 없음(E3-① 실측: `computeTransferSummary` 계열에 nbl 참조 없음 — 이 세션 재확인 미수행, **확인 필요** UV-9) |
| 반전 | **§9 — 실측 28~30 케이스(약 12파일)**: 모델 (a-1)(신축 행만)이면 ≈11, (a-2)(+ #9 삭제)이면 ≈28~30. 전부 «V-6 닫힘»을 단언하던 의도된 반전이며 문구·wire byte 보호 단언(e2e 정규식 17곳 · `building_built … propertyTaxTypeBefore:""` toEqual 5곳)은 **반전 0** |
| 사용자 결정 | UQ-1(모델 범위) · UQ-2(신축 행 `""`의 뜻) · UQ-3(근거 선택지에서 `demolished` 제외) · UQ-4(근거 입력 방식) · UQ-5(호별 면적한도) · UQ-6(별도합산 근거 문구) · UQ-7(PR 분할) |

---

## 1. 현행 사실 (실측)

### 1.1 나대지 구간이 닫혀 있는 지점

| 위치 | 사실 |
|---|---|
| `lib/tax-engine/non-business-land/other-land-state-history.ts:77-81` | `eventCarriesTaxTypeBefore(kind)` = `isEventKind(kind) && kind !== "building_built"` — **신축 행의 Before는 운반하지 않는다**(V-6 닫힘). ⑭·④·③·⑤ 4곳이 이 단일 술어를 읽는다 |
| 같은 파일 `:140-171` | `stateEventSequenceIssue` — 재산세 변경 행에서 replay 상태가 «건축물 없음»이면 `stateEventTaxChangeWithoutBuildingMessage`(규칙 #9) |
| 같은 파일 `:223-290` | `deriveOtherLandStateIntervals` — 신축이 닫는 구간 = `{hasBuilding:false, propertyTaxType:"comprehensive"}` 고정 · 나대지 위 구분 변경은 `TaxCalculationError` throw |
| 같은 파일 `:290-` | `isStateIntervalBusiness` = `hasBuilding ∧ type ∈ {exempt, special_sum, separate}` — **나대지(`hasBuilding=false`)는 type과 무관하게 비사업용** |
| `lib/tax-engine/non-business-land/property-tax-basis.ts:1-30` | V1-A 근거 모델 — 건축물 **없는** 토지의 비종합합산 선언은 «근거»(`statutory_exempt`·`separate_taxation`·`vacant_state`·`demolished`)가 있어야 존중, 아니면 **종합합산 + 확인 필요**. 이 규칙은 **꼬리(양도일 현재)에만** 쓰인다 — 매퍼 `form-mapper-helpers.ts:336-342`가 `nblOtherPropertyTaxBasis`·`nblOtherDemolishedFloorArea` 단일 칸만 실음 |
| `components/calc/transfer/nbl/OtherLandPropertyTaxBasisField.tsx:30-90` | 근거 라디오 UI(90줄) — 선택지 = `propertyTaxBasisOptions(declared, hasBuilding)`(꼬리 기준), 「모름」·미선택 → amber 안내 `nbl-other-tax-basis-unconfirmed` |
| `components/calc/transfer/nbl/OtherLandStateHistorySection.tsx:177·223` | 직전 구분 칸은 `eventCarriesTaxTypeBefore(ev.kind)`일 때만(신축 행 비노출) · 첫 행 hint `:82-84`에 «건축물이 없던 기간에는 입력할 수 없습니다(나대지는 종합합산으로 봅니다)» |
| `lib/calc/nbl-other-state-history-preview.ts:57-59` | 미리보기도 같은 술어 · `meetsBuildingRequirement = isStateIntervalBusiness(iv)` |

### 1.2 근거 모델이 허용하는 것 (재사용 대상 — 이 세션 코드 확인)

`propertyTaxBasisOptions(declared, hasBuilding=false)`(`property-tax-basis.ts` 약 `:60-72`):

| 구분 선언(enum) | 사용자 라벨(`PROPERTY_TAX_TYPE_LABEL`) | 건축물 없을 때 근거 선택지 |
|---|---|---|
| `comprehensive` | 종합합산 | 묻지 않음 |
| `exempt` | 비과세·면제 | `statutory_exempt` · `unknown` |
| `special_sum` | 분리과세 | `separate_taxation` · `unknown` |
| `separate` | 별도합산 | `vacant_state`(공지상태) · `demolished`(철거ㆍ멸실) · `unknown` |

⚠ enum 이름과 라벨이 직관과 반대다(`separate` = 별도합산 · `special_sum` = 분리과세 — `OtherLandStateHistorySection.tsx:70` 주석). 라벨은 `PROPERTY_TAX_TYPE_LABEL`·`PROPERTY_TAX_BASIS_LABEL` 단일 소스를 읽는다.

### 1.3 법령 본문 확인 (KoreanLaw MCP, 이 세션 2026-11-23 조회 · 지방세법 시행령 MST 290815 · 시행 2026-10-01)

- §101③ «법 제106조제1항제2호나목에서 "대통령령으로 정하는 토지"» = **17개 호**: 1 차고용(최저보유차고면적 1.5배 이내) · 2 건설기계 주기장·옥외작업장(1.5배) · 3 자동차운전학원 · 4 야적장·컨테이너 장치장·보세창고(최대면적 1.2배) · 5 자동차관리사업용 · 6 검사용 · 7 물류단지시설용 · 8 레미콘 제조업용 · 9 체육시설용 · 10 박물관·미술관·동물원·식물원 야외전시장 · **11 부설주차장 설치기준면적 이내** · 12 법인묘지 · 13 임야(스키장·골프장·관광단지·준보전산지) · 14 종자업 · 15 양식업 · 16 견인차 보관 · 17 폐기물 매립용.
- ⇒ 사용자가 «나대지였지만 고지서가 별도합산»이던 전형 = **면허·등록·허가를 받은 사업의 시설용 토지**(차고지·주기장·주차장·체육시설 등). 각 호에 **면적 한도**(1.5배·1.2배·설치기준면적)가 있다 — V1-A가 이미 «호별 면적 한도 확인 필요»로 고지만 하고 한도를 입력받지 않는 이유(다목 호별 축과 겹침 — 엔진 E3-① 계획서 §4)와 같다.
- §101①2호 단서는 «허가 등을 받아야 할 건축물로서 허가 등을 받지 아니한 건축물 … 사용승인을 받지 아니하고 사용 중인 건축물의 부속토지는 제외»(E3-① R1) — 이 계획의 «건축물 없는 구간»과 다른 축(건축물이 있는 구간 → E3-①이 처리).
- 새 조문 인용을 UI 문구에 더하지 않는다 → manifest 등록 불필요(UV-8: 엔진 계획서가 §101③·§103의2 등을 새로 인용하면 그쪽 소관).

### 1.4 사건 종류별 «닫는 구간» 정리 (E3-① Before 사슬)

| 사건 행 | 닫는 구간 | 현행 Before | E3-1b |
|---|---|---|---|
| 건축물 신축 | **나대지**(소유 시작 또는 직전 철거 이후) | 뜻 없음(종합합산 고정) | **구분 + 근거**(신규) |
| 건축물 멸실·철거 | 건축물 있음 | 구분(5지선다 · `""`=모름) | 불변 |
| 재산세 과세 구분 변경 | 건축물 **있음** | 구분(5지선다) | 불변 |
| 재산세 과세 구분 변경 | 건축물 **없음**(나대지) | **차단(#9)** | **구분 + 근거**(신규 · #9 삭제) |
| 꼬리(양도일 현재) | 마지막 상태 | 현행 입력 `nblOtherPropertyTaxType` + V1-A 근거 칸 | 불변(나대지 꼬리도 이미 V1-A) |

---

## 2. 사용자 시나리오 — 무엇을 알고 무엇을 모르는가

### 2.1 시나리오

| # | 상황 | 사용자가 아는 것 | 입력(추천 모델) |
|---|---|---|---|
| B1 | **신축 앞 나대지가 별도합산(공지상태)이었다** — 소유 시작 후 몇 년간 주차장·차고지·주기장 등으로 사업에 쓰다 건물을 지음 | 그때 **재산세 납세고지서의 과세구분 = 별도합산**, 그 토지가 사업(면허·등록·허가) 시설용이었다는 사실 | 신축 행: 「신축 직전 나대지 재산세 구분」 = 별도합산 · 근거 = 공지상태 |
| B2 | 신축 앞 나대지가 **분리과세**였다 | 고지서 과세구분 = 분리과세 | 구분 = 분리과세 · 근거 = 분리과세대상 토지 |
| B3 | 신축 앞 나대지가 **비과세·면제**였다(공공용 사용 등) | 고지서에 비과세·면제 표기 | 구분 = 비과세·면제 · 근거 = 비과세·면제 토지 |
| B4 | 나대지 내내 종합합산(대다수) 또는 **모름** | 아무것도 입력하지 않아도 됨 | 신축 행 구분 = 기본(종합합산) — **입력 없음 = 현행과 동일** |
| B5 | 나대지로 두다 **중간에 공지상태 별도합산으로 바뀌었다**(예: 주차장 개시) 후 지금도 나대지로 양도 | 변경 시기(고지서 연도) · 변경 전 종합합산 · 양도일 현재 별도합산 + 근거(공지상태) | 구분 변경 행(나대지 위): 변경 직전 = 종합합산 · 꼬리 = 양도일 현재 칸(별도합산 + V1-A 근거 칸 — 기존) |
| B6 | 반대로 **공지상태 별도합산이던 나대지가 종합합산으로 바뀌었다** | 변경 전 별도합산 + 근거 | 구분 변경 행(나대지 위): 변경 직전 = 별도합산 · 근거 = 공지상태 · 꼬리 = 종합합산 |
| B7 | 구분은 알지만 **근거를 모른다** | 고지서 과세구분만 | 근거 «모름»/미선택 → **종합합산 + 확인 필요**(V1-A와 동일 · 막지 않음) |
| B8 | 철거 후 1년 안에 별도합산이던 기간(영 §103의2) | 철거일 · 고지서 | **E3-⑤ — 이 계획에서 입력받지 않는다**(§4) · 유예기간 입력 안내(`NBL_STATE_HISTORY_GRACE_ROW_NOTICE`)로 갈음 |

### 2.2 알고 모르는 것 → 칸 설계 원칙

- 사용자는 **고지서의 «과세구분»**을 안다(철거·변경 행 hint가 이미 같은 출처를 가리킴 — `OtherLandStateHistorySection.tsx:196-208`). 그 구분이 **왜** 비종합합산이었는지(공지상태 17종 중 어느 호인지 · 면허 보유)는 고지서에 안 나와 모를 수 있다 → 근거 선택은 **사실 질문**(V1-A 철학: 결론 대신 사실·출처 — `OtherLandPropertyTaxBasisField.tsx` 머리주석)으로 묻고 **모르면 «모름»을 고르게** 한다(막지 않음).
- 사용자가 모르는 것: §101③ 호별 면적 한도 충족 여부(고지서는 별도합산을 부과했을 뿐 한도 충족을 증명하지 않을 수 있다) → 한도는 입력받지 않고 **확인 필요 고지**(UQ-5).
- 이력에 «아무 주장도 하지 않는» 사용자가 대다수다 — 신축 행의 기본값이 종합합산이어야 현행이 불변이다(UQ-2).

### 2.3 칸 · 문구 · hint (placeholder 숫자 예시 금지 — FieldCard `hint`)

**신축 행** (새 카드 «신축 직전 나대지 기간의 재산세 구분»):

- 라벨: 「신축 직전 나대지 기간의 재산세 구분」(선택지 4개: 비과세·면제 / 분리과세 / 별도합산 / 종합합산 — 기본 표시 = 종합합산)
- hint: 「건축물이 없던 기간(소유 시작 또는 직전 철거 이후 ~ 신축일 전날)의 재산세 납세고지서 과세구분입니다. 종합합산이었거나 모르면 그대로 두세요 — 종합합산으로 판정합니다. 별도합산·분리과세·비과세였다면 선택하고 아래에서 근거를 고르세요.」
- 선택지는 `PTAX_OPTIONS`의 «모름» 제외 4개(신축 행의 `""` = 주장 없음 = 종합합산 — UQ-2).

**근거 카드**(구분이 종합합산이 아닐 때만 — 엔진 술어 `propertyTaxBasisOptions(declared, false)` 단일 소스 · `demolished` 제외 — UQ-3):

- 라벨: 「그 구분의 근거」
- hint: 「건축물이 없는 토지에 「{별도합산}」이 부과된 근거입니다. 재산세 과세내역(고지서)과 해당 사업의 면허·등록·허가로 확인해 고르세요 — 모르면 「모름」을 고르면 됩니다.」(V1-A hint `OtherLandPropertyTaxBasisField.tsx:57`의 «근거입니다 … 고르세요» 문구와 같은 계열 · 「{}」는 `PROPERTY_TAX_TYPE_LABEL`)
- 선택지: `PROPERTY_TAX_BASIS_LABEL` 라벨 + `PROPERTY_TAX_BASIS_LEGAL` description 그대로(공지상태 = 「지방세법 시행령」 제101조제3항 인용 — 엔진 상수).
- 미선택·모름 amber 안내: **새 엔진 상수 필요**(R-4) — 방향: 「근거를 고르지 않거나 모름이면 이 나대지 기간은 종합합산으로 보아 판정하고 확인 필요로 표시합니다(근거 없이 별도합산·분리과세·비과세를 인정하지 않습니다).」 V1-A 문구(`…-unconfirmed`)를 «이 구간»으로 바꾼 변형.
- 근거가 `vacant_state`이면 보조 안내(고지 상수 R-4): 「공지상태 별도합산은 사업별 면적 한도(차고지 최저보유차고면적의 1.5배 등)가 있습니다 — 이 계산은 한도를 판정하지 않고 선언을 근거 선택으로 받아들입니다. 확인 필요.」(한도 수치는 문구에 넣지 않는다 — 17호별로 달라 확정 문구는 엔진 소관 · UV-5).

**나대지 위 «재산세 과세 구분 변경» 행**: 같은 카드(직전 구분 4지선다 + 근거). 라벨 「변경 직전 나대지 기간의 재산세 구분」. 건축물 위 행(5지선다 · 「변경 직전 그 토지의 재산세 구분」 — `OtherLandStateHistorySection.tsx:223-232`)과 라벨만 갈린다.

**종류 hint 첫 행**(`:82-84`): 마지막 문장을 교체 — 「… 건축물이 없던 기간에도 재산세 과세 구분이 바뀐 적이 있으면 «재산세 과세 구분 변경»을 입력합니다(나대지의 별도합산·분리과세·비과세는 근거를 함께 고릅니다).」 — **현행 hint 문장 단언 1건 반전**(`…e3-1-section-render.test.tsx:228-230`).

---

## 3. 엔진 모델 후보별 UI 영향 비교 (UQ-1)

| 후보 | 내용 |
|---|---|
| **(a-1)** | 신축 행에만 Before + 근거. 나대지 위 구분 변경(#9)은 닫아 둠 |
| **(a-2) 추천** | 나대지를 **닫는** 모든 행(신축 행 + 나대지 위 구분 변경 행)에 Before + 근거. #9 삭제 |
| (b) | **나대지 전용 새 사건 종류**(`bare_tax_type_changed` 제안) — 나대지 위에서만 허용, 건축물 위 `tax_type_changed`와 분리 |
| (c) | 기존 V1-A 근거 칸(`nblOtherPropertyTaxBasis`)을 구간에도 재사용 |

| 기준 | (a-1) | **(a-2)** | (b) | (c) |
|---|---|---|---|---|
| B1·B2·B3(신축 앞 나대지) 표현 | ✅ | ✅ | ✅(신축 + 변경 2행) | ❌ — V1-A 칸은 **꼬리 전용**: 꼬리에 건물이 있으면 선택지가 비어 숨는다(`property-tax-basis.ts` `propertyTaxBasisOptions` separate+건물 = `[]` — `OtherLandPropertyTaxBasisField.tsx:34`) |
| B5·B6(나대지 위 변경) 표현 | ❌ 막힘 유지 | ✅ | ✅ | ❌ |
| 새 사건 종류 | 0 | 0 | **+1**(종류 4지선다 — 사용자가 «건물이 그때 있었나»를 알고 종류를 골라야 함 → ⑧ 규칙 «종류 vs 상태 불일치» 추가) | 0 |
| 새 필드 | 행 칸 1(근거) | 행 칸 1(근거) | 행 칸 1 + 종류 값 1 | 필드 N(구간별 복제) |
| 위젯 변경량(`OtherLandStateHistorySection.tsx` 339줄 기준) | ≈ +70 | ≈ +90 | ≈ +130(종류 분기 추가) | 재설계 |
| ⑧ 규칙 | 신규 0 · #9 유지 | **#9 삭제 · 신규 0**(근거 미선택은 V1-A처럼 안 막음) | 신규 1~2 | — |
| 미리보기·결과 카드 | 행 문구 갈래 1 | 같음 | 같음 | — |
| ③ 복원 byte-identical | ✅(근거 키 부재 유지) | ✅ | ✅ | — |
| ⑫ Zod | 행 칸 +1 | 행 칸 +1 | 행 칸 +1 | — |
| 기존 테스트 반전 | ≈ 11 | ≈ 28~30 | ≈ 11 + 새 종류 분기 (S1~S13식 «종류가 셋뿐» 가정 추가 점검 필요) | — |
| 사용자 인지 부담 | 낮음 | **낮음**(같은 «재산세 과세 구분 변경» 종류 · 행의 건축물 상태는 시스템이 replay로 판정) | 높음(종류 선택에 상태 지식 요구) | — |

**UI 관점 추천 = (a-2)**, 단 **한 번에 하지 말고 두 PR로 단계화**(UQ-7): ① 신축 행(a-1) ② 나대지 위 변경 행(#9 삭제). 이유: (a-2)가 가장 일반적이고 사용자 모델이 단순하며(시스템이 «이 행이 나대지를 닫는가»를 replay로 정하고 근거 칸을 노출) 반전 규모의 절반 이상이 ②에 몰려 있어 ①만으로도 B1~B3(가장 흔한 사례)를 먼저 열 수 있다. (b)는 추천하지 않는다 — 사용자가 같은 일(고지서 구분이 바뀜)을 건물 유무에 따라 다른 종류로 입력해야 한다.

**(c)의 재사용 가능한 부분**: V1-A **leaf**(`PROPERTY_TAX_BASIS_*`·`propertyTaxBasisOptions`·`resolvePropertyTaxBasis`)와 **라디오 표현**은 그대로 재사용한다(UQ-4: `OtherLandPropertyTaxBasisField`의 라디오 부분을 공용 표현 컴포넌트로 추출해 2곳이 쓴다 — 단일 사용 추상화가 아니다). store 필드(`nblOtherPropertyTaxBasis`)는 꼬리 전용으로 남긴다.

---

## 4. E3-⑤(철거 후 한시 지위)와 묶을지

| 질문 | 답 |
|---|---|
| 같은 칸(근거 라디오)으로 받을 수 있나 | **자리는 같다** — 철거 뒤 나대지 구간을 닫는 행의 근거 선택지에 `demolished`(철거ㆍ멸실된 건축물 부속토지 — 영 §103의2)가 이미 V1-A 표에 있다(`property-tax-basis.ts` `separate` + 건물 없음). 노출 조건 = «이 나대지 구간이 철거 행 직후에 시작» |
| 그런데 지금 열 수 있나 | **아니오** — ① `demolished`는 **종전 바닥면적 × 영 §101② 배율 이내 부분만** 별도합산(`resolvePropertyTaxBasis` `{kind:"demolished", floorArea}` — `property-tax-basis.ts:97·118`)이라 **면적 일부**다. 이력 판정(`isStateIntervalBusiness`)은 구간 전체를 사업용/비사업용으로만 가른다. 꼬리에 `demolished`가 있고 면적이 범위를 넘으면 이미 `isPartialArea`(`other-land-state-history-apply.ts:111-112`)로 **이력을 반영하지 않고 고지**한다 ② 철거 후 «1년(빈집 3년)» 한시는 **기간 한정**이라 구간 끝을 사용자 입력이 아닌 철거일+1년으로 정해야 한다 — 새 입력(건축허가 여부·건축 외 용도 — 통합 E3 ⑤ 설명 `nbl-other-land-state-history.plan.md:80`) 없이는 판정 불가 ③ 규칙 §83의5①9호 유예 행이 철거 후 대부분 기간을 이미 덮는다(엔진 E3-① 계획서 R9) |
| 추천 | **묶지 않는다.** E3-1b의 근거 선택지에서 `demolished`는 제외(UQ-3 (가)), 대신 안내 문구로 유예기간 입력(9호 «건축물 멸실·철거·붕괴»)을 가리킨다. E3-⑤는 부분 면적(Q-4 (나)) 결정 뒤에 같은 행 카드에 `demolished` 선택지 + 종전 바닥면적 칸을 **더하기만** 하면 된다(새 행·새 종류 없음) |
| 막다른 길 방지 | 직접 API가 `demolished`를 행에 실어 오면 엔진이 V1-A의 «incompatible/unconfirmed → 종합합산 + 확인 필요»로 접는다(400 아님) — ⑧에는 해당 규칙을 두지 않는다(UI가 선택지를 안 주므로 stale 값만 가능 — 와이어 정규화가 제거). 엔진 R-8 |

---

## 5. 화면 스펙 ⑤ (추천 (a-2))

### 5.1 레이아웃 — 변경 부분(추가 카드만 · 기존 철거·건축물 위 변경 행은 byte-identical)

```
소유기간 중 건축물 유무·재산세 구분 이력                              [§168의6 기간기준]
Q. 소유기간 중 이 토지 위 건축물이 새로 생기거나 없어진 적, 또는 재산세 과세 구분이 바뀐 적이 있습니까? *   ← 불변
   ( ○ 바뀐 적 없습니다  ● 바뀐 적 있습니다  ○ 모름 )

┌ ① 건축물 사건 ───────────────────────────────────────────── [삭제] ┐   ← 신축 행(신규 칸)
│ 사건 종류 ( ● 건축물 신축  ○ 건축물 멸실·철거·붕괴  ○ 재산세 과세 구분 변경 )   hint(첫 행·§2.3 교체)
│ 사건일    [2023-06-01]   hint: 건축물이 있는 것으로 보는 첫날입니다…(불변)
│ ┌ 신축 직전 나대지 기간의 재산세 구분 ─────────────────────────────┐   ← 신규(sky? 아래 톤 표기)
│ │ ( ○ 비과세·면제  ○ 분리과세  ● 별도합산  ○ 종합합산 )              │   기본 표시 = 종합합산
│ │ hint: 종합합산이었거나 모르면 그대로 두세요 — 종합합산으로 판정합니다…
│ │ ┌ 그 구분의 근거 ─────────────────────────────────────────────┐ │   ← 구분 ≠ 종합합산일 때만
│ │ │ ( ● 공지상태 등 업무·경제활동에 활용되는 별도합산 토지 (지법 시행령 §101③)
│ │ │   ○ 모름 — 확인하지 못함 )                                      │ │   (`demolished` 제외 — UQ-3)
│ │ │ [amber] (미선택·모름) 근거 없이는 이 나대지 기간을 종합합산으로… │ │
│ │ │ [amber] (공지상태) 사업별 면적 한도는 판정하지 않습니다 — 확인 필요 │ │
│ │ └──────────────────────────────────────────────────────────────┘ │
│ └────────────────────────────────────────────────────────────────┘
└──────────────────────────────────────────────────────────────────┘
┌ ② 재산세 과세 구분 변경 (나대지) ─────────────────────────── [삭제] ┐   ← 나대지 위 변경 행(#9 삭제)
│ 사건 종류 (● 재산세 과세 구분 변경)  사건일 [____-__-__]
│ 변경 직전 나대지 기간의 재산세 구분 ( 4지선다 ) + 근거(위와 같음)
│ 변경 후: 별도합산 (양도일 현재 선언 기준)  ← 읽기 전용(E3-① U4 «변경 후» 줄 그대로)
└──────────────────────────────────────────────────────────────────┘
[ + 사건 추가 ]
양도일 현재 건축물: …  (건축물 사건 0건이면 「건축물(건물·시설물) 있음」 토글 — E3-① 그대로)
┌ 이 이력으로 나뉜 소유기간 (sky) ──────────────────────────────────┐
│ 2014-…~2023-05-31  3,xxx일  없음  별도합산(공지상태 — 근거 선택)  충족   ← 문구 갈래 신규
│ 2023-06-01~…        xxx일   있음  양도일 현재 선언 기준   결과 계산 후 확정
└──────────────────────────────────────────────────────────────────┘
```

톤: 신규 «구분 + 근거» 카드는 **행 카드(amber = 취득·분리계산) 안의 서브섹션**이므로 `FieldCard` 두 장을 amber 행 카드 안에 그대로 쌓는다(새 ToneCard 중첩 금지 — 3개 이상 연속 서브섹션 번호 배지 패턴 비적용: 행 카드 번호 `sectionNum={i+1}`이 이미 있음). 근거 라디오 tone은 V1-A 선례(`sky`)를 따르지 않고 행 카드와 같은 `amber`(같은 행 안에서 톤이 갈리면 시각 소음 — UV-6 확인 필요, 컴포넌트 `components/calc/CLAUDE.md` tone 표 재확인 후 확정).

### 5.2 위젯 상세 (`OtherLandStateHistorySection.tsx` 339줄 → ≈430줄 예상 · 800줄 정책 안)

1. **노출 술어**: 지금의 `carriesBefore = eventCarriesTaxTypeBefore(ev.kind)`(`:177`)를 **세 갈래**로 확장 — 모두 엔진 leaf 단일 소스(R-2):
   - `eventCarriesTaxTypeBefore(kind)` — 이제 신축도 true(종류 술어는 사실상 `isEventKind`).
   - `eventClosesBareInterval(events, i, tailHasBuilding)`(제안) — replay로 «이 행 직전 건축물 없음»인가. 신축 행은 항상 true · 철거 행은 항상 false · 구분 변경 행은 replay 결과.
   - 이 둘로 라벨·선택지 갈래: 나대지 닫음 = 4지선다(모름 없음) + 근거 / 건축물 닫음 = 5지선다(현행).
2. **근거 카드 노출**: 나대지 닫음 ∧ `Before ∈ {exempt, special_sum, separate}` — 선택지 = `propertyTaxBasisOptions(Before, false)` − `demolished`(제안 leaf `eventBasisOptions`). 구분 변경 시 근거 리셋(onChange 핸들러에서 `patchEvent(i, { propertyTaxTypeBefore: v, propertyTaxBasisBefore: "" })` — **이벤트 시점 쓰기** · `useEffect` 금지).
3. **종류 전환 시 리셋**(`:179` onChange): 이미 `{kind, propertyTaxTypeBefore: ""}` — 여기에 `propertyTaxBasisBefore: ""` 추가(철거 ↔ 신축 전환 시 stale 방지).
4. **건축물 토글 전환(tax-only)**: 구분 변경 행의 «나대지 닫음/건축물 닫음» 갈래가 토글에 따라 바뀐다 → 근거 값은 store에 남기고 **와이어가 갈래에 맞을 때만 전송**(3중 패턴 — §6 ④). 토글을 되돌리면 값이 복원돼 보인다(V1-A의 «숨겨진 칸 값 보존» 방침과 같음).
5. **«변경 후» 줄 · 같은 구분 안내**: 불변(`:180-196` 로직 그대로 — 나대지 위 행에도 적용).
6. **미리보기 행 «재산세 구분» 텍스트**(`rowTaxTypeText :96-100`): 현행 `!hasBuilding → "종합합산(나대지 — 고정)"`는 **주장 없음일 때 문구 그대로 유지**(`__tests__/lib/calc/nbl-state-history-section-render.test.tsx:208` 단언 보호). 나대지 + 비종합합산 선언이 **받아들여진 구간**: 「별도합산(나대지 — {근거 라벨 짧은 형})(선언)」 · 근거 미확인으로 접힌 구간: 「종합합산(나대지 — 근거 미확인 · 확인 필요)」. 이를 위해 미리보기 행에 `basisOutcome`(제안)이 필요(R-6). 짧은 형 라벨 표는 엔진 leaf에 두거나(권장) 위젯 상수(비권장 — 단일 소스).
7. **섹션 제목·부제·모드 문구**: 변경 없음(이미 «건축물 유무·재산세 구분»).
8. **한정 고지**(`:316-323` 위젯 한정 고지 = 결과 경고와 같은 문구): 나대지 근거 주장이 1건 이상이면 엔진이 다른 문구로 **대체**하면(R-4) 위젯도 같은 상수를 읽는다(E3-① U4 결정·편차 3과 같은 정책).
9. **파일 분할**: 800줄은 안전하나 행 카드가 길다 — Do에서 행 카드를 `StateEventRowCard.tsx`로 추출할지 **기회주의 판단**(현재 339 + 90 ≪ 700, 분리 의무 없음). 근거 라디오 추출은 UQ-4.

### 5.3 UI 순서 = 계산 순서

엔진은 ① 사건 시간순 구간화 → ② 각 구간 구분 결정(Before 사슬 + 근거 해석) → ③ 꼬리(현행 입력 + V1-A 근거) 판정. 행 안 순서 = 종류 → 사건일 → **구분 → 근거** → 변경 후 읽기. 근거는 구분 선택 직후(영향받는 칸 직전 원칙).

---

## 6. 클라이언트 14지점 (①~⑧ + ⑨~⑭ 확인점)

| 지점 | 변경 | 근거(실측) |
|---|---|---|
| ① 타입 | `NblOtherStateEventInput`에 **`propertyTaxBasisBefore?: "" \| PropertyTaxBasis`**(optional — 필수로 두면 이 타입 리터럴을 쓰는 테스트 ≥ 12파일이 tsc 오류) | `calc-wizard-asset-nbl-other.ts:36-45` |
| ② initial | 변경 0 — `nblOtherStateEvents: []`. **행 기본값**은 `addEvent`가 만든다(위젯 `:119-125` — 키를 쓰지 않거나 `""`) | `calc-wizard-asset-factory.ts:380` · `calc-wizard-asset-nbl.ts:180` |
| ③ normalize | `migrateNblStateHistory`(`calc-wizard-asset-migrate-nbl.ts:46-52`): 근거 값이 `PROPERTY_TAX_BASIS_VALUES` 밖이면 제거(`""`). **키가 없던 기존 행에는 키를 만들지 않는다**(`JSON.stringify` byte-identical 단언 `__tests__/lib/stores/nbl-state-history-migrate.anchor.test.ts` · `…e3-1-client.anchor.test.ts:67` 보호). 신축 행의 Before는 이제 보존(술어 true) |
| ④ API 변환 | `stateHistoryWireFields`(`nbl-other-state-history-scope.ts:60-77`): 근거 키는 **「나대지 닫음 ∧ Before ∈ 비종합합산」일 때 값이 비어 있지 않을 때만** 실음(그 밖은 키 생략 → 기존 `building_built … propertyTaxTypeBefore:""` toEqual 5곳 byte-identical: `__tests__/api/nbl-state-history-e2-route.anchor.test.ts:311` · `e2e/transfer-nbl-other-state-history-u3.spec.ts:160·242·326` · `…e3-1.spec.ts:252`). «나대지 닫음»은 leaf replay(`tailHasBuilding = asset.nblOtherHasBuilding`)로 |
| ⑤ UI | §5 | — |
| ⑥ 사이드바 | 변경 없음(E3-① 실측 — 이 계획에서 재확인은 `git grep -n "nbl\|NonBusiness" lib/stores/calc-wizard-store.ts lib/stores/transfer-per-asset-summary-helpers.ts components/calc/shared/WizardSidebar.tsx` 한 번 — UV-9) | — |
| ⑦ 결과 카드 | §7 | — |
| ⑧ validation | §8 | `transfer-tax-validate-nbl-state-history.ts:44-62` 호출부 변경 없음(leaf 안 변경) |
| ⑨⑩ | 해당 없음(새 사건 종류·새 enum 없음 — `PROPERTY_TAX_BASIS_VALUES`는 V1-A가 이미 ⑫ 보유) | `transfer-tax-schema-nbl.ts:173` |
| ⑪ | 해당 없음 | — |
| **⑫ Zod** | **행 스키마에 `propertyTaxBasisBefore: z.enum(PROPERTY_TAX_BASIS_VALUES).or(z.literal("")).optional()` 추가(필수)** — 안 하면 중첩 칸이 **침묵 strip**(`transfer-tax-schema-nbl.ts:56-60` 머리주석이 경고한 바로 그 함정). refine 입력 타입 `nblOtherStateEvents?: {kind;date}[]`(`transfer-tax-schema-nbl-refines.ts:72`)은 근거를 읽지 않으면 변경 없음(#9 삭제는 leaf 안) | — |
| ⑬ | 자동 운반(`nbl*` prefix-pick) — **body 도달 E2E로 확인**(§10) | — |
| ⑭ | `buildLandStateHistory`(`form-mapper-helpers.ts:306-320`): `StateEvent.propertyTaxBasisBefore` 운반(술어) + 신축 Before 운반 | 엔진 소관 |

**3중 패턴(정책 3)** — `propertyTaxBasisBefore`:
- ⑤ 표시: 미선택(`""`/키 없음) = 라디오 무선택 + amber 「근거가 확인되지 않았습니다」 안내(V1-A와 같은 표시 fallback)
- ④ 전송: 비어 있으면 키 생략(= `""`)
- ⑧: 규칙 없음(V1-A `unselected`도 안 막는다 — `transfer-tax-validate-nbl-other.ts:49-58`은 `demolished` 바닥면적 누락만 막음)
- ⑫: enum `""` 허용
- 엔진: `""`/부재 = unconfirmed → 종합합산 + 확인 필요

**신축 행 `propertyTaxTypeBefore`의 `""`**: 5층 모두 «주장 없음 = 종합합산(고지 없음)»(UQ-2 (가)). 철거 행·건축물 위 변경 행의 `""` = «모름 → 종합합산 + 확인 필요»(E3-① 불변)와 **뜻이 다르다** → 같은 칸에서 `""`가 두 가지로 읽히지 않도록 **술어(`eventClosesBareInterval`)가 갈래를 정하고 위젯·엔진 모두 그 술어를 읽는다**(침묵 소실 grep 게이트 확장 — §10).

`useEffect → store` 미러링 없음 · 자동 안분 fallback 없음(빈 날짜·빈 면적을 채우지 않음).

---

## 7. 미리보기·결과 카드 ⑦

| 화면 | 현행 | E3-1b |
|---|---|---|
| 입력 미리보기 열 「사업용 토지 요건」 | `isStateIntervalBusiness`(건축물 ∧ 구분 ∈ 사업용) — 나대지 = 항상 «미충족» | 나대지 + **받아들여진** 비종합합산 → «충족»(엔진 leaf R-3) · 근거 미확인은 종합합산으로 접혀 «미충족» + 문구 «근거 미확인». 열 이름·구조 불변 |
| 미리보기 행 «재산세 구분» | `rowTaxTypeText`(`:96`) | §5.2-6 갈래 2개 추가(주장 없음 문구는 불변) |
| ⑦ 결과 카드 구간표(`NblStateHistoryPeriodTable.tsx:36-` `taxTypeText`) | `propertyTaxType` echo 텍스트 + 모름 문구 | 나대지 + 비종합합산 행: 「별도합산(나대지 — 공지상태 근거)」, 접힌 행: 「종합합산(근거 미확인 — 확인 필요)」. echo에 `basisOutcome`(제안 R-6) 필요. 표 제목 불변 |
| 입력 미리보기 = 결과 구간표 | 같은 leaf 보장 | R-3 이후도 단일 leaf |
| 고지 | 결과 `warnings` | R-4 신규 상수(근거 미확인 · 공지상태 한도 · 한정 고지 변형) — **위젯과 결과 카드가 같은 상수를 읽는다** |

표시 주의: 나대지 + 별도합산 «충족»인 구간이 소유기간의 큰 부분을 차지해도 이 표는 **건축물·재산세 구분·근거만 본 것**이다(합계 문구 `:262-266`이 이미 말함) — 호별 면적 한도·수입금액비율은 계산 결과에서 확정.

---

## 8. ⑧ 검증 규칙

게이트·순서·호출 인자는 E3-① 그대로(`validateNblStateHistory` — `tailHasBuilding: asset.nblOtherHasBuilding`). 변경은 **leaf 안**.

| # | 조건 | 가리키는 칸 | ⑫ | 비고 |
|---|---|---|---|---|
| 1~8′ | 기존(모드·0행·종류·날짜·역순·같은 날·하한·양도일·같은 건축물 종류 연속) | 불변 | 불변 | 불변 |
| **9(삭제)** | 건축물 없는 구간의 재산세 과세 구분 변경 | — | **400 → 통과** | (a-2) 선택 시. (a-1)이면 유지. 메시지 함수 `stateEventTaxChangeWithoutBuildingMessage`와 derive throw(`other-land-state-history.ts:248` 인근)는 삭제 또는 도달 불가 안전망으로 축소(엔진 결정) |
| 12(신규 · 규칙 없음) | 나대지 구간 근거 미선택·모름·구분-근거 불일치 | — | — | **막지 않는다**(V1-A와 같음 — `unselected`/`unknown`/`incompatible` → 종합합산 + 확인 필요). 위젯 amber 안내만 |
| 13(신규 · 규칙 없음) | 나대지 구간 근거 = `demolished`(직접 API 전용) | — | — | 막지 않고 엔진이 unconfirmed로 접음(§4 · R-8) |

**⑧↔⑫ parity 격자 변경**: `…e3-1-validate-parity.anchor.test.ts:90-96`의 NO_BUILDING 차단 4행이 «통과»로 **반전**하고 새 행 추가 — 신축 앞 별도합산 + 근거 · 근거 미선택 · 철거 뒤 변경 + 근거 · tax-only + 토글 off + 변경 · 신축 행 구분 `""`(현행 동일). 불변식 «⑫ 400이면 ⑧도 막는다»(`nbl-state-history-u1-validate-parity.anchor.test.ts:100`)는 유지.

**필드 점프**: 신규 키 0 — 기존 `nblOtherStateEvents.${i}.kind`·`.date` 앵커(`OtherLandStateHistorySection.tsx` `data-field`) 재사용. #9 점프 케이스 1건(`e2e/_helpers/validation-field-jump-cases-nbl.ts:86`)은 **삭제**(막을 규칙이 사라짐) — 대체 점프 케이스 없음(새 차단 규칙 0). 새 입력 칸에 `data-field`를 주는 이유는 점프가 아니라 **테스트 앵커**(근거 라디오 testid 규칙: `nbl-other-state-event-${i}-ptax-${v}`는 구분 칸 재사용 · 근거는 `nbl-other-state-event-${i}-basis-${v}`).

---

## 9. 기존 테스트 반전 규모 — grep 실측 (vitest 미실행 · UV-1)

> 방법: `git grep -n` + 해당 테스트 정독. 케이스 = `it` 또는 `it.each` 1행. «반전» = 현행 단언이 모델 변경으로 **반대가 되거나 기대값이 바뀌는** 것(신규 추가 제외).

### 9.1 (a-2) 반전 목록

| # | 파일:줄 | 현행 단언 | 변경 | 케이스 |
|---|---|---|---|---|
| A1 | `__tests__/tax-engine/non-business-land/nbl-state-history-e3-1-leaf.test.ts:106` | V-6 닫힘 — 신축 행 Before 뜻 없음 | 반전(Before가 구간 구분이 됨) | 1 |
| A2 | 같은 파일 `:164` | `eventCarriesTaxTypeBefore` 신축 = false | true | 1 |
| A3 | 같은 파일 `:126` | Anchor 4 — 나대지 위 구분 변경 derive throw 4건 | 3~4건 non-throw | 1 |
| A4 | 같은 파일 `:198` | tax-only + 토글 off ⑧ 차단 + 전용 문구 | 통과 | 1 |
| A5 | 같은 파일 `:208` | 첫 건축물 사건이 신축이면 앞 구분 변경 차단 | 통과 | 1(절반) |
| A6 | 같은 파일 `:215` | 철거 뒤 구분 변경 차단 | 통과 | 1(절반) |
| A7 | `__tests__/tax-engine/_helpers/nbl-state-history-e3-1-table.ts:84-85` T9o 행 + `:109-114` `E3_REFERENCE_ROWS` T9o* | T9o = «신축 행 Before를 실어도 T9c와 같은 결과(닫힘)» | 기대 비사업용 → 사업용(3,651/3,651 — 엔진 계획서 실측 인용) · T9o* 참고 행을 본 행으로 승격 | 데이터 1행 · 소비처 `it.each` 3~4(leaf `:57` · predo `:31`·`:42` · e3-1.anchor `:137` · route `:100` 주석 — **소비처별 확인 필요**) |
| A8 | `…/nbl-state-history-e3-1.anchor.test.ts:132-137` | 신축 행 Before 엔진 input에 안 실림 | 실림 | 1 |
| A9 | `__tests__/lib/calc/nbl-state-history-e3-1-client.anchor.test.ts:53` · `:82` | ③ 신축 stale Before `""` 정규화 · ④ 같은 정규화 | 보존(근거 갈래는 replay) | 2 |
| A10 | 같은 파일 `:125` · `:170` · `:177` | 미리보기 tax-only 토글 off null · M12 토글 off ⑧ 차단 · 철거 뒤 변경 ⑧ 차단 | 통과 + 미리보기 있음 | 3 |
| A11 | `__tests__/lib/calc/nbl-state-history-wire.anchor.test.ts:59` | ④ 신축 stale Before `""` | 보존 | 1 |
| A12 | `__tests__/lib/stores/nbl-state-history-migrate.anchor.test.ts:71-76` | ③ 신축 stale Before `""` | 보존 | 1 |
| A13 | `__tests__/lib/calc/nbl-state-history-section-render.test.tsx:145-148` | «철거 행에만 5지선다(신축 행 없음)» | 신축 행에도 4지선다 | 1 |
| A14 | `__tests__/lib/calc/nbl-state-history-e3-1-section-render.test.tsx:73-78` · `:228-230` | «신축 행에는 없다» · 첫 행 hint 문장 «건축물이 없던 기간에는 입력할 수 없습니다(나대지는 종합합산으로 봅니다)» | 반전 · hint 문장 교체 | 2 |
| A15 | `__tests__/api/nbl-state-history-e3-1-route.anchor.test.ts:131` · `:~144` | ⑫ 400(tax-only 토글 off · 철거 뒤/신축 앞) | 200 | 2 |
| A16 | `__tests__/api/nbl-state-history-e3-1-validate-parity.anchor.test.ts:90-96` | NO_BUILDING 차단 4행(`blocked12:true`) | 통과 4행 | 4 |
| A17 | `e2e/transfer-nbl-other-state-history-e3-1.spec.ts:~200-223` | «건축물 없는 구간의 구분 변경: ⑧ 차단 + 점프 → 토글 켜면 통과» | 시나리오 재작성(차단 없음) | 1 |
| A18 | `e2e/_helpers/validation-field-jump-cases-nbl.ts:86` | 점프 케이스 «건축물 없는 구간» | 삭제 | 1 |
| | **합계** | | | **≈ 28~30 케이스 / 약 12파일** |

### 9.2 모델별

| 모델 | 반전 케이스 | 비고 |
|---|---|---|
| (a-1) 신축 행만 | A1·A2·A7~A9(`:53`·`:82`)·A11~A14(`:73-78`·hint는 hint 개정에 따라 1) = **≈ 11** | #9 유지 → A3~A6·A10·A15~A18 불변 |
| **(a-2)** | **≈ 28~30** | 위 표 전체 |
| (b) | A1~A2 계열 일부 + 새 종류 분기 점검 | 별도 «종류가 넷뿐» 침묵 분기 재점검(S1~S13식) — 규모 미측정 |

### 9.3 **반전 0**으로 확인한 것 (보호 대상)

| 대상 | 근거 |
|---|---|
| `종합합산(나대지 — 고정)` 문구 단언 | `…section-render.test.tsx:208`(주장 없음 갈래 문구 유지로 보호) |
| e2e 하드코딩 정규식·문구 17곳(4파일) | E3-① 계획서 §8.1 실측 — **문구를 바꾸지 않고 신규 상수만 추가**하면 0(UQ-6 · R-4) |
| `building_built … propertyTaxTypeBefore:""` toEqual 5곳 | 근거 키 생략 정책(§6 ④) — 단 **신축 행에 사용자가 비종합합산을 고른 새 e2e**는 신규 |
| ③ 구 스냅샷 JSON byte-identical | 근거 키 부재 유지(§6 ③) |
| 철거 행·건축물 위 변경 행 단언(E3-① section-render 26건 중 대부분) | 갈래 술어가 건축물 닫음에서 현행 5지선다를 유지 |
| `e3-1-wire` 침묵 소실 grep 게이트(`kind === "building_removed"` 0건) | 술어 사용 지속 · 게이트에 신술어 추가는 신규 |

### 9.4 정직한 한계

- A5·A6·A15는 한 `it` 안에 반전 expect와 비반전 expect가 섞여 있어 «케이스 수»는 파일 정독 기준 추정(±3).
- A7의 소비처 수(3~4)는 `git grep -n "E3_ROWS\|T9o"`로 본 참조이며 각 `it.each`가 T9o를 실제 반복하는지는 vitest로 확인하지 않았다(UV-1).
- tsc 오류 수(`NblOtherStateEventInput` 확장 · `StateEvent` 필드 추가)는 미측정 — 근거 필드를 optional로 둬 테스트 리터럴 오류를 피하는 설계(§6 ①)를 전제한다.

---

## 10. 테스트·E2E·mutation 계획 (Do 단계 — 이 세션 미실행)

| 층 | 파일 | 케이스 |
|---|---|---|
| 단위(leaf 술어) | `nbl-state-history-e3-1b-leaf.test.ts`(신규) | `eventClosesBareInterval` 격자(신축 / 철거 / tax-only 토글 on·off / 철거→신축→변경 / 신축→철거→변경) · `eventBasisOptions`(`demolished` 제외 · 구분별) · 나대지 구간 해석(accepted/unconfirmed 4사유) |
| ⑤ 위젯 | `nbl-state-history-e3-1b-section-render.test.tsx`(신규) | 신축 행 4지선다·기본 종합합산 표시 · 비종합합산 선택 시 근거 노출 · 구분 변경 시 근거 리셋 · 종류 전환 시 근거 리셋 · 토글 on→off 갈래 전환 · 근거 미선택 amber · 공지상태 한도 안내 · 미리보기 문구 갈래 3 · 한정 고지 대체 |
| ③④ | `…migrate.anchor` · `…wire.anchor` 확장 | 근거 키 부재 byte-identical · 허용값 밖 제거 · 갈래 불일치 시 전송 생략 |
| ⑧↔⑫ | parity 격자 반전 4 + 신규 5(§8) | |
| 통합(엔진) | 엔진 계획서 소관 | T9c/T9o · B5·B6 매트릭스 |
| 결과 카드 | `nbl-state-history-result-card.anchor.test.tsx` +3 | 나대지 + 별도합산 행 · 접힌 행 · 문구 |
| E2E 신규 | `e2e/transfer-nbl-other-state-history-e3-1b.spec.ts` ≈ 6건 | ① B1: 신축 2023-06-01 · 앞 나대지 별도합산 + 공지상태 → **body `nblOtherStateEvents[0].propertyTaxBasisBefore`·`propertyTaxTypeBefore` 도달**(침묵 strip 방지 — ⑫) → 사업용 · 대조군(구분 미선택) 비사업용 ② B7: 근거 모름 → 비사업용 + 확인 필요 고지 + body 키 ③ B5/B6: tax-only + 토글 off + 나대지 위 변경 → 200(E3-① 차단 반전) ④ 구분 변경 시 근거 리셋 ⑤ 신축 행 기본(주장 없음) body에 근거 키 없음(byte-identical) ⑥ 375px 가로 스크롤 없음 · 라이트/다크 · 결과 카드 구간 표시 |

**mutation 계획**(제품 코드 1줄 → 실패 → 원복): ① 신축 행 Before 운반 술어를 `kind !== "building_built"`로 되돌림(③④⑤⑭ 각 1곳 — 곳마다 다른 파일이 잡아야) ② 근거 키 와이어 갈래를 «항상 전송»으로 ③ ⑫ 스키마 근거 칸 삭제(route anchor body 도달) ④ `eventClosesBareInterval`을 «마지막 행 기준»으로 ⑤ 구분 변경 시 근거 리셋 삭제 ⑥ `demolished` 선택지 제외 해제 ⑦ 신축 행 `""`를 «모름 + 고지»로(byte-identical 단언이 잡아야) ⑧ 미리보기 갈래 문구 고정. **침묵 소실 grep 게이트**: `…e3-1-wire.test.ts`에 «근거 키 운반 4곳이 단일 술어를 읽는다» 추가.

---

## 11. 사용자 결정 UQ-n

| # | 질문 | 선택지 | **추천** | 근거 |
|---|---|---|---|---|
| UQ-1 | 입력 모델 범위 | (a-1) 신축 행만 / **(a-2)** 신축 행 + 나대지 위 구분 변경(#9 삭제) / (b) 나대지 전용 새 종류 / (c) V1-A 칸 재사용 | **(a-2) — 단 PR은 두 단계(UQ-7)** | §3 — (b)는 사용자가 건물 유무로 종류를 갈라야 하고 «종류가 넷뿐» 침묵 분기를 재점검해야 함 · (c)는 꼬리 전용이라 신축 앞 구간을 못 담음. (a-2)는 사건 종류·질문을 안 늘림. 대가 = 반전 ≈28~30(§9) |
| UQ-2 | 신축 행·나대지 닫음 행에서 `""`의 뜻 | **(가) 주장 없음 = 종합합산, 고지 없음(현행 byte-identical)** / (나) 모름 = 종합합산 + 새 «확인 필요» 고지(모든 기존 이력에 경고 +1) / (다) 신축 행에 필수 선택(⑧ 차단) | **(가)** | 나대지의 기본(종합합산)은 지방세법 §106①1호의 잔여 분류(별도합산·분리과세 제외 토지 — 엔진 E3-① §1.1 확인)라 «혜택을 주장하지 않으면 종합합산»이 기본이다. (나)는 주장 안 한 사용자 전원의 결과 `warnings` 바이트·경고 단언 변경(영향 규모 미측정 — UV-4). (다)는 U1의 «모드 `""` 차단 → 83건» 반전 재발 ⛔. **한계 명시**: (가)는 «모르는 사용자»와 «종합합산이던 사용자»를 구분하지 않는다 — 구분이 필요하면 새 «모름» 값이 필요(와이어 enum 확장) |
| UQ-3 | 나대지 근거 선택지에서 `demolished`(철거ㆍ멸실) | **(가) 제외 + 유예기간 입력 안내** / (나) 포함 + 종전 바닥면적 칸 | **(가)** | §4 — 면적 일부 모델이며 꼬리에서도 이력 미반영 경로. (나)는 E3-⑤ + 부분 면적(Q-4 (나)) 착수 |
| UQ-4 | 근거 입력 방식 | **(가) 행 안 «구분 + 근거» 두 칸(V1-A 라디오 재사용·공용 표현 컴포넌트 추출)** / (나) 구분 선택지 자체에 근거를 합쳐 한 칸(예: «별도합산 — 공지상태» 1선택) / (다) 구분만 받고 근거는 묻지 않음(선언 존중) | **(가)** | (다)는 V1-A가 막은 역버그(근거 없는 별도합산 인정)라 ⛔(엔진 E3-① Q-2 (다) 기각 · `property-tax-basis.ts` 머리주석). (나)는 선택지 폭증(구분 3 × 근거 1~3) + enum 새 값. (가)가 꼬리 칸과 입력 경험이 같다. 비용 = 근거 키 1개(①③④⑫⑭) |
| UQ-5 | 공지상태 별도합산의 호별 면적 한도(차고 1.5배·주기장 1.5배·야적장 1.2배 등) | **(가) 입력받지 않고 확인 필요 고지(V1-A와 같음)** / (나) 호별 선택 + 기준면적 칸 | **(가)** | §1.3 — 17호마다 한도 기준이 달라 다목 호별 축과 겹치고, 이력은 호별 용도를 구간마다 가지지 않기로 이미 결정(엔진 통합 계획 §2.1 · UQ-9). 한도 판정 없이 선언을 받아들이는 한계를 고지로 밝힌다 |
| UQ-6 | 기존 고지 문구 수정 방식 | **(가) 덧붙이기·신규 상수만(기존 문장 byte-identical)** / (나) 기존 한정 고지 문장 교체 | **(가)** | e2e 하드코딩 17곳(E3-① §8.1) 반전 0 보호. E3-① 선례(결정 기록 «기존 고지 문구 불변») |
| UQ-7 | PR 분할 | **(가) 2단계: ① 신축 행(a-1) ② 나대지 위 변경 행(#9 삭제)** / (나) 한 번에 (a-2) | **(가)** | ①만으로 가장 흔한 B1~B3를 연다 · 반전 ≈11 → ≈17 순차. ②는 tax-only + 토글 의미(건물 없는 토지의 이력)까지 걸려 별도 검증 가치. 둘 다 한 설계 문서의 연속이라 계획·결정은 한 번 |

---

## 12. 미검증 UV-n

| ID | 항목 | 상태 | 영향 |
|---|---|---|---|
| UV-1 | §9 반전 케이스 수(≈28~30)·소비처 수 — **vitest·tsc 미실행**, 파일 정독 + grep | **확인 필요**(Do 직전: 워크트리 밖 복사본에서 `StateEvent`에 필드 추가 · `eventCarriesTaxTypeBefore` 신축 true로 바꿔 `npx tsc --noEmit` + `npx vitest run __tests__/lib/ __tests__/api/ __tests__/calc/ __tests__/tax-engine/non-business-land/` 실측) | §9 |
| UV-2 | 사용자가 신축 앞 나대지 구간의 고지서 과세구분과 **근거(공지상태 호별)**를 구분해 알 수 있는가 · «면허·등록·허가 시설용 토지» 안내가 근거 선택에 충분한가 | **확인 필요**(수동·사용자 판단) | §2.3 hint |
| UV-3 | 엔진 계획서와 모델명·필드명(`propertyTaxBasisBefore` · `eventClosesBareInterval` · `eventBasisOptions` · `basisOutcome`) 일치 · R-1~R-8 수용 | **확인 필요**(메인 세션 합침) | §5·§6 |
| UV-4 | UQ-2 (가) 외 대안((나) 모름 + 고지)의 **영향 규모**: 결과 `warnings`에 «고지 +1» 시 기존 단언 수 | 미측정 — `git grep -n "warnings" __tests__/tax-engine/non-business-land/nbl-state-history-*` 후 `toEqual`/`toHaveLength` 분류 필요 | UQ-2 대안 |
| UV-5 | §101③ 17호 중 **나대지가 아닌데도 사업용(건축물 없음) 별도합산**이 되는 호의 범위 — 문구에 «면허·등록·허가 시설용»이라 적는 것이 정확한가(호별로 요건이 다름: 11호는 «부설주차장 설치기준면적 이내» 등) | **확인 필요** — 본문 §101③(이 세션 조회)은 호별 요건이 다르다는 것만 확인. hint 단정 문구 금지(확정은 엔진 상수) | §2.3 hint |
| UV-6 | 근거 라디오 tone(V1-A `sky` vs 행 카드 `amber`) — `components/calc/CLAUDE.md` tone 표 재확인 | **확인 필요**(Do 시) | §5.1 |
| UV-7 | 나대지 위 구분 변경(B5)의 «꼬리 별도합산 + V1-A 근거(공지상태)»와 이력 변경 행의 «변경 후» 줄이 같은 근거를 말하는가(꼬리 근거 칸은 기존 칸이 단독 소유) · 꼬리 `demolished`일 때 이력 미반영(`isPartialArea`)과 신규 행의 상호작용 | **확인 필요** — 꼬리 `demolished`(면적 초과 시)는 `applyStateHistory`가 `notices.length > 0`로 이력 전체를 미반영(`:111-112`)하므로 — 면적이 범위 안이면 해당 없음 — 행에 근거를 입력해도 쓰이지 않는다 → 위젯이 꼬리 `demolished` 선택 시 «이력 미반영» 안내를 보이는지 점검(기존 U1 계획에 해당 안내 유무는 이 세션에서 확인 안 함) | 막다른 길(화면에 있는데 판정에 안 쓰이는 칸) |
| UV-8 | 새 조문 인용 없음 가정(§101③·§103의2·§106 등 UI 문구 인용 없음) — 엔진 계획서가 새 인용을 하면 `additions-*` manifest 등록 + `npm run verify:legal` | **확인 필요**(엔진 소관) | |
| UV-9 | ⑥ 사이드바 영향 없음 — 이 세션 재확인 미수행(E3-① 실측 인용) | **확인 필요**(grep 1회) | §6 ⑥ |
| UV-10 | tax-only 이력 + 나대지(토글 off) 허용 시 `nblOtherBuildingToggleHidden`(E3-① — 건축물 사건 ≥1일 때만 숨김)이 새 갈래에서도 막다른 길을 만들지 않는가 — 나대지 tax-only는 건축물 사건 0건이라 토글 노출 유지(현행과 같음) | 정독상 이상 없음 — **실행 미확인** | ⑧ #9 삭제 후 |
| UV-11 | 신축 행 근거 입력 후 **사용자가 종류를 건축물 멸실로 바꾸면** 리셋(onChange)되는데, 세션 복원에서 stale 근거가 남은 상태로 종류가 바뀐 행이 있는가 — ③ 정규화가 갈래 불일치 값을 제거해야 | 설계 의도 — 테스트로 확인 | §6 ③ |

---

## 13. PR 분할 (Do — 엔진 선행 → UI 시퀀셜: 화면에 있는데 판정에 안 쓰이는 칸 금지)

1. **E3-1b-엔진 ①**(엔진 계획서): leaf(`eventCarriesTaxTypeBefore` 신축 true · 나대지 닫음 구간 근거 해석 · `isStateIntervalBusiness` 갈래 · echo `basisOutcome`) · ⑫ 행 스키마 근거 칸 · ⑭ 운반 · 고지 상수(R-4) · 반전 A1·A2·A7·A8·A9 엔진측.
2. **U5a**(이 계획 ①단계): ③④ 근거 키 · ⑤ 위젯 신축 행 «구분 + 근거» · 미리보기·⑦ 갈래 · 첫 행 hint · 반전 A9~A14 · E2E B1·B2·B3·B7 · mutation ①~⑦.
3. **E3-1b-엔진 ②**: #9 삭제 + derive throw 축소 + `eventClosesBareInterval`(replay 노출) · 반전 A3~A6·A15·A16.
4. **U5b**: 구분 변경 행의 나대지 갈래 · tax-only + 토글 off · 반전 A10·A17·A18 · E2E B5·B6.
5. 파일 크기: `OtherLandStateHistorySection.tsx` 339 → ≈430 · `OtherLandPropertyTaxBasisField.tsx` 90 → ≈75 + 공용 표현 컴포넌트 ≈50 · `other-land-state-history.ts` 327 → ≈400(≤700) · `nbl-validation-messages.ts` 89 → ≈85. 위험 구간(≥750) 파일은 건드리지 않는다(`calc-wizard-asset-migrate.ts` 737은 대상 아님 — ③은 `…-migrate-nbl.ts` 52줄).

완료 보고 전 필수: `ui-engine-sync-checker`(14지점) · ⑫ body 도달 E2E · 침묵 소실 grep 게이트(근거 키 운반 4곳 단일 술어) · 브라우저 수동 확인(또는 «미수행» 명시).

---

## 14. 재제안 금지·기결정 준수

V-1 일 단위(과세기준일 접기 ⛔) · Q-15 (가′) · «모름» = 혜택 불성립 + 확인 필요(건축물 위 구간 `""` = 모름 — **나대지 구간은 종합합산이 잔여 분류라 `""` = 주장 없음**으로 갈래를 분리 — UQ-2에서 사용자 결정 대상으로 올림, 임의로 바꾸지 않음) · 근거 없는 비종합합산 선언 존중 금지(V1-A 역버그 — UQ-4 (다) 기각) · E3-① 모델(사건 배열 + Before 사슬) 유지 · 자동 안분 fallback 금지(빈 날짜·빈 면적 채우지 않음) · `useEffect → store` 미러링 금지(리셋은 onChange) · E3-⑤·업종·주택부수토지·13호는 이 문서에서 건드리지 않는다 · 계산·판정을 UI가 새로 짓지 않음(구간·근거 해석·문구는 엔진 leaf·상수 단일 소스).

---

## 15. 자가 검토 (plan-design-self-review-loop · 1회)

| # | 검토 항목 | 발견 | 정정 |
|---|---|---|---|
| 1 | «신축 앞 나대지만 열면 된다»는 초안 | B5(나대지로 두다 중간에 공지상태 개시 후 나대지로 양도)는 신축 행이 없어 (a-1)로 표현 불가 → #9 삭제까지 가야 완결 | 모델을 (a-1)/(a-2)로 나누고 PR을 2단계로(UQ-1·UQ-7) |
| 2 | 신축 행 `""`의 뜻이 철거 행 `""`(모름)과 같다고 가정 | 같다면 **모든 기존 이력에 새 «모름» 고지가 붙어** 경고 바이트·단언이 바뀐다. 나대지는 종합합산이 잔여 분류라 의미가 다르다 | UQ-2로 올림 · 기본 (가) byte-identical · 두 `""`가 한 칸에서 달리 읽히는 위험은 술어 단일 소스로(§6) |
| 3 | 근거 필드를 필수로 | 테스트 리터럴 ≥ 12파일 tsc 오류 · 구 스냅샷 JSON byte-identical 단언 반전 | optional + 키 부재 유지 + 와이어는 비어 있으면 생략 → e2e/route `building_built … ""` toEqual 5곳 반전 0 확인 |
| 4 | ⑫ Zod 변경 0 가정(E3-① 선례) | E3-①은 행 스키마가 이미 Before를 가졌지만 **근거는 행에 없다** — 빠지면 침묵 strip | §6 ⑫ «필수 추가» + body 도달 E2E + mutation ③ |
| 5 | `demolished`를 열면 E3-⑤도 같이 해결된다 | 면적 일부 모델이라 구간(전량)과 불일치 — 꼬리에서도 면적 초과 시 이력 미반영(`apply.ts:111-112`) | §4 · UQ-3 (가) · 안내만 |
| 6 | 반전 규모 | 초안 추정 «E3-① 차단 단언 몇 건» → 파일별 정독으로 A1~A18 표 작성. 케이스 단위 ±3 불확실 | §9.4에 한계 명시 · UV-1 |
| 7 | 법령 문구 | 초안 hint에 «차고 1.5배» 같은 수치 단정 → §101③ 17호는 호별 한도·요건이 다름(이 세션 본문 확인) | 한도 수치를 문구에서 뺌 · UV-5 |
| 8 | 꼬리 `demolished` + 이력의 상호작용 | 이력 전체 미반영 경로라 신규 행 입력이 **판정에 안 쓰이는 칸**이 될 수 있음 | UV-7 — 위젯 안내 필요 여부 확인 후 Do |
| 9 | ⑥ 영향 | 이 세션에서 재확인하지 않음 | UV-9로 «확인 필요» 명시 |
| 10 | 계산·판정을 UI가 짓는가 | 미리보기 «충족» 판정은 엔진 leaf R-3이 한다(UI 신규 판정 로직 없음) · 짧은 근거 라벨도 엔진 leaf 권장 | §5.2-6 |

**verdict: `ready-with-decisions`** — 구조·영향·반전 규모는 산출했다. 착수 전 남은 것 = ① 사용자 UQ-1~UQ-7(특히 UQ-1·UQ-2) ② 엔진 계획서와 모델명·R-n 합의(UV-3) ③ UV-1(복사본 probe)·UV-7(꼬리 `demolished` 상호작용) 실측. 이 셋 전에는 코드 착수 금지(엔진 선행 PR → U5a → 엔진 ② → U5b).

## 엔진 계획서와 합칠 때 요청 사항 (R-n — 제안)

| # | 요구 | 이유 |
|---|---|---|
| R-1 | `StateEvent.propertyTaxBasisBefore?: PropertyTaxBasis` + derive: 나대지 닫음 구간의 구분 = `resolvePropertyTaxBasis`(hasBuilding=false) accepted이면 Before, 아니면 `comprehensive`(+ 접힘 사유 echo) | §6 · 근거 있는 선언만 존중 |
| R-2 | 단일 술어군: `eventCarriesTaxTypeBefore`(신축 true) · `eventClosesBareInterval(events, i, tailHasBuilding)` · `eventBasisOptions(declared)`(= `propertyTaxBasisOptions(declared,false)` − `demolished`) — ③④⑤⑭ 4곳이 모두 이 술어 | 침묵 소실 방지(E3-① S9~S12 동형) |
| R-3 | `isStateIntervalBusiness` 갈래: 나대지 + 받아들여진 비종합합산 = 사업용 | §7 |
| R-4 | 신규 상수(기존 문구 byte-identical): 나대지 근거 미확인 · 공지상태 한도 · 한정 고지 변형 | UQ-6 |
| R-5 | `StateHistoryIntervalEcho`·미리보기 행에 `basisOutcome`(accepted/unconfirmed + 사유 + 근거 값) | §7 ⑦ |
| R-6 | ⑫ Zod 행 스키마 근거 칸 + `stateEventSequenceIssue`의 #9 삭제(2단계) + `stateEventTaxChangeWithoutBuildingMessage` 처리 | §8 |
| R-7 | 신축 행 `""` = 주장 없음(고지 없음) — derive가 `unknown`이 아니라 `comprehensive`로 매핑 · `unknownClosers`(`apply.ts:~160`)에 잡히지 않게 | UQ-2 |
| R-8 | 나대지 행의 `demolished`·구분-근거 불일치 = unconfirmed(400 아님) + 철거 후 한시는 유예기간 입력 안내(E3-⑤) | §4 |

## 결정 기록 (2026-11-23 사용자)

- **공통 — 모두 추천안 승인**: 엔진 Q-1 (a) / UI UQ-1 (a-2) — 나대지 구간을 닫는 사건 행(신축 행 · 나대지 위 `tax_type_changed` 행)에 «재산세 구분(`propertyTaxTypeBefore`) + 근거(`propertyTaxBasisBefore` — V1-A 근거 열거·해석기 `resolvePropertyTaxBasis` 재사용, 근거 없는 비종합합산은 종합합산으로 접고 고지)» · 엔진 Q-3 나대지 근거 = 공지상태 별도합산(`vacant_state`)·분리과세(`separate_taxation`)·비과세(`statutory_exempt`) 3종 + 모름(`demolished` 제외 — 유예 입력이 덮음, UI UQ-3 (가)) · 엔진 Q-2 / UI ⑤ 의견 = **E3-⑤(철거 후 한시 지위)와 묶지 않음** · 엔진 Q-5 / UI UQ-2 (가) 신축 행 `""` = 선언 없음(기존 이력 바이트 동일), tax 행 `""` = 모름 · 엔진 Q-6 E3-① «건축물 없는 구간 변경 차단» 규칙 **삭제**(의도된 반전) · 엔진 Q-8 호 번호 받지 않음 · 엔진 Q-7 / UI UQ-6 (가) 고지는 새 상수만.
- **면적한도(엔진 Q-4 · UI UQ-5) = 3지선다(전체 한도 이내 / 일부 초과 / 모름) + «일부 초과»와 «모름»은 그 구간을 종합합산으로 보고 확인 필요 고지** — 엔진 원안(일부 초과 = 이력 미적용)은 «일부 초과»가 «모름»보다 유리해지는 역전(이내 198,210,000 / 일부 초과 198,210,000 / 모름 253,960,000)이 실측돼 기각. UI 원안(묻지 않고 이내 전제)은 «모름 = 혜택 불성립» 원칙과 충돌해 기각. 대가: 실제로 일부만 초과하면 한도 이내 면적도 비사업용 쪽으로 보수 처리(고지로 알림). 꼬리(양도일 현재) 부분 면적 경로의 «이력 미적용 + 고지»(통합 Q-8)는 그대로.
- PR 순서(메인 세션 결정): E3b-0(테스트만) → E3b-1(엔진·⑫ 신규 칸 2개 + route 관통 anchor·⑭·고지) → UI → E2E. UI 원안의 «신축 행 먼저 / 차단 삭제 나중» 2단계는 엔진이 한 PR로 판정까지 열므로 채택하지 않는다.

## 구현 기록 — UI (①②③④⑤⑦⑧ · 2026-11-23)

> 브랜치 `feat/nbl-e3-1b-bare-land` · 엔진 커밋 E3b-0·E3b-1 위에 UI 1커밋(한 PR). 위 «결정 기록»과 엔진 계획서 «구현 기록»이 이 문서 본문(§2.3 4지선다 · §5.1 톤 · §13 2단계 PR)보다 우선한다.

### 본문과 달라진 것

| 본문 | 구현 |
|---|---|
| §2.3 구분 변경 행도 4지선다 | **신축 행 = 4지선다(모름 없음 · `""` = 선언 없음 → «종합합산» 표시)** · **나대지 위 구분 변경 행 = 5지선다(`""` = 모름 → 종합합산 + 확인 필요 — 엔진 결정 «tax 행 `""` = 모름»)**. 구분 변경 행의 «모름» 고지는 종전 상수(`…TAX_CHANGE_UNKNOWN_NOTICE`)를 그대로 쓴다 |
| §2.3 근거 hint «면허·등록·허가» | 뺐다(UV-5 — 호별 요건이 달라 단정 금지). «재산세 과세내역(고지서)에서 확인해 고르세요 · 철거 후 한시 별도합산·건축 중 기간은 근거로 받지 않고 「부득이한 사유 유예기간」으로 입력» |
| §5.1 근거 라디오 tone(UV-6) | 행 카드와 같은 **amber**(V1-A 꼬리 칸은 sky 유지). `PropertyTaxBasisRadio`가 tone을 prop으로 받는다 |
| §5.2-1 `eventCarriesTaxTypeBefore` 의미 확장 | 확장하지 않았다(엔진 구현 기록과 같음). 갈래는 `eventClosesBareInterval`이 정하고, 철거·건축물 위 구분 변경(`carriesBefore && !closesBare`)은 종전 카드 그대로 |
| 면적한도 «묻지 않고 이내 전제»(UI 원안) | **3지선다**(전체 이내 / 일부 초과 / 모름) — 근거가 공지상태일 때만. 미선택·일부 초과·모름 = 접힘 + 면적한도 고지(결정 기록) |
| 고지 «한정 고지 변형 대체»(§5.2-8) | 하지 않았다 — 엔진이 **새 상수 3종을 추가만** 한다(기존 문구 byte-identical). 카드는 엔진 `resolveBareDeclaration` 결과로 접힘·수용을 가르고 같은 상수를 보인다 |
| §13 «2단계 PR» | 채택하지 않았다(결정 기록) — 한 PR |
| `tailHasBuilding` | `StateEventSequenceOptions`에서 **제거**(⑧·⑫′·⑤ 미리보기 호출부 3곳 + 단언). 차단 규칙이 삭제돼 결과에 영향이 없는 인자였다. `eventClosesBareInterval`의 인자는 남는다(건축물 사건 0건일 때 초기 상태) |

### 변경 파일

| 지점 | 파일 |
|---|---|
| ① 타입 | `lib/stores/calc-wizard-asset-nbl-other.ts` — `NblOtherStateEventInput`에 optional `propertyTaxBasisBefore`·`areaWithinLimitBefore`(키 부재 = 종전 행과 byte-identical) |
| ② initial | 변경 0 — 행은 `addEvent`가 `{kind, date, propertyTaxTypeBefore:""}`로 만든다(선언 키 없음) |
| ③ normalize | `lib/stores/calc-wizard-asset-migrate-nbl.ts` — 신축 행 직전 구분 보존 · 선언 칸은 허용값 안 + 종류가 나대지를 닫을 수 있을 때만(`eventClosesBareInterval([{kind}],0,false)`) · 키를 새로 만들지 않는다 · 건축물 토글은 보지 않는다(숨은 값 보존) |
| ④ API 변환 | `lib/calc/nbl-other-state-history-scope.ts` — **`stateEventWireRow(events,i,tailHasBuilding)`**(전송형 단일 함수) + `stateHistoryWireFields`가 사용. 나대지를 닫는 행에서만 선언 칸 · 근거는 `eventBasisOptions`에 있을 때만 · 면적한도는 근거 `vacant_state`일 때만 · 값이 있을 때만 키 |
| ⑤ 입력 | `components/calc/transfer/nbl/OtherLandBareIntervalFields.tsx`(신규 161줄 — 구분 → 근거 → 면적한도 + 고지) · `PropertyTaxBasisRadio.tsx`(신규 39줄 — V1-A 꼬리 칸과 공용) · `OtherLandStateHistorySection.tsx`(339→355: 갈래 분기 · 종류 전환 리셋 · 첫 행 hint · 미리보기 문구) · `OtherLandPropertyTaxBasisField.tsx`(라디오를 공용 컴포넌트로) · `lib/calc/nbl-other-state-history-preview.ts`(④ 전송형을 그대로 읽는다 + 행 echo) |
| ⑥ 사이드바 | 영향 없음 확인 — `git grep -n "nbl\|NonBusiness" lib/stores/calc-wizard-store.ts lib/stores/transfer-per-asset-summary-helpers.ts components/calc/shared/WizardSidebar.tsx` 0건 |
| ⑦ 결과 | `components/calc/NblStateHistoryPeriodTable.tsx` — 구간표 «재산세 구분» 열이 근거 해석을 보인다 · 문구는 leaf `bareIntervalTaxTypeText`(`other-land-state-history.ts`에 추가 — 입력 미리보기와 단일 소스) |
| ⑧ validation | 새 규칙 0(근거 미선택·모름은 막지 않는다 — V1-A와 같음) · `validateNblStateHistory`에서 `tailHasBuilding` 제거 |
| ⑫ | `lib/api/transfer-tax-schema-nbl-refines.ts`에서 `tailHasBuilding` 제거(Zod 신규 칸 2개는 엔진 커밋) |

### 3중 패턴 (정책 3 — `propertyTaxBasisBefore`·`areaWithinLimitBefore`)

| 층 | 값 `""`·미선택의 뜻 |
|---|---|
| ⑤ 표시 | 라디오 무선택 + amber 접힘 고지(엔진 `resolveBareDeclaration` 결과 · 선택지에 없는 stale 값도 «미선택») |
| ④ 전송 | 키 생략(= 엔진 «미선택») — 같은 `stateEventWireRow`를 ⑤ 미리보기도 읽는다 |
| ⑧ | 규칙 없음 |
| ⑫ | enum + `""` 허용 |
| 엔진 | 근거 `unselected` · 한도 `area_unknown` → 종합합산 + 확인 필요 |

신축 행 구분 `""`: ⑤ «종합합산» 표시 = ④ `""` 전송 = ⑫ enum 허용 = 엔진 «선언 없음 · 고지 없음». `useEffect → store` 미러링 0 · 자동 안분 fallback 0(한도는 전체 구간 접힘만 — 부분 면적 안분 없음).

### 테스트

- 신규: `__tests__/lib/calc/nbl-state-history-e3-1b-section-render.test.tsx`(17) · `…e3-1b-client.anchor.test.ts`(60 — **E3B_ROWS 전 행 ④ 전송 = 표의 raw 판정 · ⑤ 미리보기 = 판정 구간** + 전송형 격자) · `__tests__/lib/stores/nbl-state-history-e3-1b-migrate.anchor.test.ts`(5) · `__tests__/components/nbl-state-history-e3-1b-result-card.anchor.test.tsx`(7) · E2E `e2e/transfer-nbl-other-state-history-e3-1b.spec.ts`(7).
- 반전(단언은 지우지 않고 새 기대값으로): e3-1-client 2 · wire.anchor 1 · migrate.anchor 1 · e3-1-section-render 2 · section-render 1 · e3-1-leaf(`tailHasBuilding` 인자 제거) · 가드 2(`leaf-unreachable` WIRE-1·6 허용 목록 · `e3-1-wire`: `tailHasBuilding` 3중 패턴 단언 → «나대지 갈래 단일 술어 5곳» + 신규 고지 상수 3종 단일 소스).
- E2E 엔진 쪽 2곳(`validation-field-jump-cases-nbl.ts` 1행 · `e3-1.spec.ts` 1건) 실행 확인 · 기존 `transfer-nbl-other-state-history*.spec.ts` 22건 + `transfer-validation-field-jump -g "nbl:"` 통과.
- 브라우저(Playwright · 입력 → 계산 → 결과): R1 산출세액 **198,210,000**(사업용) vs 대조군(선언 없음) **253,960,000**(비사업용) = −55,750,000 · R7 198,210,000 · 면적한도 일부 초과·모름 = 비사업용 · 라이트/다크 대비 4.5 · 375px 사건 영역·카드 안.

### mutation (제품 코드 1줄 → 대응 anchor만 실패 → 원복 · 21건 전부 검출)

| # | 변이 | 실패한 곳 |
|---|---|---|
| P-b13 | ④ 와이어 «나대지 갈래 무시(항상 전송)» | e3-1b-client · e3-1-client(건축물 구간 stale) · e3-1-wire 게이트 |
| U2·U3 | ④ 근거 선택지 필터 제거 · 면적한도 게이트(근거=공지상태) 제거 | e3-1b-client(전송형 격자) |
| U4·U5·U6 | ③ 선언 칸 버림 · 빈 값에도 키 생성 · 신축 행 직전 구분 다시 지움 | e3-1b-migrate · migrate.anchor · e3-1-client |
| U7·U8·U11·U12·U13 | ⑤ 구분 변경 시 리셋 삭제 · 근거 선택 시 한도 리셋 삭제 · 종류 전환 키 리셋 삭제 · 신축 행 종합합산을 `comprehensive`로 저장 · 신축 행 표시 fallback «모름» | e3-1b-section-render |
| U9·U10 | ⑤ 위젯 갈래를 «종류만»·«마지막 행 기준» replay로 | e3-1b-section-render · e3-1-section-render · section-render · e3-1-wire 게이트 |
| U14·U15 | ⑤ 수용 고지 삭제 · 면적한도 접힘 고지를 근거 접힘 고지와 합침 | e3-1b-section-render |
| U16·U17·U18 | ⑤ 미리보기 선언 칸 미전달 · 행 echo 미전달 · 문구 해석 건너뜀 | e3-1b-client(미리보기 격자) · e3-1b-section-render |
| U19·U20 | ⑦ 결과 구간표 bare 문구 제거 · 근거 짧은 라벨 오귀속 | e3-1b-result-card · e3-1b-section-render |

### 남은 확인 필요

- **UV-2**: 사용자가 신축 앞 나대지의 «과세구분 vs 근거»를 구분해 알 수 있는가 — 수동·사용자 판단(hint는 고지서 확인으로만 안내).
- **UV-7**: 꼬리(양도일 현재)에 `demolished` 부분 면적이 있어 엔진이 이력 전체를 미반영(`isPartialArea`)하는 경우 — 입력 칸이 판정에 안 쓰이는데 위젯이 그 사실을 행 안에서 알리지 않는다(결과 `warnings`의 기존 `PARTIAL_AREA` 고지만). 이 PR 이전부터 모든 행에 해당하는 한계라 건드리지 않았다.
- 사용자 실제 고지서 문구와 «근거» 3종 라벨의 정합(법 인용 라벨은 엔진 `PROPERTY_TAX_BASIS_LABEL` 단일 소스 — 신규 인용 없음, manifest 등록 불필요).
