# 면적 3필드 상시 노출·한 행 배치 + 기준시가 계산기 연면적 칸 제거 (수정 계획서 rev.2)

- 대상: 양도소득세 마법사 ① 기본정보 「면적·규모」 카드 — **일반건물(GB)** + **상업용건물·오피스텔(CB)**
- 추가 대상: 「건물 기준시가 계산」 모달 내 「건물 연면적」 입력 칸
- 작성일: 2026-08-05 (rev.2 — 사용자 답변 Q1=모달 연면적 / Q2=완전 삭제 / Q3=CB 포함 반영)

---

## 1. 현상 실측

### 1.1 ① 기본정보 면적 카드

| 자산 | 컴포넌트 | 현재 배치 | 조건부 노출 |
|---|---|---|---|
| GB | `asset-sections/AssetAreaGeneralBuilding.tsx` (88줄) | **세로 3단** | 「건물 연면적」만 `useEstimatedAcquisition === true`일 때 (`:48`·`:63`) |
| CB | `asset-sections/AssetAreaCommercial.tsx` (122줄) | **이미 3열 한 행 + `stacked`** (`:56`) | 없음(3필드 항상 표시) |

> ⚠️ **CB는 배치가 이미 요구대로다** — Q3 "함께 변경"의 실질은 **hint(팁) 삭제뿐**이다. CB 연면적은 입력 칸이 아니라 전용+공유 **자동계산 표시**(`:104-113`)라 삭제 대상이 아니다.

### 1.2 「건물 기준시가 계산」 모달의 연면적 칸

- 위치: `building-std-price/BuildingStdPriceForm.tsx:346-348`(토지면적과 2열) · `:356-358`(단독).
- 노출 조건: `showFloorArea = !isMech && !hideFloorArea`, `hideFloorArea = composite || apartmentConv` (`:235`·`:237`) — **호출부가 제어할 수 없는 폼 내부 파생**이다.
- 상위 폼에서 prefill을 받는다: `BuildingStdPriceModalButton.tsx:121` `prefill.floorArea → floorArea`.
- prefill을 넘기는 호출부(양도세):
  - GB: `GeneralBuildingBlock.tsx:266`(양도시) · `:320`(취득시) — `floorArea: asset.gbBuildingArea`
  - CB: `CommercialBuildingBlock.tsx:409`·`:439` · `CommercialInheritanceStdPriceSection.tsx:102` — `floorArea: totalFloorArea`(전용+공유)
- ⇒ **GB·CB 경로에서는 상위 폼 값이 이미 모달로 흘러가고 있고, 모달의 입력 칸은 그 값을 덮어쓰기 위한 중복 칸이다.**
- 모달 호출부는 전체 16개 파일(상속·증여 `EstateBody…`, PHD, 겸용, 3시점 등 포함). 상위에 연면적 필드가 **없는** 경로가 다수 → 일괄 삭제 불가.

### 1.3 GB 게이트가 만든 부작용 (요구 1의 근거)

「양도시 기준시가」 섹션은 **항상** 표시되고 그 모달에 `floorArea: asset.gbBuildingArea`를 넘긴다(`:266`). 그런데 실거래가 모드에서는 ①에 연면적 칸이 없어 **prefill이 항상 빈 값** → 사용자가 모달 안에서 연면적을 직접 친다. 상시 노출은 이 이중 입력을 없앤다.

---

## 2. 요구사항 확정

| # | 요구 | 확정 내용 |
|---|---|---|
| 1 | 처음부터 연면적 입력 가능 | GB `isEstimated` 게이트 삭제 → 3필드 상시 노출 |
| 2 | 취득정보 입력 시 나타나는 연면적 입력란 제거 | **「건물 기준시가 계산」 모달 안의 연면적 입력 칸**을 GB·CB 경로에서 숨김 (§3.3) |
| 3 | 3필드 한 행 + 팁 삭제 | GB: 3열 그리드로 변경 + hint 3개 **완전 삭제**(ⓘ 툴팁 대체 없음) / CB: 배치 유지, hint 3개 **완전 삭제** |

---

## 3. 변경 설계

### 3.1 GB 면적 카드 — `AssetAreaGeneralBuilding.tsx`

```tsx
<ToneCard tone="sky" title="면적·규모" noDark>
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
    <FieldCard stacked label="취득·양도 당시 토지 면적" unit="㎡"> <DecimalInput …gbLandArea/> </FieldCard>
    <FieldCard stacked label="건물 연면적"             unit="㎡"> <DecimalInput …gbBuildingArea/> </FieldCard>
    <FieldCard stacked label="건축물 바닥면적"          unit="㎡"> <DecimalInput …gbBuildingFootprintArea/> </FieldCard>
  </div>
</ToneCard>
```

- `isEstimated` 게이트·지역변수·전용 주석(`:46-48`) 제거(내 변경이 만든 고아만 정리).
- `hint` 3개 제거. `stacked`는 3열에서 좌-라벨이 입력폭을 압박하기 때문(`FieldCard.tsx:18-22`).
- `data-slot="field-card"` 유지 → E2E 셀렉터 무손상.
- **파일 헤더 주석의 법령 설명은 유지**한다 — 화면 hint는 지우되 「건축물 바닥면적」이 「건축법 시행령」 제119조 제1항 제3호 개념이고 주택 「정착면적」과 다르다는 근거(`:12-21`)는 코드 독자용으로 남긴다.

### 3.2 CB 면적 카드 — `AssetAreaCommercial.tsx`

- `hint` 3개(전용면적·공유면적·대지면적, `:60`·`:72`·`:84`) 삭제. 그 외 구조 무변경.

### 3.3 모달 연면적 칸 숨김 — 신규 prop 배선

호출부가 제어할 수 없는 현행(`hideFloorArea`는 폼 내부 파생)이므로 **prop 1개를 신설해 GB·CB 호출부에서만 켠다**.

```
BuildingStdPriceModalButton  (신규 prop: hideFloorAreaInput?: boolean)
   └→ BuildingStdPriceForm   (동명 prop 수신)
        const hideFloorArea = composite || apartmentConv || hideFloorAreaInput;
```

적용 호출부 **5곳**: `GeneralBuildingBlock.tsx:266`·`:320`, `CommercialBuildingBlock.tsx:409`·`:439`, `CommercialInheritanceStdPriceSection.tsx:102`. 나머지 11개 호출부는 무변경(상위 연면적 필드가 없어 모달이 유일 입력 경로 — 숨기면 dead-end).

**연면적이 비었을 때**: 입력 칸 대신 한 줄 안내만 표시한다.

> 건물 연면적은 ① 기본정보 「면적·규모」에서 입력합니다.

- 입력 칸은 어떤 경우에도 나타나지 않는다(요구 2 충족).
- 값이 없을 때 **입력 경로를 명시**해 dead-end를 피한다(정책 `feedback_ui_gate_removes_sole_input_path`).
- 값이 있을 때는 안내도 표시하지 않는다(§4.1 대안 검토 참조).

### 3.4 일괄 계산 모달 연면적 칸 — `MultiPointBuildingStdPriceModal`

「취득·양도 2시점 일괄 계산」 모달에도 연면적 칸이 있다(`:520-522`). 여기서도 없앤다. **단, 구조가 달라 조건이 하나 붙는다.**

이 모달은 **부분(층/구역) 행을 여러 개** 만들 수 있다(`+ 부분 추가`, `:449`). 층마다 구조·용도가 다르면 행을 나눠야 ㎡당 가액이 정확히 잡히기 때문이고, 이때 **행마다 연면적이 따로 필요**하다. 상위 폼에는 건물 **전체** 연면적 하나뿐이라 2행 이상을 대체할 값이 없다(2행부터는 prefill도 빈 값 → 숨기면 연면적 0으로 조용히 오산).

⇒ **행이 1개일 때만 숨긴다**:

| 상태 | 연면적 칸 |
|---|---|
| 행 1개(기본) — prefill 값 있음 | **숨김**. 값 없으면 §3.3과 같은 안내 한 줄 |
| 「+ 부분 추가」로 2행 이상 | 각 행에 표시(층별 분할은 사용자가 명시적으로 선택한 경우) |

- 적용 호출부 **2곳**: `GeneralBuildingBlock.tsx:283`(`housingFloorAreaPrefill = gbBuildingArea`) · `CommercialBuildingBlock.tsx:371`(`= totalFloorArea`).
- 나머지 3개 호출부(`ThreePointStandardPriceInput`·`ThreePointAssetMajorRender`·`inheritance/HouseValuationSection`)는 겸용 주택/상가 다행 구조가 기본이라 **무변경**.
- 「+ 부분 추가」 자체를 없애는 안은 채택하지 않았다 — 층별 구조·용도 분할은 건물기준시가 산정의 정확성 요소다(법령 정확성 최우선).

### 3.5 범위에서 뺀 것

- 상속·증여 등 나머지 11개 1시점 모달 호출부 — 상위 연면적 필드 부재(모달이 유일 입력 경로).
- 엔진·API·Zod — 무변경(§4.2).

---

## 4. 파급 검토

### 4.1 대안 검토 기록 (왜 "숨김+안내"인가)

| 안 | 판정 |
|---|---|
| 무조건 완전 삭제(안내도 없음) | 상위 미입력 시 연면적 0으로 계산되어 **틀린 기준시가가 조용히 산출**된다 — 채택 불가 |
| 읽기 전용 값 표시(`disabled` 입력 칸) | 칸이 남아 요구 2와 어긋남 |
| **숨김 + 미입력 시 안내 한 줄** | 채택 |

### 4.2 동기화 지점 (14지점)

필드 신설이 아니라 **표시 게이트·레이아웃 변경**이다.

| 지점 | 판정 |
|---|---|
| ⑤ UI 위젯 | **변경** — GB 게이트·3열 / CB hint / 모달 prop |
| ⑧ validation | **무변경(의도)** — `transfer-tax-validate-gb.ts:133-135`는 환산 모드에서만 연면적을 필수로 본다. 실거래가 모드에서 "칸은 보이되 필수는 아님"은 UI 통과↔validate 차단 모순의 **반대 방향**(느슨)이라 정책 위반 없음 |
| ①②③④⑥⑦⑨~⑭ | 무변경 |

### 4.3 엔진 영향 0

`lib/calc/transfer-tax-api-gb.ts:151-157` — GB 기준시가 payload는 `useEstimatedAcquisition || gbHasExtension`일 때만 구성된다. 실거래가·비증축 모드에서 연면적을 입력해도 엔진 입력에 들어가지 않아 **세액 변동 없음**. 그 모드에서의 실효는 모달 prefill(표시·편의 계층)뿐이다.

### 4.4 테스트 영향

| 파일 | 영향 | 대응 |
|---|---|---|
| `e2e/building-stdprice-modal-prefill.spec.ts:63` | **깨진다** — `modal.getByPlaceholder("건물 연면적")` 단언. 칸이 사라짐 | spec 재설계: ① 입력 → 모달의 **계산 결과/계산서에 반영된 연면적**으로 검증. 토지면적(`:64`) 단언은 유지 |
| 같은 spec `:34-36`·`:44-55` | 환산취득가 클릭이 연면적 노출 전제 | 주석 정정 + 클릭 없이도 연면적 입력 가능함을 반영 |
| `e2e/building-register-autofill.spec.ts:92`·`:184` | **무영향**(추정 → 착수 시 확인) — 상증 전용 계산기 페이지 경로로 `hideFloorAreaInput` 미적용 |
| `e2e/general-building-97-2-swap.spec.ts` 등 store 주입형 | 무영향 |
| `__tests__/components/asset-section-basic-area-gate.anchor.test.tsx:200` | 무영향(GB는 `area-scenario-select` 미렌더만 단언) |

---

## 5. 검증 계획 (성공 기준)

1. **신규 RTL anchor** → verify: `npx vitest run __tests__/components/area-card-row-layout.anchor.test.tsx` 통과
   - A1: GB — `useEstimatedAcquisition: false`에서도 「건물 연면적」 입력이 렌더된다 *(현행 코드에서는 실패해야 정상 — 게이트 실증)*
   - A2: GB — 3필드가 `sm:grid-cols-3` 그리드의 형제로 렌더된다
   - A3: GB·CB — 면적 카드에 hint 문단이 없다
   - A4: 1시점 모달 — `hideFloorAreaInput` 시 「건물 연면적」 입력이 없고, 값이 비면 안내 문구가 렌더된다
   - A5: 일괄 계산 모달 — `hideFloorAreaInput` + 행 1개면 연면적 칸이 없고, 「+ 부분 추가」로 2행이 되면 각 행에 연면적 칸이 나타난다
2. `npx tsc --noEmit` 0건
3. `npx vitest run __tests__/components/ __tests__/lib/calc/` 통과
4. `npx playwright test building-stdprice-modal-prefill building-register-autofill` 통과(전자는 spec 수정 후)
5. 브라우저 실측
   - 일반건물 선택 직후(취득정보 미입력) ① 면적·규모에 3칸이 한 행
   - 연면적 입력 → 「건물 기준시가 계산」 모달에 연면적 칸이 **없고** 계산 결과가 그 값으로 나옴
   - 연면적 미입력 → 모달에 안내 문구 표시

---

## 6. 확정된 전제

- CB의 「연면적 (전용+공유)」은 자동계산 **표시**(입력 칸 아님)라 그대로 둔다.
- 일괄 계산 모달의 다행(2행 이상) 연면적 칸은 §3.4 근거로 유지한다.

---

## 7. 작업 순서

```
1. anchor A1~A5 작성 → verify: A1·A4·A5가 현행 코드에서 실패(게이트·칸 존재 실증)
2. AssetAreaGeneralBuilding.tsx (게이트 제거·3열·hint 삭제)
   AssetAreaCommercial.tsx (hint 삭제)
   → verify: A1~A3 통과 · tsc 0건
3. BuildingStdPriceModalButton/Form에 hideFloorAreaInput 배선 + 1시점 호출부 5곳 적용
   → verify: A4 통과 · tsc 0건
4. MultiPointBuildingStdPriceModal에 hideFloorAreaInput 배선(행 1개 한정) + 호출부 2곳 적용
   → verify: A5 통과 · tsc 0건
5. E2E building-stdprice-modal-prefill spec 재설계 → verify: 통과
6. 브라우저 실측 → verify: §5-5
```
