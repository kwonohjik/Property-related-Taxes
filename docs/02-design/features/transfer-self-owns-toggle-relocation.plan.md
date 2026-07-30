# 소유자 분리 토글 상단 이동 · 전 취득원인 노출 · 별개취득 안내카드 삭제

작성일 2026-07-30 · 대상 `components/calc/transfer/` 취득정보 섹션

> **진행 상태 (2026-07-30)** — 요구 **A·B 완료**, 요구 **C는 별도 PR로 분리**(사용자 확정).
> A·B는 §3·§4.2 (1)(4)만 구현했고, C의 실질 작업(§4.1 안 C — 분리 계산 입력 3종을 상속·증여로 확장)은
> 미착수다. 그때까지 `AssetOwnershipSplitSection`의 `acquisitionCause !== "purchase"` 게이트가
> **조용한 과대과세(§2)를 막는 안전장치**다 — C 작업 전에 이 게이트만 푸는 일은 금지.

## 0. 요구 3건

| # | 요구 | 판정 |
|---|---|---|
| A | 별개취득 안내카드(「취득시기가 다르므로 취득가액은 토지·건물 각각…」) **삭제** | 단순 — 렌더 제거 + E2E 2곳 |
| B | 「토지·건물 소유자 다름」 토글을 「토지·건물 취득일 다름」 **위로** 이동 | 인과상 정합 — 아래 §3 |
| C | 소유자 토글이 **상속·증여 등 모든 취득원인**에서도 노출 | ⚠️ **토지 취득일 입력을 함께 주지 않으면 조용한 과대과세** — 아래 §4가 이 계획의 핵심 |

---

## 1. 실측 — 현재 배치

`CompanionAcqPurchaseBlock.tsx` 렌더 순서:

| 순서 | 요소 | 위치 |
|---|---|---|
| 1 | 취득일 토글 → 취득일(2열) → **축 A 양도가액 결정** | `CompanionAcqDateSection`(:210) |
| 2 | **「토지·건물 소유자 다름」 토글** | :223-260 |
| 3 | 별개취득 안내카드(`split-acq-total-note`) | :316-326 |
| 4 | PHD 토글 · 축 B 취득가액 산정 방식 | 이하 |

소유자 토글이 **양도가액 섹션 뒤**에 떨어져 있다(사용자 지적 = 이미지16·17).

### 1.1 인과가 역방향이다

소유자 토글 ON은 취득일 토글을 **강제로 켠다**(`CompanionAcqPurchaseBlock.tsx:234` → `onHasSeperateLandAcquisitionDateChange(true)`, 상위 배선 `CompanionAcquisitionCauseSection.tsx:180`). 지금은 **아래** 토글을 눌렀는데 **위쪽** 화면이 펼쳐진다. 위로 옮기면 위→아래 연쇄가 된다 — 요구 B는 UI 순서 = 로직 순서 원칙에 부합한다.

### 1.2 상속·증여 경로에는 분리 UI가 **아무것도** 없다

- 소유자 토글·취득일 토글·토지 취득일 입력은 **전부 `CompanionAcqPurchaseBlock` 안**에 있고, 이 블록은 `acquisitionCause === "purchase"`에서만 렌더된다(`CompanionAcquisitionCauseSection.tsx:120`).
- 상속(`CompanionAcqInheritanceBlock`, 150줄): 「상속개시일」(= `acquisitionDate`) · 「피상속인 취득일」만. `landAcquisitionDate` 입력·설정 **0건**.
- 증여(`CompanionAcqGiftBlock`, 58줄): 「증여일」(= `acquisitionDate`) · 「증여자 취득일」만. 동일.

---

## 2. ⚠️ 요구 C의 핵심 위험 — 토글만 노출하면 조용한 과대과세

`lib/tax-engine/transfer-tax.ts:315`

```ts
const ownerRawGain = splitDetail && selfOwns !== "both"
  ? (selfOwns === "building_only" ? splitDetail.building.gain : splitDetail.land.gain)
  : rawGain;   // ← splitDetail이 null이면 selfOwns를 통째로 무시하고 전체 양도차익
```

그리고 `lib/tax-engine/transfer-tax-split-gain.ts:356`

```ts
if (!input.landAcquisitionDate) return null;   // ← splitDetail = null
```

**연쇄**: 상속 자산에 소유자 토글만 노출 → 사용자가 "건물만 본인 소유" 선택 → 토지 취득일을 넣을 칸이 없음 → `landAcquisitionDate` undefined → `calcSplitGain` null → `splitDetail` null → **`selfOwns`가 무시되고 토지분까지 전액 과세**된다. 오류 메시지도 없다.

### 2.1 ⚠️ 초판 정정 — 토지 취득일만으로는 **여전히 과대과세**다

초판은 "토지 취득일 입력을 동반하면 해소"라고 결론냈다. **재검증 결과 불충분하다.** `calcSplitGain`은 날짜 가드를 통과한 뒤에도 **안분 비율**을 요구한다:

```
transfer-tax-split-gain.ts:373   const ratio = calcApportionRatio(input)
                          :382   if (missingStd.length > 0) { if (!isSeparate) return null; … }
```

`calcApportionRatio`는 취득시 기준시가(㎡당 개별공시지가 × 면적, 또는 결합 총액)에서 나온다. **상속·증여 경로에는 그 입력이 하나도 없다** — 실측:

| 필요 입력 | purchase | 상속(`CompanionAcqInheritanceBlock` 150줄 + `InheritedAcquisitionDeemedSection` 88줄) | 증여(58줄) |
|---|---|---|---|
| 토지 취득일 | 2열 有 | **없음** | **없음** |
| 취득시 기준시가(안분 비율) | `StandardPriceInput` 有 | **없음**(기준시가 위젯 0건) | **없음** |
| 양도가액 구분(축 A) | `LandBuildingSaleSplitSection` 有 | **없음** | **없음** |
| 파트별 취득가액(축 B) | `LandBuildingSplitSection` 有 | **없음** | **없음** |

⇒ 상속에서 소유자 토글 + 토지 취득일만 주면 `ratio`가 null → 비-별개취득이므로 `return null` → `splitDetail` null → **selfOwns 무시 → 전체 과세**. 초판 설계(안 A)로는 요구 C가 **작동하지 않는다**.

⇒ **요구 C의 실제 범위 = 분리 계산 입력 3종(양도가액 구분 · 취득시 기준시가 또는 파트별 취득가액 · 토지 취득일)을 상속·증여에도 제공하는 것.** 토글 이동보다 훨씬 크다. §4에서 재설계한다.

### 2.2 ⚠️ 초판 정정 — `hasSeperate` 강제 ON은 비-purchase에서 **해롭다**

초판 §7은 "취득원인 전환 시 stale ON — 회귀 없음"이라 결론냈으나 틀렸다.

- 소유자 토글 OFF 시 `hasSeperateLandAcquisitionDate`는 **기존 값을 유지**한다(`CompanionAcquisitionCauseSection.tsx:180` — `v !== "both" ? true : asset.hasSeperateLandAcquisitionDate`). 즉 켰다 끄면 `true`가 잔존한다.
- 그 상태에서 토지 취득일이 채워져 있고 건물 취득일과 다르면 `isSeparateAcquisition`이 **true** → 파트별 취득가액 **필수** 규칙이 발동 → 상속 경로엔 파트별 취득가액 입력이 없으므로 **입력 칸 없는 차단(dead-end)**.

**해법**: 비-purchase에서는 `hasSeperateLandAcquisitionDate`를 **건드리지 않는다**. 분리 계산 진입은 `isSplitPayloadActive = hasSeperate === true || selfOwns !== "both"`(`transfer-tax-api-split.ts:39-43`)로 **`selfOwns`만으로 이미 성립**하므로 강제 ON이 불필요하다. 그 플래그는 purchase의 취득일 2열 UI를 띄우기 위한 것이다.

---

## 3. P1 — 안내카드 삭제 (요구 A)

### 대상
- `CompanionAcqPurchaseBlock.tsx:316-326` — `isSeparateAcq` 조건의 `<ToneCard>`(`data-testid="split-acq-total-note"`) 렌더 블록 삭제.
- E2E `e2e/split-mode-gating.spec.ts`
  - `:324` U1 — `split-acq-total-note` 존재 단언 **제거**. 같은 테스트의 "상단 취득가액 산정 방식 미표시" 단언은 유지(그게 본 검증이다).
  - `:465` U6 — `toHaveCount(0)`은 삭제 후 **항상 참**이라 무의미해진다. U6의 실제 의도("취득일 동일 → 상단 입력 유지")를 지키는 단언(상단 「취득가액 산정 방식」 라벨 존재)으로 교체.

### 트레이드오프 (사용자 확정 사항)
안내카드는 "왜 상단 취득가액 칸이 사라졌는가"를 설명하던 유일한 문구다. 삭제하면 그 설명이 없어지지만, 바로 아래에 「취득가액 산정 방식 — 토지·건물 독립 선택」 헤더가 이어져 맥락은 유지된다. 화면 밀도 개선을 우선한다는 사용자 판단을 따른다.

---

## 4. P2 — 소유자 토글 상단 이동 + 전 취득원인 노출 (요구 B·C)

### 4.1 설계 — 안 C(기존 분리 컴포넌트 재사용) 채택

초판의 안 A(소유자 축만 승격)는 §2.1에서 **작동하지 않음**이 확인됐고, 안 B(purchase 배치 해체)는 2026-07-29 확정 규약과 anchor 4건(R1·R2·R3·U12)을 다시 흔든다. 세 번째 길을 쓴다.

**안 C** — 분리 계산 UI는 **이미 독립 컴포넌트**다. `CompanionAcqPurchaseBlock` 안에서만 호출될 뿐 purchase에 결합돼 있지 않다:

| 컴포넌트 | 역할 | 재사용 가능성 |
|---|---|---|
| `LandBuildingSaleSplitSection` | 축 A — 양도가액 구분/일괄 + 양도시 기준시가 | props 전부 `asset`/콜백 기반 — **그대로 재사용** |
| `LandBuildingSplitSection` | 축 B — 파트별 취득가액 4방식 + 취득시 기준시가 카드 + 자본적지출 | 동일 — **그대로 재사용** |

⇒ 상속·증여에서도 이 둘을 렌더하면 분리 계산 입력 3종이 모두 갖춰진다. purchase 배치는 **손대지 않는다**.

**상속에서 파트별 취득가액이 자연스러운 이유**: 상속세 신고 시 상속재산은 토지·건물을 **각각 평가**해 명세에 기재한다(상증법 §60~§66). 즉 납세자는 파트별 평가액을 이미 갖고 있으므로, 총액을 안분받는 것보다 직접 입력이 정확하다.

### 4.2 구현

**(1) 소유자 토글 이동** — `CompanionAcqPurchaseBlock.tsx:223-260` 블록을 잘라 `CompanionAcquisitionCauseSection.tsx`의 **취득원인 라디오 직후·원인별 블록 앞**(현재 :110 부근)에 배치.

- 새 컴포넌트 `components/calc/transfer/AssetOwnershipSplitSection.tsx`로 추출한다 — `CompanionAcquisitionCauseSection`이 264줄이라 인라인하면 계속 커지고, 소유자 축은 응집된 단위다.
- 게이트는 종전과 동일한 `isSplitable`(= `assetKind === "housing" || "building"`). **취득원인 게이트는 걸지 않는다**(요구 C).
- ON 시 `selfOwns: "building_only"` + `hasSeperateLandAcquisitionDate: true` 동시 patch — **단일 배치 update**로(`onChange({ selfOwns, hasSeperateLandAcquisitionDate })`). 두 번 나눠 부르면 stale spread로 한쪽이 덮인다(memory `feedback_multikey_patch_stale_spread_overwrite`). 현재 상위 배선(`CompanionAcquisitionCauseSection.tsx:176-182`)이 이미 한 번에 patch하므로 그 형태를 유지한다.

**(1′) `hasSeperate` 강제 ON은 purchase에서만** (§2.2 정정)

```ts
onChange({
  selfOwns: v,
  // purchase만 — 취득일 2열 UI를 띄우기 위한 플래그다. 비-purchase에는 그 UI가 없고,
  // 잔존 시 별개취득 오판정 → 파트별 취득가액 필수 → 입력 칸 없는 차단이 된다(§2.2).
  // 분리 계산 진입은 selfOwns만으로 성립한다(isSplitPayloadActive).
  ...(acquisitionCause === "purchase" && v !== "both"
    ? { hasSeperateLandAcquisitionDate: true }
    : {}),
});
```

**(2) 비-purchase 분리 입력 — 기존 컴포넌트 재사용**

`selfOwns !== "both"`이고 `acquisitionCause !== "purchase"`일 때, 원인별 블록 **뒤**에 새 래퍼 `components/calc/transfer/NonPurchaseOwnershipSplitBlock.tsx`를 렌더한다. 내부는 조립만 한다(로직 신설 금지):

1. **토지 취득일** — `DateInput`. hint: "토지와 건물을 같은 날 취득했다면 같은 날짜를 입력하세요. 건물 취득일은 위 「상속개시일」/「증여일」 칸을 사용합니다 (소득세법 시행령 §166⑥)." 1985.1.1. 클램핑은 purchase와 동일(`MIN_ACQ_DATE`).
2. **축 A** — `<LandBuildingSaleSplitSection>` 그대로.
3. **축 B** — `<LandBuildingSplitSection>` 그대로. 술어(`acqStdRequiredLand`·`acqStdRequiredBuilding`·`saleStdPlacement`)는 **`CompanionAcqPurchaseBlock`과 같은 함수로 이 래퍼가 1회 계산해 주입**한다(재파생 금지 — 기존 규약).

**API fallback 동반**(⑬): `transfer-tax-api-split.ts:91-97`의 `landAcquisitionDate` 삼항에 `selfOwns !== "both"`일 때 `primary.acquisitionDate` 후퇴를 추가한다 — 이미 `usesPhd`가 같은 패턴을 쓴다. 사용자가 토지 취득일을 비워도 "같은 날 취득"으로 해석돼 `calcSplitGain`이 진입하고, 날짜가 같으므로 `isSeparateAcquisition`은 false라 파트별 완결 규칙이 발동하지 않는다. **⑧ validate도 같은 fallback을 인식**해야 한다(3중 패턴).

**(3) 취득일 다름 토글은 purchase 유지** — 상속·증여에서 이 토글은 "상속개시일과 토지 취득일이 다른가"라는 물음이 되는데, **현재 데이터 모델은 취득원인이 자산 단위 단일값**이라 "건물은 상속·토지는 매매" 같은 파트별 상이 원인을 애초에 표현할 수 없다. 토글을 노출하면 선택해도 파트별 취득가액 규칙만 발동해 dead-end가 된다. 비-purchase에서는 `selfOwns !== "both"`가 분리의 유일한 트리거다.
(파트별 취득원인 상이는 **현 모델의 한계**로 별도 과제 — §7에 기록.)

**(4) 역상태 모순 가드** — purchase에서 소유자 다름 ON 상태이면 취득일 다름 토글에 `disabled` + `disabledReason`("토지·건물 소유자가 다르면 각각 산정하므로 항상 분리됩니다")을 건다(`ToggleCard` 기존 지원). 위아래로 나란히 놓이면 "위는 ON, 아래는 OFF"가 눈에 띄기 때문이다.

### 4.3 결과 배치

```
③ 취득정보
  ├ 지분(%) 분할 취득 토글
  ├ 취득 원인 [매매|상속|증여|이월과세|신축]
  ├ ★ 토지·건물 소유자 다름 토글                    ← 이동(전 원인 공통)
  │   └ (ON) 건물만 본인 / 토지만 본인 선택
  └ 원인별 블록
      ├ purchase     : 취득일 다름 토글 → 취득일 2열 → 축 A → 축 B …   (무변경)
      ├ inheritance  : 상속개시일 · 피상속인 취득일 · §163⑨ 평가액 …
      │   └ (소유자 ON) ★ 토지 취득일 → 축 A → 축 B                    ← 신규 래퍼
      └ gift         : 증여일 · 증여자 취득일 · 증여 신고가액 …
          └ (소유자 ON) ★ 토지 취득일 → 축 A → 축 B                    ← 신규 래퍼
```

---

## 5. 14 동기화 지점

| 지점 | 영향 |
|---|---|
| ①②③ 폼 상태·initial·normalize | **변경 없음** — `selfOwns`·`landAcquisitionDate` 모두 기존 `AssetForm` 필드 |
| ④⑬ API 변환 | **변경 필요**(초판 "변경 없음"은 오류) — `transfer-tax-api-split.ts:91-97` `landAcquisitionDate` 삼항에 `selfOwns !== "both" → primary.acquisitionDate` fallback 추가(§4.2 (2)). 파트 필드 전송 게이트(`isSplitActive`)는 이미 `selfOwns`를 인식하므로 그대로 |
| ⑤ UI 위젯 | 신규 `AssetOwnershipSplitSection`(소유자 토글) · 신규 `NonPurchaseOwnershipSplitBlock`(조립 래퍼) · `CompanionAcqPurchaseBlock`(토글·안내카드 제거) · `CompanionAcquisitionCauseSection`(배치·`hasSeperate` 조건부 patch) |
| ⑥ 사이드바 | **확인 필요** — `computeTransferSummary`의 취득가액 합계가 비-purchase 파트 입력(`separateAcqPartsSum`)을 인식하는지. 상속은 총액(`fixedAcquisitionPrice`) 기준이라 파트 입력 시 합계가 어긋날 수 있다 |
| ⑦ 결과 카드 | 변경 없음 — `SplitGainDetailSection`은 취득원인과 무관하게 `splitDetail`을 렌더 |
| ⑧ validation | **추가 필요** — (a) `selfOwns !== "both"` + 분리 입력 미비 시 차단, (b) ④의 `landAcquisitionDate` fallback을 validate도 **동일하게** 인식(3중 패턴 — 미적용 시 "UI 통과 ↔ validate 차단" 모순) |
| ⑨~⑫⑭ Zod·route | **변경 없음** (신규 엔진 필드 없음) |

---

## 6. 검증 계획

1. **anchor 선작성** — `__tests__/tax-engine/transfer-tax/self-owns-non-purchase.test.ts`
   - E1(전제 확증): `selfOwns="building_only"` + `landAcquisitionDate` 미제공 → `splitDetail` null → **토지분까지 과세**됨을 고정(현행 동작 = 회귀 감지선).
   - E2(🔴 현행 red): 토지 취득일 **제공 + 취득시 기준시가 미제공** → `ratio` null → 여전히 `splitDetail` null → 과대과세. **초판이 놓친 케이스**(§2.1).
   - E3: 토지 취득일 + 파트별 취득가액·양도가액 제공 → `splitDetail.selfOwns` 반영, 비소유 파트 gain 폐기.
   - E4: 취득일 동일(fallback 경로) → `isSeparateAcquisition` false → 파트별 완결 규칙 미발동.
2. **API anchor** — `__tests__/calc/`: 비-purchase + `selfOwns ≠ both` + 토지 취득일 미입력 → body의 `landAcquisitionDate`가 `acquisitionDate`로 채워짐(⑬ fallback).
3. **validate anchor** — 같은 fallback을 validate도 인식(통과), 분리 입력이 진짜 없으면 차단(⑧).
4. **컴포넌트** — 상속·증여에서 소유자 토글 노출 / ON 시 축 A·축 B·토지 취득일 등장 / purchase는 **무변경**(래퍼 비노출) / 소유자 토글이 취득일 토글보다 DOM 앞 / 비-purchase 소유자 ON이 `hasSeperate`를 켜지 않음.
4. **E2E** `split-mode-gating.spec.ts` — 안내카드 단언 2곳 교체(§3) + 소유자 토글이 취득일 토글보다 **앞**에 오는 DOM 순서 단언 신규.
5. `npx vitest run __tests__/tax-engine/transfer-tax/ __tests__/calc/ __tests__/components/` → 통과
6. `npx tsc --noEmit` 0건 · `npm test` 전체
7. **브라우저 수동 확인**: 상속 취득 + 소유자 다름 ON → 토지 취득일 입력 → 계산 → 결과에서 비소유 파트가 빠지는지

## 6.1 A·B 구현 결과 (2026-07-30 완료)

| 항목 | 결과 |
|---|---|
| 신규 `AssetOwnershipSplitSection.tsx` | 소유자 토글 + 건물만/토지만 선택. 매매 게이트 내장(C 확대 시 그 조건만 제거) |
| 배치 | `CompanionAcquisitionCauseSection` 취득원인 라디오 **직하** — 취득일 토글보다 앞 |
| 안내카드 | `split-acq-total-note` 렌더 블록 + 고아가 된 `ToneCard` import 제거 |
| 역상태 가드 | 소유자 다름 ON이면 취득일 토글 `disabled` + `disabledReason` |
| E2E | **34/34 통과** (기존 31 + P7 3건 신규: DOM 순서 · 자동 ON/비활성 · 상속 미노출) |
| 전체 vitest | **1111파일 12,411건 통과** |
| `tsc --noEmit` | 0건 |

**설계에서 한 가지 바꿨다**: 계획 §4.2 (1′)은 "비-purchase에서 `hasSeperate`를 켜지 말 것"이었으나, A·B 단계에서는 토글 자체가 매매 전용이라 해당 분기가 **아직 도달 불가**다. 조건부 patch를 미리 넣으면 쓰이지 않는 분기가 남으므로 **C 작업 시 함께** 넣는다(그때 게이트를 푸는 것과 한 몸이어야 안전).

### C(별도 PR) 착수 시 반드시 함께 할 것

1. `AssetOwnershipSplitSection`의 `acquisitionCause` 게이트 제거 — **단독으로 하면 과대과세**(§2.1)
2. `hasSeperate` 강제 ON을 purchase 조건부로(§4.2 (1′))
3. `NonPurchaseOwnershipSplitBlock` — 토지 취득일 + 축 A + 축 B 조립(§4.2 (2))
4. ④⑬ `landAcquisitionDate` fallback + ⑧ validate 동일 fallback
5. ⑥ 사이드바 합계가 비-purchase 파트 입력을 인식하는지 확인
6. E2E "상속 취득에서는 아직 노출되지 않는다"(`split-mode-gating.spec.ts` P7) **기대값 반전**

## 7. 리스크

| 리스크 | 대응 |
|---|---|
| 소유자 토글을 전 원인에 노출했는데 토지 취득일 입력을 빠뜨림 → **조용한 과대과세**(§2) | ⑧ validation 차단을 **같은 PR에서** 반드시 함께. 이것만 누락되면 기능이 아니라 결함이 된다 |
| 상속·증여에서 "토지 취득일"과 "상속개시일"이 서로 다른 카드에 있어 혼란 | hint 2줄로 명시(§4.2 (2)). 그래도 혼란이 남으면 안 B(분리 축 전체 승격)를 후속 과제로 |
| purchase에서 토지 취득일 칸이 두 곳에 생김 | 공통 칸을 `acquisitionCause !== "purchase"`로 게이트. 컴포넌트 테스트로 고정 |
| 취득원인 전환(매매↔상속) 시 `hasSeperateLandAcquisitionDate`가 stale ON으로 남음 | **초판의 "회귀 없음" 판단은 오류였다**(§2.2). 매매에서 켠 플래그 + 토지 취득일이 남은 채 상속으로 전환하면 `isSeparateAcquisition`이 true가 되어 파트별 취득가액 필수 → 상속 경로엔 그 입력이 없어 dead-end. §4.2 (1′)로 비-purchase에서는 이 플래그를 켜지 않게 하고, **취득원인 전환 시 stale 값 처리**를 anchor로 고정한다 |
| 파트별 취득원인 상이(건물은 상속·토지는 매매)를 표현할 수 없음 | 현 데이터 모델의 한계(`acquisitionCause`가 자산 단위 단일값). 이번 범위 밖 — 별도 과제로 기록만. 해당 사용자는 지분 분할 취득(별도 자산 추가)으로 우회 가능 |
| 안내카드 삭제로 "왜 상단 입력이 없는지" 설명 소실 | 사용자 확정 사항. 파트별 헤더가 맥락을 대신함 |
