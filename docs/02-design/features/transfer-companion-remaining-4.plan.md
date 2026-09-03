# 컴패니언·축 B 남은 4종 개방 — 실측·설계·진행

**선행**: 상가 개방(`transfer-companion-commercial.plan.md`, PR #1454) · 부담부증여 개방(PR #1447·#1452)

---

## 0. 착수 전 실측 — 「⏸ 사유부터 잰다」

`transfer-companion-commercial.plan.md` §7이 남은 차단을 4종으로 적어 두었으나, **그 사유를
그대로 받지 않고 route로 다시 쟀다**. 이 저장소는 ⏸ 사유의 전제가 틀렸던 사례를 두 번 기록하고
있다(`transfer-acq-valuation-review-2026-09.completion.md` §14 — A06·§9-7).

### 0.1 엔진은 이미 10종을 전부 안다

```ts
TransferTaxItemInput.propertyType:
  housing | land | building | right_to_move_in | presale_right
  | mixed-use-house | commercial_building | general_building_unit
  | general_building | redevelopment_apt
```

좁아진 것은 **컴패니언 파이프라인**이다 — ⑩ enum + ④ fold + ⑭ 매핑. 상가와 같은 모양이다.

### 0.2 단건 기준값 (취득 3억 2015-03-01 → 양도 6억 2024-06-01 · 2주택)

| 종류 | 세율 | 과세표준 | 총세액 |
|---|---:|---:|---:|
| 주택 | 38% | 243,500,000 | 79,849,000 |
| **분양권** | **60%**(§104①1호) | 297,500,000 | **196,350,000** |
| 입주권 | 38% | 244,500,000 | 80,267,000 |
| 재개발APT | 38% | 204,000,000 | 63,338,000 |
| 일반건물 | 38% | 243,500,000 | 79,849,000 |

### 0.3 장벽은 **두 종류**다 — 이 구분이 배치를 가른다

| 컴패니언 | ⑧ | ④ payload | route |
|---|---|---|---|
| **분양권** | 차단 | **housing으로 fold** | 200 · 38% 누진그룹 |
| **입주권** | 차단 | **housing으로 fold** | 200 · 38% 누진그룹 |
| 일반건물 | 차단 | 유지 | **400** (⑩ enum) |
| 재개발APT | 차단 | 유지 | **400** (⑩ enum) |

fold 쪽(분양권·입주권)은 **200이면서 틀린 값**이고, enum 쪽(일반건물·재개발)은 계산이 아예
안 된다. ⑧이 넷 다 막고 있어 **살아 있는 오산은 없다** — 이 작업은 버그 수정이 아니라 축 개방이다.

### 0.4 🔴 겸용주택은 형태가 다르다 — 일괄에서 통째로 무시된다

primary 겸용주택 + 토지 컴패니언 → route **200**, `groupTaxes`가 일반주택 대조군과 **완전 동일**
(169,860,000). 겸용 분리계산 산출물이 응답에 하나도 없다.

> 같은 픽스처를 **단건으로 돌리면 500**(「겸용주택: 취득시 상가건물 기준시가와 개별공시지가를
> 모두 입력하세요」)인데 **일괄에서는 그 필수 검증조차 타지 않는다**. 일반건물이 「단건이면
> 500인데 일괄은 200」이었던 것과 같은 형태다.

### 0.5 부수 발견 — 축 B의 세율군 분열

primary=분양권으로 축 B(지분 분할)를 돌리면 ⑧은 막지만 route는 **같은 물건의 지분을 서로 다른
세율군으로** 가른다: `short_term`(primary만 60%) + `progressive`(나머지 지분 38%).

---

## 1. 배치

| 배치 | 대상 | 장벽 | 상태 |
|---|---|---|---|
| **1** | 분양권 | ④ fold (+⑩⑭) · **서브객체 0** | ✅ 완료 |
| **2** | 입주권 + 재개발APT | fold/enum + **§166 서브객체** | ✅ 완료 |
| **3** | 일반건물 | 5-a가 `return`해 5-a-3 미실행 | ✅ 완료 |
| 4 | 겸용주택 | 세액 계산이 엔진 내부 완결 | 🛑 미착수 — V-2~V-4·Q-1 미해소 |

> 🔑 **배치 3·4는 별개의 두 작업이 아니었다.** 실측 결과 둘 다 **같은 구조 문제** —
> 5-a(일괄)가 `return`해 버려 GB·겸용 전용 분기가 도달 불가 — 이고, 배관이 아니라
> **route 재설계**다. 설계문서: `transfer-bundled-subengine-hosting.design.md`

---

## 2. 배치 1 — 분양권 ✅

### 2.1 왜 배관만으로 되는가

분양권 특유의 축은 **전부 엔진이 `propertyType`만으로 판정한다**:

| 축 | 근거 | 엔진 처리 |
|---|---|---|
| 60% 단일세율 | 소득세법 §104①1호 | `propertyType === "presale_right"` |
| 장기보유특별공제 배제 | 같은 법 §95② | 〃 |
| 개산공제 1% | 같은 법 시행령 §163⑥4호 | 〃 |

⇒ §166 같은 **서브객체가 없다**. 입주권·재개발과 갈리는 지점이 여기다.

### 2.2 변경 (14 동기화 지점)

| 지점 | 파일 | 변경 |
|---|---|---|
| ⑩ | `transfer-tax-schema-sub.ts` | companion `assetKind` enum에 `presale_right` |
| ④ | `transfer-tax-api-helpers.ts` | `toEngineAssetKind`에서 분양권 fold 제거 |
| ⑭ | `bundled-split-helpers.ts` | 타입 union 2곳 + `propertyType` 매핑 + 안분·split fold |
| ⑧ | `transfer-tax-validate.ts` | `SINGLE_ONLY`에서 분양권 제거 |

⑤는 변경 없다 — 자산종류 선택지 8종이 **컴패니언 카드에도 이미 그대로 렌더**된다
(`AssetSectionBasic.tsx:38` 전수 확인). 입력 경로는 처음부터 있었고 ⑧만 막고 있었다.

### 2.3 fold는 「부수토지 배율」 축도 오염시키고 있었다

`resolveHousingContextFromCompanion`(`bundled-split-helpers.ts:85`)은 컴패니언 중
`assetKind === "housing"`인 것을 찾아 **정착면적·배율의 기준 주택**으로 삼는다. 분양권이
주택으로 접혀 오면 **정착면적이 없는 권리**가 그 자리에 앉는다. fold 제거로 원천 차단됐다.

### 2.4 실측

| | 세율군 | 과세표준 | 산출세액 |
|---|---|---:|---:|
| 종전(fold) | progressive 38% **1개** (두 자산) | 489,500,000 | 169,860,000 |
| **개방 후** | progressive 38%(primary) | 246,000,000 | 73,540,000 |
| | **short_term 60%**(분양권) | **297,500,000** | **178,500,000** |
| | 합계 | 543,500,000 | **252,040,000** |

**+82,180,000.** 분양권 그룹의 과세표준·산출세액이 **단건 분양권 실측과 정확히 일치**한다
(297,500,000 · 178,500,000) — 컴패니언이 단건과 같은 규칙으로 계산됨을 고정한다.
기본공제 250만원은 최고세율 그룹(60%)에 귀속됐다(`feedback_basic_deduction_highest_rate_allocation`).

### 2.5 뮤테이션 4축 전부 RED

| 되돌린 층 | 결과 |
|---|---|
| ⑩ enum에서 분양권 제거 | 3 failed |
| ④ fold 복원 | 3 failed |
| ⑭ `propertyType` 매핑 제거(land로) | 2 failed |
| ⑧ 차단 복원 | 1 failed |

### 2.6 stale anchor 반전

`companion-redev-rights-single-only.anchor.test.ts`의 **AC-2**가 「분양권은 차단되어야 한다」를
단언하고 있었다. 그 anchor가 근거로 든 삼킴(AC-5 — 60%·§95②·§163⑥4호)은 **fold가 원인**이고,
fold를 걷어내면 셋 다 되살아난다 ⇒ 차단이 아니라 개방으로 종결했다. **AC-1(입주권)은 유지**한다.

---

## 3. 배치 2 — 입주권 + 재개발APT ✅

### 3.1 같은 §166 자산인데 장벽이 서로 달랐다

| 컴패니언 | ④ payload | route |
|---|---|---|
| **입주권** | `toEngineAssetKind`가 **housing으로 fold** | 200 · §166 없이 주택으로 계산 |
| **재개발APT** | `redevelopment_apt` 유지 | **400** — ⑩ enum 부재 |

한쪽은 접혀서 통과하고 한쪽은 튕겼다. 그래서 **한 배치로 묶었다** — 어느 한쪽만 열면
나머지가 같은 서브객체를 기다리며 남는다.

### 3.2 왜 배관만으로 되는가

`buildRedevelopmentPayload(asset, ownershipRatio)`가 **이미 존재**하고 절대금액 성분
(권리가액·필요경비)의 지분 스케일까지 처리한다(축 A에서 구현). 컴패니언은 **각 자산이 자기
물건의 100%**라 스케일 자체가 불요하다 ⇒ 자산별로 같은 빌더를 부르면 된다.

> ⚠️ 종전 기록은 재개발 차단 사유를 「청산금·권리가액이 절대금액 성분이라 지분 스케일이
> 필요하다(상가와 반대)」로 적었다. 그것은 **축 B(지분 분할)의 사유**이고 이미 빌더가 풀어
> 두었다. 컴패니언 축에는 애초에 해당하지 않는다.

### 3.3 변경 (14 동기화 지점)

| 지점 | 파일 | 변경 |
|---|---|---|
| ⑩ | `transfer-tax-schema-sub.ts` | enum에 `right_to_move_in`·`redevelopment_apt` |
| ⑫ | 〃 | `redevelopment: redevelopmentSchema` — **primary와 같은 스키마 재사용**(refine 4종 포함) |
| ④ | `transfer-tax-api-helpers.ts` | `toEngineAssetKind` **삭제** — fold가 항등이 되어 고아가 됐다 |
| ⑬ | 〃 | 자산별 `buildRedevelopmentPayload(asset)` emit |
| ⑭ | `bundled-split-helpers.ts` | union·`propertyType` 매핑·서브객체 전달·안분 fold |
| ⑭ | `engine-input.ts` | **Date 변환 단일 leaf `toEngineRedevelopment` 추출** |
| ⑧ | `transfer-tax-validate.ts` | `SINGLE_ONLY`에서 2종 제거 |

### 3.4 Date 변환은 복제하지 않고 leaf로 뽑았다

`RedevelopmentInfo`의 `Date` 필드는 **정확히 5개**다(타입 전수 확인 — `approvalDate` ·
`settlementSaleDate` · `firstDisclosureDate` · `completionDate` · `otherHouseAcquisitionDate`).
단건 경로에 인라인돼 있던 변환을 `toEngineRedevelopment`로 뽑아 컴패니언이 **같은 leaf**를
쓴다. 복제하면 한쪽만 필드가 늘어 그 경로에서만 `Date < string` silent false가 난다.

### 3.5 뮤테이션 5축 전부 RED

| 되돌린 층 | 결과 |
|---|---|
| ⑩ enum에서 2종 제거 | 4 failed |
| ⑫ `redevelopment` 서브객체 제거 | 2 failed |
| ⑬ emit 제거 | 4 failed |
| ⑭ `propertyType` 매핑 제거 | 2 failed |
| ⑭ 서브객체 전달 제거 | 2 failed |

### 3.6 stale 단언 4건 반전 — 「바이트 동일」이 판별력으로 뒤집혔다

| 파일 | 종전 단언 | 반전 |
|---|---|---|
| `companion-redev-rights-single-only` AC-1·AC-3 | 입주권·재개발 차단 | 개방 |
| 〃 **AC-4** | 입주권 컴패니언 응답이 순수 주택과 **바이트 동일** | **더는 같지 않다** |
| `transfer.route.review-2026-08-f40` F40-6 | payload `assetKind === "housing"`(fold) | `right_to_move_in` 보존 |
| `burdened-gift-fractional-validate` | 재개발 + 함께양도 차단 | 개방 |
| `gb-fractional-validate.predo` GBF-21 | 「겸용주택·재개발 차단 그대로」 | 재개발 개방 + **겸용주택 전용 항목 신설** |

> 🔑 AC-4의 반전이 이 배치에서 가장 센 안전망이다. 종전에는 §166 입력을 **다 채운** 입주권과
> **하나도 안 넣은** 순수 주택의 응답이 `JSON.stringify` 바이트 단위로 같았다. 개방 후에는
> 달라야 하고, 같아지면 배관 어딘가가 다시 침묵 strip한다는 뜻이다.

> ⚠️ GBF-21은 재개발을 반전하면서 **겸용주택 차단을 보는 항목을 새로 뒀다** — 원래 그 항목이
> 두 자산을 함께 보고 있어, 반전만 하면 겸용주택 축의 안전망이 조용히 사라진다.
