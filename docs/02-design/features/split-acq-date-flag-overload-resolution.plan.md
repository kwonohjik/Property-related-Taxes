# 겸용주택 파트-수준 UI 가드 표현 통일 계획서

> 대상: 양도소득세 · 토지·건물 분리 계산 진입 플래그(`hasSeperateLandAcquisitionDate`)
> 작성: 2026-07-29 · **자가 검토 3-way 후 전면 축소(초안의 핵심 설계 기각)**
> 선행: `e2e-preexisting-failures-4.plan.md` §10(전수 점검)

**사용자에게 보이는 변화는 없다.** 이 작업의 가치는 N-2·N-3처럼 같은 원인이 반복 발현하는 것을
막는 것뿐이며 기능 개선이 아니다(내부 품질 작업). 착수 여부는 §9의 비용·이득 평가를 보고 정한다.

---

## 1. 배경 — 이미 끝난 것과 남은 것

`hasSeperateLandAcquisitionDate`는 ①"취득일 상이"(사용자 의사)와 ②"분리 계산 필요"(시스템 요구)를
겸한다. 겸용주택 토글(`MixedUseSection.tsx:44-50`)과 `selfOwns ≠ both`
(`CompanionAcquisitionCauseSection.tsx:180`)가 ②를 위해 이 플래그를 **강제 ON** 한다.

그 결과 겸용에서 파트-수준 UI가 잘못 노출됐고, 두 건을 개별 가드로 막았다(완료).

| 완료 | 결함 | 조치 |
|---|---|---|
| N-2 | 축 A(양도가액 구분 + 양도시 기준시가) | `&& !isMixedUse` (`CompanionAcqDateSection.tsx:199`) |
| N-3 | 축 B(파트별 취득가액 방식·금액·자본적지출) | `&& !isMixedUse` (`CompanionAcqPurchaseBlock.tsx:680`) |

**남은 것은 그 두 가드가 흩어져 있다는 점 하나**다. 축 A를 고친 뒤에야 축 B가 드러난 것이
"다음 분기에서 또 터진다"는 신호였다.

> 코드에 이미 같은 인식이 있다 — `CompanionAcqPurchaseBlock.tsx:118-125` 주석:
> "`isSplit`으로 가르면 안 된다 — 그 플래그는 겸용주택과 `selfOwns≠both`에서도 강제로 켜진다".

---

## 2. ⛔ 초안 설계(통합 술어) 기각 — 실측으로 성립 불가

초안은 `isSplitCalcActive`(= `hasSeperate || selfOwns !== "both"`) 하나로 UI·API를 통합하려 했다.
자가 검토 3건이 **동일하게 Critical로 기각**했고, 실측이 근거다.

### 근거 1 — UI와 API는 **애초에 다른 술어**를 쓴다

| 계층 | 현행식 | 특징 |
|---|---|---|
| UI `isSplit` (`CompanionAcqPurchaseBlock.tsx:115-117`) | `(assetKind === "housing" \|\| "building") && !!hasSeperate` | **자산종류 게이트 有 · `selfOwns` 無** |
| API `isSplitPayloadActive` (`transfer-tax-api-split.ts:39-42`) | `(hasSeperate === true \|\| selfOwns !== "both") && !isBurdenedGift` | **자산종류 無 · `selfOwns` 有** |

두 조건은 교집합이 아니라 **서로 다른 축**이다. 하나의 술어로 둘을 동시에 만족시킬 수 없다.

### 근거 2 — 통합하면 **36조합 중 24조합에서 화면이 바뀐다**

전수 대조(6 자산종류 × 2 `hasSeperate` × 3 `selfOwns`) 결과 불일치 24건:

- `land`·`general_building`·`commercial_building`·`redevelopment_apt` **전 조합 20건** —
  `isSplitable` 유실로 취득일 2열이 **신규 오노출**
- `housing`·`building`의 `hasSeperate=false && selfOwns≠both` **4건** —
  `CompanionAcquisitionCauseSection.tsx:191`이 토글 값을 그대로 write하므로 사용자가 직접 끌 수 있어
  **실사용 도달 가능**

초안의 성공 기준("화면을 바꾸지 않는다")과 정면 충돌한다.

### 근거 3 — API 위임은 **새 dual-truth를 만든다**

"현행 `isSplitPayloadActive`와 동치"를 검증하려면 비교 대상이 필요한데, 위임으로 교체되면 원본이
사라진다. 테스트에 현행식을 복제하면 **그 복제본이 또 다른 진실 소스**가 되어, 원본이 바뀌어도
테스트가 계속 통과한다 — 이 계획서가 없애려던 문제를 재생산한다.

### 근거 4 — 초안이 대상 분기를 **3곳으로 과소 집계**

실측: `isSplit` 참조 12곳(타입 선언·prop 전달 포함), **렌더 분기 10곳**.
초안이 언급하지 않은 것 중 `CompanionAcqPurchaseBlock.tsx:443`(PHD 토글 게이트)·
`:539`(취득시/양도시 기준시가 5-way 블록)는 **입력 위젯 노출 게이트**라 술어를 잘못 바꾸면
입력 경로 소멸로 직결된다.

---

## 3. ✅ 채택 — 헬퍼 1개, 축 A·B 2곳만

**API는 손대지 않는다. 취득일 2열·PHD 토글·기준시가 블록 등 나머지 8분기도 손대지 않는다.**
겸용 가드가 붙은 2곳의 **표현만** 헬퍼로 통일한다.

```ts
// lib/calc/transfer-tax-split-acq-mode.ts (기존 단일 소스 파일)

interface PartLevelUiFlags {
  isMixedUseHouse?: boolean;
}

/**
 * 파트-수준 가액 입력(축 A 양도가액 구분 · 축 B 파트별 취득가액)이 **의미 있는** 자산인가.
 *
 * 겸용주택은 `hasSeperateLandAcquisitionDate`가 강제 ON이라 `isSplit`이 참이 되지만,
 * 그 입력은 **엔진에 도달할 수 없다**:
 *   · `MixedUseAssetInput`(types/transfer-mixed-use.types.ts:45)에 파트 필드가 정의되어 있지 않다
 *   · `app/api/calc/transfer/route.ts:568` 겸용 분기가 early-return —
 *     `calculateTransferTax`(→ calcTransferGain → calcSplitGain)를 호출조차 하지 않는다
 * 겸용 취득가액은 총액을 §100② 기준시가 비율로 안분하고, 자본적지출은 「실제 필요경비」 칸
 * (MixedUseAssetMajorStdPrice.tsx:161·183 → housingInheritedExpense)에서 따로 받는다.
 *
 * ⚠️ **호출 가능 계층: UI 한정.** 엔진 `TransferTaxInput`에는 `isMixedUseHouse`가 **없다**
 *    (types/transfer.types.ts:484 주석 — "폼 전용 플래그라 엔진은 재판정할 수 없다").
 *    엔진은 API가 파생해 넘긴 명시 입력(`isSeparateAcquisition` 등)으로만 판정한다.
 */
export function acceptsPartLevelAmounts(asset: PartLevelUiFlags): boolean {
  // 현행 표현(`!!props.asset?.isMixedUseHouse`)을 **그대로** 옮긴다 — `assetKind` 조건을
  // 덧붙이면 `assetKind` 변경으로 `isMixedUseHouse`가 잔존한 자산에서 동작이 갈린다.
  return !asset.isMixedUseHouse;
}
```

교체 대상 **2곳뿐**:

| 위치 | 현행 | 변경 후 |
|---|---|---|
| `CompanionAcqDateSection.tsx:199` (축 A) | `isSplit && !isMixedUse && …` | `isSplit && acceptsPartLevelAmounts(p.asset) && …` |
| `CompanionAcqPurchaseBlock.tsx:680` (축 B) | `isSplit && !isMixedUse` | `isSplit && acceptsPartLevelAmounts(props.asset)` |

**손대지 않는 8분기**(현행 유지 — 근거). 분리 OFF 3곳(`:81`·`:82`·`:110`)을 1행에 묶어 **6행**이다:

| 분기 | 유지 근거 |
|---|---|
| 취득일 2열 (`DateSection:142`) | 겸용도 `landAcquisitionDate`를 소비(`transfer-tax-mixed-use.ts:136-139` LTHD 기산) |
| 겸용 안내 A-1 (`:132`) | `isSplit && isMixedUse` — 겸용 **전용**이라 반대 술어 |
| 분리 OFF 분기 (`:81`·`:82`·`:110` — **3곳**) | 겸용과 무관한 표시 분기 |
| 라벨 (`PurchaseBlock:171`) | 〃 |
| PHD 토글 (`:443`) | 이미 `!isMixedUse` 별도 가드 有 — 다른 축 |
| 기준시가 5-way (`:539`) | 겸용은 내부 5-way에서 「겸용 영역에서 입력」 안내로 분기 — 다른 축 |

---

## 4. 케이스 매트릭스 — **전 행 현행과 동일**해야 한다

`acceptsPartLevelAmounts`는 현행 `!isMixedUse`를 그대로 옮긴 것이므로 **정의상 동치**다.
매트릭스는 그 동치를 고정하는 용도다.

| # | 자산 | `hasSeperate` | `selfOwns` | `isMixedUseHouse` | 축 A·B | 현행 대비 |
|---|---|---|---|---|---|---|
| 1 | 주택 | true | both | false | 표시 | 동일 |
| 2 | 주택 | true | both | **true**(겸용) | **숨김** | 동일 |
| 3 | 주택 | true | building_only | false | 소유 파트만 | 동일 |
| 4 | 주택 | true | building_only | **true** | **숨김** | 동일 |
| 5 | 주택 | **false** | building_only | false | 미표시(`isSplit` false) | 동일 |
| 6 | `land`·`redevelopment_apt` 등 | 임의 | 임의 | 임의 | 미표시(`isSplitable` false) | 동일 |
| 7 | 건물 | true | both | **true**(stale — assetKind 변경 잔존) | **숨김** | 동일 ※`assetKind` 조건을 넣었다면 갈렸을 케이스 |
| 8 | 부담부증여 | 임의 | 임의 | 임의 | 컴포넌트 early-return | 동일 |

---

## 5. 테스트 계획

### anchor (`__tests__/calc/accepts-part-level-amounts.test.ts` 신설)

**RED 절차 주의**: 헬퍼가 없으면 `import`가 모듈 해석 실패로 **파일 전체가 로드되지 않아**
"단언 실패"가 아니라 컴파일 에러가 난다. 의미 있는 RED가 아니므로 헬퍼를 먼저 **`return false`
스텁**으로 추가한 뒤 RED를 확인한다(`throw` 스텁도 부적절 — 전 케이스가 예외로 죽어
"어느 단언이 왜 실패했는지"가 드러나지 않는다).

| ID | 입력 | 기대 | `return false` 스텁에서 |
|---|---|---|---|
| G1 | `{}`(겸용 아님) | `true` | **실패** |
| G2 | `{ isMixedUseHouse: true }` | `false` | 통과 |
| G3 | `{ isMixedUseHouse: false }` | `true` | **실패** |
| G4 | `{ isMixedUseHouse: undefined }` | `true` — 현행 `!!undefined = false → !false` 동치 고정 | **실패** |

→ RED 분포 **3:1**. 이 분포가 아니면 anchor가 잘못 작성된 것이다.

> **매트릭스 #7(`assetKind` 조건 부재)은 anchor로 고정하지 않는다** — `PartLevelUiFlags`가
> `isMixedUseHouse` 하나만 받으므로 `assetKind`를 조건에 넣는 것 자체가 **타입 수준에서 불가능**하다.
> 좁은 인자 타입이 오용을 구조적으로 막는 편이 테스트로 감시하는 것보다 낫다.

### 회귀 가드 — 기존 anchor **8건**을 수정 없이 통과해야 한다

`__tests__/components/split-acq-date-mixed-note.test.tsx`의
**E1·E2·E2-b·E6-a·E6-b·E7-a·E7-b·E7-c**(8건)가 축 A·B·취득일 2열의 겸용/비겸용 노출을 고정한다.
※ 같은 파일의 **E3·E4는 PHD 3시점 모달 테스트로 이 리팩터와 무관**하다(파일 전체는 10건).

**공백 인지**: 기존 anchor Harness는 `assetKind: "housing"` 고정이라 매트릭스 #6(비-`isSplitable`
자산)·#3~#5(`selfOwns ≠ both`) 케이스를 덮지 않는다. 이번 변경은 그 축을 건드리지 않으므로
공백을 남겨두되, **초안 설계였다면 반드시 필요했을 anchor**임을 기록해 둔다(재시도 방지).

### 회귀 범위

`npm run test:transfer` + 위 anchor + 겸용 관련 E2E **42건**(`--workers=1` 순차 — 병렬은
부하로 위양성, `e2e-preexisting-failures-4.plan.md` §9-N2 실측).

---

## 6. 14 동기화 지점 점검

**엔진 input·result 타입 변경 없음 · 신규 폼 필드 없음 · API 전송 필드 불변 · 판정 로직 불변.**

| 지점 | 해당 | 근거 |
|---|---|---|
| ①②③ | ✕ | 필드 신설 없음 |
| ④API 변환 | ✕ | **API를 손대지 않는다**(초안의 위임안 기각) |
| ⑤UI 위젯 | **✓** | 축 A·B 2곳 표현 교체 |
| ⑥⑦ | ✕ | 사이드바·결과 표시값 불변 |
| ⑧validation | ✕ | 아래 참조 |
| ⑨~⑭ | ✕ | 스키마·body·Route 불변 |

**⑧ 근거 정정(자가 검토 발견)** — 초안은 "`validateSplitDirectInputs:95`가 플래그 원본으로
early-return하므로 안전"이라 적었으나 **사실과 다르다**. 겸용은 플래그가 강제 true라 `:95`에서
early-return하지 **않는다**. 실제 방어는 호출부
`transfer-tax-validate-asset.ts:306`의 `if (asset.isMixedUseHouse === true) return validateMixedUseAsset(...)`다.

> ⚠️ **그 호출부 가드가 겸용의 유일한 방어선이다.** 제거되면 `needsTransferStd`
> (`validate-split.ts:206-207`)가 발동하는데 — `saleSplitMode` 기본값이 `"apportioned"`
> (`calc-wizard-asset-factory.ts:147`)라 **모든 겸용 자산에서 true** — 양도시 기준시가 2필드를
> 요구한다. 그 유일한 입력 경로인 축 A 카드는 N-2로 **이미 숨겨졌으므로** 입력 칸 없는 dead-end가 된다.
> 이번 변경은 그 구조를 바꾸지 않지만, **사실 관계를 정확히 기록해 둔다**(다음 작업자가
> `:95` early-return을 믿고 호출부 가드를 정리하면 즉시 터진다).

---

## 7. 리스크

| 리스크 | 등급 | 완화 |
|---|---|---|
| 헬퍼 표현이 현행과 미묘하게 달라짐 | 중 | 현행 `!!isMixedUseHouse`를 **그대로** 옮긴다. `assetKind` 조건은 `PartLevelUiFlags` 타입에 그 필드가 없어 **구조적으로 불가능**(매트릭스 #7) |
| 2곳 중 하나만 교체 | 낮 | 기존 anchor 8건이 즉시 RED |
| 인자 타입이 느슨해 `undefined` 오판정 | 낮 | `PartLevelUiFlags`는 `isMixedUseHouse?: boolean` 하나뿐 — `undefined → true` 반환이 현행(`!!undefined = false` → `!false = true`)과 동일 |

---

## 8. 작업 순서

```
1. 헬퍼 `return false` 스텁 + anchor G1~G4 작성 → RED 확인
                                     → verify: G1·G3·G4 실패 / G2 통과 (**3:1** — 컴파일 에러 아님)
2. 헬퍼 구현                          → verify: G1~G4 GREEN
3. 축 A·B 2곳 교체                    → verify: 기존 anchor 8건 **수정 없이** GREEN
4. npm run lint + npm run check:pre-pr → verify: 0건
5. git diff --stat                    → verify: 변경이 헬퍼 신설·2줄 교체·anchor 신설에만 국한
6. 겸용 E2E 42건 --workers=1          → verify: 전건 통과(화면 불변 증거)
```

톤·폰트 게이트는 **생략한다** — 신규 UI 텍스트·클래스가 0건이다(판단 기록).

---

## 9. 착수 여부 판단 — **하지 않는 것도 합리적이다**

| | 내용 |
|---|---|
| **이득** | 겸용 가드 표현·근거가 헬퍼 1곳에 모인다. 새 파트-수준 분기를 추가할 때 `acceptsPartLevelAmounts`를 쓰면 누락이 준다 |
| **비용** | 헬퍼 1개 + 2줄 교체 + anchor 4건. 회귀 검증(E2E 42건)이 비용의 대부분 |
| **사용자 가치** | **0** — 화면·계산 모두 불변 |
| **하지 않을 근거** | 현재 가드는 2곳뿐이고, 강제 ON 경로가 늘어날 조짐이 실측상 없다(write 지점 2곳 고정). 초안이 예측한 "미래에 또 터진다"는 **분기가 늘 때만** 성립한다 |
| **할 근거** | 이번 세션에 **실제로 두 번 터졌다**(N-2 → N-3). 세 번째가 생기면 같은 조사를 반복한다 |

권고: **비용이 작으므로 착수해도 좋으나, 우선순위는 낮다.** 다른 기능 작업과 경합하면 뒤로 미룬다.

> 🗂 **2026-07-29 결정: 백로그.** 착수하지 않는다. 사용자 가치가 0이고 강제 ON 경로가 늘어날
> 조짐이 없어 지금 지불할 이유가 없다. **재개 신호**는 아래 둘 중 하나다:
> ⑴ 파트-수준 UI 분기가 **3곳째** 추가될 때(현재 2곳 — 축 A·축 B)
> ⑵ `hasSeperateLandAcquisitionDate` **강제 write 경로가 3곳째** 생길 때(현재 2곳 — 겸용·`selfOwns≠both`)
>
> 그때는 §3 설계를 그대로 쓰면 된다 — 자가 검토(3-way)까지 끝난 상태다.
> **§2(초안 기각 근거)를 먼저 읽을 것** — 통합 술어로 재시도하면 24조합이 깨진다(재시도 방지).

---

## 10. 범위 밖

- **API `isSplitPayloadActive`** — UI와 다른 술어를 쓰는 것이 의도적이다(§2 근거 1). 통합 금지.
- **겸용 강제 write**(`MixedUseSection.tsx:44-50`) — 제거하면 겸용에서 분리 계산 경로가 꺼져
  4부분 안분·취득일 2열이 사라진다(기능 제거).
- **`selfOwns ≠ both` 강제 write** — 취득일이 실제로 다를 개연성이 높고 `calcSplitGain`에서 정상 소비.
- **플래그 필드명 오타(`Seperate`)** — 전 계층 rename은 독립 과제, 회귀 범위가 훨씬 크다.
- **`validateSplitDirectInputs:95` 진입 구조** — ②로 진입해 ①로 세부 판정하는 현행이 의도적일 수
  있다. 바꾸려면 validate 전체 흐름 재검토 필요(§6 ⑧ 경고 참조).
