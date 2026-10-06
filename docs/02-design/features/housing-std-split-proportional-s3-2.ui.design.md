# S3-2 겸용주택 주택분 기준시가 분할 (뺄셈 → 비례 안분) — UI 설계

> 상태: **Design 완료 (2026-10-06, transfer-tax-ui-senior)**. 소스 수정 없음. 단 엔진 확정 전 항목은 **「엔진 설계 확정 대기」**(E-n)로 표시했고 제안안을 적었다.
> 짝 문서: 엔진 `housing-std-split-proportional-s3-2.engine.design.md`(transfer-tax-senior 동시 작성 — 이 문서 작성 시점에 §0~§9 골격만 있었다). 계획서 `docs/00-pm/housing-std-split-proportional.plan.md` §2·§4·§6·§8 · S3-1 UI `housing-std-split-proportional-s3-1.ui.design.md`(구현: `components/calc/transfer/AcqBuildingStdField.tsx`).
> 표기: **확인** = 파일을 열어 줄 번호까지 본 것 · **화면 실측** = dev 서버(`E2E_PORT=3132`, 워크트리)에서 Playwright로 열어 본 화면 · **확인 필요** = 못 본 것.
> ⚠️ 엔진 파일 줄 번호는 base `eeb0ea719`(HEAD) 기준이다. 워크트리의 `transfer-tax-mixed-use-housing.ts`는 엔진 에이전트가 작업 중이라 줄이 이미 움직였다(`transferLandRaw`·`PROTO_FILL` probe 흔적 확인) — 인용은 `git show HEAD:…`로 대조할 것.

## §0 요약

1. **신규 입력은 2칸**이다 — 「취득시 주택건물 기준시가」·「양도시 주택건물 기준시가」(국세청 건물 기준시가 중 **주택 부분 연면적만**의 값 = 나목). 겸용 주택분의 비례 분모(가목 : 나목)다.
2. **`AcqBuildingStdField`는 그대로 재사용할 수 없다**(§2.3) — 폼 필드·연면적 소스·토지 단가 소스·스냅샷 키·시점이 전부 다르다. 대신 **같은 부품**(`BuildingStdPriceModalButton` · `CurrencyInput` · `FieldCard`)으로 겸용 전용 컴포넌트 **1개**(`MixedUseHousingBuildingStdField`, `timePoint` prop)를 만들어 **4곳**에 꽂는다(자산-우선 취득/양도, 용도변경 레거시 취득/양도).
3. **입구 판정**(§1): 겸용 주택분 뺄셈 입구는 **단건 카드 = 컴패니언 카드(같은 컴포넌트)** 한 갈래이고, 다건(multi)은 겸용을 **차단**(`multi-transfer-tax-validate.ts:136-138`)해 입구가 아니다. 취득시 칸은 **비-PHD ∧ 상가→주택 아님**, 양도시 칸은 **비-PHD**에서 노출(제안, 엔진 확정 대기).
4. 🔴 **지시문의 「용도변경은 나목을 안 쓴다」는 코드와 일부 어긋난다**(§1.3): 주택→상가(`house_to_commercial`)는 **일반 분기**라 취득·양도 양쪽 나목을 쓴다. 상가→주택(`commercial_to_house`)만 취득시 나목이 없고, 그래도 **양도시 나목은 쓴다**(취득시 토지분을 양도시 비율로 안분 — `transfer-tax-mixed-use-housing.ts:269-270`). → Q-U3.
5. **PHD는 신규 칸을 열지 않는다** — PHD 패널(`MixedUsePreHousingDisclosureSection.tsx:176`)에 이미 「주택건물 부분」 3시점 기준시가 칸(`phdBuildingStdPriceAtAcq`·`…AtTransfer`)이 있다. 다만 **PHD + §97②2호 단서(나목 채택)** 경로는 엔진이 양도시 뺄셈(`:129-133`)을 여전히 쓴다(`applyHousingProviso` — def `:61`, 호출 `:145`·`:230`) → E-3.
6. **3중 패턴**: 노출(⑤)·전송(④)·필수(⑧)·Zod(⑫)·엔진 throw가 **같은 술어**. 새 어댑터 `lib/calc/mixed-use-housing-std-split.ts`가 B0의 `mixed-use-acq-date-split.ts` 선례대로 엔진 leaf를 감싼다(§3).
7. ⑥ 사이드바는 **변경 없음**(§6.1) · ⑦ 결과 카드는 엔진 echo(`housingStdSplit`)를 읽어 비례 산식을 표시(§6.2) · stale 문구 역방향 grep 결과 **교체 4 + 확인 3**(§7).

## §1 UI 입구 전수

### 1.1 화면 경로 (확인 + 화면 실측)

겸용 주택분 UI는 하나의 컴포넌트 계통이다:

```
CompanionAssetsSection.tsx:85 <CompanionAssetCard>        (자산 1 = 단건 primary · 자산 2+ = 함께 양도 — 같은 카드)
 └ CompanionAssetCard.tsx:382 <AssetSectionAcquisition>
    └ AssetSectionAcquisition.tsx:260 <MixedUseExpandedPanel>   (assetKind === "housing" 일 때 마운트)
       └ MixedUseSection.tsx:90  `if (!asset.isMixedUseHouse) return null`
          └ MixedUseSection.tsx:129 <MixedUseStandardPriceInputs>
             ├ MixedUseStandardPriceInputs.tsx:44 `hasPartialUsageChange` ──▶ MixedUseLegacyStdPrice  (용도변경 ON)
             └ (그 외) ───────────────────────────────────────────────────▶ MixedUseAssetMajorStdPrice (자산-우선)
```

④ API 변환도 같은 빌더다 — 단건 `transfer-tax-api.ts:164`, 컴패니언 `transfer-tax-api-companion-payload.ts:230` 둘 다 `buildMixedUsePayload`. ⑭ 엔진 입력 조립도 단일 leaf(`app/api/calc/transfer/mixed-use-asset-input.ts:173` `...s.mixedUse` 스프레드). 그러므로 **UI 칸 4곳 + ④ 1곳 + ⑫ 1곳**이면 단건·컴패니언이 함께 열린다(B0 선례와 같다).

### 1.2 입구 판정 표

「취득 N」「양도 N」은 **제안 노출**이다. 엔진이 소비하는지는 `transfer-tax-mixed-use-housing.ts`(HEAD)를 읽어 판정했고, 엔진 시니어 확정 전이라 E-n 표시.

| # | 경로 | 렌더 조건 (file:line) | 엔진 뺄셈 소비 (HEAD) | 취득 N | 양도 N | 판정 |
|---|---|---|---|---|---|---|
| a | **단건 겸용 · 매매 환산/실가/감정·매매사례 · 용도변경 없음 · PHD OFF** | AssetMajor `:238-251`(취득 H, `!usePreHousingDisclosure`) · `:262-276`(양도 H_T) | 취득 `:301` · 양도 `:129-133` | ● | ● | **입구** |
| b | 컴패니언(함께 양도) 겸용 | 같은 카드(§1.1) — `assetKind:"mixed_use_house"` 변환은 `companion-payload.ts:220-224` | 동일 | ● | ● | **입구**(a와 같은 칸) |
| c | 상속·증여 취득(≥1985) 겸용 | AssetMajor `:153-198`(신고가액 override 카드) + H `:238`(PHD OFF) | 취득가액은 신고가액/H로 의제, **토지:건물 배분은 같은 `acqLandStd/acqBuildingStd`**(`:269-302`) | ● (E-4) | ● | **입구** — 신고가액만 있고 H가 비면 분모가 0이 되는 기존 쏠림(코드 대조: 토지 100% — `housing.ts:273-302`) 확인 필요, Q-U6 |
| d | 환산(비-PHD) · 신축 · 1985 이전 상속·증여 | 같은 칸 — `validate-mixed-use-asset.ts:104-119` 주석이 「환산·신축·1985 전 상속·증여」를 같은 요구 묶음으로 둠 | 동일(일반 분기) | ● | ● | **입구** |
| e | **별개 취득**(토지일 ≠ 건물일, B0) | `MixedUseAcqHousingLandPriceField`(AssetMajor `:253-258` · Legacy `:183`) | 취득 `:280-300` | ● | ● | **입구** — B0 칸의 역할 재정의 필요(§2.5, Q-U5) |
| f | 공익수용(§164⑨1호) 겸용 | 상속·증여와 매매실가에서는 ⑧이 조합 차단(`validate-mixed-use-asset.ts:75`·`transfer-tax-validate-mixed-use-inheritance.ts:34`) | 환산 분모만 낮춤(`helpers.ts:403-417`) — **분할은 일반 분기** | ● | ● | **입구**(환산만) |
| g | **PHD ON** (§164⑦ 미공시) | AssetMajor `:214-236` PHD 토글 · `:238` 취득 H 숨김 · `:262` 양도 H_T 숨김 / Legacy `isCaseA` `:118,164,295` | 취득: PHD 엔진이 대체(`housing.ts:136-232`). 양도: **단서(`swapToDirect`) 채택 시에만** `applyHousingProviso`가 `transferBuildingStd` 뺄셈 사용(`:132` 산출, `:145`·`:230` 호출) | ✕ | ✕ (E-3) | **비입구** — PHD 패널에 주택건물 3시점 칸이 이미 있다. 단서 경로 처리는 엔진 확정 대기 |
| h | 용도변경 **주택→상가** (`house_to_commercial`, 비-PHD) | Legacy `:168-180`(취득 H, `partialChangeDirection !== "commercial_to_house"`) · `:309-320` 양도 H_T | **일반 분기**(`:272-303`, `isBuildingDayLandPriceRequired`가 `commercial_to_house`만 제외 — `mixed-use-acq-date.ts:58`) | ● **(취득시 연면적 = 취득시 주택 면적, §2.4)** | ● | **입구** — 지시문 가정과 다름(§0-4). E-5 |
| i | 용도변경 **상가→주택** (`commercial_to_house`, 비-PHD) | Legacy `:168`이 취득 H를 숨김 · `:258-262` 안내문 | 취득시 주택분 = 취득시 상가 기준시가 × 면적비 → 토지/건물은 **양도시 비율 차용**(`:269-270`) → 양도시 뺄셈 소비 | ✕ | ● | **부분 입구** — 양도 N만 |
| j | 상속·증여 + 용도변경 | ⑧이 차단(`validate-mixed-use-inheritance.ts:34`) · 엔진 throw(`helpers.ts:373-377`) | — | ✕ | ✕ | **비입구**(차단 조합) |
| k | **다건(multi)** 겸용 | `multi-transfer-tax-validate.ts:136-138` `MULTI_MIXED_USE_UNSUPPORTED_MESSAGE` | — | ✕ | ✕ | **비입구**(겸용 자산 자체가 차단) |
| l | 일반 주택(비-겸용)·일반건물·상가 | `MixedUseExpandedPanel`이 `isMixedUseHouse`로 null | S3-1이 별개 처리 | ✕ | ✕ | 범위 밖 |

### 1.3 용도변경 판정 근거 (지시문과 다른 점)

- 엔진은 `partialUsageChange?.direction === "commercial_to_house"`일 때만 별도 분기를 탄다(`housing.ts:248`). `house_to_commercial`은 `else`(일반 겸용 분기, `:272`)로 떨어져 `acquisitionStandardPrice.housingPrice − 가목`을 한다 — 이 값이 취득시 **전체 건물이 주택이던 시점**의 결합가다.
- 따라서 「용도변경이라 나목을 안 쓴다」가 아니라 **방향별로 다르다**: h는 양쪽, i는 양도만. 이 판정은 **엔진 확정 대기**(E-5) — 엔진 시니어가 h의 비례 분모 가목·나목을 어느 연면적으로 잡는지 확정해야 한다. UI는 아래 §2.4의 prefill만 방향별로 다르게 둔다.
- 화면 실측(Playwright, 비-PHD): `house_to_commercial` → `mixedAcqHousingPrice`·`mixedTransferHousingPrice` 노출 / `commercial_to_house` → `mixedAcqHousingPrice` **미노출**, `mixedTransferHousingPrice` 노출 — 위 표 h·i와 일치.

### 1.4 「막다른 길 없음」 검토

노출(⑤) ⇔ 필수(⑧) ⇔ 전송(④) ⇔ 필수(⑫) ⇔ 엔진 throw가 **같은 술어**여야 한다(§3). 이 설계의 위험 지점 둘:

1. **PHD 단서**(g): 엔진이 단서 채택 시 양도시 나목을 요구하는 방향으로 가면 UI는 PHD에서 칸이 없다 → 막다른 길. 대안은 엔진이 PHD 패널의 `phdBuildingStdPriceAtTransfer`를 쓰는 것(이미 입력 칸·⑧ 요구가 있음) — E-3 권장안.
2. **상가→주택(i)**: 취득 N이 없는 걸 엔진도 알아야 한다(엔진이 취득 N을 요구하면 칸 없는 throw). E-5.

## §2 배치 · 입력 방식 · 라벨 · testid

### 2.1 계산 순서 = 표시 순서

엔진 비례식: 토지분 = 개별주택가격 × 가목 ÷ (가목 + 나목) (S3-1 확정 산식). 변수 사용 순서는 **H(개별주택가격) → 가목(토지: 공시지가 × 부수토지 면적) → 나목(주택건물)**.

현 화면의 입력 위치 (화면 실측 + 확인):

| 순서 | 입력 | 위치 | 비고 |
|---|---|---|---|
| 1 | 취득시 개별주택공시가격 H | ② 주택 기준시가 → 취득 sub-block (AssetMajor `:238-251`) | PHD 시 숨김 |
| 2 | (별개 취득) 건물 취득일 기준 부수토지 공시지가 | 같은 sub-block `:253-258` (B0) | 술어 참일 때만 |
| — | **주택부수토지 공시지가 (취득시 가목)** | **③ 상가 기준시가 → 「상가부수토지 개별공시지가」(`mixedAcqLandPricePerSqm`, AssetMajor `:417-429`)** | 🔶 주택·상가가 **한 필지 한 단가를 공유**한다(`api-mixed-use.ts:151-153` 주석 · `housing.ts:274-275` 모두 `acquisitionStandardPrice.landPricePerSqm`). **주택 전용 공시지가 칸은 없다** |
| 3 | 양도시 H_T | ② 주택 → 양도 sub-block `:262-276` | PHD 시 숨김 |
| — | 양도시 단가 | ③ `:432-441` | 위와 같다 |

**배치 결정**: 신규 N 칸은 **② 주택 기준시가 안의 각 시점 sub-block 맨 아래**(취득: H·B0 아래 / 양도: H_T 아래)에 둔다.

- 근거 1: 가목 단가 칸은 ③ 상가 섹션에 있고 주택·상가 공용이라 옮길 수 없다(옮기면 `data-field` 유일성·E2E 셀렉터 붕괴).
- 근거 2: 현 화면의 ③이 이미 **「상가건물 기준시가 → 상가부수토지 공시지가」(건물 → 토지)** 순이다. 비례식은 가목·나목이 대칭이라 건물 칸이 토지 칸보다 앞서는 것이 현 규약과 어긋나지 않는다.
- 근거 3: N은 단가·면적과 **독립 입력**이다(모달에 연면적·구조·용도·경과연수를 넣는다). 단 위치지수(≤2000 취득 트랙) 때문에 모달이 가목 단가를 prefill로 받는다 — 별개 취득이면 B0 칸 값을 쓴다(§2.4).
- 한계(명시): N이 단가(가목 입력)보다 **위에** 있어 「H → 가목 → 나목」과 어긋난다. 힌트에 「토지 기준시가(아래 개별공시지가 × 주택부수토지 면적)」를 명시해 짝을 알린다. 가목 값을 N 카드 안에 **자동 표시하는 안은 채택하지 않았다** — 취득시 가목의 기준일(건물일/토지일)이 엔진 확정 대기(E-1)라 UI가 먼저 정하면 dual-truth.

### 2.2 컴포넌트 구성

```
components/calc/transfer/mixed-use/MixedUseHousingBuildingStdField.tsx   (신규, ~110줄)
  props: { asset, onChange, timePoint: "acquisition" | "transfer", transferDate?, acqLabel?, landArea? }
  - leaf 술어(§3)가 false면 null (B0 `MixedUseAcqHousingLandPriceField`와 같은 패턴)
  - 박스: 취득 = `rounded-md border border-amber-200 bg-amber-50/40 p-2` / 양도 = emerald 같은 토큰 (기존 sub-block 톤 그대로 — 새 ToneCard 신설 없음)
  - FieldCard(field=…) + CurrencyInput + BuildingStdPriceModalButton(applyTimePoint)
호출 4곳
  AssetMajor 취득 sub-block  : B0 필드 직후 (`MixedUseAssetMajorStdPrice.tsx:258` 다음)
  AssetMajor 양도 sub-block  : H_T StandardPriceInput 직후 (`:274` 다음)
  Legacy 취득                : B0 필드 직후 (`MixedUseLegacyStdPrice.tsx:183` 다음, `!isCaseA` 블록 안)
  Legacy 양도                : H_T StandardPriceInput 직후 (`:319` 다음, `!isCaseA` 블록 안)
```

톤 매핑(CLAUDE.md): 취득 = amber, 양도 = emerald(양도시점) — 기존 sub-block 색과 같다.

### 2.3 `AcqBuildingStdField` 재사용 가능성 (실제 props 확인)

`AcqBuildingStdField`의 props는 `{ asset, onChange, transferDate?, variant: "proportional"|"separate" }`(확인: `AcqBuildingStdField.tsx:36-41`)이고 내부가 일반 주택 전용으로 박혀 있다:

| 항목 | AcqBuildingStdField (일반) | 겸용 필요 | 재사용 |
|---|---|---|---|
| 폼 필드 | `buildingStandardPriceAtAcq` | `mixedAcqHousingBuildingStdPrice` / `mixedTransferHousingBuildingStdPrice` (제안) | ✕ — 한 자산이 일반·겸용 값을 섞으면 안 된다 |
| 시점 | **취득 전용**(`applyTimePoint="acquisition"`) | 취득 + **양도** | ✕ |
| 연면적 prefill | `asset.buildingFloorArea` (「건물 연면적」) | **주택 연면적 `residentialFloorArea`** — 겸용은 `buildingFloorArea`가 없고 면적이 ① `MixedUseAreaInputs`에 있다 | ✕ |
| 취득시 토지 단가 prefill | `asset.standardPricePerSqmAtAcq` | `mixedAcqLandPricePerSqm \|\| phdLandPricePerSqmAtAcq`(토지일=건물일) **또는 B0 칸 값**(별개 취득) | ✕ |
| 토지 면적 prefill | `asset.acquisitionArea` | 주택부수토지 면적(파생, `computeDerivedAreas`) | ✕ |
| 스냅샷 키 | `bsp-{id}-split-acq` | 겸용 전용 키(§4.4) | ✕ |
| testid | `acq-building-std-card` | 겸용 전용 | ✕ |

**재사용하는 것은 부품이다**: `BuildingStdPriceModalButton`(`lockedTaxType="transfer"`·`applyTimePoint`·`snapshotKey`·`prefill`·`onApply`), `CurrencyInput`, `FieldCard`, `stdPriceAddressOf`. `AcqBuildingStdField`에 `variant: "mixed"`를 더하는 안은 props가 5개 이상 갈라져(필드·시점·연면적·단가·키·testid) 한 컴포넌트가 두 도메인을 안는 형태가 된다 → 기각(Simplicity — 별 컴포넌트 ~110줄이 더 단순).

> ⚠️ 모달이 **「주택 부분만」 산정**하도록 넘길 것: `prefill.floorArea`(주택 연면적), 구조·용도는 모달 안에서 사용자가 선택(주거용). 모달에는 「건물 용도」 select가 있어(`BuildingStdPriceForm.tsx:540,668` 확인) **용도 선택은 사용자 몫**이다 — 상가 부분은 모달에 들어가지 않는다. `hideFloorAreaInput`은 켜지 않는다(상가 모달·`AcqBuildingStdField`와 같은 규약; 연면적 단일 입력 자리는 ①이라 prefill로 채우되 모달에서 보정 가능).

### 2.4 모달 prefill (시점별)

| prefill | 취득시 | 양도시 |
|---|---|---|
| `floorArea` | 주택→상가(h): `partialChangeAcqResidentialArea \|\| (residentialFloorArea + nonResidentialFloorArea)` — 취득시 전체가 주택이라서(`computeAcqDerivedAreas` `helpers.ts:65-80`). 그 밖: `residentialFloorArea` | `residentialFloorArea` |
| `landAreaM2` | 면적 미전달(취득시 면적은 엔진이 정한다 — Legacy `:182` 주석과 같은 이유) | `landArea`(주택부수토지, `derived.residentialLandArea`) |
| `acquisitionDate` | 건물 취득일 `asset.acquisitionDate` | 〃 |
| `transferDate` | 양도일 | 〃 |
| `acqLandPricePerSqm` | **토지일=건물일**이면 `mixedAcqLandPricePerSqm \|\| phdLandPricePerSqmAtAcq` / **별개 취득**이면 **B0 칸 값** `mixedAcqLandPricePerSqmAtBuildingAcq`(건물 취득일 기준이라 모달의 「건물 취득일 기준 위치지수」와 일치) | (미사용) |
| `acqLandPricePerSqm2001` | `phdLandPricePerSqmAtAcq2001` | — |
| `transferLandPricePerSqm` | — | `mixedTransferLandPricePerSqm \|\| phdLandPricePerSqmAtTransfer` |
| `snapshotKey` | `bsp-{id}-mx-housing-acq` | `bsp-{id}-mx-housing-transfer` |

- 상가 모달(`AssetMajor :394-396`)은 「토지일 ≠ 건물일이면 prefill 불가」 규칙(`canPrefillAcqLandPrice`)을 둔다. 주택 N은 **B0 칸이 정확히 그 값**이라 별개 취득에서도 prefill이 가능하다 — 신규 비대칭이 아니라 B0의 존재 이유다.
- 용도변경 h의 `floorArea` fallback은 `PartialUsageChangeInputs.tsx:36-43`·엔진 `computeAcqDerivedAreas`와 **세 번째 사본**이 된다 → prefill은 **표시 보조일 뿐**(저장값 아님·사용자가 모달에서 수정)이라 dual-truth 위험이 낮지만, 제안: `lib/calc/mixed-use-housing-std-split.ts`에 순수 함수 `acqHousingFloorAreaForModal(asset)` 하나로 두고 `PartialUsageChangeInputs`는 건드리지 않는다(Surgical).

### 2.5 B0 칸(`MixedUseAcqHousingLandPriceField`)과의 관계 — 엔진 확정 대기 E-1

현 B0 = **건물 취득일 기준** 부수토지 공시지가(`landPricePerSqmAtBuildingAcq`)로 H(건물일 공시)에서 같은 날짜의 토지분을 **빼는** 용도. 비례로 바뀌면 계획서 §4·§7이 「`landPricePerSqmAtBuildingAcq`의 역할 재정의 — 비례 분모의 가목을 어느 날짜로 잡는가(B1 Q3)」를 열어 뒀다.

| 안 | 가목 기준일 | UI 영향 |
|---|---|---|
| **A (권장)** | 건물 취득일 | **B0 칸 존치**, 술어·값·전송 불변. **문구만** 정정(§7 T1·T2). N과 같은 날짜의 가목·나목·H로 비례 — 날짜가 한 축이라 일관 |
| B | 토지 취득일(조심2008서1720, 공시 전 사안) | B0 칸 **폐지** → 술어·④·⑧·⑫·엔진·E2E(`mixed-use-acq-landprice-at-building-acq.spec.ts`) 동시 철거 + 저장 세션의 stale 값 정리. 칸이 사라지는 방향이라 §1.4 막다른 길 위험 |

A를 전제로 이 설계를 썼다. B면 §2.1 표의 2행·§2.4 `acqLandPricePerSqm` prefill·§5 ⑧ B0 줄이 바뀐다.

### 2.6 라벨 · hint · 단위 · testid

| 요소 | 취득시 | 양도시 |
|---|---|---|
| FieldCard `label` | `{acqLabel} 주택건물 기준시가` — `acqLabel`은 AssetMajor의 기존 변수(`"취득시"`·`"상속개시일"`·`"증여일"`, `:63`), Legacy는 `"취득시"` | `양도시 주택건물 기준시가` |
| `required` | `*` (술어 참이면 항상) | `*` |
| 단위 | 원 | 원 |
| hint | 「주택 부분 연면적만의 국세청 건물 기준시가입니다(상가 부분·토지 제외). 개별주택가격(주택건물+부수토지)을 토지 기준시가 : 이 건물 기준시가 비율로 나누는 데 씁니다. 토지 기준시가는 아래 「상가부수토지 개별공시지가」 × 주택부수토지 면적입니다.」 | 위와 같은 문구 + 「양도일 기준」 |
| 구별 | 기존 **「상가건물 기준시가 (토지 제외)」**(③)와 혼동되지 않게 라벨에 **「주택」** 을 박고 hint 첫 문장에 **「상가 부분 제외」** 를 둔다. 같은 `FieldCard`의 `field`가 다르다(`mixedAcqCommercialBuildingPrice` ↔ 신규) | |
| 런처 | `<BuildingStdPriceModalButton buttonLabel="취득시 주택건물 기준시가 계산" applyTimePoint="acquisition">` (내부가 `variant="modalLauncher"`) | `buttonLabel="양도시 주택건물 기준시가 계산" applyTimePoint="transfer"` |
| placeholder | 없음(숫자 예시 금지) | |
| `data-testid` (카드) | `mixed-acq-housing-building-std-card` | `mixed-transfer-housing-building-std-card` |
| `data-testid` (입력) | `mixed-acq-housing-building-std` | `mixed-transfer-housing-building-std` |
| FieldCard `field`(= `data-field`, ⑧ 이동 앵커) | `mixedAcqHousingBuildingStdPrice` | `mixedTransferHousingBuildingStdPrice` |

testid 충돌 검토: `mixed-acq-land-price-at-building-acq`(B0)·`mixed-acq-land-std-at-building-acq`와 접두만 비슷하고 정확 일치 충돌 없음. `data-testid^=`·`*=` 접두 셀렉터로 `mixed` 계열을 잡는 e2e/test는 grep 결과 **없음**(확인) — `feedback_new_widget_breaks_uniqueness_selectors` 해당 없음.

### 2.7 입력 방식 — 모달 + 직접 입력 허용 (Q-U1)

S3-1 결정(양도시 칸이 직접 편집 가능, 홈택스·세무사 산정서 사용)과 같다. 모달 「적용」→ `onApply(v) → onChange({ mixedAcqHousingBuildingStdPrice: String(v) })`. 통합 모달(`onApplyBoth`, 한 번 계산으로 두 칸 채움)은 §10 Q-U2에서 대안으로 다룬다.

### 2.8 ASCII 목업 (자산-우선, 용도변경 없음 · 별개 취득)

```
 ② 주택 기준시가
  취득시
  ┌ 개별주택공시가격 [연도▾][공시가격 조회]  [   금액 입력  ] 원 ┐      ← H (기존)
  └────────────────────────────────────────────────────────┘
  ┌ 주택부수토지 개별공시지가 — 건물 취득일 기준 (별개 취득일 때만) ┐      ← B0 (기존)
  └────────────────────────────────────────────────────────┘
  ┌ 취득시 주택건물 기준시가 *                    [   금액 입력  ] 원 ┐      ← 신규 (data-field=mixedAcqHousingBuildingStdPrice)
  │  주택 부분 연면적만의 국세청 건물 기준시가입니다(상가 부분·토지 제외)…│
  │                              [취득시 주택건물 기준시가 계산]     │
  └────────────────────────────────────────────────────────┘
  양도시
  ┌ 개별주택공시가격                              [   금액 입력  ] 원 ┐      ← H_T (기존)
  └────────────────────────────────────────────────────────┘
  ┌ 양도시 주택건물 기준시가 *                    [   금액 입력  ] 원 ┐      ← 신규 (data-field=mixedTransferHousingBuildingStdPrice)
  │                              [양도시 주택건물 기준시가 계산]     │
  └────────────────────────────────────────────────────────┘
 ③ 상가 기준시가  (상가건물 기준시가 취득/양도 · 상가부수토지 개별공시지가 취득/양도 — 기존, 주택·상가 공용 단가)
```

## §3 ①②③ 폼 필드 · 3중 패턴 술어

### 3.1 폼 필드 (제안 — 엔진 필드명 확정 대기 E-2)

| 지점 | 변경 | 위치 |
|---|---|---|
| ① 타입 | `mixedAcqHousingBuildingStdPrice: string` · `mixedTransferHousingBuildingStdPrice: string` | `lib/stores/calc-wizard-asset-gb.ts`(겸용 필드 블록 `:325-360` — B0 `mixedAcqLandPricePerSqmAtBuildingAcq`가 `:347`) + `lib/stores/calc-wizard-asset-mixed-use.ts`의 `MIXED_USE_DEFAULT_KEYS` 유니온 `:53-56` 부근. **`calc-wizard-asset.ts`(931줄, 이미 초과)는 건드리지 않는다** |
| ② initial | 두 필드 `""` | `calc-wizard-asset-mixed-use.ts` 디폴트 객체 `:94` 부근 |
| ③ normalize | `if (!a.mixedAcqHousingBuildingStdPrice) a.mixedAcqHousingBuildingStdPrice = "";` ×2 | `migrateMixedUseFields` `:182` 부근 |
| stale 가드 | **접근부 방어**: UI READ `asset.mixedAcqHousingBuildingStdPrice ?? ""`, ④·⑧은 `parseAmount(…)`(null/undefined → 0, 확인: `api-mixed-use.ts:18` 헤더 주석). migrate는 현행 `assets[]` 세션을 못 잡는다(`feedback_new_asset_field_stale_sessionstorage_guard`) | B0가 `?? ""`(`MixedUseAcqHousingLandPriceField.tsx:40`)로 한 것과 같다 |
| 숨김 stale | 술어 false 후에도 값이 store에 남는다 → **④는 술어 참일 때만 키를 싣는다**(B0 Q20 규약 — `api-mixed-use.ts:162-166`). 취득일을 바꾼 뒤 남은 값이 stale인 것은 모든 취득시 기준시가 칸의 공통 위험(S3-1 §4와 같은 판정, 별도 해소 대상 아님) | |
| `useEffect → store` | **사용 안 함** — fallback 자체가 없다(미입력은 ⑧ 차단) | |

### 3.2 3중 패턴 술어 (UI 어댑터 ← 엔진 leaf)

```ts
// lib/tax-engine/mixed-use-housing-std-split.ts   (엔진 시니어 소관 — 시그니처 제안, E-2)
export function isHousingBuildingStdRequired(i: {
  side: "acquisition" | "transfer";
  usePhd?: boolean;
  partialDirection?: "house_to_commercial" | "commercial_to_house";
  /* E-4: 취득시 H>0 요구 여부 — 엔진 확정 대기 */
}): boolean

// lib/calc/mixed-use-housing-std-split.ts   (UI 어댑터, ~45줄 — B0 `mixed-use-acq-date-split.ts`와 동일 구조)
export function needsMixedHousingBuildingStdAtAcq(a: AssetForm): boolean
export function needsMixedHousingBuildingStdAtTransfer(a: AssetForm): boolean
export function mixedAcqHousingBuildingStd(a: Pick<AssetForm,"mixedAcqHousingBuildingStdPrice">): number     // parseAmount, 폴백 없음
export function mixedTransferHousingBuildingStd(a: Pick<AssetForm,"mixedTransferHousingBuildingStdPrice">): number
export function acqHousingFloorAreaForModal(a: AssetForm): string   // §2.4
```

- 어댑터는 폼 문자열 → leaf 인자 변환만 한다(날짜·방향·PHD 규칙을 다시 쓰지 않는다). 인자 원천은 ④가 엔진에 보내는 값과 같다: `usePhd = a.usePreHousingDisclosure`, `partialDirection = a.hasPartialUsageChange && a.partialChangeDirection ? … : undefined`(B0 어댑터 `mixed-use-acq-date-split.ts:35-37`과 동일 식).
- **제안 술어값**(엔진 확정 대기):
  - 취득: `겸용 ∧ ¬PHD ∧ ¬(용도변경 ∧ commercial_to_house)`
  - 양도: `겸용 ∧ ¬PHD`
- **소비 5곳이 한 함수**: ⑤ 컴포넌트(false면 null) · ④ `buildMixedUsePayload`(참일 때만 키) · ⑧ `validateMixedUseAsset`(참 ∧ ≤0이면 오류) · ⑫ 겸용 스키마 superRefine(엔진 leaf를 직접 호출) · 엔진 throw. 겸용 아닌 자산은 `assetKind === "housing" && isMixedUseHouse` 선행 게이트(어댑터 `mixed-use-acq-date-split.ts:30` 패턴).
- **격자 패리티 테스트**(§8 V-1): 겸용 × 취득원인(매매·상속·증여·신축) × PHD × 용도변경(없음·h·i) × 취득일 동일/별개 × H 있음/없음의 전수 격자에서 `노출 ⇔ ⑧ 요구 ⇔ ④ 전송 ⇔ ⑫ 요구` (`feedback_fe8_vs_12_parity_grid`). ⑧ ⊇ ⑫ 방향성도 검사.

## §4 ④ API 변환 (+ ⑫⑬⑭)

### 4.1 ④ `lib/calc/transfer-tax-api-mixed-use.ts` (365줄 → +~14줄)

```ts
acquisitionStandardPrice: {
  housingPrice: …, commercialBuildingPrice: …, landPricePerSqm: …,
  ...(needsMixedAcqLandPriceAtBuildingAcq(primary) ? { landPricePerSqmAtBuildingAcq: … } : {}),     // B0 (기존)
  ...(needsMixedHousingBuildingStdAtAcq(primary) ? { housingBuildingPrice: mixedAcqHousingBuildingStd(primary) } : {}),   // 신규 (필드명 E-2)
},
transferStandardPrice: {
  …,
  ...(needsMixedHousingBuildingStdAtTransfer(primary) ? { housingBuildingPrice: mixedTransferHousingBuildingStd(primary) } : {}),
},
```

- 명시 매핑이라 빠지면 침묵 strip(`api-mixed-use.ts:4-5` 헤더) — **여기 추가하지 않으면 엔진에 안 간다**.
- **공유지분(`share()`)**: 기준시가는 스케일하지 않는다(헤더 표 `:98` 「기준시가 전부 — 안 한다」) → N도 **스케일하지 않는다**. 분모·분자가 같은 100% 스케일이어야 비례가 성립한다.
- **fallback 없음**: 술어 참인데 값이 0이면 0을 싣고 ⑧·⑫가 막는다(자동 안분 fallback 금지).

### 4.2 ⑫⑬⑭ (엔진 쪽 요구 — UI 시니어가 확인한 사실)

| 지점 | 사실 (확인) | 요구 |
|---|---|---|
| ⑫ Zod | `mixedUseStandardPriceSchema`(`schema-mixed-use.ts:32-36`)는 비엄격 `z.object` → 필드가 없으면 **침묵 strip**(`:56-58` 주석). 취득측은 `.extend({...})`(`:51`), 양도측은 기본 스키마 그대로 | 취득·양도 양쪽에 신규 optional `nonnegative().int()` 추가 + superRefine에서 `isHousingBuildingStdRequired`로 필수화(B0 `:166-178`과 동일 구조). **양도측 `.extend`가 새로 필요**하다 |
| ⑬ body spread | 단건·컴패니언 모두 `mixedUse` 서브객체째 전송(`api.ts:720`, `companion-payload.ts:230`) | 신규 변경 없음(④ 안의 서브객체 값이라) |
| ⑭ Route | `mixed-use-asset-input.ts:173` `...s.mixedUse` 스프레드, `landAcquisitionDate` 등만 Date 변환 | **변경 없음** — Zod가 필드를 통과시키면 엔진 `MixedUseAssetInput`에 도달. 엔진 타입(`transfer-mixed-use.types.ts`의 `MixedUseStandardPrice`·`acquisitionStandardPrice` 확장 타입)에 필드만 추가 |
| ⑨⑩⑪ | 해당 없음(enum·자산-수준 `acquisitionDate` fallback 무관) | — |
| 컴패니언 ⑫ | `transfer-tax-schema-companion.ts:119`가 **같은 `mixedUseAssetSchema`** | 자동 전파 |

### 4.3 5단 파이프라인 전수 (폼 → … → 엔진)

폼(①②③) → 변환 ④(`buildMixedUsePayload`, 술어 참일 때만 키) → fetch body ⑬(서브객체째) → Zod ⑫(필드 + refine) → Route ⑭(스프레드, 변경 없음) → 엔진 input. **고쳐도 안 도달하는 곳**: ⑫ 양도측 스키마에 필드를 안 넣으면 strip(B0가 양도측에 둘 필요가 없어서 `.extend`가 취득측에만 있다 — 복사 실수 주의).

### 4.4 스냅샷 키 (계산서 서식)

`BuildingStdPriceModalButton`은 `snapshotKey`가 없으면 「건물 기준시가 계산서」 서식이 **비어 출력**된다(`AcqBuildingStdField.tsx:63-64` 주석). 신규 키 규약:

- `bsp-{assetId}-mx-housing-acq` · `bsp-{assetId}-mx-housing-transfer`
- `lib/calc/building-std-snapshot-keys.ts` 갱신 필수 3곳(단일 출처, 소비처는 화면·PDF·이력 동봉 필터): `idOfSnapshotKey`(`-mx-housing-(acq|transfer)$` 환원 — 긴 접두 먼저 규율) · `snapshotKeyTimepoint`(두 정규식에 `mx-housing` 접두 추가 — 한쪽만 고치면 화면·PDF 불일치 `:39-47` 주석) · `snapshotKindLabel`(「겸용 주택분」). 단위 테스트 `__tests__/calc/building-std-snapshot-keys.test.ts`에 케이스 추가.
- 대안(기각): 기존 `split` 계열 키 재사용 — 겸용은 별개 취득 분할 카드가 없어 충돌은 없으나 `snapshotKindLabel`이 「토지·건물 분리 건물분」으로 **오표기**한다(Q-U7).
- ⚠️ `-mx-commercial`처럼 취득·양도 통합 키가 아니라 **시점별 2키**다(칸이 시점별이므로 — §2.2). 통합 모달 안(Q-U2)을 채택하면 `-mx-housing` 단일 키 + `idOfSnapshotKey`에 `-mx-housing$`.

## §5 ⑧ validation (`lib/calc/transfer-tax-validate-mixed-use-asset.ts`, 227줄 → +~28줄)

| 항목 | 설계 |
|---|---|
| 요구 위치 (취득) | B0 검사(`:130-134`) **직후**: `needsMixedHousingBuildingStdAtAcq(asset) && mixedAcqHousingBuildingStd(asset) <= 0` → `fieldError("mixedAcqHousingBuildingStdPrice", msg)` |
| 요구 위치 (양도) | 양도시 단가 검사(`:46-50`) **직후**: `needsMixedHousingBuildingStdAtTransfer(asset) && … <= 0` → `fieldError("mixedTransferHousingBuildingStdPrice", msg)` |
| 순서 | 기존 ⑧은 양도시 검사(`:41-50`)가 취득시 검사(`:59-134`)보다 먼저다(화면은 취득 → 양도). 기존 H_T·H와 같은 위치 관계를 따른다 — 양도 N이 취득 N보다 먼저 보고된다. 화면 순서에 맞추려면 양도 블록을 이동해야 해 범위 밖(`feedback_validate_routing_reveals_intended_screen_layout`: 의도된 화면 정본은 validate 순서지만 이 파일은 이미 양도 우선) |
| 메시지(취득) | `${label}: ${acqWord} 주택건물 기준시가를 입력하세요. 겸용주택의 개별주택가격(주택건물+부수토지)은 토지 기준시가 : 건물 기준시가 비율로 토지분·건물분에 나눕니다 — 주택 부분 연면적 기준으로 계산기에서 산정하거나 직접 입력하세요.` |
| 메시지(양도) | 같은 구조, `양도시 주택건물 기준시가` |
| 조문 인용 | S3-1 메시지는 「소득세법 §99①1호 나목·시행령 §166⑥」을 붙였다. **겸용 주택분의 §166⑥은 주택:상가 안분 조문이라 이 비례(토지:건물)의 근거로 같은 문구를 그대로 쓸 수 있는지 확인 필요**(`korean-law-citation-verify`). 확인 전에는 메시지에서 조문 인용을 **뺀다**(권장) |
| 접두 | 신규 메시지는 `^자산: .*주택건물 기준시가를 입력하세요`(B0 `^…건물 취득일.* 기준 주택부수토지`와 구별) |
| 3중 패턴 | 술어는 §3의 한 함수. fallback·display fallback 없음. 미입력은 ⑧ 오류 + **입력칸 이동**(`fieldError`의 key = FieldCard `field`) |
| 막다른 길 | 칸은 술어 참인 **모든 상태에서 렌더**된다 — AssetMajor는 ② 주택 sub-block이 `usePreHousingDisclosure` 거짓일 때만 H·H_T를 렌더(`:238,:262`)하는데 술어도 `¬PHD`라 같다. Legacy는 `!isCaseA`(PHD 파생) 블록 안인데 술어가 `¬PHD`라 **`isCaseA ⊂ PHD`** 로 포함된다 ✓. 섹션 접힘(③ 취득정보)은 기존 이동 메커니즘이 펼친다(B0·S3-1과 같은 섹션) |
| 저장 이력 재계산 | 이력 `inputData` 복원 → 신규 필드 `""`(③) → ⑧이 막고 그 칸으로 이동. 저장 `resultData`는 스냅샷이라 불변(plan §4 「저장 이력」과 같음) |
| 영향받는 기존 ⑧ 케이스 | `validation-field-jump-cases-*.ts`의 겸용 시드 모두 신규 칸을 채워야 통과(§8 E-역grep) |

## §6 ⑥ 사이드바 · ⑦ 결과 카드

### 6.1 ⑥ 사이드바 — **변경 없음** (확인)

- 겸용 사이드바 메타(`lib/stores/calc-wizard-store.ts:403-451`)는 **주택:상가 양도가액 안분**에 `mixedTransferHousingPrice`(결합 H_T)·상가 건물·상가 토지만 쓴다. 이 안분은 plan §2 「바꾸지 말아야 할 곳」(겸용 주택:상가 안분은 결합가 그대로)이다 → N을 읽지 않는다.
- 자산별 행: `computeTransferPerAssetSummary`의 `isPlainLumpSumAsset`(`transfer-per-asset-summary.ts:139-152` — S3-1 설계가 확인한 바와 동일)이 겸용을 제외(`:144` `!a.isMixedUseHouse`)해 계산 전 개산공제 미리보기(`총액 × 율`)에 안 걸린다. 계산 후엔 엔진 확정값. **개산공제 base가 비례 몫으로 바뀌어도 사이드바는 엔진값을 읽는다.**
- ⚠️ 엔진이 개산공제 합계를 `H × 3%`(라목 전체)로 유지하는지(토지분 + 건물분 base 합 = H) 아니면 가목·나목 원값에 3%를 씌우는지에 따라 **결과 카드의 「× 3%」 라벨**이 달라진다 → §6.2.

### 6.2 ⑦ 결과 카드 (`components/calc/results/mixed-use/MixedUseCalculationSections.tsx`, 593줄 → +~35줄)

현행(확인): 주택 블록이 `h.landStdPriceAtAcq`·`h.buildingStdPriceAtAcq`를 **개산공제 괄호 라벨**로만 쓴다(`:328`·`:340`) — 개별주택가격을 토지/건물로 나눈 **분할 과정은 화면 어디에도 없다.** 신규 표시:

```
 ▸ 취득시 주택분 기준시가 분할 (개별주택가격 → 토지분·건물분)
   토지분 기준시가 = 개별주택가격 {H} × 토지 기준시가 {L} ÷ (토지 기준시가 {L} + 주택건물 기준시가 {N})   = {토지분}
   건물분 기준시가 = 개별주택가격 {H} − 토지분 {토지분}                                                  = {건물분}
 ▸ 양도시 주택분 기준시가 분할 (양도가액 안분 비율)   — 같은 형식
```

- 위치: `주택 양도차익` 행 **앞**(`주택 양도차익` 행(`:314` 부근), 환산취득가 행 다음) — 분할값이 양도가액·취득가액 안분과 개산공제에 쓰이므로 사용 순서상 앞.
- 표기 규칙: `FLine`/`Frac`(`components/calc/results/shared/FormulaParts`) · 한국어 풀어쓰기 · 각 숫자 옆 라벨 · `Math.floor` 묵시 · 중간 산술 미표시 · 건물분은 잔액 흡수 `H − 토지분`(S3-1 `SplitGainDetailSection.tsx:148`과 같은 규약).
- **엔진 echo 요구 (E-6)**: `HousingGainSplit`(`housing.ts:24-37`)에 `housingStdSplit?: { acq?: StdSplit; transfer?: StdSplit }` — `StdSplit = { housingTotal; landStd; buildingStd; landBasis; buildingBasis }`(S3-1 `stdSplit`과 같은 모양 → 결과 카드 부품 재사용 가능성 점검). 전달 경로: `helpers.ts:658`·`:709`(`landStdPriceAtAcq` 복사 지점) → `MixedUseGainBreakdown` housing(`transfer-mixed-use.types.ts:579` 부근). **echo가 없는 결과(PHD·용도변경 i 취득시·구 저장 이력)는 블록을 그리지 않는다** — 유무로 분기(플래그 의미 변경에 의존하지 않음).
- **개산공제 라벨**(`:328·:340`): 현행 「취득시 토지 기준시가 X × 3%」의 X가 가목 원값이다(`housing.ts:395` `landStdPriceAtAcq: acqLandStd`(HEAD 확인 필요 — 줄 이동)). 비례에서 개산공제 base가 **비례 몫**(S3-1 `lumpDeductionBase`)이면 X는 토지분(`landBasis`), 라벨을 「취득시 토지분 기준시가」로, 괄호가 위 분할 블록과 같은 숫자를 가리키게 한다. `landStdPriceAtAcq`의 **의미**는 엔진이 정한다(E-6) — UI는 echo를 읽기만 한다(재계산 금지, `feedback_aggregate_display_rederives_engine_value`).
- 컴패니언 겸용 파트 카드·합산·PDF·신고서: 같은 `MixedUseGainBreakdown`을 소비하는지 **확인 필요**(`MixedUseResultCardAdapter.ts` 외 소비처 grep에서 `landStdPriceAtAcq` UI 소비는 `MixedUseCalculationSections` 한 곳뿐이었다 — 컴패니언 경로 렌더 파일은 미열람).

## §7 문구 정정 (역방향 grep — `components lib e2e __tests__`)

검색식: `건물분|토지분을 빼|빼야|빼 건물|뺍니다|뺄셈|역산|같은 날짜의 토지분|토지분 =|건물분 =` + 겸용 범위(`components/calc/transfer/mixed-use`·`MixedUseSection`·`components/calc/results/mixed-use`·`lib/calc/*mixed-use*`·`lib/api/transfer-tax-schema-mixed-use.ts`·`lib/tax-engine/mixed-use-acq-date.ts`). 「역산」 중 §164⑤ PHD 환산·면적 역산(`MixedUseAreaInputs.tsx:41-146`·`MixedUseCalculationSections.tsx:219-305`·`MixedUseResultCardParts.tsx:114-158`·`PreHousing…`)은 **다른 개념이라 대상 아님**(확인).

| # | 위치 | 현재 | 정정안 | 종류 |
|---|---|---|---|---|
| T1 | `MixedUseAcqHousingLandPriceField.tsx:48` (B0 hint) | 「…건물분을 구하려면 같은 기준일의 토지분(공시지가 × 주택부수토지 면적)을 **빼야 합니다**. 상가부수토지 개별공시지가(토지 취득일 기준)로 대신하지 않습니다.」 | 「개별주택공시가격은 토지+건물 일괄가액이라, 이를 토지분·건물분으로 나누려면 같은 기준일의 토지 기준시가(공시지가 × 주택부수토지 면적)가 필요합니다. 상가부수토지 …」 | **화면 문구**(E-1 A안 전제) |
| T2 | `MixedUseAcqHousingLandPriceField.tsx:23` (헤더 주석) | 「…같은 날짜의 토지분을 빼야 건물분이 되는데…」 | 비례 서술로 교체 | 주석 |
| T3 | `transfer-tax-validate-mixed-use-asset.ts:133` (B0 ⑧ 메시지 괄호) | 「(개별주택공시가격에서 같은 날짜의 토지분을 **뺍니다**)」 | 「(개별주택공시가격을 같은 날짜의 토지 기준시가 비율로 나눕니다)」 | **화면 문구**(오류 패널) |
| T4 | `lib/tax-engine/mixed-use-acq-date.ts:6,24` · `types/transfer-mixed-use.types.ts:99` · `housing.ts:126-132,269-302` | 「건물분 = H − 토지분」·「뺄셈의 피감수」·「토지분을 빼」 | 엔진 시니어가 함수 교체 시 함께 | 엔진 주석(본 문서 소관 밖) |
| T5 | `e2e/mixed-use-acq-landprice-at-building-acq.spec.ts` | 위 T1·T3의 **문구를 단언하지 않음**(확인: spec이 `/건물 취득일\(2010-03-15\) 기준 주택부수토지/` 접두만 단언 — T3 접두 유지) | 접두 불변이라 무영향 | 확인 |
| T6 | `components/calc/transfer/mixed-use/MixedUseAssetMajorStdPrice.tsx:248` (H hint) | 「미공시 시 비워두세요 — 위 §164⑦ 토글 사용」 | 변경 없음(비례 무관). 단 **「개별주택공시가격」 라벨 아래 N 칸이 따라온다**는 안내는 N 카드 hint가 맡는다 | 확인 |
| T7 | `MixedUseLegacyStdPrice.tsx:260` (상가→주택 안내) | 「…양도시 면적비율로 안분되어 취득시 주택부분 기준시가를 산정합니다.」 | 의미 불변(취득시 상가 기준시가를 주택/상가로 안분 — 토지:건물 분할과 다른 축). 단 **양도시 주택건물 기준시가 칸이 필요**함을 안내에 추가할지는 Q-U3 결정 후 | 확인 |

⚠️ 위 grep은 `PreHousingDisclosure…`·`MixedUsePreHousingDisclosureSection`의 「역산」(§164⑤ 3시점 환산)·`MixedUseResultCardParts`의 「역산한 취득시 개별주택가격」을 의도적으로 제외했다 — 이 문구들은 PHD의 `P_A_est` 서술이고 의미상 맞다(S3-1 UI §3.1 「그대로 두는 것」과 같은 판정).

## §8 E2E · vitest 계획

### 8.1 신규 spec — `e2e/mixed-use-housing-std-proportional.spec.ts`

시드: B0 spec(`mixed-use-acq-landprice-at-building-acq.spec.ts:20-76`)의 `mixedAsset()`·`seed()`·`expandAssetSection(page, 3)` 방식 그대로. 포트 `E2E_PORT=3132`(워크트리). 부정 단언마다 **같은 spec의 긍정 단언**을 짝으로 둔다(`feedback_negative_anchor_needs_positive_twin`).

| # | 시나리오 | 단언 |
|---|---|---|
| H1 | 자산-우선(용도변경 없음)·매매 환산·토지일=건물일 | `mixed-acq-housing-building-std-card` **1개 보임** · `mixed-transfer-housing-building-std-card` **1개 보임** · DOM 순서: 취득 N은 `mixedAcqHousingPrice` **뒤**·양도 sub-block **앞**, 양도 N은 `mixedTransferHousingPrice` **뒤**·③ 상가 섹션 **앞** · 라벨에 「주택건물」 포함 · 기존 `상가건물 기준시가` 칸과 `data-field` 구별 |
| H2 | **부정 짝 PHD** | 같은 시드에서 `usePreHousingDisclosure` ON → 두 카드 **0개** (H1 긍정과 짝). OFF로 복귀하면 다시 1개 |
| H3 | 용도변경 h(주택→상가) | 두 카드 **1개씩**(취득시 prefill 연면적 = 주택+상가 합, §2.4 — 모달을 열어 `floorArea` 입력값 확인) |
| H4 | 용도변경 i(상가→주택) | 취득 N 카드 **0**, 양도 N 카드 **1**(H3 긍정과 짝) |
| H5 | 상속(≥1985) | 두 카드 **1개씩**, 라벨이 「상속개시일 주택건물 기준시가」 |
| H6 | 별개 취득(B0) | B0 카드·취득 N 카드 **동시 1개씩**, 순서 B0 → N · 모달 prefill `acqLandPricePerSqm`이 B0 칸 값(모달에서 확인) |
| H7 | **⑧ 차단 + 입력칸 이동** | N 비움 → 「다음」 → `validation-issues`에 「취득시 주택건물 기준시가를 입력하세요」 → 오류 클릭 → 입력 `mixed-acq-housing-building-std` **focus** · 뷰포트 내 → 채움 → 오류 소멸. 양도 N도 같은 흐름 |
| H8 | **막다른 길 없음 격자** | H1~H6 상태마다 「N 비움 → 「다음」」: 오류가 나면 **그 칸이 DOM에 보인다**(`toBeVisible`). 오류가 안 나면 카드가 0개(= 술어 거짓) — `노출 ⇔ 요구` 양방향 |
| H9 | **request body** | `page.waitForRequest(/api\/calc\/transfer$/)` — 계산 클릭 후 body `mixedUse.acquisitionStandardPrice.<엔진필드>`·`transferStandardPrice.<엔진필드>`에 입력값 존재(공유지분 100%에서 스케일 없음) · PHD 시 **키 없음**(짝) · 상가→주택 시 취득측 키 없음, 양도측 있음 |
| H10 | 결과 산식 | 계산 후 결과의 「취득시 주택분 기준시가 분할」 블록 숫자 = 입력(H·N)과 엔진 echo 일치 · `개별주택가격 × 토지 기준시가 ÷ (토지 + 주택건물)` 한국어 라벨 · PHD 결과에는 블록 **없음** |
| H11 | 컴패니언(함께 양도) 겸용 | 자산 2에 겸용 → 같은 카드·같은 칸 · request body `companionAssets[*].mixedUse…`에 N 존재(기존 `transfer-companion-mixed-use.spec.ts` 시드 활용) |
| H12 | 모달 적용 | 런처 클릭 → 연면적 등 입력 → 「취득시 적용」 → 칸 채워짐 · `applyTimePoint`라 반대 시점 적용 버튼 없음 |
| H13 | **저장 이력 재계산(구 이력)** | 신규 필드가 없는 `inputData` 시드(B0 이전 형태) → 「이 조건으로 재계산」 경로에서 ⑧ 차단 + N 칸 이동(막다른 길 아님) — 방법은 기존 이력 재계산 spec 확인 필요 |

### 8.2 기존 e2e 역방향 grep (필드명 기준 — 자르지 않음)

- 겸용 시드를 가진 spec 전부(`e2e/mixed-use-*.spec.ts` 15개 + `transfer-companion-mixed-use.spec.ts` + `building-std-2023-mixed-*`)는 겸용 주택분이 비-PHD면 **신규 N 필수**로 「다음」/계산이 막힌다 → 시드에 N 두 칸 추가. **전수 목록·건수는 Do 단계에서 `grep -ln "isMixedUseHouse" e2e` 후 실행으로 확정**(이 설계에서는 실행하지 않았다 — 확인 필요). B0 시드 `mixedAsset()`의 `mixedAcqHousingPrice`·`mixedTransferHousingPrice` 보유 spec이 1차 후보.
- `e2e/_helpers/validation-field-jump-cases-*.ts`의 겸용 케이스: 신규 오류가 **기존 케이스의 대상 오류보다 먼저** 나오지 않도록 시드에 N을 채워야 한다(양도 N이 취득 검사보다 앞서므로 더 많은 케이스에 영향 — 확인 필요).

### 8.3 vitest

| # | 테스트 | 내용 |
|---|---|---|
| V-1 | `__tests__/calc/mixed-use-housing-std-split-parity.test.ts` | §3 격자 패리티(노출 술어 ⇔ ⑧ ⇔ ④ ⇔ ⑫). **엔진 leaf를 직접 import**해 어댑터가 판정 규칙을 복제하지 않았음을 보인다(`feedback_leaf_anchor_skips_zod_layer` — ⑫는 route/Zod 경유 케이스 1건 별도) |
| V-2 | `__tests__/calc/mixed-use-housing-std-split-api.test.ts` | ④: 술어 참일 때만 키 · 지분 60%에서 N 스케일 안 함 · PHD 키 없음 · `parseAmount` undefined 방어(stale 세션) |
| V-3 | `__tests__/components/mixed-use-housing-building-std-field.test.tsx` | DOM(`.test.tsx`): 술어 ⇔ 렌더 · 런처 props(`applyTimePoint`·`snapshotKey`·`prefill.floorArea`) · 별개 취득에서 B0 값 prefill |
| V-4 | `__tests__/components/mixed-use-housing-std-split-display.test.tsx` | echo 있음/없음 두 갈래 문구 |
| V-5 | `__tests__/calc/building-std-snapshot-keys.test.ts` 확장 | `-mx-housing-acq/-transfer` 환원·시점·라벨 |
| V-6 | ⑧ 단위: `transfer-tax-validate-mixed-use-asset` 기존 테스트 중 겸용 비-PHD 케이스는 N 보충 필요(건수 확인 필요) |

## §9 800줄

| 파일 | 현재 | 증감 | 착지 | 판정 |
|---|---|---|---|---|
| `components/calc/transfer/mixed-use/MixedUseHousingBuildingStdField.tsx` (신규) | — | +~110 | ~110 | OK |
| `lib/calc/mixed-use-housing-std-split.ts` (신규) | — | +~45 | ~45 | OK |
| `MixedUseAssetMajorStdPrice.tsx` | 490 | +~22(호출 2곳 + import) | ~512 | OK |
| `MixedUseLegacyStdPrice.tsx` | 387 | +~20 | ~407 | OK |
| `MixedUseAcqHousingLandPriceField.tsx` | 56 | 문구만 ±0 | 56 | OK |
| `transfer-tax-api-mixed-use.ts` | 365 | +~14 | ~379 | OK |
| `transfer-tax-validate-mixed-use-asset.ts` | 227 | +~28 | ~255 | OK |
| `lib/api/transfer-tax-schema-mixed-use.ts` | 203 | +~25(양도측 `.extend` + refine) | ~228 | OK |
| `lib/stores/calc-wizard-asset-mixed-use.ts` | 202 | +~6 | ~208 | OK |
| `lib/stores/calc-wizard-asset-gb.ts` | 407 | +~12 | ~419 | OK |
| `lib/stores/calc-wizard-asset.ts` | **931(이미 초과)** | **0 — 건드리지 않는다** | 931 | ⚠️ 기존 초과, 별건 |
| `MixedUseCalculationSections.tsx` | 593 | +~35 | ~628 | OK(≤700) |
| `lib/calc/building-std-snapshot-keys.ts` | (미측정) | +~6 | — | 확인 필요 |

## §10 사용자 결정 질문 (Q-U-n)

| # | 질문 | 선택지 | 권장 |
|---|---|---|---|
| **Q-U1** | N 입력 방식 | (a) 모달 + **직접 입력 허용** (b) 모달 전용 | **(a)** — S3-1·양도시 칸과 동일(홈택스·산정서). 이견 없으면 확정 |
| **Q-U2** | 취득·양도 N의 배치 | (a) **각 시점 sub-block에 1칸씩 + 런처 2개**(`applyTimePoint`, 스냅샷 시점별 2키) (b) 한 카드 2열 + **통합 모달**(`onApplyBoth`, 한 번 계산으로 두 칸 — 상가건물 `:352-408`과 같은 형) | **(a)** — 계산 순서(취득 블록 → 양도 블록)·시점 색(amber/emerald)과 맞고 PHD 시 양도 블록이 통째로 숨는 기존 구조를 건드리지 않음. (b)는 입력 수고가 줄지만 두 칸이 시점 블록 밖으로 나와 순서·톤 규약과 어긋나고, h(용도변경)에서 취득·양도 연면적이 달라 한 모달에 담기 어렵다 |
| **Q-U3** | 용도변경 노출 | (a) 방향별(h: 양쪽 · i: 양도만) — **코드 대조 결과** (b) 용도변경은 전부 비노출(지시문 가정) | **(a)** 단 **엔진 확정 대기**. (b)로 가려면 엔진이 용도변경 경로의 나목 소비를 없애야 한다(h의 `else` 분기가 일반 분기라 구조상 어렵다) |
| **Q-U4** | PHD + §97②2호 단서 양도시 뺄셈 | (a) 엔진이 PHD 패널의 `phdBuildingStdPriceAtTransfer`(주택건물 3시점 입력, 이미 존재)를 양도시 나목으로 사용 — **신규 칸 불필요** (b) PHD에도 양도시 N 신규 칸 | **(a)** — (b)는 PHD 양도 sub-block이 숨겨진 구조(`AssetMajor :262`)와 충돌하고, 단서 채택은 계산 **결과**에 달려 UI가 사전에 요구할 수 없어 막다른 길 위험 |
| **Q-U5** | B0 칸(건물 취득일 가목) 처리 | **(A) 존치 + 문구 정정**(가목·나목·H 모두 건물일) (B) 폐지(토지일 가목) | **(A)** — 근거: 날짜 한 축이라 일관, 변경량 최소. 단 **엔진·계획서 B1 Q3 확정 대기**(공시 후 사안의 가목 기준일 문헌 미확보 — plan §7). B면 §2.5·§4·§5·e2e 연쇄 |
| **Q-U6** | 상속·증여에서 취득시 H가 비어 있고 신고가액만 있을 때 | (a) N을 **필수**로 요구(토지:건물 배분에 필요) (b) H·N 모두 요구 | **(a) + 엔진 확정**. 코드 대조상 현행은 H=0이면 `acqBuildingStd=0`→토지 100%(`:273-302` — 실행 확인 필요). 비례식이 가목:나목 비율만으로 서면 H 없이 배분 가능하므로 N 필수·H 선택이 자연스럽다. 엔진 §3 술어(H>0 요구 여부, E-4)와 한 번에 정한다 |
| **Q-U7** | 건물 기준시가 계산서 스냅샷 키 | (a) 신규 `-mx-housing-(acq\|transfer)` + 라벨 「겸용 주택분」 (b) 기존 `-split-` 재사용 | **(a)** — (b)는 계산서 제목이 「토지·건물 분리 건물분」으로 오표기. 키 파일 3정규식 + 테스트 갱신 비용은 작다 |
| Q-U8 | 메시지의 조문 인용(§99①1호 나목·시행령 §166⑥) | 유지 / 삭제 | **삭제**(확인 전). 겸용 §166⑥의 본문은 주택:상가 안분이라 같은 문구가 이 비례의 근거인지 `korean-law-citation-verify`로 확인 후 복원 |

### 엔진 시니어와 맞출 것 (E-n — 엔진 설계 확정 대기)

| # | 항목 | UI 영향 |
|---|---|---|
| E-1 | 비례 분모의 **가목 기준일**(건물일/토지일) — B0 `landPricePerSqmAtBuildingAcq` 존치 여부 | §2.5, Q-U5 |
| E-2 | 필드명·타입: 제안 `acquisitionStandardPrice.housingBuildingPrice` · `transferStandardPrice.housingBuildingPrice`(optional int ≥0, `commercialBuildingPrice`와 대칭) + leaf `isHousingBuildingStdRequired({side, usePhd, partialDirection, …})`(`mixed-use-acq-date.ts`와 같은 위치·형) | §3·§4 |
| E-3 | PHD + §97②2호 단서 경로의 양도시 뺄셈(`applyHousingProviso` ← `transferBuildingStd`) 처리 | Q-U4 |
| E-4 | 취득시 N 필수 술어가 `housingPrice > 0`에 의존하는가(상속·증여 신고가액 단독) | Q-U6 |
| E-5 | 용도변경 h의 취득시 연면적 정의(취득시 주택 면적 = 전체) · i의 양도시 비율 차용 유지 여부 | §1.2 h·i, §2.4 |
| E-6 | 결과 echo `housingStdSplit {acq, transfer}`와 `landStdPriceAtAcq`/`buildingStdPriceAtAcq`의 **의미**(개산공제 base = 비례 몫인가 가목 원값인가) | §6.2 |
| E-7 | 환산 분모: 겸용은 총액 H_T 그대로(분자 H와 같은 총액 척도)라 S3-1 D-1(분모 척도) 쟁점이 **없어 보인다** — 코드 대조(`helpers.ts:403-425`)만, 엔진 확인 필요 | 양도시 N은 분모가 아니라 **양도가액 토지/건물 분리·필요경비 안분 축**에만 쓰임 |

## §11 확인 필요 (이 설계가 확인하지 못한 것)

1. **모달을 겸용 주택분 경로에서 실제로 열어 값 적용까지 해 본 화면 실측은 하지 않았다**(입구 가시성·필드 앵커·화면 순서까지만 실측 — 본문 §1.3·§2.1). Do 단계 H12에서 확인.
2. 엔진 설계 확정 전이라 §1.2의 취득 N/양도 N 열은 **코드 판독 기반 제안**이다(E-1~E-7).
3. 상속·증여 H=0 → 토지 100% 쏠림은 **코드 대조**(`housing.ts:273-302`)이고 실행하지 않았다.
4. 컴패니언 겸용 결과 카드·합산 카드·PDF·신고서가 겸용 breakdown의 신규 echo를 소비하는지(`landStdPriceAtAcq` UI 소비는 `MixedUseCalculationSections` 한 곳으로 확인) — 컴패니언 렌더 경로 미열람.
5. 기존 e2e·vitest 중 겸용 비-PHD 시드의 **정확한 영향 건수**(신규 N 필수화로 막히는 수) — 변형 실측 미수행(엔진 설계 §5가 vitest 쪽을 잰다).
6. `building-std-snapshot-keys.ts` 소비처(이력 동봉 필터 `use-auto-save-calculation`·`BuildingStdPriceReportSection`·PDF)의 키 접두 열거가 새 키를 통과시키는지 — 정규식 3곳 외 소비처 열람 미완.
7. 공시 후 겸용(개별주택가격 있음)의 비례 가목 기준일 문헌 — plan §7 「공시 후 정면 사안 미확인」과 같음(Q-U5).
8. 메시지 조문 인용 정합(Q-U8).
9. **자동 안분 fallback 금지·useEffect→store 미러링 금지·validate 동기화** 3대 정책 자가 점검: 신규 칸은 fallback 없음(미입력 ⑧ 차단), `useEffect` 미사용(prefill은 렌더 시 파생), ⑧은 ⑤·④와 같은 술어. 14 동기화 중 클라이언트 ①②③④⑤⑥(무변경)⑦⑧ + ⑫(엔진 쪽 요구)⑬⑭(무변경 확인) 명세 완료 — **구현 전이라 grep 자가 점검은 Do 단계 몫**.

---

## §12 Do 결과 (UI 측 — 2026-10-07, 진행 중 기록)

> 단계마다 갱신(중간에 멈춰도 상태가 남도록). 최종 정리·14지점 점검표는 이 절 끝 「최종」 소절.

- **[1/9 완료] ①②③**: `mixedAcqHousingBuildingStdPrice`·`mixedTransferHousingBuildingStdPrice`(string, `""`) — 타입 `lib/stores/calc-wizard-asset-gb.ts`, initial·normalize `lib/stores/calc-wizard-asset-mixed-use.ts`(`calc-wizard-asset.ts` 931줄은 미접촉). stale 세션 복원 → `""` → ⑧이 막는다(값 지어내기 없음).
- **[2/9 완료] 어댑터·④·⑧·⑤·키**: `lib/calc/mixed-use-housing-std-split.ts`(leaf 4술어 어댑터 + 값 + 모달 연면적) · ④ `transfer-tax-api-mixed-use.ts` · ⑧ `transfer-tax-validate-mixed-use-asset.ts` · ⑤ `MixedUseHousingBuildingStdField.tsx`(AssetMajor 2곳·Legacy 2곳) · 스냅샷 키 `-mx-housing-{acq|transfer}`(`building-std-snapshot-keys.ts`) + 적용성 게이트(`building-std-snapshot-applicability.ts`) · 오류 path 라벨(`transfer-tax-error-format.ts`).
- **[3/9 완료] ⑦·문구**: `components/calc/results/mixed-use/MixedUseHousingStdSplit.tsx`(echo kind 3형태 — 재도출 없음, echo 없으면 미표시) + `MixedUseCalculationSections.tsx`(주택 양도차익 행 앞 삽입 · 개산공제 괄호 라벨 「취득시 토지분/건물분 기준시가」). stale 문구 T1·T2·T3·T7 정정(`MixedUseAcqHousingLandPriceField`·`calc-wizard-asset-gb.ts` 주석·⑧ B0 메시지·Legacy 상가→주택 안내).
- **[4/9 완료] vitest 보충**: 폼 경유 route 테스트 12파일은 body shim을 걷고 **폼 필드**에 항등 나목(`__tests__/tax-engine/_helpers/mixed-use-identity-std-form.ts` — ④ 페이로드에서 엔진 shim 값을 읽어 폼 문자열로 환원). dom 14파일은 엔진 직접 호출이라 `calcMixedUseTransferTaxIdN`으로 import 교체(12파일 값 불변 통과 · 2파일은 아래 「바뀐 기대값」).
- **[5/9 완료] 신규 테스트**: `__tests__/calc/mixed-use-housing-std-split-parity.anchor.test.ts`(격자 811건 — 노출·④·⑧·⑫ 패리티 + H 술어 ⑧ ⊇ leaf, 뮤테이션 4종 KILLED) · `__tests__/components/mixed-use-housing-building-std-field.anchor.test.tsx`(17) · `…-std-split-display.anchor.test.tsx`(12, 뮤테이션 1종 KILLED) · 스냅샷 키·적용성 게이트 테스트 확장.
- **[6/9 완료] E2E**: 신규 `e2e/mixed-use-housing-std-proportional.spec.ts`(13건) + 기존 겸용 spec 시드 보충(`e2e/_helpers/mixed-housing-std-seed.ts` — 항등 나목) + 입력칸 이동 케이스(`validation-field-jump-cases-mixed.ts`·`-leaf.ts`).

### 최종 (UI 측 Do 완료 — 2026-10-07)

**14 동기화 지점 자가 점검** (file:line은 이 워크트리 작업 트리 기준)

| # | 지점 | 위치 | 상태 |
|---|---|---|---|
| ① | 폼 타입 | `lib/stores/calc-wizard-asset-gb.ts:354`(취득) · `:356`(양도 — 바로 아래) | ✅ `calc-wizard-asset.ts`(931줄) 미접촉 |
| ② | initial | `lib/stores/calc-wizard-asset-mixed-use.ts:57-58`(타입) · `:97-98`(`""`) → 팩토리 `calc-wizard-asset-factory.ts:388` 스프레드 | ✅ |
| ③ | normalize | `calc-wizard-asset-mixed-use.ts:187-188` + 접근부 방어(`parseAmount(undefined)=0` · UI `?? ""`) | ✅ stale 세션 → `""` → ⑧ 차단(값 지어내기 없음) |
| ④ | API 변환 | `lib/calc/transfer-tax-api-mixed-use.ts:166-168`(양도) · `:181-183`(취득) — 술어 참일 때만 키 · 어댑터 `lib/calc/mixed-use-housing-std-split.ts` | ✅ 단건·컴패니언 같은 빌더(`transfer-tax-api.ts:164` · `transfer-tax-api-companion-payload.ts:231`) |
| ⑤ | UI 위젯 | `components/calc/transfer/mixed-use/MixedUseHousingBuildingStdField.tsx` ← `MixedUseAssetMajorStdPrice.tsx:261`(취득)·`:285`(양도) · `MixedUseLegacyStdPrice.tsx:188`·`:334` | ✅ |
| ⑥ | 사이드바 | `computeTransferSummary` 겸용 메타는 결합 H_T만 사용 — **변경 없음 확인** | ✅ |
| ⑦ | 결과 카드 | `components/calc/results/mixed-use/MixedUseHousingStdSplit.tsx` ← `MixedUseCalculationSections.tsx:314` · 개산공제 라벨 `:331`·`:343` | ✅ echo kind 3형태, echo 없으면 미표시 |
| ⑧ | validation | `lib/calc/transfer-tax-validate-mixed-use-asset.ts:60`(양도)·`:151`(취득) — 같은 leaf 어댑터 | ✅ 오류 field = `mixedTransferHousingBuildingStdPrice`·`mixedAcqHousingBuildingStdPrice`(FieldCard `field`) |
| ⑨⑩⑪ | enum·자산 fallback | 해당 없음 | — |
| ⑫ | Zod | `lib/api/transfer-tax-schema-mixed-use.ts:46`(필드)·`:198`·`:203`(leaf refine) — 엔진 단계 구현, **이 단계에서 ④ 페이로드를 실제 스키마에 넣는 격자로 재확인** | ✅ |
| ⑬ | body spread | `transfer-tax-api.ts:720` `mixedUse` 서브객체째 · 컴패니언 `:231` | ✅ 변경 불요 |
| ⑭ | Route | `app/api/calc/transfer/mixed-use-asset-input.ts:173` `...s.mixedUse` 스프레드 | ✅ 변경 불요(route 테스트 12파일이 폼 경유로 도달 실측) |

**3대 정책**: useEffect→store 미러링 0(칸 미렌더만 — 값은 store에 남되 ④가 안 싣고 ⑧이 안 요구) · 자동 안분 fallback 0(비어 있으면 0 그대로 → ⑧ 차단, 상가건물·PHD·H에서 값을 지어내지 않음 — 테스트로 고정) · validate 8번째 동기화(격자로 ⑤⇔④⇔⑧⇔⑫ 일치 실측).

**검증 수치**: `npx tsc --noEmit` 0 · `npm run lint` 0 error(기존 warning 357) · `npx vitest run __tests__/`(json) **30,005 tests · 29,918 passed · 0 failed · 13 pending(기존 skip)** · E2E(`E2E_PORT=3132`, json): 겸용·컴패니언·건물 기준시가·field-jump·dead-end 등 관련 spec **747 passed · 0 failed · 21 skipped**(skip 21 전부 `transfer-validation-field-jump` 기존 `unreachableInUi`).

**바뀐 기대값(UI 단계)**: ① `mixed-use-housing-estimated-numerator.anchor.test.tsx` — 「취득시 개별주택가격 미공시(§97 환산)」 결과는 S3-2 이후 새로 만들 수 없어(엔진 throw·⑫·⑧ 차단) **구 저장 이력 형태**(공시 결과에서 분자·환산취득가·echo를 0/없음으로 되돌린 객체)로 재구성 — 카드가 구 결과를 여전히 「(미공시)」로 읽는지가 주제. ② `mixed-use-acq-building-day-result-follow.anchor.test.tsx` — 개산공제 괄호 라벨 「취득시 토지/건물 기준시가」 → 「취득시 토지분/건물분 기준시가」(⑦ 라벨 정정, 숫자 불변). 나머지 dom 12파일은 항등 나목으로 **값 불변** 통과. E2E: `mixed-use-asset-major-commercial-modal.spec.ts` 런처 locator를 `exact: true`로(주택 섹션 런처 2개가 부분 일치로 잡힘 — 위젯 하나 더 = 셀렉터 유일성 붕괴 선례).

**shim 처리 판단**: 폼 경유 route 테스트 12파일(`callTransferTaxAPI` 본문을 가로채는 방식)은 body shim을 걷고 **폼 필드에 항등 나목**을 넣어 ④가 실제 값을 싣게 했다(`mixed-use-identity-std-form.ts` — ④ 페이로드에서 엔진 shim 값을 읽어 폼 문자열로 환원). **raw body·엔진 직접 테스트의 shim은 유지**: 그 테스트는 body를 손으로 적어 ④를 거치지 않으므로 폼 필드로 바꿀 대상이 없고(엔진·⑫ 계약 검증이 주제), shim은 나목 전송을 ⑫가 거부하지 않는지만 돕는다. 유지 목록: `unpaid-tax-mode-penc`·`pre-designation-contract`·`surcharge-155-15ho`(raw 겸용 본문 + 폼 기반 비겸용 공용 `post()`)·`oh09`·`d9`·`f17b`·`89-2-e7`·`house-count-exclusion`·`surcharge-fallback`·`unavoidable-outside-capital`·`win-win-rental`·`d15`·`bundled-swallows-special`.

**설계 대비 차이**: ⑤ `timePoint`는 `"acq"|"transfer"`(설계 `acquisition` 표기 → 지시에 맞춤) · `embedded` prop 추가(시점 박스 안에서 톤 카드를 이중으로 두르지 않음) · 스냅샷 적용성 게이트(`building-std-snapshot-applicability.ts`)에 `-mx-housing-*` 케이스 추가(PHD ON·상가→주택으로 술어가 거짓이 된 뒤에도 옛 계산서가 출력되는 stale 방지 — 설계 외 추가, 테스트 포함) · ⑧ 메시지에 조문 인용 없음(Q-U8 삭제안).

**⑧ H 검사 ⇔ leaf H 술어 격자 결과**: 취득시 H — ⑧은 leaf가 요구하는 모든 조합에서 막는다(⑧ ⊇ leaf) · 상속·증여(≥1985)에서는 H 때문에 막지 않는다(Q-B 일치; <1985 상속은 H 필수 — leaf도 같다). 양도시 H_T — ⑧은 **PHD에서도** 요구한다(PHD 패널이 같은 `mixedTransferHousingPrice` 칸을 렌더하고 주택:상가 양도가액 안분 분자가 H_T라 필요 — 엔진 보고 「PHD H_T=0은 안분 분자 0」과 일치). leaf(`isHousingPriceAtTransferRequired`)는 PHD면 거짓이라 ⑧이 leaf보다 엄격하다 — 이 불일치는 의도된 방향(⑧ ⊇ ⑫)이며 칸이 있어 막다른 길이 아니다.

**남은 확인 필요**: ① 공시 후 취득 + 토지·건물 취득일 상이 정면 선례 · 국세청 고시 현행 산식(계획서 §7) 미해소 ② 모달 prefill 연면적(주택→상가 취득시 = 주택+상가 합)은 엔진 `computeAcqDerivedAreas`와 같은 규칙이나 사용자 안내(N_A의 연면적 의미 — 설계 §9-3)는 실사용 확인 필요 ③ 모달이 1985 이전 의제취득·2000 이전 건물 N을 산정기준율 트랙으로 내는지 겸용 경로에서 미확인 ④ 컴패니언 결과 카드·PDF·신고서에서 분할 블록 표시는 `MixedUseCalculationSections` 한 곳뿐(역방향 grep) — 컴패니언 겸용 파트 카드 경로가 같은 블록을 쓰는지 화면 미확인 ⑤ 브라우저 수동 확인은 Playwright E2E로 대체(별도 육안 확인 미수행) ⑥ 겸용 개산공제 라벨 「× 3%」는 미등기(0.3%)에서도 하드코딩(기존, 이번 범위 밖 — 언급만).

**Check 단계 지적 반영 (2026-10-07)**
- **Medium — ⑧ 격자 공허 통과 해소**: `…parity.anchor.test.ts`의 ⑧ 블록이 선행 오류 셀을 `return`으로 조용히 건너뛰던 것을 고쳤다. PHD ON 셀에 필수 입력(최초 고시·3시점·용도변경일)을 채우는 fixture(`PHD_FIXTURE`)와 상속·증여 신고가액을 넣었고, 선행 오류는 **분류(ok / H 미입력 / 미지원 조합)** 해 이유 불명이면 실패, 셀 수는 `EXPECTED_COUNT`로 고정(단언 셀 26 → **74** / 160, H 선행 14 · 미지원 조합 72 · 이유 불명 0). 뮤테이션(scratchpad 복사·복원): ⑧에서 PHD 면제 제거 → 이 블록 40건 실패 · ⑧ 취득 상가→주택 면제 제거 → 4건 실패(둘 다 KILLED, 복원 후 163 passed).
- **Low — B0 안내**: 토지·건물 취득일이 다르면 취득시 나목 칸 라벨에 「— 건물 취득일 기준」, hint에 두 취득일, ⑧ 메시지에 「(…건물 취득일 {date} 기준 값)」(⑫ 메시지 정합). 같은 날짜면 문구 불변. 테스트·E2E(H1 짝·H6) 단언 추가, 기존 단언은 접두 정규식이라 무영향(역방향 grep 확인).
- **Low — stale 주석**: `mixed-use-acq-date.ts` 2곳 · ⑧ B0 주석 · identity helper의 「④ 싣기 전 shim」(raw body·엔진 직접 테스트 전용, 폼 경유는 `-form.ts`) · `154-1-holding` B-11 주석(손계산 괄호는 이미 제거돼 있어 「상단 주석 수치」 문장을 정정).
