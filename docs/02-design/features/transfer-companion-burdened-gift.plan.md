# 컴패니언(다른 물건) × 부담부증여 — 구현 계획

**상태**: ✅ 완료 (2026-09-03)
**선행**: 축 B × 부담부증여 PR #1447 (`transfer-axis-b-burdened-gift.plan.md`)

---

## 1. 무엇이 막혀 있었나

`lib/calc/transfer-tax-validate.ts`의 `SINGLE_ONLY`가 `transferType === "burdened_gift"`를
「함께 양도와 같이 계산할 수 없습니다」로 차단한다. 축 B(전 자산 fractional)만 예외로 열려 있었다.

### 1.1 기록된 차단 사유는 틀렸다

`transfer-tax-validate.ts:120-121` 원문:

> route가 transferPrice를 안분값으로 덮어써 §159 기준 gain과 **스케일 충돌** →
> 표시 필요경비가 **음수(-91,000,000)**

**충돌하지 않는다.** 엔진 STEP 0.48(`transfer-tax-burdened-gift-step.ts:82-85`)이
`transferPrice`·`acquisitionPrice`·`expenses`를 **모두 §159 산정값으로 다시 덮어쓴다.**
route의 안분값은 그대로 버려진다.

### 1.2 진짜 결함 — 자산 수만큼 곱해진다 (실측)

Gate-B를 우회해 route를 태운 실측. 물건1 평가 10억(취득 5억) · 물건2 평가 6억(취득 3억) ·
총 인수채무 4억:

| | 자산1 차익 | 자산2 차익 | 합계 |
|---|---:|---:|---:|
| 현행 배관 | 194,000,000 | 194,000,000 | **388,000,000** |
| 정본(§159) | 121,250,000 | 72,750,000 | **194,000,000** |

원인: ④가 카드마다 **그 카드의 입력 채무 전액**을 `burdenedGiftInfo`에 담는다.
카드 안에서는 A(자산가액) = C(증여가액)이므로

    양도가액ᵢ = Aᵢ × Bᵢ/Cᵢ = Bᵢ

가 되어, 각 카드가 자기 채무 전액을 양도가액으로 잡는다.

### 1.3 표시 축은 이 축의 문제가 아니다 (기존 결함)

`properties[].transferPrice`가 §159값이 아니라 route 안분값이다. **이미 출시된 축 B에도
똑같이 있다** (실측: 축 B 60% 카드 표시 600,000,000 ↔ §159 양도가액 150,000,000).
차익·세액은 정확하다. 총계약가액을 ΣC로 바꿔 넣어도 안 맞는다 — 입력 규약으로 못 고치는
별건이며, 이 축을 막을 근거가 아니다.

---

## 2. 조문

### 2.1 §159① — B/C는 **신고(증여계약) 단위 단일 비율**

법제처 원문 (소득세법 시행령, 시행 2026-07-01):

> 1. 취득가액: A × B/C — A: 법 §97①1호에 따른 가액 / B: 채무액 / C: 증여가액
> 2. 양도가액: A × B/C — A: 「상속세 및 증여세법」 §60~§66에 따라 평가한 가액 / B: 채무액 / C: 증여가액

**A만 자산별이고 B·C는 계약 단위다.** 자산 간 배분은 A가 이미 수행한다.

### 2.2 §159② — 채무 안분식이 명문

> 채무액 = A × B/C — A: 총 채무액 / B: 양도소득세 과세대상 자산가액 / C: 총 증여 자산가액

문언 범위는 「과세대상 자산과 **해당하지 아니하는** 자산을 함께 부담부증여하는 경우」로
과세/비과세 구분용이지만, **자산가액 비율로 채무를 나눈다**는 규범을 입법자가 채택했음을
직접 확인해 준다.

### 2.3 ⇒ 카드별 재현식

카드 i에 실을 채무를

    Bᵢ = B × Aᵢ / ΣA          (B = 총 인수채무, Aᵢ = 자산 i의 상증법 평가액)

로 두면 카드 안에서 Cᵢ = Aᵢ이므로

    debtRatioᵢ = Bᵢ/Cᵢ = B/ΣA = B/C   ✅ §159①의 단일 비율이 보존된다.

실측 검증: 채무 4억을 10:6으로 안분해 넣었더니 121,250,000 + 72,750,000 = **194,000,000**
— 정본과 완전 일치(단건 참조와도 자산별로 일치).

### 2.4 ⛔ 기각된 설계 — 「담보채권액이 max인 자산은 물건 귀속」

검토 초기에 **자기참조 회피**를 이유로 「담보채권액이 max인 자산은 안분에서 빼고 그 물건에
귀속시킨다」를 권고했다. **조문 위반이라 기각한다** — 그 자산만 Bⱼ/Cⱼ ≠ B/C가 되어
§159①의 단일 비율을 깬다. 근저당이 물건별로 설정된다는 사실은 맞지만, §159②는 담보가
어디 붙었든 **자산가액 비율로 나눈다**는 태도를 이미 취하고 있다.

자기참조 문제는 아래 §3.1이 다른 방법으로 없앤다.

---

## 3. 설계

### 3.0 입력 규약 (신설)

컴패니언 카드의 채무 입력 규약은 **정의된 적이 없었다** — 라벨이 「임대보증금 총액」일 뿐이고
안내 문단은 축 A(`isFractional`)·축 B(`isFractionalSplit`) 전용이었다.

⇒ **각 카드에 그 물건의 채무를 입력한다.** 상증법 §66(담보 재산 평가)·§61⑤(임대 재산 평가)이
**재산별** 평가이므로 자산별 채무가 Aᵢ 산정에 필요하다. 축 A(지분 인수분)·축 B(물건 전체)와
또 다른 제3의 규약이므로 안내 문단을 신설한다.

### 3.1 엔진 1점 — `assumedDebtOverride`

Bᵢ를 「입력 채무에 비율을 곱하는」 방식으로 만들 수 **없다**:

- 입력 채무가 0인 자산(무담보 물건)에는 어떤 비율을 곱해도 0이다 — 그 자산 몫이 통째로 사라진다.
- 채무를 스케일하면 `mortgage`·`rental` 평가 성분이 함께 움직여 **Aᵢ 자체가 바뀐다**(자기참조).

⇒ `BurdenedGiftInfo`에 `assumedDebtOverride?: number`를 두고 `computeDebtRatio`가
그것을 B로 쓴다. **평가(`computeSangjeungbeopValuation`)는 원 입력값 그대로** 돌아
Aᵢ가 고정된다 — 자기참조가 원천 제거된다.

`assumedDebtAmount`의 소비 지점은 `computeDebtRatio`(`burdened-gift-valuation.ts:180`)
**단 하나**이므로 override 1개로 양도가액·취득가액·개산공제·증여세가 모두 일관된다.

### 3.2 ④ 재배분

`transfer-tax-api.ts`가 컴패니언 부담부증여를 감지하면:

1. 각 자산 Aᵢ = `computeSangjeungbeopValuation`(지분율 반영 후)
2. B = Σ(보증금ᵢ + 담보차입금ᵢ)
3. Bᵢ = `safeMultiplyThenDivide(B, Aᵢ, ΣA)`, **마지막 자산이 잔액 흡수**(절사 오차)
4. `burdenedGiftInfo.assumedDebtOverride = Bᵢ`

### 3.3 증여세 1회 (D2)

카드별 breakdown을 합치면 증여재산공제가 N번 차감되고 누진이 갈라진다(축 B에서 −19,400,000 실측).
⇒ `burdenedGiftWholeInfo`에 **합산 info**를 실어 M-0.5가 §159를 1회 계산한다.

합산 info는 각 성분의 단순 합(기준시가·보증금·담보차입금·임대료·설정액)이다.
`giftValuation.max`가 ΣAᵢ와 일치하려면 **모든 자산의 `selectedMode`가 `supplementary`여야
한다** — Σmax ≠ max(Σ성분)이기 때문이다. 그 조건은 §3.4 게이트가 강제한다.

### 3.4 ⑧ 게이트 교체

- `SINGLE_ONLY`에서 `burdened_gift` 제거.
- **신설**: 어느 자산이든 상증법 평가의 승자가 보충적평가가 아니면(담보평가·임대평가가 max)
  **명시 차단**. 그 경우 합산 info의 max가 ΣAᵢ와 어긋나 증여세가 조용히 틀린다.
  「침묵 오산보다 명시 차단」(`multi-transfer-tax-validate.ts:57-71`)과 같은 층위.

---

## 4. 14 동기화 지점

| 지점 | 변경 |
|---|---|
| ⑤ UI | `BurdenedGiftBlock` 컴패니언 안내 문단 신설 |
| ⑧ validate | Gate-B에서 `burdened_gift` 제거 + 평가승자 게이트 신설 |
| ④⑬ 변환 | 채무 재배분 + `assumedDebtOverride` 주입 + 합산 `burdenedGiftWholeInfo` |
| ⑫ Zod | `burdenedGiftInfoSchema.assumedDebtOverride` |
| ⑩ 컴패니언 Zod | 위 스키마 공유 — 추가 변경 없음(PR #1447이 `burdenedGiftInfo`·`transferType`을 이미 깔았다) |
| ⑭ Route | `bundled-split-helpers` 매핑 — `burdenedGiftInfo` 통째 전달이라 추가 변경 없음 |

## 5. 검증

- 엔진 anchor: `assumedDebtOverride`가 debtRatio를 가른다 (뮤테이션)
- 배관 anchor: route 태워 합계 = 정본, 카드별 = 단건 참조
- 게이트 anchor: 평가승자가 담보·임대인 자산이 섞이면 차단
- E2E

---

## 6. 실행 결과

### 6.1 변경

| 층 | 파일 | 변경 |
|---|---|---|
| 엔진 | `types/transfer-burdened-gift.types.ts` · `burdened-gift-valuation.ts` | `assumedDebtOverride` 1필드 + `computeDebtRatio` 소비 1지점 |
| ④⑬ | `transfer-tax-api-burdened-gift.ts` | `companionBurdenedGiftValuations` · `apportionCompanionBurdenedGiftDebt` · `buildCompanionBurdenedGiftWholeInfo` |
| ④⑬ | `transfer-tax-api.ts` · `transfer-tax-api-helpers.ts` | 재배분 주입(primary + 컴패니언) · 합산 wholeInfo |
| ⑫⑩ | `transfer-tax-burdened-gift-schema.ts` | 필드 1개 — primary·컴패니언·whole이 **같은 스키마를 공유**해 한 곳으로 끝났다 |
| ⑭ | — | 변경 없음. `bundled-split-helpers`가 `burdenedGiftInfo`를 통째로 넘긴다 |
| ⑧ | `transfer-tax-validate.ts` · `-asset.ts` · `-bg.ts` | Gate-B 해제 · 평가승자 게이트 신설 · 「채무 > 0」 판정을 신고 단위로 |
| ⑤ | `BurdenedGiftBlock` · `TransferModeBlock` · `AssetSectionTransfer` · `CompanionAssetCard` | `isCompanionBundle` 안내 문단 |

### 6.2 실측

픽스처: 물건1 평가 10억(취득 5억)·채무 4억 + 물건2 평가 6억(취득 3억)·**채무 0**.

| | 값 |
|---|---|
| 재배분 Bᵢ | 250,000,000 / 150,000,000 (= 4억 × 10:6) |
| 자산별 차익 | 121,250,000 / 72,750,000 — **단건 참조와 자산별 일치** |
| debtRatio | 0.25 = B/ΣA ✅ |
| 합산 증여가액 | 1,600,000,000 = ΣAᵢ, 승자 `supplementary` |
| 증여세 | 291,000,000 (과표 11.5억) — **1회** |
| 축 B 회귀 | 64,600,360 그대로, override 미부착 |

### 6.3 뮤테이션 (전부 RED)

| 제거한 층 | 결과 |
|---|---|
| 엔진 override 소비 | O 5건 중 2건 실패 |
| ④ 재배분 | C 8건 중 4건 실패 |
| ⑬ 합산 wholeInfo | 2건 실패 |
| ⑬ 컴패니언 주입 | 2건 실패 |
| ⑫ Zod 필드 | 1건 실패 (차익) |

### 6.4 검증

- `npm test` 전건 통과 (1829 파일 · 19,489 tests)
- E2E 9건 통과 (신규 2 + 축 B 2 + 축 A 5)
- **stale anchor 3건 반전** — 전부 「부담부증여 × 함께양도는 차단된다」를 단언하고 있었다
  (`burdened-gift-fractional-validate.test.ts` 2건 · `axis-b-burdened-gift-plumbing.anchor.test.ts` P-6)

## 7. 남은 것

| 항목 | 상태 |
|---|---|
| ⚠️ 표시 축 | `properties[].transferPrice`가 §159값이 아니라 route 안분값. **축 B에도 있는 기존 결함** — 차익·세액은 정확하다 |
| 🛑 담보평가·임대평가가 max인 자산 | ⑧ 명시 차단. 합산 증여가액이 ΣAᵢ와 어긋나기 때문 — 열려면 합산 info에 평가액 override가 필요하다 |
| 🛑 겸용주택·상가·재개발 × 함께양도 | Gate-B 유지 — 미검증 |
