# 소유자 분리(selfOwns) — 상속·증여 등 비-매매 취득원인 확대 [요구 C]

작성일 2026-07-30 · 선행 PR **#913**(요구 A·B 완료) · 대상 `assetKind ∈ {housing, building}`

> **선행 상태**: 「토지·건물 소유자 다름」 토글은 `AssetOwnershipSplitSection.tsx`로 분리돼 취득원인
> 라디오 직하에 배치됐으나, 내부에 `acquisitionCause !== "purchase" → return null` 게이트가 있다.
> 그 게이트는 **조용한 과대과세를 막는 안전장치**다(§1). 이 계획이 그것을 안전하게 푸는 작업이다.

---

## 1. 왜 게이트를 단독으로 풀면 안 되는가

`lib/tax-engine/transfer-tax.ts:315`

```ts
const ownerRawGain = splitDetail && selfOwns !== "both"
  ? (selfOwns === "building_only" ? splitDetail.building.gain : splitDetail.land.gain)
  : rawGain;   // splitDetail이 null이면 selfOwns를 통째로 무시
```

`splitDetail`은 `calcSplitGain`이 만든다. 그 함수가 null을 반환하는 경로가 둘:

| 반환 지점 | 조건 |
|---|---|
| `transfer-tax-split-gain.ts:356` | `landAcquisitionDate` 없음 |
| `:382-396` | 필요한 취득시 기준시가가 없어 안분 비율 산출 불가 + 비-별개취득 |

상속·증여 경로에는 **둘 다 없다** → `selfOwns`가 무시되고 **비소유 파트까지 전액 과세**된다. 오류 메시지도 없다.

---

## 2. 핵심 실측 — 취득가액 총액은 **이미 엔진에 도달해 있다**

초판(`transfer-self-owns-toggle-relocation.plan.md` §4.1 안 C)은 "파트별 취득가액 입력(`LandBuildingSplitSection` 4방식 라디오)을 상속·증여에도 제공"으로 설계했다. **재실측 결과 불필요하며 부적합하다.**

### 2.1 상속 — `acquisitionPrice`에 평가액이 주입된다

`transfer-tax.ts:122-129` **STEP 0.45**가 `calcTransferGain`(STEP 3, :304)보다 **앞**에서 실행된다:

```ts
const inheritedStep = runInheritedAcquisitionStep(rawInput, input, pre1990LandResult);
if (inheritedStep) { input = inheritedStep.updatedInput; … }
```

`inheritance-acquisition-helpers.ts:202-204`

```ts
return { ...currentInput, acquisitionPrice: result.acquisitionPrice, … };
```

⇒ `calcSplitGain`이 실행될 시점에 **상속 평가액(§163⑨ 신고가액 / §176의2④ 환산)이 `input.acquisitionPrice`에 들어 있다.**

### 2.2 증여도 동일

`transfer-tax-api.ts:218-230` — 환산·감정·매매사례가 아니면 `acquisitionPrice = parseAmount(primary.fixedAcquisitionPrice)`. 증여는 「증여 신고가액」이 그 필드다(`CompanionAcqGiftBlock.tsx`).

### 2.3 따라서 파트별 입력이 아니라 **안분 비율**만 있으면 된다

`transfer-tax-split-gain.ts` `calcOnePart`(actual 분기):

```ts
if (isSeparate) return own ?? null;
const base = input.acquisitionPrice ?? 0;
const pair = splitPair(base, input.landAcquisitionPrice, input.buildingAcquisitionPrice, landRatio, "취득가액");
```

상속·증여는 취득일이 하나(상속개시일·증여일)라 `isSeparateAcquisition`이 **false**이므로 이 분기를 탄다. 파트 2칸이 비어 있으면 `landRatio`(취득시 기준시가 비율)로 **§166⑥ 안분**한다 — 법령상으로도 이것이 정본이다("가액의 구분이 불분명한 때").

> 상속세 신고서에는 토지·건물이 각각 평가돼 기재되지만, 우리 UI의 상속 취득가액 입력(`PostDeemedInputs`)은 **총액 하나**를 받는다. 총액 + 기준시가 비율 안분이 현재 데이터 모델과 정합적이며, 4방식 라디오(실거래가/환산/감정/매매사례)는 상속 취득가액의 성질(§163⑨ 평가액)과 맞지 않는다.

### 2.4 취득시 기준시가 — 상속 경로는 **모드별로 갈린다** (초판 오류 정정)

초판은 "상속 경로에 기준시가 입력 0건"이라 썼으나 `InheritedAcquisitionDeemedSection`(88줄)만 본 결과였다. 하위 컴포넌트 실측:

| 상속 모드 | 취득시 기준시가 | 근거 |
|---|---|---|
| **pre-deemed**(상속개시일 < 1985-01-01) | **있음** — `standardPriceAtAcq`·`acquisitionArea` | `PreDeemedInputs.tsx:250-292`(§176의2④ 환산 계산용) |
| **post-deemed**(1985-01-01 이후) | **없음** | `PostDeemedInputs.tsx` — `publishedValueAtInheritance` 등 별도 필드만 |
| 증여 | **없음** | `CompanionAcqGiftBlock.tsx`(58줄) |

⇒ 실무 대부분인 **post-deemed 상속·증여에 취득시 기준시가 입력을 신설**해야 한다.
⚠️ pre-deemed는 이미 `standardPriceAtAcq`(총액)를 쓰므로 **중복 입력을 만들지 않도록** 그 값을 공유해야 한다(같은 폼 필드 양방향 read/write — `components/calc/CLAUDE.md` 규약). ㎡당 단가 필드(`standardPricePerSqmAtAcq`)까지 채우는지는 **구현 시 확인 필요**(`PreDeemedInputs`는 `LandPriceLookupField`로 총액을 도출한다 — 단가 저장 여부 미확인).

---

## 3. 필요 입력 3종 (확정)

| # | 입력 | 소비 지점 | 상속·증여 현황 |
|---|---|---|---|
| ① | `landAcquisitionDate` | `calcSplitGain` 진입 가드(:356) | **없음** → API fallback으로 해결(§4.2) |
| ② | 취득시 기준시가 토지분·건물분 | `calcApportionRatio` → 취득가액 §166⑥ 안분 | post-deemed·증여 **없음** → 신설 |
| ③ | 양도가액 구분 또는 양도시 기준시가 | `splitPair`(양도가액 축, :419-425) | **없음** → 기존 컴포넌트 재사용 |

**파트별 취득가액(4방식)은 불필요**(§2.3). 자본적지출 파트 분리도 이번 범위 밖(총액 `expenses`가 비율 안분된다 — `transfer-tax-split-gain.ts:453-456`).

---

## 4. 구현

### 4.1 게이트 해제

`AssetOwnershipSplitSection.tsx` — `if (asset.acquisitionCause !== "purchase") return null;` 제거. **이 줄은 아래 4.2~4.5가 모두 들어간 뒤에만 제거한다.**

### 4.2 `landAcquisitionDate` fallback (④⑬⑧)

`lib/calc/transfer-tax-api-split.ts:91-97` 삼항에 후퇴를 추가한다 — `usesPhd`가 이미 같은 패턴이다:

```ts
landAcquisitionDate:
  (primary.hasSeperateLandAcquisitionDate || primary.selfOwns !== "both") && primary.landAcquisitionDate
    ? primary.landAcquisitionDate
    : usesPhd || primary.selfOwns !== "both"   // ← 추가
      ? primary.acquisitionDate
      : undefined,
```

토지·건물을 같은 날 취득한 것으로 해석되므로 `isSeparateAcquisition`이 false → 파트별 취득가액 완결 규칙이 발동하지 않는다(§2.3 안분 경로 유지).

⚠️ **⑧ validate도 같은 fallback을 인식**해야 한다 — 미적용 시 "UI 통과 ↔ validate 차단" 모순(3중 패턴 규약).

> **선택지**: 비-매매에서도 토지 취득일을 **입력받을** 수 있다(건물만 상속받고 토지는 이전에 매매 취득한 경우). 다만 그 경우 `isSeparateAcquisition`이 true가 되어 파트별 취득가액이 필수가 되는데 상속 경로엔 그 입력이 없어 **dead-end**가 된다. ⇒ **이번 범위에서는 입력칸을 만들지 않고 fallback만** 둔다. 파트별 취득원인 상이는 현 데이터 모델의 한계로 별도 과제(§7).

### 4.3 취득시 기준시가 입력 신설 (②)

새 컴포넌트 `components/calc/transfer/NonPurchaseSplitInputsBlock.tsx` — **조립만** 한다(로직 신설 금지).

```
렌더 조건: isLandBuildingSplitable(assetKind)
        && acquisitionCause !== "purchase"
        && (selfOwns ?? "both") !== "both"
위치:     각 원인 블록 **뒤**(CompanionAcquisitionCauseSection)
```

내용:
1. **취득시 기준시가** — 기존 `StandardPriceInput`(`components/calc/inputs/`) 재사용. `propertyKind`는 `toPropertyKind(assetKind)`(`CompanionAcqPurchaseBlock.types.ts`)로 도출. 폼 필드는 `standardPricePerSqmAtAcq`·`acquisitionArea`·`standardPriceAtAcq` — **pre-deemed 상속과 같은 필드**이므로 양방향 공유되어 중복 입력이 생기지 않는다(§2.4).
2. **축 A** — `<LandBuildingSaleSplitSection>` 그대로. props는 전부 `asset`/콜백 기반이라 매매 결합이 없다.
3. 안내 1줄: "토지·건물 소유자가 달라 본인 소유분만 과세합니다. 취득가액·양도가액은 취득시/양도시 기준시가 비율로 안분합니다 (소득세법 시행령 §166⑥)."

술어 주입(`saleStdPlacement` 등)은 `CompanionAcqPurchaseBlock`과 **같은 함수로 이 블록이 1회 계산**해 내려준다(재파생 금지 — 기존 규약).

### 4.4 `hasSeperate` 강제 ON은 매매에서만

`AssetOwnershipSplitSection`의 `onCheckedChange`:

```ts
onChange({
  selfOwns: "building_only",
  // 매매 전용 — 취득일 2열 UI를 띄우기 위한 플래그다. 비-매매에는 그 UI가 없고,
  // 잔존 시 별개취득 오판정 → 파트별 취득가액 필수 → 입력 칸 없는 차단이 된다.
  ...(asset.acquisitionCause === "purchase" ? { hasSeperateLandAcquisitionDate: true } : {}),
});
```

분리 계산 진입은 `isSplitPayloadActive = hasSeperate === true || selfOwns !== "both"`(`transfer-tax-api-split.ts:39-43`)로 **`selfOwns`만으로 이미 성립**한다.

⚠️ **취득원인 전환 stale 처리**: 매매에서 켠 `hasSeperateLandAcquisitionDate`가 상속으로 전환된 뒤 남고 `landAcquisitionDate`도 남아 있으면 `isSeparateAcquisition`이 true가 되어 dead-end. 취득원인 라디오 `onChange`에서 비-매매 전환 시 `hasSeperateLandAcquisitionDate: false`로 정리한다(값 보존 정책의 예외 — 그 플래그는 매매 UI 전용 표시 상태이지 사용자 데이터가 아니다).

### 4.5 validation (⑧)

`lib/calc/transfer-tax-validate-split.ts`:
- `selfOwns !== "both"` + 비-매매 + 취득시 기준시가 3요소 미입력 → 차단("본인 소유분만 과세하려면 취득 당시 ㎡당 개별공시지가와 면적이 필요합니다 — 소득세법 §99①1호 가목·시행령 §166⑥").
- ①의 `landAcquisitionDate` fallback을 **같은 규칙으로 인식**(빈 값이어도 `acquisitionDate`가 있으면 통과).
- 양도가액 축은 기존 V4·V7이 이미 커버(`selfOwns` 무관하게 적용) — **확인 필요**(비-매매에서 그 검증이 실제로 도는지 실측).

---

## 5. 14 동기화 지점

| 지점 | 영향 |
|---|---|
| ①②③ 폼 상태·initial·normalize | **변경 없음** — 사용하는 필드 전부 기존 `AssetForm`에 존재 |
| ④⑬ API 변환 | `landAcquisitionDate` fallback(§4.2). 파트 필드 전송 게이트(`isSplitActive`)는 이미 `selfOwns` 인식 |
| ⑤ UI 위젯 | `AssetOwnershipSplitSection`(게이트·patch) · 신규 `NonPurchaseSplitInputsBlock` · `CompanionAcquisitionCauseSection`(배치·stale 정리) |
| ⑥ 사이드바 | **확인 필요** — `computeTransferSummary`의 취득가액이 상속 경로에서 무엇을 읽는지. 상속 평가액은 엔진 STEP 0.45에서 산정되므로 결과 도착 전에는 표시할 수 없을 수 있다 |
| ⑦ 결과 카드 | 변경 없음 — `SplitGainDetailSection`은 취득원인과 무관하게 `splitDetail`을 렌더. **다만 "안분비 토지 x% : 건물 y%" 표시가 상속에서도 올바른 문구인지 확인** |
| ⑧ validation | §4.5 |
| ⑨~⑫⑭ Zod·route | **변경 없음**(신규 엔진 필드 없음) |

---

## 6. 검증 계획

1. **anchor 선작성** — `__tests__/tax-engine/transfer-tax/self-owns-non-purchase.test.ts`
   - N1(전제 확증): 상속 + `selfOwns="building_only"` + `landAcquisitionDate` 없음 → `splitDetail` null → **토지분까지 과세**(= 현행, 회귀 감지선)
   - N2(🔴 red): 위 + `landAcquisitionDate` 제공, 기준시가 없음 → 여전히 null(§1 두 번째 경로)
   - N3: `landAcquisitionDate` + 취득시 기준시가 + 양도 안분 근거 제공 → `splitDetail` 생성, **건물분 gain만 과세**
   - N4: 상속 평가액(STEP 0.45 주입)이 §166⑥ 비율로 안분되는지 — `splitDetail.land.acquisitionPrice + building = acquisitionPrice` 항등
   - N5: 취득일 동일(fallback) → `isSeparateAcquisition` false → 파트별 완결 규칙 미발동
   - N6: 증여 경로 동형(N3와 같은 구조, `fixedAcquisitionPrice` 소스)
2. **API anchor**: 비-매매 + `selfOwns ≠ both` + 토지 취득일 미입력 → body `landAcquisitionDate === acquisitionDate`
3. **validate anchor**: fallback 인식(통과) / 기준시가 미입력 차단
4. **컴포넌트**: 상속·증여에서 토글 노출 · ON 시 기준시가+축 A 등장 · 매매는 **무변경**(신규 블록 비노출) · 비-매매 ON이 `hasSeperate`를 켜지 않음 · 취득원인 전환 시 stale 정리
5. **E2E**: `split-mode-gating.spec.ts` P7 "상속 취득에서는 아직 노출되지 않는다" **기대값 반전** + 상속 소유자 분리 전체 플로우 1건
6. `npm test` 전체 · `tsc --noEmit` 0건
7. **브라우저 수동 확인**: 상속 + 소유자 다름 → 기준시가·양도 안분 입력 → 계산 → 결과에서 비소유 파트 제외 확인(Network 탭 `landAcquisitionDate` 전송 확인)

## 6.1 구현 결과 (2026-07-30 완료)

| 항목 | 결과 |
|---|---|
| anchor `self-owns-non-purchase.test.ts` | 신규 19건(엔진 N1~N6 + 배관 N7·N8) — **전부 green** |
| 전체 vitest | **1112파일 12,429건 통과** |
| E2E `split-mode-gating.spec.ts` | **36/36** (기존 34 + 상속·증여 노출 / 매매 중복 방지 2건 신규, "상속에서 미노출" 1건은 기대값 반전) |
| `tsc --noEmit` · 변경 파일 lint | 0건 |

### 착수 전 실측 3건 결과 (§7 "확인 필요" 해소)

1. **`PreDeemedInputs`는 ㎡당 단가를 저장하지 않는다** — `standardPriceAtAcq`(총액)만 받는다(`CurrencyInput` 또는 `Pre1990LandValuationInput`의 `onCalculatedPrice`). ⇒ pre-deemed 상속도 단가·면적이 필요하므로 신규 블록이 3요소를 모두 받는다. 총액은 같은 폼 필드를 공유해 중복 입력이 생기지 않는다.
2. **사이드바 ⑥ — 영향 없음**. `computeTransferSummary`는 `isSeparateAcquisition(a)`일 때만 파트 합계를 쓰고(`calc-wizard-store.ts:477`), 비-매매 소유자 분리는 취득일이 같아 false → 종전대로 `fixedAcquisitionPrice`를 읽는다. 상속에서 그 필드가 비는 것은 **이번 변경과 무관한 기존 동작**이다.
3. **V4·V7은 비-매매에서 돌지 **않았다**(초판 추정 오류)** — 호출부는 취득원인 게이트 밖이지만 `validateSplitDirectInputs` **첫 줄**이 `if (!asset.hasSeperateLandAcquisitionDate) return null`이었다. 비-매매 소유자 분리는 그 플래그를 켜지 않으므로 **검증 전체가 건너뛰어졌다**. 게이트를 `isSplitPayloadActive`와 같은 조건(`hasSeperate || selfOwns !== "both"`)으로 확장했다.

### 초판 설계에서 바뀐 것

- **파트별 취득가액(4방식) 불필요 확정** — 상속 평가액이 STEP 0.45에서 `acquisitionPrice`에 주입되므로(anchor N3·N4가 실증) §166⑥ 비율 안분으로 나뉜다. `LandBuildingSplitSection` 재사용은 하지 않았다.
- **엔진 변경 0** — anchor N1~N6이 작성 시점에 이미 전부 green이었다. 결핍은 **배관(API·validate·UI)뿐**이었다.
- **V8 신설** — 소유자 분리 + 취득일 동일 경로에서 취득시 기준시가 3요소를 요구. 이 갭은 기존 테스트 `split-sale-std-part-gate.test.ts` A5가 **취득시 기준시가 없이 통과**하고 있던 데서도 드러났다(양쪽 환산인데 환산 분자가 없는 입력 — 엔진에서 조용히 null). 픽스처에 3요소를 추가해 원래 검증 대상(양도시 기준시가 축)만 보게 정정했다.

## 7. 리스크

| 리스크 | 대응 |
|---|---|
| 게이트만 먼저 풀림 | §4.1을 **마지막 단계**로. anchor N1~N3가 green이 되기 전에는 제거 금지 |
| pre-deemed 상속에서 기준시가 입력이 **두 번** 노출 | 같은 폼 필드를 공유하므로 값은 어긋나지 않으나 칸이 둘이면 혼란. `PreDeemedInputs` 활성 시 신규 블록의 기준시가 부분을 숨긴다(축 A는 유지) — 구현 시 실측 후 결정 |
| `PreDeemedInputs`가 ㎡당 단가를 저장하지 않으면 안분 비율 산출 불가 | §2.4 "확인 필요" — 구현 전 probe로 실측. 미저장이면 신규 블록에서 단가·면적을 받는다 |
| 상속 자산 종류가 `inheritanceAssetKind`(land/house_individual/house_apart)로 별도 관리됨 | 소유자 분리는 `assetKind`(housing/building) 기준이라 축이 다르다. 두 값이 모순되는 조합(예: `assetKind=building` + `inheritanceAssetKind=land`)에서 동작 확인 필요 |
| 파트별 취득원인 상이(건물은 상속·토지는 매매) | 현 데이터 모델 한계(`acquisitionCause`가 자산 단위 단일값). 범위 밖 — 지분 분할 취득으로 우회 가능 |
| 겸용주택(`isMixedUseHouse`)과 충돌 | 겸용은 자체 4부분 안분이 축을 지배하며 `isSeparateAcquisition`에서도 제외된다(`transfer-tax-split-acq-mode.ts:153`). 신규 블록도 겸용에서는 비노출로 게이트 |
