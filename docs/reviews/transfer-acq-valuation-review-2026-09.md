# 양도소득세 취득가액·평가 축 코드리뷰 — 엔진 · lib/calc · 6계층

> ✅ **처리 완료 — 결과는 [`transfer-acq-valuation-review-2026-09.completion.md`](transfer-acq-valuation-review-2026-09.completion.md)가 정본이다.**
> 이 문서는 **착수 전 시점 그대로**다. 아래 §6의 12배치 표는 「예정」으로 읽히지만 실제로는
> **3개 PR(#1416·#1419·#1423)로 18건이 처리**됐고, §9의 ⏸ 7건 중 4건은 사용자 결정으로 종결됐다.
> 남은 미해소는 **A06·A10·A23** 3건이며 전부 소스에 마커가 달려 있다.
> §1·§7·§8의 「정정·금지·기각」 기록과 §10의 「닿지 않은 곳」은 여전히 유효하다.

> 2026-09-02 · 대상 `master` **265c10bf** · 워크트리 `.claude/worktrees/acq-valuation-review`
> 범위: **엔진 12파일 3,364줄** + **lib/calc 16파일 2,069줄** — §163⑨ 상속·증여 취득가액 / §164④~⑦ 개별공시지가·주택가격 미공시 환산 / §164⑨ 수용·공매경락 분모 특례 / §97의2④ 가업상속공제 의제취득가 / §166 다필지·재개발 / §101·상증법 §35 저가양수. 각 결함은 ①폼~⑭Route 6계층(⑤UI·⑧validate·④변환·⑫Zod·⑬body·⑭매핑)을 관통해 판정했다.
> 방법: 12축 병렬 정독 → **항목별 적대적 반증 41회**(항목당 1~3, 독립 반증자) → 완전성 비평. 모든 세액은 `npx tsx`로 무수정 소스를 직접 import해 관측한 값이고 산식 추론값이 아니다.

---

## 0. 요약

| | 건수 |
|---|---|
| 1차 raw findings | 53 |
| 병합 후 | 32 |
| 1차 확정 (반증 통과) | **22** |
| 1차 기각 | 2 |
| Low 미검증 (반증 미실시) | 8 |
| 2차 raw (파생 발견 + 완전성 비평) | 9 |
| 2차 확정 | **7** |
| 2차 기각 | 1 |
| 자동 검증자 사망으로 탈락했다가 **메인 루프가 직접 검증해 복구** | **1** (A20) |
| **확정 고유 결함** | **21** |

**반증 41회의 결과**: CONFIRMED **17** · PARTIALLY_CONFIRMED **24** · REFUTED **0**. 이와 별도로 **반증자 4명이 API 오류로 사망**했다(§10 「검증 커버리지 공백」) — 그중 A20은 1렌즈 배정이라 판정 자체가 소실돼 조용히 탈락했고, 메인 루프가 직접 검증해 복구했다(§4.7).
REFUTED가 0인 것은 결함이 전부 실재했다는 뜻이지 **원 서술이 전부 옳았다는 뜻이 아니다** — PARTIALLY 24건은 수치·범위·조문·심각도 중 하나 이상이 정정됐고, 그중 **A05는 44,586,668원 결함에서 세액 영향 0원 결함으로 뒤집혔다**(§1 참조).

### 심각도 · 유형 분포

| 심각도 | 건수 | 항목 |
|---|---|---|
| 🔴 Critical | **4** | A01 · A02 · A03 · A04 |
| 🟠 High | **7** | A06 · A07 · A08 · A09 · A10 · A11 · A12 |
| 🟡 Medium | **7** | A13 · A15 · A16 · A18 · A20 · A21 · A22 |
| ⚪ Low | **3** | A05 · A17 · A19 |

| 유형 | 건수 |
|---|---|
| `wiring` (침묵 stripping · 조기반환 누락 · 계층 배선 부재) | 8 |
| `legal-accuracy` (조문 요건 미구현·게이트 부재) | 4 |
| `display` (표시 산식 ↔ 표시 금액 괴리 · 산출근거 소실) | 4 |
| `reachability` (입력받고 검증하고 버림 / 해소 불가 차단) | 3 |
| `arithmetic` (스케일·면적 축 불일치) | 2 |

**안전망 베이스라인**: mutation probe 18회 중 **15회가 반응 0건**. 세액을 1.5억 움직이는 한 줄을 뒤집어도 7,800~16,400개 테스트가 전건 초록이다. 즉 이 영역의 결함은 「테스트가 잡는데 방치된 것」이 아니라 **안전망이 애초에 없는 것**이다(§9).

---

### 세액이 실제로 틀어지는 것 — 실측 10건

실측 세액 쌍(현행 출력 / 올바른 출력)을 관측한 항목만 넣었다. 표시 전용·기능 차단·미실측 항목은 제외했다.

| 우선 | 결함 | 실측 세액차 | 방향 | 관측 |
|---|---|---|---|---|
| 1 | **A01** 일부양도에서 pre1990 §164④ 면적이 「취득 전체면적」 | **154,704,000원** (0 → 154,704,000) | 과소 (전액 소멸) | 3회 독립 재현, 원 단위 일치 |
| 2 | **A02** 미등기 다필지에 장특공제가 그대로 적용 | **129,360,000원** (332,640,000 → 462,000,000) + 개산공제 **5,400,000원** 필요경비 과대 | 과소 | 3회 독립 재현 |
| 3 | **A03** ①상증법 평가액 공란이면 §163⑨ payload 전체가 미전송 | 상가 **103,950,000 ~ 124,740,000원** · 주택 **53,311,500 ~ 68,992,000원** | 과대 (토지는 양방향) | 3회 재현, 입력 종속 |
| 4 | **A10** 필지 카드 순서가 세율 기산일을 결정 | **84,722,000원** 스윙 (197,703,000 ↔ 282,425,000) · 환지 첫 필지 **75,779,000원** | 양방향 / 환지는 과대 고정 | 2회 재현 |
| 5 | **A04** 취득원인을 바꿔도 stale 가업상속공제가 의제취득가를 강제 | **83,281,000원** (97,405,000 → 14,124,000) · GB 경로 **71,242,600원** | 과대 (의제↔실지 대소에 따라 양방향) | 3회 재현, 원 단위 일치 |
| 6 | **A09** `hasPre1990` 게이트에 1990-08-30 기간 요건 부재 | **61,409,855 ~ 178,196,271원** (등급 입력 종속) | 양방향 | 3회 재현 |
| 7 | **A12** 컴패니언 토지의 다필지 입력이 ④에서 소실 | **2,173,600 ~ 15,488,000원** (필지 간 취득시기 격차 비례, 상한 탐색 12,474,000) | 양방향 | 3회 재현 |
| 8 | **A07** 지분 모드에서 ①은 안분되고 ②(§164④)는 100% 물건 값 | **10,078,073원** (단건) / **11,138,923원** (2지분 번들) | 과소 (저지분에서 상대오차 폭증) | 2회 재현 |
| 9 | **A11** §164⑦ 산식 괄호 단서(§164⑧ 준용) 미구현 | **10,288,162원** (279,800,400 → 290,088,562) | 과소 | 1회 실측 (§80①1호 구간 한정) |
| 10 | **A06** PHD 경로가 자본적지출·양도비를 나목 후보로 안 읽음 | **4,399,780 ~ 10,134,945원** | 과대 | 3회 재현(원 수치는 재현 실패 — §1-④) |

세액 0원이 확정된 것: **A05**(컴패니언 §164⑨1호 — 그 조합은 HTTP 500으로 죽는다) · **A08**(공매·경락 다필지/split — 입력이 무시되어 특례 미적용값 = 현행값) · **A17·A18·A19·A21·A22**(표시 전용). **A15**는 세액이 아니라 기능 차단(HTTP 400). **A13**은 세액 미실측(감면 5년 안분 비선형 경로, 감면대상 소득금액 ±3천만원대까지만 관측). **A16**은 세액이 아니라 차단돼야 할 입력이 통과해 증여재산가액 700,000,000원이 산출된다.

---

## 1. ⚠️ 먼저 정정 — 반증 단계에서 전제가 뒤집힌 5건

원 finding을 그대로 읽으면 잘못된 수정을 하게 되는 것들이다. **아래가 정본이다.**

### ① A05의 44,586,668원은 이 결함의 크기가 아니다 — 컴패니언 경로의 세액 영향은 **0원**

원 finding은 「컴패니언 §164⑨1호 토지분 보상 2필드가 ④⑫⑭에 없어 44,586,668원 과대」라고 적었다. 세 반증자가 독립적으로 확인한 사실:

- 그 두 숫자(137,480,932 / 182,067,600)는 **단건(primary) 경로**를 `calculateTransferTax`로 leaf 호출한 값이다. primary 경로는 ④(`transfer-tax-api-helpers.ts:656-657`) → ⑫(`transfer-tax-schema.ts:128-129`) → ⑭(`engine-input.ts:57`)가 **이미 정상 배선돼 있어** 현행에서도 특례가 발동한다. 즉 그 44,586,668원은 「특례 자체의 크기」이지 결함이 유발한 오차가 아니다.
- 컴패니언 경로에서 그 2필드가 세액을 1원이라도 바꾸는 조합은 **0건**이다. 컴패니언에는 `standardPricePerSqmAtAcquisition`(토지분 취득시 ㎡당 기준시가) 채널이 ⑫·⑭ 어디에도 없어서 — 배선 지점 3곳이 전부 단건 전용(`transfer-tax-api.ts:457` · `transfer-tax-schema.ts:289` · `engine-input.ts:280`) — `calcSplitGain`이 `TaxCalculationError(INVALID_INPUT)`을 던지거나(별개취득) `null`을 반환한다(취득일 동일). §164⑨1호 분모 인하는 `transfer-tax-split-gain.ts:315` `if (landMode === "estimated")` 안에서만 호출되므로 **구조적으로 도달 불가**다.
- 실제 route POST 실측: **HTTP 500** — `"자산 2: 환산·감정·매매사례 취득가액 계산에는 취득시 기준시가 토지분(취득시 ㎡당 개별공시지가 × 토지 면적 — 소득세법 §99①1호 가목)이 필요합니다."`

⇒ **severity critical → low**. 그리고 finding이 제안한 수정(2필드를 shape·④·⑭에 추가)은 **no-op이다**(실측: 주입 전후 THROW 동일). 살아남는 것은 두 가지다 — ⑧ validate가 「토지분 보상액 총액을 입력하세요」로 **입력을 강제해 놓고** 그 값을 버린다는 UI↔엔진 모순, 그리고 그 조합 전체가 원인 불명의 500으로 죽는다는 **별건 결함**(컴패니언 perSqm 채널 부재 — §7 신규 항목).

### ② A12의 조문 인용 「소득세법 시행령 §162①6호(환지 취득시기)」는 틀렸다 — **§162①9호**다

KoreanLaw 본문 verbatim 확인(현행 시행령, 시행 2026-07-01):

- §162①**6호** = 「"「민법」 제245조제1항의 규정에 의하여 부동산의 소유권을 취득하는 경우에는 당해부동산의 점유를 개시한 날"」 — **점유취득시효**다.
- §162①**9호** = 「"「도시개발법」 또는 그 밖의 법률에 따른 환지처분으로 인하여 취득한 토지의 취득시기는 환지 전의 토지의 취득일. 다만, 교부받은 토지의 면적이 환지처분에 의한 권리면적보다 증가 또는 감소된 경우에는 그 증가 또는 감소된 면적의 토지에 대한 취득시기 또는 양도시기는 환지처분의 공고가 있은 날의 다음날로 한다."」

**이 오인용은 finding이 만든 것이 아니라 저장소에서 복제된 것이고, 저장소가 자기 자신과 모순된다**:

| 표기 | 위치 |
|---|---|
| ❌ §162①6호 | `lib/tax-engine/legal-codes/transfer.ts:218` `REPLOTTING_ACQ_DATE` · `lib/stores/calc-wizard-asset.ts:298` · `components/calc/transfer/asset-sections/AssetSectionAcquisition.tsx:214` · `components/calc/inputs/ParcelListInput.tsx:197` |
| ✅ §162①9호 | `components/calc/transfer/RedevelopmentBlockCards.tsx:64` · `components/calc/results/transfer/receive-only-display.ts:14` |

상수 주석의 「환지처분 확정일 다음날」도 법문은 「환지처분의 **공고가 있은 날**의 다음날」이다. **별건 정정 대상**으로 §7에 남긴다.

### ③ A13의 「저장소 『자동 안분 fallback 금지』 정책 위반」은 성립하지 않는다

`CLAUDE.md:314` 원문: 「자동 안분 fallback 금지(**예외: PHD §164⑦**). 미입력은 검증 오류로 차단.」 — A13이 다루는 경로가 **정책이 명시적으로 예외로 지목한 바로 그 경로**다. legal-accuracy 논거(취득시 값을 최초공시 자리에 대입하는 것이 §164⑦ 산식이 아니다)는 독립적으로 성립하지만, **정책 위반 논거는 삭제해야 한다**.

같은 항목의 방향 주장도 반증됐다. 「건물 기준시가는 경년감가로 낮아진다」는 저장소 자체 `calcBuildingStandardPrice` 실측에서 인접연도 6쌍 중 **3쌍이 상승**한다(2002→2003 37,900,000→44,600,000 등 — 신축가격기준액 상승이 잔가율 감소를 역전). ⇒ 오차 방향은 **양방향**이다.

### ④ A06의 「PHD 분기만 자본적지출을 안 읽는다」는 틀렸다 — 비-PHD split도 안 읽는다

`transfer-tax-split-gain.ts:500`도 `input.expenses ?? 0`만 본다. 실측: 별개취득·양쪽 환산 비-PHD split에 `capitalExpenditure: 100,000,000`을 주입해도 총세액 429,936,871 **불변**. 차이는 엔진이 아니라 **차단·대체 입력 경로의 유무**다 — 비-PHD split은 `transfer-tax-validate-split.ts:435-441`이 「토지분·건물분 칸에 각각 입력하세요」로 차단하고 파트 칸이 실재하는데, **PHD + 취득일 동일** 조합만 차단도 파트 칸도 없다.

세액 수치도 재현되지 않았다. 원 「정본 fixture 22,240,467원」은 세 반증자 모두 **재현 실패** — 그 fixture의 파트별 가목은 토지 393,631,473 · 건물 173,787,714라 나목 1.2억으로는 §97②2호 단서가 발동할 수 없다(파트칸을 직접 넣어도 총세액 28,710,143 불변). 「현실 시나리오 18,941,473원」도 PHD 11필드 중 6개가 공개되지 않아 재현 불가. **대체 실측값을 정본으로 쓴다**(§3.1).

### ⑤ A11의 「Sum_A === Sum_F이면 항상 틀린다」는 참이 아니다

「소득세법 시행규칙」 §80①은 §164⑧의 산정방법을 2호로 가른다(오프라인 아카이브 본문 확인):

- **1호** = 「취득일이 속하는 연도의 다음 연도 말일이전에 양도하는 경우」 → 가목 `취득당시 + (취득당시 − 전기) × [보유월수/조정월수(100분의 100을 한도로 한다)]`
- **2호** = 「제1호외의 경우에는 당해 양도자산의 취득당시의 기준시가」

§164⑦ 준용에서 「양도」 자리는 「최초공시」다. ⇒ **최초공시일이 취득연도의 다음 연도 말일보다 뒤면 2호가 적용되어 대체분모 = Sum_A = Sum_F → 비율 1 → 현행 출력이 곧 법령이 요구하는 값**이다. 결함 구간은 **§80①1호 구간에 한정**된다(취득이 최초공시와 같은 고시분 구간에 있는 경우 — 예: 개별주택가격 최초공시 2005-04-30 직전 취득).

같은 이유로 finding의 suggestedFix(형제 §164⑥의 `calcSec164_8AdjustedDenominator` 단순 이식)는 **불충분하다** — 그 헬퍼와 호출부는 §80①1호/2호 연도 축을 판정하지 않고 동일성만 보고 무조건 가목 산식을 태운다. 저장소에는 이미 그 축을 구현한 도메인 무관 leaf가 있다: `lib/tax-engine/same-adjustment-period-std-price.ts`의 `SameAdjustmentPeriodClass`(`clause_1`/`clause_2`/`not_applicable`).

---

## 2. 🔴 Critical — 세액 오류 + 실측 + 정상 UI 경로 도달

### 2.1 A01 — 일부양도(partial)에서 pre1990 §164④ 취득기준시가가 「양도분 면적」이 아니라 「취득 전체면적」으로 산출된다

**위치** `lib/calc/transfer-tax-api-helpers.ts:241` · **유형** `arithmetic` · **검증** CONFIRMED 3/3
**조문** 「소득세법 시행령」 §176조의2②2호 verbatim(「양도당시의 실지거래가액 … × 취득당시의 기준시가 / 양도당시의 기준시가」) + 「소득세법」 §114⑦(추계 대상 = 해당 양도자산) · 「소득세법 시행령」 §164④ verbatim(「1990년 8월 30일 개별공시지가가 고시되기 전에 취득한 토지의 취득당시의 기준시가는 다음 산식에 의하여 계산한 가액으로 한다 …」)

**결함** — 엔진 최상위 `acquisitionArea`는 `transfer-tax-api.ts:483`에서 `resolveAcqAreaForStdPrice(primary)`를 태워 `areaScenario === "partial"`이면 양도면적으로 정정된다(B4-1). pre1990 §164④ 경로의 면적만 `buildPre1990LandPayload`가 raw `primary.acquisitionArea`(= 취득 전체면적)를 그대로 쓴다. 양도시 기준시가는 `StandardPriceInput`이 **양도면적** 기준으로 자동 계산하므로(`CompanionAcqPurchaseBlock.tsx:646` 취득시 `area={props.acquisitionArea}` ↔ `:668` 양도시 `area={props.transferArea}`) 환산 분자만 (취득면적/양도면적)배 부풀려진다.

**근거** — 한 payload 안에서 자기모순이 직접 관측된다:
```
pre1990Land.areaSqm      = 300      ← buildPre1990LandPayload (원본 취득면적)
acquisitionArea (최상위) = 100      ← resolveAcqAreaForStdPrice (양도면적)
standardPriceAtTransfer  = 150000000 (= 1,500,000/㎡ × 양도 100㎡)
```
`transfer-tax-validate-asset.ts:418-419`의 면제 근거 주석이 verbatim 「환산·감정·매매사례는 **B4-1이 기준시가 면적을 정정했고**」인데, **이 경로에서는 그 전제가 무너져 있다**. 조문 렌즈로도 반증되지 않았다 — 분자를 300㎡·분모를 100㎡로 잡는 것은 어느 독법에서도 자기모순이고, 실측상 환산비율이 정확히 1.0이 되어 환산취득가 = 양도가액 → 양도차익이 통째로 0이 된다.

**실패 시나리오** — 토지 300㎡ · 1988-05-01 취득 · 환산 · 1990 개별공시지가 500,000원/㎡ · 등급 218/218/218 · 일부양도(취득 300㎡ / 양도 100㎡) · 양도가 900,000,000 · 2023-05-01.

| | 취득기준시가 | 양도차익 | 과세표준 | **총부담세액** |
|---|---|---|---|---|
| 현행 (areaSqm=300) | 150,000,000 | **0** | 0 | **0원** |
| 정정 (areaSqm=100) | 50,000,000 | 598,500,000 | 416,450,000 | **154,704,000원** |

검산: 598,500,000 = 900,000,000 − 300,000,000(환산취득가) − 1,500,000(§163⑥ 개산공제 = 50,000,000 × 3%).

**세액 영향** — **154,704,000원 과소(전액 소멸)**. 왜곡 배율 = 취득면적/양도면적. 세 반증자가 각각 5단 파이프라인(④ `callTransferTaxAPI` → ⑫ `propertySchema.parse` → ⑭ `buildTransferEngineInput` → 엔진)을 통과시켜 원 단위까지 동일 값을 얻었다. 독립 시나리오(양도시 단가 6,000,000/㎡)에서도 176,880,000 → 225,630,900(48,750,900원 과소)으로 재현되어 「양도차익 0 경계의 우연」이 아님이 확인됐다.

**처방** — `const areaSqm = resolveAcqAreaForStdPrice(primary) ?? 0;` (같은 파일 내 함수). 환지(`reduction`)는 헬퍼가 `acquisitionArea`를 그대로 반환하므로 이중 안분 없음. 757파일 7,807테스트 회귀 0건 실측.
⚠️ **이 한 줄로 덮이지 않는 형제 경로가 있다**: 일반 환산(비-pre1990) partial도 동일한 3배 부풀림을 낸다(실측 동일 154,704,000원). 다만 일반 환산은 사용자가 총액 칸(`StandardPriceInput.tsx:269`)에 양도분 기준 금액을 직접 타이핑해 우회할 수 있는 반면, **pre1990은 `transfer-tax-api.ts:399`가 `standardPriceAtAcquisition: hasPre1990 ? undefined`로 폼 값을 버리고 단가 칸도 `pricePerSqmDisabled`라 우회 경로가 0개**다. 그래서 pre1990을 우선 고치되, 일반 환산 축은 §7에 별건으로 남긴다.

**안전망** — **0건**. 정적으로도 증명된다: 제안 수정은 `areaScenario === "partial"`일 때만 동작이 달라지는데, `pre1990`을 언급하는 테스트·spec 30파일 중 `areaScenario` 또는 `transferArea`를 한 글자라도 포함한 파일이 **0건**이다. 뮤테이션 실행도 3회 독립(90파일 1,015건 / 750파일 7,712건 / 757파일 7,807건) 전부 반응 0.

### 2.2 A02 — 미등기 다필지 양도에서 장기보유특별공제가 그대로 적용되고 개산공제가 3%로 계산된다

**위치** `lib/tax-engine/transfer-tax-multi-parcel-branch.ts:70` · **유형** `wiring` · **검증** CONFIRMED 3/3
**조문** 「소득세법」 §95② verbatim(「"장기보유 특별공제액"이란 제94조제1항제1호에 따른 자산(**제104조제3항에 따른 미등기양도자산**과 같은 조 제7항 각 호에 따른 자산은 **제외한다**)으로서 …」) · 「소득세법 시행령」 §163⑥1호 verbatim(「토지　취득당시의 법 제99조제1항제1호 가목의 규정에 의한 개별공시지가×3／100(법 제104조제3항에 규정된 **미등기양도자산의 경우에는 3／1000**)」)

**결함** — `handleMultiParcelBranch`가 `parcels: parcelsWithOverride`로 필지를 넘기며 `effectiveInput.isUnregistered`를 실어주지 않는다. 서브엔진은 미등기를 **이미 정확히 구현했다**(`multi-parcel-transfer.ts:239` `if (isUnregistered) return 0;` · `:378` `parcel.isUnregistered ? 0.003 : 0.03` · `:433` 호출부). 그런데 `ParcelInput.isUnregistered`를 채우는 경로가 ①⑤⑫⑬ 어디에도 없다 — `parcelSchema`(`transfer-tax-schema-sub.ts:567~611`)에 필드가 없고 Zod `z.object`는 unknown key를 **strip**하므로 ④가 실어도 도달 불가, `buildParcelsPayload`(`transfer-tax-api-parcels.ts:75~128`)도 미생성, `ParcelListInput.tsx`에 「미등기」 문자열 0건.

**내부 모순이 2:2다**(원 finding은 「기본공제에만 반영」이라 적었으나 정정) — 같은 분기가 미등기를 이미 알고 있다: 세율 70%(`:104` `calcTax(mpTaxBase, parsedRates, effectiveInput, ...)` → `transfer-tax-rate-calc.ts:166`, 실측 `appliedRate: 0.7`) · 기본공제 0(`:93` `calcBasicDeduction(..., input.isUnregistered, ...)`). **장기보유특별공제와 개산공제에만 미반영**이다.

**실패 시나리오 A(장특공제)** — 토지 2필지 각 500㎡ · 2010-01-01 취득 각 2억 · 2024-05-01 10억 양도 · 폼-전역 미등기 ON.

| 케이스 | 양도차익 | 장특공제 | 기본공제 | 과세표준 | 세율 | **총세액** |
|---|---|---|---|---|---|---|
| 현행(다필지) | 600,000,000 | **168,000,000**(28%) | 0 | 432,000,000 | 0.7 | **332,640,000** |
| 필지에 플래그 주입 | 600,000,000 | **0** | 0 | 600,000,000 | 0.7 | **462,000,000** |
| 단건 대조군(동일 수치) | 600,000,000 | 0 | 0 | 600,000,000 | 0.7 | **462,000,000** |
| 다필지·등기(회귀 확인) | 600,000,000 | 168,000,000 | 2,500,000 | 429,500,000 | 0.4 | 160,446,000 |

**실패 시나리오 B(개산공제)** — 환산 1필지 1000㎡ · 취득단가 200,000원/㎡: 개산공제 **6,000,000(3%)** vs 주입 시 **600,000(3/1000)** → 필요경비 **5,400,000원 과대**. 필지 기본 `acquisitionMethod`가 `"estimated"`(`AssetSectionAcquisition.tsx:218`)이므로 **이 축이 다필지의 기본 경로**다.

**세액 영향** — **129,360,000원 과소** + 개산공제 축 5,400,000원 필요경비 과대. B=단건 대조군 일치가 「올바른 값」의 독립 확인이다.

**처방** — `:70`을 `parcels: parcelsWithOverride.map((p) => ({ ...p, isUnregistered: p.isUnregistered ?? effectiveInput.isUnregistered }))`.
⚠️ 원 제안(`isUnregistered: effectiveInput.isUnregistered`)은 **`??` 없이 쓰면 안 된다** — `TransferTaxInput.isUnregistered`가 required boolean(`types/transfer.types.ts:306`)이라 자산 플래그가 false일 때 필지별 true를 덮어써 leaf가 이미 지원하는 필지별 축(`ParcelInput.isUnregistered`, `:76`)을 조용히 죽인다.
⚠️ 함께: `multi-parcel-transfer.ts:376-378`이 `parcel.isUnregistered ? 0.003 : 0.03` **리터럴 삼항**이고 이 파일은 `estimatedDeductionRate()`를 import하지 않는다. `legal-codes/transfer-nbl.ts:218-232`가 그 함수를 「§163⑥ 개산공제율 선택 — 미등기양도자산(§104③) 여부 **단일 판정점**. 신규 개산공제 지점은 반드시 이 함수를 경유할 것. 리터럴 `0.03` 사용 금지」로 규정하고 2026-07-28에 15곳이 3% 고정이라 10배 오산출된 이력을 기록해 두었다. 토지에서는 값이 같아 세액 영향 0이지만 **수정 시 SSOT 경유로 맞출 것**.

**안전망** — **0건**. `parcels`를 다루는 테스트 17파일 중 자산-수준 `isUnregistered: true`와 조합한 것 0건, E2E도 0건. `__tests__/tax-engine/multi-parcel-transfer.test.ts:141-145`가 필지-수준 `isUnregistered: true`로 개산공제 117,894를 단언하지만 **서브엔진을 직접 호출**해 배선(⑬)을 안 태운다 — `feedback_leaf_anchor_skips_zod_layer`의 전형. `npm run test:transfer` 782파일 8,378건 반응 0건(2회).

### 2.3 A03 — ①상증법 평가액을 비우고 ②(§164④~⑦ 기준시가)만 채우면 §163⑨ payload 자체가 전송되지 않는다

**위치** `lib/calc/transfer-tax-api-inheritance.ts:82` · **유형** `wiring` · **검증** CONFIRMED 2 · PARTIALLY 1
**조문** 「소득세법 시행령」 §163⑨ 본문·1호·2호 verbatim(오프라인 국세청 아카이브 실독):
> 본문 — 「상속 또는 증여(…)받은 자산에 대하여 법 제97조제1항제1호가목을 적용할 때에는 상속개시일 또는 증여일 현재 「상속세 및 증여세법」 제60조부터 제66조까지의 규정에 따라 평가한 가액(…)을 취득당시의 실지거래가액으로 본다. 다만, 다음 각 호의 어느 하나에 해당하는 경우에는 각 호의 구분에 따라 계산한 금액으로 한다.」
> 1호 — 「… 평가한 가액과 **제164조제4항의 규정에 의한 가액중 많은 금액**」
> 2호 — 「… 평가한 가액과 **제164조제5항 내지 제7항의 규정에 의한 가액중 많은 금액**」

**결함** — post-deemed 분기의 `if (reportedRaw <= 0) return {};`가 ①이 비면 `inheritedAcquisition` payload를 **통째로 버린다**. ②의 엔진 주입은 전부 `resolveInheritedAcquisitionInput`(`inheritance-acquisition-helpers.ts:230-238`) 안에 있고 그 함수는 `runInheritedAcquisitionStep`(`:39` `if (!rawInput.inheritedAcquisition) return null;`)을 통과해야 실행되므로, `commercialInheritanceValuation` 같은 다른 payload가 정상 전송돼도 ②는 **비교조차 되지 않는다**. 엔진은 `reportedValue: 0`이어도 `max(0, ②) = ②`를 올바르게 채택한다(`inheritance-acquisition-price.ts:234-270`).

**⑧이 이 조합을 의도적으로 통과시킨다** — 우연이 아니라 설계된 통과다:
- `transfer-tax-validate-clause-a.ts:116-117` 「②도 가목이다 — §163⑨2호 「… 중 많은 금액」」 + `isSec164ClauseAFilled(asset)` → `return null`
- `transfer-tax-validate-commercial-asset.ts:53-63` 「①만 요구하면 **②를 다 채운 사용자가 막힌다(probe Y-5)**」 + `isFullyFilled(sec164CommercialStatus(asset))` → 통과

**실패 시나리오** — 상속 상가(오피스텔) · 상속개시일 2002-06-01 · 2023-02-16 양도 20억 · §164⑥ 8필드 완비 · ①(상속세 신고가액) 공란.

| | 취득가액 | 양도차익 | **총부담세액** |
|---|---|---|---|
| 현행 | `inheritedAcquisition = undefined` → **0** | 2,000,000,000 (양도가 전액) | **619,228,500원** |
| 정정(reportedValue:0 전송) | §164⑥ **300,000,000 ~ 360,000,000** | 1,640,000,000 ~ 1,699,834,163 | **494,488,500 ~ 515,278,500원** |

`validateStep(0)~(3)` 실측 **오류 0건**, 엔진 `warnings` **null**, 「상속 취득가액 의제」 step 자체가 결과에 없다. 그런데 해당 입력 카드(`CommercialInheritanceStdPriceSection.tsx:84-86`)는 화면에서 **「N개 항목을 모두 입력한 경우에만 비교합니다」라고 약속한다**.

**세액 영향** — 상가 **103,950,000 ~ 124,740,000원 과대**(입력 종속) · 주택 §164⑦ **53,311,500 ~ 68,992,000원 과대** · 토지 §164④는 **양방향**: `pre1990Enabled` OFF면 4,041,937 ~ 6,114,163원 과대, **ON이면 2,902,970 ~ 4,391,271원 과소**(③ 환산취득가가 ②보다 크면 가목 확정이 환산을 되돌려 세액이 오른다).
⇒ 원 finding의 「전부 과대」는 **토지 축에서 성립하지 않는다**. 상가·주택은 취득가액이 문자 그대로 0이 되므로 항상 과대다.

**처방** — 조기반환을 「① 미입력 **이고** ② 경로도 미완성」일 때로 좁힌다. `sec164-required-fields.ts`의 `isFullyFilled(sec164House/Commercial/LandStatus)` 단일 소스를 ⑧과 공유해 validate↔API를 같은 술어로 묶는다(그 모듈 헤더가 스스로 「빌더는 완성 여부로, validate는 부분 입력 여부로 같은 판정을 공유한다」는 불변식을 선언하는데 post-deemed 게이트만 그 밖에 있다). ②만 있는 경우 `reportedValue: 0 + reportedMethod`를 실어 보내면 엔진이 §164 분기에서 먼저 반환해 `legacyFallback` 면적곱에 닿지 않는다(⑫ post-deemed `reportedValue`는 `z.number().int().nonnegative()`라 0을 받는다).
⚠️ **범위 한정 — 상속 전용이다**. 같은 줄을 증여도 타지만(`reportedSource = isGift ? fixedAcquisitionPrice : publishedValueAtInheritance`) 증여는 ⑧이 step 0에서 「자산: 증여 신고가액을 입력하세요.」로 **차단**한다(실측). 게이트를 증여까지 넓히면 불필요한 회귀가 난다.
⚠️ **L-04 anchor의 JSDoc 계약을 함께 개정할 것**. `__tests__/calc/inherited-acquisition-reported-value-always.anchor.test.ts`는 「값이 없으면 payload를 **보내지 않는 것**이 정답이다 — 빈 payload를 보내면 `legacyFallback`이 돌아 assetKind가 세액을 597,000,000 가른다」를 명문으로 봉인하고 「⛔ R-14 재제안 금지」까지 달았다. 좁힌 게이트로는 테스트가 green을 유지하지만(fixture가 `right_to_move_in` + §164 필드 전무 → `isFullyFilled` 3종 모두 false) **그 계약 문구를 안 고치면 다음 리뷰가 되돌린다**.

**안전망** — 반응 **2건**이며 둘 다 **이 조합을 다루지 않는다**. `:82`의 `<= 0` → `< 0` 뮤테이션 전건 실행(6,729 suites / 18,763 tests) 결과 L-04(`inherited-acquisition-reported-value-always.anchor.test.ts`) + **N-03**(`__tests__/components/redev-163-9-priority-notice.anchor.test.tsx` — 원 finding 누락). N-03은 `RedevelopmentSec163_9PriorityNotice`가 `buildInheritedAcquisitionPayload`를 직접 호출해 **UI 안내 노출까지 함께 움직이므로** 수정 시 반드시 함께 볼 것. ⇒ 「② 완비 + ① 미입력」 부분집합의 안전망은 **0건**.

### 2.4 A04 — 취득원인을 상속에서 바꾸면 가업상속공제 카드가 사라지지만 `familyBusinessInheritance`는 어디서도 걸러지지 않는다

**위치** `lib/calc/transfer-tax-api.ts:646` · **유형** `wiring` · **검증** CONFIRMED 2 · PARTIALLY 1
**조문** 「소득세법」 §97의2④ verbatim(KoreanLaw mst 280405 실독): 「**「상속세 및 증여세법」 제18조의2제1항에 따른 공제**(이하 이 항에서 "가업상속공제"라 한다)**가 적용된 자산**의 양도차익을 계산할 때 양도가액에서 공제할 필요경비는 제97조제2항에 따른다. 다만, 취득가액은 다음 각 호의 금액을 합한 금액으로 한다. 1. 피상속인의 취득가액(제97조제1항제1호에 따른 금액) × … 가업상속공제적용률 2. 상속개시일 현재 해당 자산가액 × (1 − 가업상속공제적용률)」 — 적용 대상은 **가업상속공제가 적용된 상속 자산**이다.

**결함** — ⑤ UI만 `acquisitionCause === "inheritance"`로 카드를 게이팅한다(`CompanionAcquisitionCauseSection.tsx:303`). 취득원인 라디오 핸들러(`:77-85`)는 `hasSeperateLandAcquisitionDate`만 정리하고 `familyBusinessInheritance`는 손대지 않으며, `updateAsset`은 `{...a, ...patch}` 단순 shallow merge다(`CompanionAssetsSection.tsx:71-75`). ④(`:646`)는 `!== undefined`만 보고 무조건 spread, ⑧(`transfer-tax-validate-asset.ts:764-774`)은 4필드 완성만, ⑫(`transfer-tax-schema.ts:457`)·⑭(`engine-input.ts:383`)·엔진 STEP 0.42(`transfer-tax-family-business.ts:253-254`) 모두 취득원인 조건이 없다.

**형제 경로는 이미 게이트를 갖고 있다** — 같은 파일 `:715` `...(primary.acquisitionCause === "carryover_gift" && primary.carryover ? ... : {})` · `transfer-tax-api-inheritance.ts:40` `isSec163_9Cause(primary.acquisitionCause)`. 게다가 설계문서가 의도를 명시한다: `docs/02-design/features/transfer-fb-cgt-credit-integration/…ui.design.md:167` 「활성화 조건: `asset.acquisitionCause === "inheritance"` … **가업상속 자산은 반드시 상속 취득이어야 하므로**」. ⇒ 「의도된 설계」가 아니라 ⑤에만 있고 ④에 없는 **누락**이다.

**실패 시나리오** — 취득원인=상속 → 가업상속공제 토글 ON → 4필드 입력 → 취득원인을 **매매**로 변경(카드가 화면에서 사라져 끌 방법이 없다) → 취득가액 4억 입력 → 계산.

| | 엔진 도달 취득가액 | 양도차익 | 과세표준 | **총부담세액** |
|---|---|---|---|---|
| 현행 (stale FB 좌초) | **140,000,000**(의제) | 360,000,000 | 285,500,000 | **97,405,000원** |
| 올바른 값 | 400,000,000(실지) | 100,000,000 | 77,500,000 | **14,124,000원** |

**세액 영향** — **83,281,000원 과대**. 방향은 의제취득가와 실지취득가의 대소에 따라 **양방향**(반대 방향은 미실측).

**범위가 원 finding보다 넓다**:
- **매매 전용이 아니다** — `purchase` / `gift` / `newConstruction` 전부 `fbInBody: true` + `validateStep(0) = null` 실측(세 경우 모두 총부담 97,405,000).
- **취득원인을 안 바꿔도 터진다** — `assetKind`를 `general_building`으로 바꾸면 `CompanionAcquisitionCauseSection.tsx:58-66` 조기반환으로 FB 카드가 아예 렌더되지 않는데 취득원인은 여전히 inheritance라 ④ 게이트를 통과한다. **실측 71,242,600원 과대**(85,366,600 vs 14,124,000). ⇒ **제안된 ④ 게이트만으로는 절반만 막힌다**.
- **다건은 이미 안전** — `multi-transfer-tax-validate.ts:96`이 FB 존재만으로 전면 차단. 결함 범위는 **단건 마법사 한정**.
- **결과 화면은 침묵하지 않는다** — `TransferTaxResultView.tsx:609-610` · `ValuationDetailCards.tsx:122-123`이 `familyBusinessDetail`이 있으면 `FamilyBusinessImputedComparisonCard`를 렌더한다. 즉 취득원인이 매매인데 결과에 가업상속공제 비교 카드가 뜬다. **입력 단계는 침묵, 결과 단계에는 흔적**이다(원 finding의 「완전 침묵」 정정).

**처방** — ④에 형제 경로와 같은 게이트를 넣되 **⑤의 렌더 조건과 같은 술어**여야 한다(취득원인 + assetKind + 겸용 제외). `acquisitionCause === "inheritance"` 단독으로는 GB 경로가 남는다. 3중 방어: ④ 게이트 + ⑤ onChange stale 정리(`calc-wizard-asset-carryover.ts:118-123` `migrateCarryoverFields`가 「취득원인이 carryover_gift가 아니면 carryover를 통째로 초기화」하는 확립된 선례가 있다) + ⑧에 「취득원인이 상속이 아닌데 FB 입력이 남아 있음」 차단.
⚠️ **엔진 STEP 0.42에 게이트를 넣지 말 것** — `__tests__/tax-engine/_helpers/mock-rates.ts:170-192` `baseTransferInput`이 `acquisitionCause`를 설정하지 않고 `types/transfer.types.ts:427` 주석이 「미지정 시 매매로 간주」라, 엔진에 걸면 FB 엔진 테스트 5건이 전부 skip된다.

**안전망** — **0건**. `familyBusinessInheritance`를 다루는 테스트는 엔진 단위 3파일뿐(`family-business-cgt.test.ts` · `fb-lthd-95-4-latter.anchor.test.ts` · `redevelopment/fb-cgt-override-not-reverted.anchor.test.ts`)이고 ④/⑧/⑫/⑬/⑭ 계층 커버리지 0건. 제안된 게이트를 실제로 넣고 506파일 5,380건 / 6,837건 실행 → 반응 0건(2회 독립).

---

## 3. 🟠 High

### 3.1 A06 — PHD(§164⑦) 경로가 자산 단위 자본적지출·양도비를 전혀 읽지 않아 §97②2호 나목 비교가 성립하지 않는다

**위치** `lib/tax-engine/transfer-tax-split-gain.ts:715` · **유형** `wiring` · **검증** PARTIALLY 3/3 (전원 high)
**조문** 「소득세법」 §97①2호·3호 · 같은 조 ②2호 단서 verbatim(「다만, 제1항제1호나목에 따라 취득가액을 환산취득가액으로 하는 경우로서 **가목의 금액이 나목의 금액보다 적은 경우에는 나목의 금액을 필요경비로 할 수 있다**」 / 가목 = 환산취득가액 + 개산공제, 나목 = 「제1항제2호 및 제3호에 따른 금액의 합계액」) · 「소득세법」 §100② 후문 verbatim(「이 경우 **공통되는 취득가액과 양도비용**은 해당 자산의 가액에 비례하여 안분계산한다」 — 자본적지출 미열거)

**결함** — `calcSplitGainPreDisclosure`가 필요경비 소스로 `input.expenses`(deprecated legacy) 하나만 읽는다. `input.capitalExpenditure`·`input.transferExpense`는 이 함수에서 참조 0건. 게다가 ④가 환산 모드에서 `expenses: 0`을 강제하므로(`transfer-tax-api.ts:368-369`) PHD는 항상 환산이라 `:715`의 `totalExpenses`는 **실무상 항상 0**이다. `applyAssetSwap`의 swap 자격 인자도 `landDirectExpenses !== undefined`(`:730`)만 보는데, 비-PHD 경로는 2026-08에 `|| landTransferExpense > 0`(`:574`·`:582`)로 고치고 「⚠️ 양도비만 있어도 나목이 성립한다」(`:567-569`) 주석까지 남겼다. **PHD 분기만 그 수정에서 빠졌다.**

**축이 두 갈래다**(정정 — §1-④):
| 구성 | 자본적지출 | 양도비 |
|---|---|---|
| PHD + 취득일 **동일** | 🔴 조용히 소실 — **차단도 파트 칸도 없다** | 🔴 조용히 소실 |
| PHD + 취득일 **분리** | 🟡 ⑧이 파트 칸으로 유도(정상) | 🔴 조용히 소실 — ⑧이 `transfer-tax-validate-split.ts:439`에서 **「양도비는 자산 전체 칸을 그대로 쓰면 됩니다」라고 명시 보증**한 뒤 엔진이 버린다 |
| 비-PHD split | 🟡 ⑧이 차단(`:435-441`) | 🟢 `:531-537` 정상 안분 |

**실패 시나리오** — 주택 · 1994-05-10 취득(취득일 동일) · 최초공시 2005-04-30 · 2023-06-15 양도 16억 · 환산 · PHD 토글 자동 ON(`CompanionAcqPurchaseBlock.tsx:195-209`가 취득일 < 2005-04-29면 자동 래치) · 자본적지출 1억 + 양도비 2천만.

| | 양도차익 | swapL | **총세액** |
|---|---|---|---|
| 필요경비 없음 | 1,463,563,943 | false | 433,353,406 |
| **현행** (자산단위 1.2억 입력) | 1,463,563,943 | false | **433,353,406** (0원 변화) |
| 파트칸 등가 입력 | 1,434,314,464 | **true** | **423,218,461** |

**세액 영향** — 실측 **9,662,169 / 10,134,945원 과대**(취득일 동일) · **4,399,780 / 6,382,895원 과대**(취득일 분리, 양도비 축 단독). ⚠️ **§100② 후문이 명문으로 허용하는 「양도비 안분」만 고치면 이 시나리오의 세액은 0원 변한다** — 차액 전부가 자본적지출 귀속이다. 원 수치(18,941,473 / 22,240,467)는 세 반증자 모두 재현 실패(§1-④).

**양도비 축 단독 실증**(자본적지출 0, `transferExpense: 300,000,000`, 동일 조건): 비-PHD split 429,936,871 → **368,643,205**(swap 발동, `dirExpL=277,777,777`) vs PHD split 433,353,406 → **433,353,406 불변**. 같은 조문이 한 경로에서만 적용된다는 것이 양도비만으로 증명된다.

**처방** — 두 축을 분리해 고친다.
- **A06-1 양도비(§97①3호·§100② 후문)**: 비-PHD `:531-537`과 동형(양도가액 비례 floor + 건물 잔액 흡수) + swap 자격을 `|| landTransferExpense > 0`으로 확장. 법적 근거 명문.
- **A06-2 자본적지출(§97①2호)**: §100② 후문 미열거라 안분 근거가 없다. **입력 경로 신설이 선행**이고 차단만으로는 못 고친다(⏸ §6).
⚠️ 원 suggestedFix ③(`validateSplitDirectInputs`의 `:108` 게이트를 `usePreHousingDisclosure`까지 확대)은 **채택 불가** — 취득일 동일 PHD에서는 파트 칸이 렌더되지 않아(`CompanionAcqPurchaseBlock.tsx:221` `isSplit = isSplitable && !!hasSeperateLandAcquisitionDate`) 해소 불가능한 dead-end가 된다(§5).

**안전망** — **0건**. `preHousingDisclosure`를 쓰는 테스트 8파일 중 `capitalExpenditure`/`transferExpense`를 넘기는 것은 `review-2026-08-f18.test.ts` 1건뿐이고 그것은 **겸용주택 별도 엔진**(`calcMixedUseTransferTax`)만 호출한다. 뮤테이션 2회(501파일 5,277건 / 1,296파일 14,750건) 전부 반응 0.
> 🔑 **같은 결함 클래스가 겸용주택 PHD에서는 이미 고쳐졌다** — `review-2026-08-f18.test.ts` 헤더가 「PHD 분기가 swapToDirect를 읽지 않아 주택분 몫이 증발 → 과다과세」(200,372,813 → 162,866,000)를 anchor 5건(P7-1~P7-5)으로 동결했음을 기록한다. **비-겸용 PHD split 경로만 그 수정에서 빠졌다.** 다만 그 선례는 자본적지출도 안분하므로(P7-1·P7-2에서 9억을 588,432,521 / 311,567,479로 분할) A06-2의 정본과 충돌한다 — ⏸ 결정 필요.

### 3.2 A07 — 지분(fractional) 모드에서 ①은 지분 안분되는데 ②(§164④ 기준시가)는 100% 물건 값 그대로다

**위치** `lib/tax-engine/inheritance-acquisition-helpers.ts:237` · **유형** `arithmetic` · **검증** CONFIRMED 1 · PARTIALLY 1
**조문** 「소득세법 시행령」 §163⑨1호 verbatim(§2.3 참조) · 본문 「상속 또는 증여(…)받은 **자산**에 대하여 …」 — 취득한 자산이 1/2 지분이면 ②도 그 지분의 가액이어야 하고, 본문·단서·괄호 어디에도 「물건 전체 기준으로 비교하라」는 문언이 없다.

**결함** — ①은 ④ 변환에서 `applyRatio`로 지분 안분된다(`transfer-tax-api-inheritance.ts:61-66` pre-deemed · `:85-87` post-deemed). ②는 `buildPre1990LandPayload`가 `areaSqm = primary.acquisitionArea`(물건 전체 면적)로 만들고 엔진 `:237`이 **무스케일 그대로 주입**해, `inheritance-acquisition-price.ts:163`·`:248`의 `max`/비교가 「내 지분 몫의 ①」과 「물건 전체의 ②」를 견준다. `acquisitionPrice`는 지분 스케일된 `transferPrice`와 같은 축이어야 하므로 스케일이 어긋난다.

**같은 결함이 감정·매매사례에서는 이미 고쳐졌다** — `transfer-tax-api.ts:437-438` 주석 verbatim: 「총액과 동일하게 지분 스케일을 적용해야 한다(종전 raw → 지분 자산 취득가 과대 = 세액 과소)」. 저장소 지분 규약도 명시적이다 — `OwnershipRatioInput.tsx:128-135` 「모든 금액을 100% 기준으로 입력하세요 … 시스템이 지분율을 자동으로 적용합니다」. 면적이 100% 규약임은 `transfer-tax-api-helpers.ts:206` `mergePrimaryBasic`(지분 companion에 primary `acquisitionArea` 승계)과 `tax-utils.ts:97-102` `computeLumpSumDeductionBase`(소비 시점에 ratio 적용)로 확정된다.

**실패 시나리오** — 1987-05-01 상속 토지 184.2㎡의 1/2 지분을 2023-02-16에 920,000,000원(전체 기준)에 양도. 배너 안내대로 신고가액 100,000,000·면적 184.2를 100% 기준으로 입력.

| | ② §164④ | 채택 | 양도차익 | **총부담세액** |
|---|---|---|---|---|
| 현행 | **84,443,174**(물건 전체) | ② | 375,556,826 | **86,908,927원** |
| 정정 | 42,221,587(지분) | ① 50,000,000 | 410,000,000 | **96,987,000원** |

**세액 영향** — **10,078,073원 과소**(단건) / **11,138,923원 과소**(2지분 번들 `calculateTransferTaxAggregate`, 224,499,000 → 213,360,077). 지분율 감응도 실측: ratio 1.0 → 차이 0(비지분 회귀 없음) / 0.5 → 10,078,073 / **0.1 → 7,973,476이지만 현행 총부담이 184,124원으로 정답 8,157,600원의 2.3%**다. ⇒ **절대액은 중간 지분에서 최대, 상대오차는 저지분에서 폭증**(원 finding의 「지분율이 낮을수록 커진다(최대 1/지분율 배)」 정정).

**§164⑦ 주택도 같은 결함이다**(원 finding은 「미실측·개연 높음」으로 남겼으나 실측 확인): `EXCEL_13_INHERITED_HOUSE_PRE_DISCLOSURE` fixture에서 ratio 1과 0.5 모두 `sec164Amount = 153,336,855` 동일(무스케일 증명) → ratio 0.5에서 ① 100,000,000 < ② 153,336,855라 **②가 잘못 이긴다**. 상가 §164⑥(`commercialValuationStdPrice`, `:232-234`)는 `computeCommercial164_6StdPrice`가 ratio 인자를 안 받아 **코드 구조상 동일**하나 미실측.

**처방** — 주입 지점에서만 지분을 반영: `:237`을 `landValuationStdPrice: applyRatio(pre1990LandResult!.standardPriceAtAcquisition, currentInput.ownershipRatio ?? 1)`. `ownershipRatio`는 ⑫⑬⑭ 전부 배선돼 있다(`transfer-tax-api.ts:439` → `engine-input.ts:261`). `houseValuationStdPrice`(`:229-231`)도 같은 자리 같은 구조로 함께 고칠 것.
⚠️ **`pre1990Land.areaSqm`이나 `standardPriceAtAcquisition` 자체를 축소하면 안 된다**(§5).

**도달성 정정** — **단건 1/2 지분은 `blocked-by-validate`다**. `transfer-tax-validate-asset.ts:733-735` 「지분 모드 자산(1/2)은 단독으로 계산할 수 없습니다.」 실측 차단. 도달 형태는 **지분 분할 모드(자산 2건 이상, 지분 합 100%)** 또는 함께양도에 fractional primary를 섞은 경우다. 그 형태에서는 `collectStepIssues(0)`에 이 이슈가 없음을 실측 확인했다.

**안전망** — **0건**. `pre1990Land`를 쓰는 테스트·spec 9파일 중 `ownershipRatio`/`ownershipNumerator`를 함께 쓰는 파일 0건 — 제안 수정은 그 축에서만 동작이 달라지므로 **반응 가능한 테스트가 존재할 수 없다**. 뮤테이션 1,136파일 13,053건 반응 0.

### 3.3 A08 — §164⑨2호 공매·경락이 단건 경로에서만 발동하는데 ⑤UI·⑧validate에 경로 제한이 없다

**위치** `components/calc/transfer/AuctionBlock.tsx:30` · **유형** `reachability` · **검증** CONFIRMED 2 · PARTIALLY 1 (high 2 · medium 1)
**조문** 「소득세법 시행령」 §164⑨ 본문 verbatim(KoreanLaw MST 286211): 「다음 각 호의 어느 하나에 해당하는 가액이 법 제99조제1항제1호가목부터 라목까지의 규정에 따른 가액보다 낮은 경우에는 그 차액을 같은 호 가목부터 라목까지의 규정에 따른 가액에서 차감하여 양도 당시 기준시가를 계산한다.」 / 2호 verbatim: 「「국세징수법」에 의한 공매와 「민사집행법」에 의한 강제경매 또는 저당권실행을 위하여 경매되는 경우의 그 공매 또는 경락가액」

**결함** — 2호는 `resolveConversionDenominatorAtTransfer`(`transfer-tax-expropriation-valuation.ts:386`)를 통해서만 발동하고 **유일한 호출부가 `transfer-tax-helpers.ts:336`**(단건 `calcTransferGain` 안)이다. 그런데 ⑤ 노출 조건(`AuctionBlock.tsx:30-34` — `isAuctionEligibleAssetKind && useEstimatedAcquisition && transferDate >= "2009-02-04"`)과 ⑧ `validateAuctionAsset`(`transfer-tax-validate-expropriation.ts:94-111`)은 그 자산이 실제로 `calcTransferGain`에 도달하는지를 보지 않는다:
- **다필지** — `transfer-tax.ts:527-531` 조기반환으로 STEP 2를 통째로 건너뛴다. 게다가 `transfer-tax-api.ts:393`이 `parcelModeActive`면 `useEstimatedAcquisition: false`를 강제 송신해 **엔진 게이트가 애초에 닫힌다**(이중 무시 — 원 finding 누락).
- **split** — `calcSplitGain` 조기반환(`transfer-tax-helpers.ts:287-288`)으로 별도 경로로 빠진다.

**1호는 같은 층위에서 이미 막혀 있다** — `ExpropriationBlock.tsx:51` `!asset.parcelMode` · `:70` `!isSplitBuilding` · `transfer-tax-validate-expropriation.ts:55`·`:126`·`:160` `if (asset.parcelMode) return null;`. **2호에만 대응 가드가 없다.**

**실패 시나리오** — 토지 + 환산 + 「여러 필지를 각각 다른 시기에 취득」 ON(필지 1개) + 일반 양도 + 2020-06-01 → 「공매·경락으로 양도했나요?」 토글이 뜨고, 켜면 ⑧이 「자산: 공매·경락 특례 — 공매·경락가액을 입력하세요.」로 **계산을 차단한다**. 3억을 입력하면 통과하지만 결과가 1원도 변하지 않는다.

| | auction OFF | auction ON | 차 |
|---|---|---|---|
| 다필지 | 184,681,200 | **184,681,200** | **0원** |
| 건물 split | 182,067,600 ~ 198,063,360 | 동일 | **0원** |
| 주택 split (원 finding 누락) | 195,291,360 | 동일 | **0원** |
| 단건 대조군 | 184,681,200 | **89,217,772** | 95,463,428 |

`auctionValuationDetail`이 전 케이스 `undefined`. 값은 ④(`transfer-tax-api-helpers.ts:640-645`·`:465-468`) → ⑫(`transfer-tax-schema.ts:122-123`) → ⑭(`engine-input.ts:57`)를 **정상 통과해 엔진 input까지 도달한 뒤 거기서 소비만 안 된다**.

**세액 영향** — **0원**(무시). 무시되는 특례 가치는 단건 동일조건에서 **95,463,428원**. 즉 「차단됐다」가 아니라 **「필수로 요구해 놓고 무시한다」**.

**처방** — 층을 맞춘다. `AuctionBlock.tsx:30`의 `show`에 `!asset.parcelMode && !asset.hasSeperateLandAcquisitionDate` 추가 + `validateAuctionAsset`에 동일 가드(1호가 이미 쓰는 패턴), 미지원 사유는 카드 안내문으로 명시.
⚠️ **술어를 1호에서 복사하면 안 된다** — 원 suggestedFix가 쓴 `isSplitLandExprEligibleAssetKind`는 `SPLIT_LAND_EXPR_TRACK_ASSET_KINDS = ["building"]`뿐인데, `calcSplitGain`은 `housing`도 태우고(`transfer-tax-split-gain.ts:398`) `AUCTION_TRACK_ASSET_KINDS`에는 `housing`이 있다. **주택 split이 그대로 남는다**(실측). 정본 술어는 `asset.hasSeperateLandAcquisitionDate` 단독이다.
⚠️ 엔진 배선(2안)은 2호가 **총액 2후보**라 필지·파트 분해 규칙에 법적 근거가 따로 필요하다 ⇒ 노출 차단이 안전.
⚠️ **겸용주택(`housing` + `isMixedUseHouse`)이 4번째 우회 경로일 가능성** — `AuctionBlock`의 show에 `isMixedUseHouse` 제외가 없고 `MixedUseAssetMajorStdPrice.tsx:212`가 `useEstimatedAcquisition: true`를 세우는데, `lib/tax-engine/`의 mixed-use 9파일에 auction 참조 0건이다. **엔진 실측 미수행 — 미확인.**

**안전망** — **0건**. `expropriation-auction-clause2.anchor.test.ts` 9건이 전부 단건/컴패니언 aggregate이고 `parcels`·`landAcquisitionDate`와 조합한 케이스 0건(전수 grep). 제안 가드를 실제로 넣고 3회 실행(209파일 2,091건 / 757파일 7,807건 / 463파일 4,368건) 반응 0.

### 3.4 A09 — `hasPre1990` 게이트에 「취득일 < 1990-08-30」 요건이 없다

**위치** `lib/calc/transfer-tax-api.ts:141` · **유형** `legal-accuracy` · **검증** CONFIRMED 1 · PARTIALLY 2 (high 2 · medium 1)
**조문** 「소득세법 시행령」 §164④ verbatim(§2.1) — 기간 요건이 조문 **본문 첫 구절에 명시**돼 있다. 「소득세법」 §97①1호 가목(실지거래가액) · 「소득세법 시행령」 §176의2① verbatim(추계 허용 요건 — 「1. 양도 또는 취득당시의 실지거래가액의 확인을 위하여 필요한 장부·매매계약서·영수증 기타 증빙서류가 없거나 그 중요한 부분이 미비된 경우 2. …거짓임이 명백한 경우」)에도 해당하지 않는다.

**결함** — ④/⑬ 게이트가 `pre1990Enabled` · `assetKind === "land"` · gift/1985 세 조건뿐이고 **1990-08-30 기간 요건이 없다**. `pre1990Enabled`는 같은 파일 주석이 스스로 「환산 클릭 시 set되는 uncleaable 래치」라 부르는 플래그이고, 등급·공시지가 값도 취득일을 고쳐도 지워지지 않는다(전 write site grep — 초기화 지점 0건). 게이트가 서면 `acquisitionPrice`(`:350-351`)와 `expenses`(`:369-370`)가 **0으로 송신**되고 엔진 STEP 0.4(`transfer-tax.ts:85-98`)가 환산 모드를 무조건 강제한다.

**같은 축의 다른 판정자는 모두 기간 게이트를 갖고 있다** — `sec164-required-fields.ts:168-169` · `inheritance-acquisition-helpers.ts:193-196` · `PostDeemedInputs.tsx:69-70` · `CompanionAcqPurchaseBlock.tsx:166-172`. **④만 빠졌다.** 다건은 더 약하다 — `multi-transfer-tax-api.ts:33`은 gift/1985 가드조차 없는데 `:30` 주석은 「단건과 동일 게이트·공용 헬퍼」라고 적어 실제와 어긋난다(다건은 `acquisitionPrice`를 0으로 만들지 않지만 `pre1990Land` payload를 실어 보내 엔진 STEP 0.4가 결국 0으로 덮는다 — **결과적 왜곡은 단건과 동일**).

**실패 시나리오** — 토지 취득일을 1988-05-01로 넣고 환산 선택(래치 자동 ON) → 등급 3종 + 1990 공시지가 입력 → 취득일을 실제 값 2005-06-01로 정정하고 실거래가 6억으로 전환. `showPre1990`이 false가 되어 **해제 토글이 화면에서 사라지고**(`Pre1990LandValuationInput.tsx:179-180`이 `showPre1990` 안에만 있다) 폼 값은 남는다.

| 실측 사례 | 현행 | 올바른 값 | 차 |
|---|---|---|---|
| 등급 218/218/218 · 1990가 500,000/㎡ | 153,780,000 | 64,801,000 | **88,979,000 과대** |
| 등급 100/95/60 · 1990가 300,000/㎡ · 300㎡ | 240,071,271 | 61,875,000 | **178,196,271 과대** |
| 등급 120/118/110 · 1990가 1,000,000/㎡ · 300㎡ | 126,210,855 | 64,801,000 | **61,409,855 과대** |

⇒ **수치는 등급 입력에 종속**된다. 단정형으로 「88,979,000원」이라 적으면 안 된다. 방향도 등급환산액과 실거래 취득가액의 대소에 따라 **양방향**.

**완화 요소(원 finding 누락)** — 서브엔진이 경고를 낸다: `pre-1990-land-valuation.ts:254-259` 「취득일이 1990.8.30. 이후입니다. 개별공시지가가 존재하므로 본 환산 대신 직접 사용을 권고합니다.」 → `Pre1990LandValuationDetailCard.tsx:45-49`가 `text-destructive` 목록으로 렌더한다. **차단이 아니라 안내이며 총부담 숫자는 그대로 틀린다.**

**더 넓고 더 조용한 형제 경로(원 finding 누락)** — 취득일이 진짜 1990.8.30. 이전인 채로 「환산 → 실거래가」만 바꾸면 **동일한 과대과세가 나고 경고가 없다**(실측: 취득일 2005-06-01과 1988-05-01이 총부담 126,210,855로 **바이트 동일** — 서브엔진 헤더가 스스로 「날짜를 바꿔도 산출값이 동일」이라 적어 두었다). ⇒ 실제로 빠진 지배적 조건은 날짜가 아니라 **모드(`useEstimatedAcquisition`)** 이고, 그 전제는 `multi-transfer-tax-api.ts:30-31` 주석이 「pre1990은 useEstimatedAcquisition=true를 선행 조건으로 하므로」라고 **명시 선언**해 두었는데 단건 `:141`이 강제하지 않는다.

**처방** — 게이트 정의 자체에 **기간 + 모드** 두 요건을 추가한다. 3중 패턴이므로 ⑧(`transfer-tax-validate-asset.ts:369-372` · `transfer-tax-validate-sec164.ts:49-51`)과 다건(`multi-transfer-tax-api.ts:33`, gift/1985 가드도 함께)에 동시 반영.
⚠️ **날짜 파생을 raw `acquisitionDate`로 하지 말 것** — `deriveSec163_9BaseDate`(`transfer-163-9-base-date.ts:44-48`)·`commercialAcquisitionDate`(`transfer-pre1990-commercial-bridge.ts:41-45`)·엔진(`inheritance-acquisition-helpers.ts:193-196`)이 전부 상속에서 `inheritanceStartDate || acquisitionDate`를 쓴다. raw만 보면 `inheritanceStartDate`가 1988인 상속 토지를 과차단한다. 상수는 `transfer-pre1990-commercial-bridge.ts:32`의 `LAND_PRICE_NOTICE_START` 재사용.

**안전망** — **0건**. `pre1990Enabled: true`를 쓰는 테스트는 전부 취득일이 1990-08-30 **이전**이라 기간 조건을 넣어도 뒤집힐 단언이 없다. 뮤테이션 3회(336파일 3,334건 / 274파일 2,756건 / 1,213파일 13,882건) 반응 0.

### 3.5 A10 — 필지 카드의 나열 순서가 세율 기산일을 바꾼다

**위치** `lib/calc/transfer-tax-api.ts:179-180` · **유형** `legal-accuracy` · **검증** CONFIRMED 1 · PARTIALLY 1
**조문** 「소득세법」 §104② verbatim(KoreanLaw MST 280405): 「제1항제2호ㆍ제3호 및 제11호가목의 보유기간은 **해당 자산의 취득일부터 양도일까지**로 한다.」 — 단서 3개 호(상속·§97의2①·합병분할) 중 어디에도 「다른 필지의 취득일을 그 필지의 취득일로 본다」는 것이 없다. 「소득세법」 §104⑤ 후단 verbatim: 「**한 필지의 토지**가 제104조의3에 따른 비사업용 토지와 그 외의 토지로 구분되는 경우에는 **각각을 별개의 자산으로 보아** 양도소득 산출세액을 계산한다.」

**결함** — 다필지 분기는 필지별로 양도차익·장특을 독립 계산한 뒤(`multi-parcel-transfer.ts:431` 필지별 `calculateHoldingPeriod`) 산출세액 단계에서는 합산 과세표준에 **자산-수준 세율 하나**를 적용한다(`transfer-tax-multi-parcel-branch.ts:98`). `calcTax`는 `transfer-tax-rate-calc.ts:345-347`에서 `resolveRateBasisAcquisitionDate(input)`으로 기산일을 정하는데, 다필지 모드의 `input.acquisitionDate`를 `transfer-tax-api.ts:179-180`이 **`primary.parcels[0]?.acquisitionDate`(첫 번째 필지 카드)로 고정**해 보낸다. 자산-수준 취득일은 무시된다 — 그런데 ⑧(`transfer-tax-validate-asset.ts:363`)은 그 칸을 **필수로 요구한다**(⑤ `CompanionAcqDateSection.tsx:119-124`는 `parcelMode`와 무관하게 렌더). 즉 **채우도록 강제해 놓고 버린다**.

**실패 시나리오** — 토지 2필지 각 500㎡ · 각 2억 · 2024-05-01 10억 양도 · A 2010-01-01 / B 2023-06-01. 두 순서에서 `taxBase` 513,500,000 · `longTermHoldingDeduction` 84,000,000이 **완전히 동일**하고 세율만 갈린다.

| 카드 순서 | body.acquisitionDate | 세율 | 산출세액 | **총세액** |
|---|---|---|---|---|
| [A, B] | 2010-01-01 | 0.42 누진 | 179,730,000 | **197,703,000** |
| [B, A] | 2023-06-01 | 0.50 단일 | 256,750,000 | **282,425,000** |

**세액 영향** — **84,722,000원 스윙, 양방향**. 축이 하나가 아니다(원 finding 누락):

| 경계 | 스윙 |
|---|---|
| §104①3호 1년 미만 (2010 vs 2023-06) | **84,722,000** |
| §104①2호 1~2년 (2010 vs 2022-10) | **28,237,000** |
| §104①8호 비사토 위기취득 배제창구(2009.3.16~2012.12.31, 둘 다 장기) | **51,205,000** |
| 둘 다 2년 초과·위기창구 무관 | **0**(결함 범위 상한) |

세 번째는 `transfer-tax-rate-calc.ts:353` `isCrisisAcqExempt(input.landAcquisitionDate ?? input.acquisitionDate)` 경로이고 `landAcquisitionDate`는 다필지에서 ④가 아예 보내지 않아 `firstParcelAcqDate`가 그대로 쓰인다 — **둘 다 장기보유여도** 카드 순서로 +10%p가 붙었다 떨어진다.

**환지 첫 필지는 순서와 무관하게 붕괴한다**(A15와 동일 지점 — §4.2): 필지 폼의 `acquisitionDate`는 환지 토글이 켜지면 `""`로 남는데 `:180`이 `|| form.transferDate`로 후퇴 → 기산일 = **양도일** → 보유 0개월 → 50% 단일세율. 실측 236,225,000 vs 160,446,000 = **75,779,000원 과세 초과**(방향 고정).

**처방** — 세율 기산일이 필지 배열 첨자에 의존하지 않도록 확정한다. 최소 조치는 ① 실효 취득일 규약을 엔진(`multi-parcel-transfer.ts:217-231`)·페이로드(`transfer-tax-api-parcels.ts:77-80`)와 맞추고(`p.useDayAfterReplotting && p.replottingConfirmDate ? p.replottingConfirmDate : p.acquisitionDate`) ② `|| form.transferDate` fallback을 제거해 확정 불가 시 ⑧에서 차단하는 것이다. **③ 순서 무관 규칙 자체는 ⏸ 결정 필요**(§6).
⚠️ **「필지를 세율군으로 갈라 `groupTaxes`로 합산」 방향은 금지 목록 인접**(§5).

**안전망** — **0건**. `firstParcelAcqDate`를 단언하는 테스트 0건. 취득일이 서로 다른 필지로 세액을 단언하는 유일한 테스트 `__tests__/tax-engine/exchange-land-integration.test.ts:150·160`(1996-02-18 / 2007-04-27, 양도 2023-02-15)은 **둘 다 2년 초과라 어느 쪽이 대표여도 누진세율**이라 원리적으로 관측 불가. `parcels[0]` → `parcels[last]` 뮤테이션(84,722,000원이 움직이는 변경)으로 782파일 8,378건 / 206파일 2,073건 실행 반응 0.

### 3.6 A11 — §164⑦ 산식 괄호 단서(§164⑧ 준용)가 미구현이라 비율 1로 `P_A_est = P_F`를 산출한다

**위치** `lib/tax-engine/transfer-tax-pre-housing-disclosure.ts:108` · **유형** `legal-accuracy` · **검증** CONFIRMED 1 · PARTIALLY 2 (전원 high)
**조문** — 괄호 단서는 **조문 본문 텍스트에 없고 산식 이미지 안에 있다**. 법제처 `lsInfoR.do?lsiSeq=286211&efYd=20260701`의 `<img alt="@@LATEX@@…">`를 디코드해 verbatim 확인:
> 「국토교통부장관이 당해 주택에 대하여 최초로 공시한 주택가격 × 취득당시의 …합계액 / …최초로 공시한 주택가격공시당시의 …합계액**(취득당시의 가액과 최초로 공시한 주택가격 공시당시의 가액이 동일한 경우에는 제8항의 규정을 준용한다)**」

§164⑥ 산식(`alt="img22048508"`)도 같은 구조의 괄호를 갖는다. 「소득세법 시행규칙」 §80①1호 가목·§80②1호·2호·§80⑤·§80③3호(라목 **주택**을 명시 열거)가 준용 체인이다.
> ⚠️ **`get_law_text`류 조문 API와 NTS 아카이브는 산식을 떨어뜨린다** — 그 경로로는 재현되지 않는다(실제로 한 반증자가 NTS 아카이브에서 0건을 얻었다). 후속 검증자는 반드시 법제처 HTML의 img alt를 볼 것.

**결함** — 엔진이 이 단서를 보지 않고 `sumAtFirstDisclosure > 0`만 확인한 뒤 `floor(P_F × Sum_A / Sum_F)`를 그대로 계산한다. `Sum_A === Sum_F`이면 비율이 1이 되어 `P_A_est = P_F`가 되고 **결과 객체에 경고·§164⑧ 신호 필드가 0개**다(28개 키 전수 확인).

**형제 §164⑥은 이미 구현·차단되어 있다** — `lib/calc/commercial-164-6-proviso.ts:54-60` `isSec164_8ProvisoApplicable()` · `transfer-tax-validate-commercial-asset.ts:163-166`(전기 기준시가합 미입력 시 차단, 주석이 「그대로 두면 비율 1로 법령과 다른 값이 나온다」 명시) · 엔진 `commercial-building-valuation.ts:281-295` `calcSec164_8AdjustedDenominator()`로 분모 교체. **§164⑦만 그 규칙 밖에 있다.** 계획서(`commercial-164-6-same-value-164-8-proviso.plan.md`, 199줄)에도 §164⑦를 범위 밖으로 선언한 문장이 없고, 저장소 전체에서 `164⑦` × `제8항` 교집합 grep **0건** ⇒ **의도적 유보가 아니라 미인지**다.

**실패 시나리오** — 토지 200㎡ · 취득/최초공시 공시지가 둘 다 1,000,000원/㎡ · 취득/최초공시 건물기준시가 둘 다 100,000,000 (⇒ Sum_A = Sum_F = 300,000,000) · P_F 3억 · P_T 9억 · 양도가 15억 · 양도 2023-06-30 · 취득 2005-02-01.

| | P_A_est | 환산취득가 | 양도차익 | **총부담세액** |
|---|---|---|---|---|
| 현행 (비율 1) | **300,000,000** (= P_F) | 500,000,000 | 991,000,000 | **279,800,400원** |
| §164⑧ 준용 (분모 320,000,000) | 281,250,000 | 468,750,000 | 1,022,812,500 | **290,088,562원** |

**세액 영향** — **10,288,162원 과소**. 방향은 A(취득시 합계)와 B(전기 합계)의 대소에 종속(A>B 상승기면 과소, A<B 하락기면 과대). ⚠️ 「취득가액 31,250,000원 과대」는 **100분의 100 한도가 걸린 상한값**이다 — C(취득~최초공시 월수)가 1~4개월인 전형 트리거에서는 1,657,458 ~ 8,196,722원 수준이다(C=1 → 298,342,542 / C=3 → 295,081,967 / C=6 → 290,322,580 / C≥12 → 281,250,000).

**트리거는 우연이 아니다** — 「소득세법 시행령」 §164③ verbatim 「새로운 기준시가가 고시되기 전에 취득 또는 양도하는 경우에는 **직전의 기준시가**에 의한다」. 취득일이 최초공시일 직전 고시주기 안이면 두 시점이 같은 고시분으로 귀착해 합계가 **필연적으로 일치한다**. 저장소 fixture 주석도 이 규칙을 쓴다(`pre-housing-disclosure-fixture.ts:28`). 다만 **실제 발생 빈도는 미측정**.

**범위가 1파일이 아니라 3곳이다**(원 finding 누락):
- `lib/tax-engine/transfer-tax-pre-housing-disclosure.ts:108-110`
- `lib/tax-engine/transfer-reductions/phd-helper.ts:104-108` — 감면 8개 조문(§99·§99의3·§98의3·§98의5~8·§99의2)의 취득시 기준시가. (단 이 파일은 스스로를 §164⑤라 인용한다 — 별건 인용 드리프트)
- `lib/tax-engine/inheritance-house-valuation.ts:229-231` — 주석이 스스로 「§164⑦(⑤ 준용) 정식 공식」이라 자칭. `housePriceAtInheritanceOverride`(`:211`) 직접입력 우회구가 있어 transfer PHD보다는 낫다.

**처방** — ⚠️ **1차 조치는 「탐지 + ⑧ 차단」이지 산정이 아니다.** 주택 축에는 B(전기 기준시가합)·D(조정월수)를 받을 폼 필드가 아예 없다(§164⑥의 `cbPrevStdPriceSum`·`cbStdPriceAdjustMonths`에 대응하는 PHD 필드 grep 0건). 실측: `calcSec164_8AdjustedDenominator(A, undefined, 24, 12) = null`. 산정하려면 ①②③⑤⑧⑫ 신규 입력 배선이 선행돼야 한다(⏸ §6). 그리고 판정에는 §80①1호/2호 연도 축이 필요하므로 `same-adjustment-period-std-price.ts`의 `clause_1`/`clause_2` leaf를 함께 가져올 것(§1-⑤).

**안전망** — **0건**. `pre-housing-disclosure.test.ts` 전건 grep에서 `Sum_A === Sum_F` 케이스·「제8항」·「164⑧」 문자열 모두 0건. 등가합 케이스만 `P_A_est = 1`로 파괴하는 뮤테이션을 메모리 내 주입(디스크 무변경)해 1,459파일 16,428건 실행 → **반응 0건**. 양성대조(무조건 분모×1.2)는 같은 파일에서 22건 실패 ⇒ 주입이 실제로 작동함을 확인.

### 3.7 A12 — 컴패니언 토지의 다필지(parcelMode) 입력이 ④ 변환에서 통째로 사라진다

**위치** `lib/calc/transfer-tax-api.ts:177` · **유형** `wiring` · **검증** PARTIALLY 3/3 (high 유지)
**조문** 「소득세법 시행령」 §164⑨1호(필지별 수용 보상 2필드) · 「소득세법 시행령」 **§162①9호**(환지 취득시기 — **§162①6호 아님**, §1-②) — 침묵 소실되는 입력의 예시

**결함** — ④는 `parcelModeActive`를 `primary.parcelMode && primary.assetKind === "land"`로만 판정하고 필지 payload도 primary에서만 조립한다(`:619-621`). 컴패니언 빌더 `buildAssetPayload`는 `parcels`를 한 번도 싣지 않고(`transfer-tax-api-helpers.ts` 전 구간 참조 0건) ⑫ `companionAssetSchema`(`transfer-tax-schema-sub.ts:373`)에도 `parcels` 칸이 없다(`parcels` 정의는 `transfer-tax-schema.ts:214` 단건 스키마 1곳뿐 · `.passthrough()` 없음 → 기본 strip). ⑭ `bundled-split-helpers.ts:353-366`도 명시 열거라 없다.

**그런데 ⑤UI와 ⑧validate는 컴패니언에서 동작한다** — `AssetSectionAcquisition.tsx:210` 다필지 토글 게이트가 `{asset.assetKind === "land" && (`뿐이고 **자산 인덱스를 보지 않는다**(같은 파일 `:128` 지분분할 토글이 `{isFirst && (`, `:190` PHD가 `isNonPrimaryAsset={!isFirst}`로 막힌 것과 대조). ⑧은 `transfer-tax-validate.ts:229-236`이 `form.assets` **전체**를 루프해 `validateParcelMode`를 돌린다. `transfer-tax-validate-asset.ts:62` 주석 「다필지 자산 검증 — **primary 자산이** 다필지 모드일 때」가 코드의 실제 적용 범위와 어긋난다.

**실측 ⑧ 차단 문구**(전부 `assetIndex: 1` = 컴패니언):
```
필지 1: 취득일을 선택하세요.
필지를 최소 1개 추가하세요.
필지 2: 양도면적을 입력하세요.
필지 1: 공익수용 환산 특례 — 보상가액(원/㎡)을 입력하세요.
```
`companionAssets[0]`의 parcel 관련 키 **0건**, `propertySchema.safeParse` **success**, route **HTTP 200** — 400도 경고도 없는 완전한 침묵 소실이다. ⇒ **입력받고, 검증하고, 버린다.**

**세액 영향** — **양방향, 파라미터 종속**. 원 「14,713,600원 과소」는 **해당 자산을 단건으로 홀로 계산한 값**이지 일괄양도 총액이 아니다(검산: 216,000,000−2,500,000 → 61,190,000 ×1.1 = 67,309,000). 위치 스왑 대조(같은 다필지 자산을 컴패니언 ↔ primary 자리에 두고 route POST 2회; 평범한 두 자산 스왑은 총액이 완전히 동일함을 대조군으로 확인) 실측:

| 시나리오 | 현행(컴패니언) | 정정(primary 배선) | 차 |
|---|---|---|---|
| 리뷰어 fixture 격리 | 79,849,000 | 82,022,600 | 2,173,600 과소 |
| end-to-end 일괄양도 A | 137,566,000 | 153,054,000 | 15,488,000 과소 |
| end-to-end 일괄양도 B | 150,766,000 | 153,054,000 | 2,288,000 과소 |
| 필지 취득시기 격차 확대(2005 vs 2022, 양도 10억) | 300,267,000 | 312,741,000 | **12,474,000 과소** |
| 자산-수준 취득일을 늦은 필지로 | 166,606,000 | 153,054,000 | **13,552,000 과대** |

⇒ **부호조차 사용자가 자산-수준 「취득일」 칸에 무엇을 넣었느냐에 종속된다**(그 칸은 parcelMode ON에서도 숨겨지지 않고 `transfer-tax-validate-asset.ts:363`이 여전히 필수로 요구한다). 침묵성·심각도는 오히려 이쪽이 더 나쁘다.

**처방** — 둘 중 하나로 **확정**한다(⏸ §6):
- **(A) 정식 지원** — ⑫ `companionAssetSchema`에 `parcels: z.array(parcelSchema).max(10).optional()` + ⑬ `buildAssetPayload`에서 `buildParcelsPayload` 호출 + ⑭ `buildCompanionEngineInputs`에서 필지 `acquisitionDate`를 `toDate` 변환(`engine-input.ts:322`가 단건에서 하는 것과 동일). 아키텍처상 가능하다 — `TransferTaxItemInput`(`types/transfer-aggregate.types.ts:43`)이 `Omit<TransferTaxInput, …>`이라 `parcels`를 이미 포함하고 `transfer-tax-aggregate.ts:170-190`이 자산별 `calculateTransferTax`를 불러 `handleMultiParcelBranch`를 그대로 탄다.
- **(B) 미지원 확정** — `AssetSectionAcquisition.tsx:210` 토글을 `isFirst` 한정으로 좁히고(바로 위 토글과 동일 패턴) `validateAssetEntry`에서 컴패니언 다필지를 명시 차단.
⚠️ **(B) 단독은 위험** — 이미 `parcelMode: true`가 저장된 stale 세션 폼은 토글이 사라진 채 `validateParcelMode`만 계속 돌아 「화면에 없는 칸을 입력하라」가 된다. ⑧ 명시 차단은 **필수 동반**이다(`feedback_new_asset_field_stale_sessionstorage_guard`).
⚠️ **(A)를 택하면 컴패니언에도 `firstParcelAcqDate` 대입(A10)을 적용할지 명시 결정할 것** — 안 맞추면 같은 입력이 primary/companion 위치에 따라 다른 세액을 낸다.
⚠️ **지금 상태(입력 가능·검증 필수·페이로드 누락)만은 유지 불가.** 어느 쪽이든 `validate-asset.ts:62` 주석을 코드와 일치시킬 것.

**범위 한정** — 다건(여러 「건」) 계산기는 `multi-transfer-tax-validate.ts:93`이 parcelMode를 차단하고 같은 함수가 「자산 2건 이상」 폼을 배제하므로 **일괄양도(bundled companion) 경로 전용**이다.

**안전망** — **0건**. `companionAssets`를 언급하는 테스트 20파일 ∩ `parcels`/`parcelMode` 언급 = 0건, `buildParcelsPayload` 테스트 등장 0건, `parcelMode` 사용처 전부 `assets[0]`/단일 자산. ⑤ 토글을 `isFirst` 한정으로 뮤테이트 후 633파일 5,861건 반응 0.

---

## 4. 🟡 Medium

### 4.1 A13 — 감면용 PHD wrapper가 최초공시 건물 기준시가 미입력 시 「취득시와 동일」이라는 비법정 시점 치환을 한다

**위치** `lib/tax-engine/transfer-reductions/phd-helper.ts:98` · **유형** `legal-accuracy` · **검증** PARTIALLY 1
**조문** 「소득세법 시행령」 §164⑦ 산식(§3.6) — 「최초공시 당시」 나목 가액 자리에 「취득당시」 값을 대입하는 것은 산식이 아니다. **§164⑦ 후단(§164⑤ 준용)의 발동요건은 「나목의 가액이 **없는 경우**」(= 국세청장 고시 부존재)이지 「사용자 미입력」이 아니다** — 미입력의 올바른 처리는 **⑧ 차단**이다(§1-③).

**결함** — `calcReductionAcquisitionStdPrice`는 §164⑦ 본체와 같은 산식을 쓰는 두 번째 구현인데, 최초공시 시점 건물 기준시가가 비면 취득시 값을 그대로 대입한다(코드 주석 verbatim 「건물 fallback: 최초공시 미입력 시 취득시와 동일 가정 (간이)」). 입력 완결 판정 `canCalcReductionPhd`(`:157-163`)가 이 필드를 요구하지 않아 fallback은 정상 UI 경로로 발동한다 — ⑧(`transfer-tax-validate-reductions.ts:195-205` 외 6곳)·④(`transfer-tax-api-reductions.ts:162-164` 외 7곳)가 전부 같은 술어를 쓴다. ⑤ `ReductionPhdInput.tsx:253`은 라벨이 「최초공시시 건물 기준시가 (원, **선택**)」이고 `:286` 힌트가 「미입력 시 취득시와 동일 가정」이라 **UI가 사용자에게 광고하는 의도된 동작**이다.

**실패 시나리오** — §99의3 신축주택 감면 자산 · PHD 환산 · P_F 540,000,000 · 16.36㎡ · 취득 공시지가 1,640,000 · 최초공시 1,810,000 · 취득시 건물 120,000,000.

| 최초공시 건물 | Sum_F | P_A_est | fallback 대비 |
|---|---|---|---|
| 110,000,000 (하락) | 139,611,600 | **567,921,404** | fallback이 37,959,717 과소 |
| **미입력 → fallback** | 149,611,600 | **529,961,687** | — |
| 130,000,000 (상승) | 159,611,600 | **496,758,481** | fallback이 33,203,206 과대 |

**세액 영향** — 최종 세액은 **미실측**(감면 5년 안분 비선형 경로). 다만 하류 영향까지는 관측했다 — `evaluateNew993`(취득 2003-09-23 · 계약 2001-06-01 · 양도 2015-06-01 · 양도소득금액 5억 · 5년시점 기준시가 7억 · 양도시 9억):

| P_A_est | 5년 안분비율 | 감면대상 양도소득금액 | fallback 대비 |
|---|---|---|---|
| 529,961,687 (fallback) | 0.4595154259 | **229,757,712** | — |
| 567,921,404 | 0.3977329391 | 198,866,469 | **+30,891,243 과다감면**(세액 과소) |
| 496,758,481 | 0.5040193269 | 252,009,663 | **−22,252,151 과소감면**(세액 과대) |

⇒ **양방향 3천만원대**. 원 finding의 「경년감가로 낮아지므로 과소 산정」은 반증됐다(§1-③).

**처방** — fallback을 제거하고 「자동 fallback 대신 ⑧ 차단」으로 간다(형제 §164⑥ 패턴). 근본적으로는 이 wrapper를 본체 `calcPreHousingDisclosureGain`의 `P_A_est` 산출부와 한 leaf로 합쳐 §164⑦ 처리가 두 곳에 갈리지 않게 할 것(본체는 landStd에 floor를 걸지 않고 wrapper는 `:94-95`에서 거는 차이도 있다).
⚠️ **§164⑤ 준용값 대입으로 가지 말 것**(§5).

**안전망** — **있으나 현행(비법정) 동작을 고정하는 방향이다**. `reduction-phd-helper.test.ts:70-81` 「최초공시 건물 미입력 시 취득시와 동일 가정」이 `estimatedAcquisitionStdPrice = 500,000,000`을 못 박고, `:79` 주석이 「Sum_A = Sum_F → 비율 1 → P_A_est = P_F」라 적어 **A11의 §164⑧ 준용 누락까지 같은 케이스에서 고정한다**. 회귀 안전망이 아니라 잘못된 동작의 고정장치다. fallback 제거 뮤테이션 → 456파일 4,923건 중 **반응 1건**(그 테스트).

### 4.2 A15 — 첫 필지에 「환지처분확정일 익일」을 켜면 서버 400으로 막히고, 화면의 취득일 칸을 고쳐도 사라지지 않는다

**위치** `lib/calc/transfer-tax-api.ts:179` · **유형** `reachability` · **검증** PARTIALLY 1
**조문** 「소득세법 시행령」 **§162①9호**(환지처분 취득시기 의제 — **§162①6호 아님**, §1-②) — 결함 자체는 조문 해석이 아니라 배선 문제

**결함** — `firstParcelAcqDate`(A10과 **동일 지점**)가 `primary.parcels[0]?.acquisitionDate || form.transferDate`다. 필지 폼의 `acquisitionDate`는 환지 토글이 켜지면 입력 칸 자체가 사라지고(`ParcelListInput.tsx:206-227` 배타 삼항) 신규 필지 기본값은 `""`(`:29`; 다필지 토글을 켤 때 만들어지는 **첫 필지**는 `AssetSectionAcquisition.tsx:216-238`의 `defaultParcel`, `:218`도 `""`). 토글 핸들러(`:199-204`)는 `acquisitionDate`를 손대지 않고, ⑧도 이 조합을 허용한다(`transfer-tax-validate-asset.ts:71-74` — `!p.useDayAfterReplotting && !p.acquisitionDate`일 때만 차단). ⇒ `"" || form.transferDate` → 자산-수준 취득일 = 양도일 → 서버 Zod refine(`lib/api/transfer-tax-schema-refines.ts:99-105`)에 걸려 **400**.

**실측**:

| 시나리오(양도일 2024-05-01) | ⑧ `collectStepIssues(0~6)` | body.acquisitionDate | route |
|---|---|---|---|
| A 필지1=환지의제, 필지2=2005-04-10 | **0건** | **"2024-05-01"** | **400** `취득일은 양도일보다 이전이어야 합니다` |
| B 필지1=2005-04-10, 필지2=환지의제 | 0건 | "2005-04-10" | 200 |
| C 환지의제 필지 1개만 | **0건** | "2024-05-01" | **400** |
| E 우회로(a): 환지 ON + 취득일 잔존 | 0건 | "2003-01-01" | 200 |

**「화면에 고칠 칸이 없다」는 틀렸다**(원 finding 정정) — 자산-수준 「취득일」 DateInput은 다필지 모드에서도 렌더된다(`AssetSectionAcquisition.tsx:180` → `CompanionAcquisitionCauseSection.tsx:154-158` → `CompanionAcqPurchaseBlock.tsx:307` → `CompanionAcqDateSection.tsx:120-125`, `data-testid="acq-date-building"`). 오히려 ⑧이 그 칸을 **필수로 요구한다**(비우면 「자산: 취득일을 입력하세요.」). 정본 서술은 **「화면에 있고 필수인 취득일 칸을 올바르게 채웠는데도 ④가 그 값을 버리고 400이 난다 — 그 칸을 아무리 고쳐도 400이 사라지지 않는다」**이다. UX 심각도는 오히려 올라간다.

**세액 영향** — 없음(기능 차단). 우회로 (a)(환지 토글 OFF → 취득일 입력 → 다시 ON)를 쓰면 환지의제 취득일 대신 원취득일이 세율 기산일이 되어 **A10 경로로 들어간다**.

**처방** — A10과 동일 지점이므로 **한 배치**(§4-배치 2). 실효 취득일 규약을 엔진·페이로드와 맞추고 `|| form.transferDate` fallback을 제거한다.
⚠️ **⑧이 다필지에서 자산-수준 날짜 순서를 건너뛰는 것은 의도된 설계이고 회귀 테스트가 못박고 있다** — `__tests__/components/transfer-asset-date-order-warning.test.tsx:76-83` T-06 「다필지 모드 — 자산-수준 취득일 비교 스킵」. 수정이 이것과 충돌하지 않게 설계할 것.

**안전망** — **0건**(A10과 동일 probe).

### 4.3 A16 — 거래대가(⑧)가 검증되지 않아 미입력이 0원으로 통과하고 시가 전액이 차액이 된다

**위치** `lib/calc/gift-deemed-validate.ts:36` · **유형** `wiring` · **검증** PARTIALLY 1
**조문** — 「상속세 및 증여세법」 §35① verbatim(MST 276123): 「특수관계인 간에 재산(…)을 시가보다 낮은 가액으로 양수하거나 시가보다 높은 가액으로 양도한 경우로서 그 대가와 시가의 차액이 … 기준금액 … 이상인 경우에는 … 증여재산가액으로 한다.」 ⚠️ **본문에 「대가 0 배제」 명문은 없다** — 문언만 보면 0도 「낮은 가액」에 포섭된다. 배제의 실제 근거는 **§4①1호(「무상으로 이전받은 재산 또는 이익」) ↔ §4①2호(「현저히 낮은 대가를 주고 … 이전받음으로써 발생하는 이익」)의 구분**이다(§35는 §4①4호로 포섭). 원 finding의 「§35 본문이 유상거래를 전제한다」는 해석이지 verbatim이 아니다.

**결함** — `bargain_transfer`의 ⑧ 검증은 시가 한 필드만 본다(`:36`). `form.bargPrice` 검사가 없다. ④(`gift-deemed-api.ts:62`)는 `parseAmount(form.bargPrice)`로 변환하는데 `parseAmount`는 빈 문자열을 0으로 되돌리고(`CurrencyInput.tsx:22-26`), ⑫(`lib/validators/gift-deemed-input.ts:42`)도 `z.number().nonnegative()`라 0을 통과시킨다. 같은 파일의 다른 유형(insurance `:31` 총 납부보험료 >0, debt_forgiveness `:40` 채무액 >0)은 금액 필드를 차단해 **유형 간 일관성도 깨진다**.

**실패 시나리오** — `/calc/gift-deemed`에서 §35 유형 선택 → 시가 10억만 입력, 거래대가 공란 → 계산.

| 케이스 (시가 10억) | ⑧ | ④ transactionPrice | ⑫ | engine applied | 증여재산가액 |
|---|---|---|---|---|---|
| `bargPrice=""` · 특수 · **purchase** | null(통과) | 0 | true | true | **700,000,000** |
| `bargPrice="0"` · 특수 · purchase | null | 0 | true | true | **700,000,000**(미입력과 동일) |
| `bargPrice=""` · 비특수 · purchase | null | 0 | true | true | 700,000,000 |
| `bargPrice=""` · 특수 · **sale** | null | 0 | true | **false** | **0** |
| `bargMarketValue=""` (대조군) | **"시가를 입력하세요"** | — | **false** | — | — |

⇒ **저가양수(`purchase`)에서만 성립한다**(원 finding 누락). 고가양도(`sale`)는 차액 < 0이라 `applied=false`로 떨어져 잘못된 값이 산출되지 않는다. 결과 화면의 `deemed-to-wizard` 버튼(`DeemedGiftResultView.tsx:510`, 게이트 `result.applied &&`)이 렌더되어 **증여세 마법사로 연계된다**.

**세액 영향** — 정상 대가 6억 대비 **+600,000,000원 과다산정**(100,000,000 → 700,000,000). 방향 2갈래: (i) 입력을 잊은 경우 실제 대가만큼 차액이 부풀어 **과다산정** (ii) 진짜 무상이전이면 §4①1호상 10억 전액이어야 하는데 7억이 나와 **과소산정**. 어느 쪽이든 차단이 정답이다.

**처방** — `gift-deemed-validate.ts:36` 아래에 거래대가 미입력 차단.
⚠️ **논거와 수정이 어긋나면 안 된다** — 실측상 미입력과 명시 `"0"`은 ④ 이후 완전히 동일한 wire(`transactionPrice: 0`)를 만들고 ⑫⑭·엔진 어디서도 구분되지 않는다. (a) 법령 논거(무상이전은 §35 대상 아님)를 밀면 **명시 0도 막아야** 하고, (b) 미입력만 막으려면 논거를 「저장소의 미입력 차단 정책 + 같은 파일 insurance:31·debt_forgiveness:40과의 일관성」으로 한정해야 한다. **원 suggestedFix는 (a)의 논거로 (b)의 수정을 제안해 자기모순이다**(⏸ §6).
⚠️ **⑫ 동기화 제안(union superRefine)은 원리적으로 무의미** — Zod는 wire만 보므로 미입력/명시 0을 구분할 수단이 없다(§5).

**안전망** — **0건**. `validateDeemedInput` 호출 테스트 4건은 전부 `capital_increase_allocation` 폼이고 `bargain_transfer` 분기를 밟는 validate 테스트 0건. Zod 쪽도 시가 0 차단 1건뿐이라 거래대가 축은 무커버. 가드 삽입 뮤테이션 → 247파일 2,389건 반응 0.

### 4.4 A18 — 사이드바 자산별 요약의 상속 취득가액 분기가 항상 null인 죽은 필드로 게이트돼 있다

**위치** `lib/stores/transfer-per-asset-summary.ts:517` · **유형** `display` · **검증** PARTIALLY 1
**결함** — `computeTransferPerAssetSummary`의 취득가액 fallback 체인이 상속 의제 분기를 `a.inheritanceMode === "post-deemed"`(`:517`)·`"pre-deemed"`(`:523`)로 게이트한다. 그런데 `inheritanceMode`는 factory가 null로 만들고(`calc-wizard-asset-factory.ts:350`) 마이그레이션 둘이 undefined를 null로 강제하며(`calc-wizard-migration.ts:124` · `calc-wizard-asset-migrate.ts:518`), **쓰기 지점이 전 저장소에 0건**이다(유일한 읽기 지점 `InheritedAcquisitionDeemedSection.tsx:44` `asset.inheritanceMode ?? computeMode(effectiveDate)`가 항상 fallback을 탄다). 도입 커밋 35eb74d7의 설계문서가 「P6-01 onChange → inheritanceMode 자동 결정」을 계획했으나 구현이 로컬 파생으로 착지해 **쓰기 지점이 처음부터 없었다**.

**실패 시나리오** — 상속 토지(2010-05-01 · 신고가액 3억 · 양도 9억)를 입력하고 계산. 엔진 `inheritedAcquisitionDetail.acquisitionPrice = 300,000,000` · 양도차익 600,000,000인데 사이드바는 계산 전후 모두 `acqPrice 0` · `acqPending false` → `TransferTaxCalculator.tsx:393-399`의 `{value > 0 ? … : pending ? "계산 후 표시" : "-"}` 규칙에 따라 **「취득가액 -」**. 결과 화면·신고서에는 300,000,000이 나오므로 같은 화면 안에서 값이 어긋난다. `inheritanceMode: "post-deemed"`만 강제 주입하면 300,000,000이 나온다(분기 자체는 정상, 게이트만 죽어 있음).

**범위 정정 2건**:
- **증여는 영향 없다** — 증여는 `CompanionAcqGiftBlock.tsx:80-83`이 신고가액을 `fixedAcquisitionPrice`(required)에 쓰므로 `directAcqRaw`의 ⑤ 분기(`:195-196`)가 값을 돌려 죽은 게이트에 **도달조차 하지 않는다**(실측 300,000,000 정상). 증상은 `acquisitionCause === "inheritance"` 전용이다.
- **다건도 「-」이고 제안 수정으로는 안 고쳐진다** — 결함 있는 체인은 `else if (acqPrice === 0 && isSingle)`(`:516`)로 **단일 자산일 때만** 진입한다. 자산 2건에서는 `inheritanceMode`를 강제 주입해도 여전히 0이다(실측). 다건 상속은 `multi-transfer-tax-validate.ts:83-85`가 `publishedValueAtInheritance`를 요구하는 **정식 지원 경로**다.

**세액 영향** — **0원**(표시 전용, 실측 확인).

**처방** — 게이트를 죽은 필드 대신 §163⑨ 단일 술어로 교체하되 **취득원인을 `inheritance`로 좁힐 것**. `transfer-163-9-base-date.ts:31-33` `isSec163_9Cause`는 `inheritance || gift`라 그대로 쓰면 증여에서 항상 0을 읽는 무의미 분기가 된다. A-8 anchor fixture에서 `inheritanceMode`를 제거해 **제품이 실제로 만드는 상태로 고정**할 것. 다건 축(`isSingle` 게이트 밖)은 별건.
> 죽은 `inheritanceMode` 필드 자체의 제거는 이 리뷰 범위 밖 — §7에 언급만 한다.

**안전망** — **있지만 제품이 만들 수 없는 상태를 고정해 회귀 감지력이 0이다**. `__tests__/lib/transfer-per-asset-summary.test.ts:247`(A-8)이 fixture에 `inheritanceMode: "post-deemed"`를 직접 세팅해 `acqPrice === 400,000,000`을 단언한다(`-t "A-8"` 실측 1 passed). 같은 fixture에서 그 필드만 빼면 **0**이 나온다.

### 4.5 A21 — 결과 카드가 `cgtUnderSection97`을 「피상속인 원취득가액 기준」이라 표시하지만 엔진은 상속개시일 평가액 기준으로 계산한다

**위치** `components/calc/results/transfer/FamilyBusinessImputedComparisonCard.tsx:119` · **유형** `display` · **검증** CONFIRMED 1/1
**조문** 「소득세법 시행령」 §163⑨ 본문 verbatim(§2.3) — 상속자산에 「소득세법」 §97①1호가목을 적용하면 취득가액은 **상속개시일 평가액**이다. 피상속인 원취득가액으로 가는 §97 경로는 존재하지 않는다(피상속인 취득가는 §97의2④ 의제산식의 구성요소로만 등장). 「상속세 및 증여세법 시행령」 §15㉑ verbatim(「…「소득세법」 제97조의2제4항을 적용하여 계산한 양도소득세액에서 **같은 법 제97조를 적용하여 계산한 양도소득세액을 뺀 금액**」).

**결함** — 카드가 `cgtUnderSection97` 행 라벨을 `"일반 §97 결정세액 (피상속인 원취득가액 기준)"`으로 찍는다. 엔진은 그 값을 `calcFn(inputWithoutFb, rates, { acquisitionOverride: fb.inheritanceMarketValue })`(`transfer-tax-family-business.ts:296-300`)로 산출한다 — **상속개시일 평가액 기준**이다. 같은 파일 `:293-295` 주석이 「소득세법 시행령 §163⑨: 상속받은 자산의 §97①1호 취득가액 = 상속개시일 현재 평가액. (피상속인 원취득가액은 §97의2④의 의제취득가 산식 구성요소일 뿐 §97 기준가액이 아니다.)」라고 못박아 **코드 주석과 화면 라벨이 정면으로 어긋난다**.

**중의성이 없다** — 같은 표 안에서 용어가 이미 바인딩돼 있다: `:95-99` 「피상속인 원취득가액」 행에 `decedentAcquisitionPrice`, `:100-104` 「상속개시일 자산 평가액」 행에 `inheritanceMarketValue`.

**실패 시나리오** — anchor FB-CGT-FULL-1과 동일 입력(양도 5억 · 피상속인취득가 1억 · 상속개시일 평가액 3억 · r=0.8 · 2015-01-01 → 2026-01-01):

| | 값 |
|---|---|
| `cgtUnderSection97` (엔진 실측) | **39,910,000** |
| 취득가액 = 상속개시일 평가액 3억으로 둔 단건 결정세액 | **39,910,000** ✅ 일치 |
| 취득가액 = 피상속인 원취득가 1억으로 둔 단건 결정세액 | **101,060,000** ❌ |

라벨대로 검산하면 101,060,000을 얻어 **61,150,000원의 불일치**를 마주하고 §18의2⑩ 공제액(48,640,000)의 근거를 재현하지 못한다.

**세액 영향** — **0원**(표시 전용).

**처방** — 라벨을 「일반 §97 결정세액 (상속개시일 평가액 기준 · 소득세법 시행령 §163⑨)」으로 정정. **오기 지점은 3곳이 아니라 5곳이다**(원 finding 누락 2건):

| # | 위치 | 형태 |
|---|---|---|
| 1 | `FamilyBusinessImputedComparisonCard.tsx:119` | 화면 라벨 |
| 2 | `FamilyBusinessImputedComparisonCard.tsx:7` | 파일 헤더 JSDoc |
| 3 | `transfer-tax-family-business.ts:106` | 타입 JSDoc |
| 4 | `transfer-tax-family-business.ts:196` | `@param regularCgt 피상속인 원취득가액 기준…` |
| 5 | `lib/tax-engine/credits/family-business-cgt-credit.ts:13` | 주석 |

「인용이 전역 복제됨」 패턴이므로 수정 시 `grep -rn "원취득가액 기준"` 전수 확인할 것.
**함께**: 카드 `:146`의 sky 분기 문구도 자기모순이다 — 실측(피상속인가 5억 > 평가액 3억, r=0.8, 양도 8억 → `imputedIsFavorable = true`)에서 「의제 취득가액(460,000,000)이 피상속인 원취득가액(500,000,000)보다 **낮아** 세액이 감소합니다」가 되는데 **취득가액이 낮으면 세액은 오른다**. 실제 감소 사유는 의제취득가가 §97 기준가액인 상속개시일 평가액(3억)보다 **높기** 때문이다.

**안전망** — **0건**. `FamilyBusinessImputedComparisonCard`를 렌더하는 테스트·E2E spec 0건(import처는 `TransferTaxResultView.tsx:39·610`, `ValuationDetailCards.tsx:34·123` 2곳뿐). 엔진 값은 `family-business-cgt.test.ts:240`이 39,910,000으로 고정하지만 화면 라벨링은 아무도 보지 않는다. 라벨 뮤테이션 → 279파일 2,235건 반응 0.

### 4.6 A22 — 피상속인 자본적지출을 넣으면 의제취득가액 산식 표시가 자기모순이 된다

**위치** `components/calc/results/transfer/FamilyBusinessImputedComparisonCard.tsx:105` · **유형** `display` · **검증** PARTIALLY 1
**조문** 「소득세법」 §97의2④1호 verbatim(§2.4) — 자본적지출을 1호 base에 넣는 것 자체는 저장소가 「해석례 미확보 상태의 채택(계획서 Q7 = 안 B)」으로 문서화한 **기존 결정**이라 이 항목의 대상이 아니다. 대상은 **채택 산식과 화면 산식의 괴리**다.

**결함** — 엔진은 §97의2④1호 base에 `decedentCapitalExpenditure`를 가산한 뒤 적용률을 곱한다(`transfer-tax-family-business.ts:181-184`). 그런데:
- **(a) 결과 카드**: `FamilyBusinessCgtDetail`에 자본적지출 echo 필드가 없어(`:93-133`) 「피상속인 원취득가액」·「상속개시일 자산 평가액」 두 행과 「의제 취득가액 (원취득가 × r% + 평가액 × (1−r)%)」 라벨만 찍고 **값은 자본적지출이 반영된 금액을 표시**한다 → 표 안의 세 숫자가 맞지 않는다.
- **(b) 입력 카드 미리보기**: `calcImputedPreview`(`FamilyBusinessInheritanceTransferSection.tsx:58-63`)가 자본적지출을 **인자로 받지도 않고**, 엔진이 명시적으로 금지한 부동소수 `1 - r`을 그대로 쓴다(엔진 `:164` 주석이 지목한 바로 그 패턴).

**두 하위 결함은 성질·발현조건이 다르므로 분리해야 한다**(원 finding 정정):

| | 성질 | 발현 조건 | 원인 |
|---|---|---|---|
| (a) 카드 | **내부 자기모순** | capex > 0 | echo 필드 부재 1개 |
| (b) 미리보기 | 내부는 일관, **엔진과 괴리** | ① capex 누락 = 모든 r ② 부동소수 = r에 따라 | 독립 2개 |

**원 수치 정정** — 「카드 라벨대로 재구성하면 259,999,999(차 80,000,001)」는 **미리보기의 부동소수 아티팩트를 카드에 잘못 이식한 것**이다. 카드는 계산하지 않고 `(appliedRate*100).toFixed(2)`·`((1-appliedRate)*100).toFixed(2)`만 찍고, 실측 `((1-0.8)*100).toFixed(2) = "20.00"`으로 **정확하다**. ⇒ 카드 재구성값은 **260,000,000**, 괴리는 **80,000,000**. 그리고 **capex = 0에서 카드는 완전 자기일관(괴리 0)**이다 — 「1원 오차」는 미리보기에만 귀속된다.

**실패 시나리오** — 「피상속인 자본적 지출액 (원) — 선택」 칸(`:231-239`, hint가 「§97의2④1호의 취득가액에 합산되어 가업상속공제적용률이 곱해집니다」라고 안내)에 1억 입력. 피상속인취득가 2억 · 평가액 5억 · r=0.8:
- **미리보기 현행**: 「200,000,000 × 80.00% + 500,000,000 × 20.00% = **259,999,999**」 / 올바른 표시: 「(200,000,000 + 100,000,000) × 80.00% + 500,000,000 × 20.00% = **340,000,000**」
- **결과 카드 현행**: sub 행 200,000,000 · 500,000,000 + 라벨 「(원취득가 × 80.00% + 평가액 × 20.00%) **340,000,000**」 — 표시된 산식으로는 340,000,000이 나올 수 없다.
- **가장 날카로운 형태**(원 finding 누락): 미리보기 숫자가 **capex 유무와 완전히 동일하다**(capex 1억 = 259,999,999, capex 0 = 259,999,999). 사용자가 hint를 읽고 1억을 입력해도 **화면 숫자가 1원도 움직이지 않는다**.

**세액 영향** — **0원**(표시 전용). 표시 산식 ↔ 표시 금액 괴리 실측 **80,000,000원**(capex 1억) · **180,000,000원**(capex 3억, r=0.6 — 이 케이스는 부동소수 기여 0으로 전액 capex 누락분) · **1원**(capex 0, r=0.8; **r=0.6에서는 미발생**).
**완화 요소**(원 finding 누락): 미리보기에 면책 문구가 있다 — `:275-277` 「※ 최종 의제 취득가액은 엔진 계산 결과로 확인하세요.」

**처방** — `FamilyBusinessCgtDetail`에 `decedentCapitalExpenditure` echo 필드 추가(엔진 `:213-222` 조립부에서 전달)하고 결과 카드에 「피상속인 자본적 지출액」 sub 행 + 라벨을 「(원취득가 + 자본적지출) × r% + 평가액 × (1−r)%」로 정정. **입력 미리보기는 자체 산식 복제를 버리고 엔진 leaf `calcFamilyBusinessImputedAcquisitionPrice`(`:174 export`)를 직접 import**한다(skill `single-source-engine-helper` — 같은 파일이 이미 `:36`에서 `isFamilyBusinessAssetScopeDecreeEra`를 그렇게 재사용한다). 그러면 자본적지출 누락과 부동소수 1원 오차가 함께 사라진다.

**안전망** — **0건**. 카드·입력 섹션을 렌더하는 테스트 0건(grep). 엔진 값만 `fb-lthd-95-4-latter.anchor.test.ts:203-207`(M-4)이 340,000,000으로 고정하고, **화면이 그 값을 어떤 산식으로 설명하는지는 아무도 보지 않는다**.

---

### 4.7 A20 — 다필지 조기반환이 상류 STEP의 판정·평가 상세를 전부 버린다 (컨텍스트로 받아 놓고 구조분해조차 하지 않는다)

**위치** `lib/tax-engine/transfer-tax-multi-parcel-branch.ts:50·243` · **유형** `display` · **검증** **메인 루프 직접 검증 CONFIRMED**(자동 검증자가 API 오류로 사망 — 아래 단서 참조)

**결함** — `transfer-tax.ts:527-531`의 다필지 조기반환이 정상경로의 결과 조립을 통째로 건너뛰면서, 반환 객체(`:243-281`)에 상류 STEP의 산출물을 하나도 싣지 않는다. 누락 확인된 것: `nonBusinessLandJudgmentDetail`·`nblSurchargeExcluded`(STEP 0.6) · `pre1990LandValuationDetail`(0.4) · `carryoverTaxationDetail`(0.475) · `inheritedAcquisitionDetail`(0.45) · `multiHouseSurchargeDetail`(0.5). 반환 객체가 싣는 것은 감면 상세 7종(CB-07에서 복구) + `penaltyDetail` + `parcelDetails`뿐이다.

**근거** — 「받아 놓고 안 쓴다」가 세 지점의 대조로 직접 증명된다(전부 메인 루프가 실물 확인):

| | 관측 |
|---|---|
| ① 타입 선언 | `MultiParcelBranchContext`가 `pre1990LandResult`(`:40`)·`carryoverDetail`(`:41`)을 **선언한다** |
| ② 호출부 | `transfer-tax.ts:528`이 `{ rawInput, effectiveInput, input, parsedRates, multiHouseSurchargeResult, pre1990LandResult, carryoverDetail, options }`로 **실제로 넘긴다** |
| ③ 함수 본문 | `:50` 구조분해는 `rawInput, effectiveInput, input, parsedRates, multiHouseSurchargeResult, options` **6개뿐**. 파일 전체 grep 결과 두 이름은 **타입 선언 `:40`·`:41`에만 등장**하고 본문 사용 0건 |

TypeScript가 잡지 못하는 형태다 — 구조분해에서 빼면 unused 경고조차 나지 않는다. 부수적으로 `parcelDetails` 자체도 `pickValuationDetails`(13종, `transfer-tax-aggregate-pickers.ts:34-49`)에 없어 일괄(bundled) 경로에서 필지별 내역이 사라진다.

**실패 시나리오** — 비사업용 토지 정밀 판정 입력(농지·재촌자경 등)을 채우고 다필지 모드로 계산. 현행: 세율에는 STEP 0.6 재판정이 `effectiveInput`을 통해 반영되는데(`:98`) **「비사업용 토지 판정」 카드는 나타나지 않는다 — 세액은 움직였는데 근거가 화면에 없다.** pre1990 등급가액·이월과세·상속취득가액 의제도 같은 방식으로 근거가 사라진다.

**세액 영향** — **0원**(표시 전용). 다만 §2.2 A02·§3.5 A10이 같은 파일의 같은 조기반환에서 나온 **세액 결함**이므로, 이 분기는 표시·계산 양쪽에서 이미 재발 지점이다.

**처방** — `:243-281` 반환 객체에 상류 산출물을 얹는다. `pre1990LandValuationDetail: ctx.pre1990LandResult` · `carryoverTaxationDetail: ctx.carryoverDetail`은 **이미 컨텍스트에 와 있어 구조분해만 추가하면 되어 비용이 사실상 0**이다. `nonBusinessLandJudgmentDetail`·`nblSurchargeExcluded`·`multiHouseSurchargeDetail`은 컨텍스트에 추가가 필요하다. `parcelDetails`는 `TransferValuationDetailSource`·`pickValuationDetails`에 함께 등록해 일괄 경로 소실도 막을 것.

**안전망** — **부분**. `multi-parcel-reduction-cap-and-rural-surtax.anchor.test.ts`(CB-07)가 **감면 상세 echo만** 고정한다 — 같은 유형을 한 번 잡고도 판정·평가 상세 축은 남겨두었다. `nonBusinessLandJudgmentDetail`이 다필지 결과에 있는지 단언하는 테스트 0건(`parcels`와 함께 쓰는 파일 0건). 다만 `__tests__/api/transfer.route.bundled-swallows-special.test.ts`가 `pickValuationDetails` 13종과 컴포넌트의 3자 동기화를 소스 수준으로 검증하므로, **`parcelDetails`를 그 목록에 넣으면 자동으로 지켜진다**.

> ⚠️ **이 항목은 자동 파이프라인에서 조용히 탈락했다가 복구된 것이다.** 배정된 검증자(`verify:A20/repro`)가 API 오류로 죽었고, 워크플로 스크립트가 「검증자 사망」과 「반증됨」을 구분하지 않아 생존 판정에서 빠졌다. 위 증거 ①②③은 **메인 루프가 워크트리에서 직접 확인**한 것이다(HEAD `265c10bf`, 오염 원복 후). 세액 영향이 0원이라 우선순위는 낮지만, **판정되지 않은 것을 기각으로 처리하지 않는다**는 원칙에 따라 복구해 남긴다.

---

## 5. ⚪ Low

### 5.1 A05 — 컴패니언 건물의 §164⑨1호 「토지분 보상 총액」 2필드가 ④⑫⑭ 어디에도 없다

**위치** `lib/calc/transfer-tax-api-helpers.ts:477` · **유형** `wiring` · **검증** PARTIALLY 3/3 (high 1 · **low 2** → low 채택)
**조문** 「소득세법 시행령」 §164⑨ 본문 verbatim(§3.3) · 1호 verbatim: 「「공익사업을 위한 토지 등의 취득 및 보상에 관한 법률」에 따른 협의매수ㆍ수용 및 그 밖의 법률에 따라 수용되는 경우의 **그 보상액과 보상액 산정의 기초가 되는 기준시가 중 적은 금액**」 · 「소득세법 시행규칙」 §80⑧ verbatim: 「영 제164조제9항제1호에서 보상금액 산정의 기초가 되는 기준시가는 보상금 산정 당시 **해당 토지의 개별공시지가**를 말한다」

**결함** — `splitLandCompensationTotal`·`splitLandCompensationBasisTotal` 2필드가 주 자산 경로에만 배선돼 있고 컴패니언 경로의 ④(`buildAssetPayload`)·⑫(`companionAssetSchema`, `.passthrough()` 없음 → strip)·⑭(`buildCompanionEngineInputs`, 명시 열거) 세 층 모두에 칸이 없다. 반면 ⑤UI(`ExpropriationBlock`, `CompanionAssetCard.tsx:334` → `asset-sections/AssetSectionTransfer.tsx:59` → `TransferModeBlock.tsx:183`)와 ⑧(`transfer-tax-validate.ts:229-236` → `validate-asset.ts:704` → `validate-expropriation.ts:168-172`)은 자산 인덱스를 보지 않는 공용 컴포넌트/공용 루프라 컴패니언에서도 동작한다. 같은 컴패니언 빌더가 per-sqm(`:455-463`)·공매경락(`:465-470`)·주택총액(`:472-477`)은 이미 spread해 **split-land 하나만 빠진 비대칭**이다.

**세액 영향 — 0원.** §1-① 참조. 컴패니언 §164⑨1호 split-land 분기는 `standardPricePerSqmAtAcquisition` 채널 부재로 **구조적으로 도달 불가**다. 실측 스윕:

| 컴패니언 조합 | 결과 |
|---|---|
| 취득일 상이 + 양쪽 환산 | **HTTP 500** `INVALID_INPUT` |
| 취득일 상이 + land만 환산 | **HTTP 500** |
| split 토글 ON + 취득일 동일 | 200이나 `splitDetail=false`(split 미실행) — 2필드 주입해도 무영향 |
| 취득일 상이 + 양쪽 실가 | 200, `splitDetail=true` — 실가 파트에는 §164⑨1호가 애초에 부적용 |

⇒ 2필드가 세액을 1원이라도 바꾸는 컴패니언 조합 **0건**. 제안 수정(2필드 추가)은 **no-op**이다(실측: 주입 전후 THROW 동일).

**처방** — 층을 맞춘다. (i) ⑧ `validateSplitLandExprAsset`·⑤ `ExpropriationBlock`이 **컴패니언에서는 이 블록을 띄우지도 요구하지도 않게** 하거나, (ii) 컴패니언 `standardPricePerSqmAtAcquisition` 채널을 먼저 열고 그 다음에 2필드를 얹는다. **(ii) 없이 2필드만 넣는 것은 금지**(§6-⛔).
> 🔴 **부수 발견 — 별건 결함**: 별개취득 컴패니언 + 환산 조합은 **⑧ 통과 ↔ 엔진 500**이다. 원인은 A05의 2필드가 아니라 컴패니언 `standardPricePerSqmAtAcquisition` 채널 부재(배선 지점 3곳 전부 단건 전용 — `transfer-tax-api.ts:457` · `transfer-tax-schema.ts:289` · `engine-input.ts:280`)이고, ⑭ `bundled-split-helpers.ts:438`은 `acquisitionArea: c.areaM2`(면적)만 잇는다. §7에 신규 항목으로 남긴다.

**안전망** — **0건**. ⑧·엔진 anchor는 전부 단건 또는 leaf 직접 호출(`transfer-validate-split-land-expropriation.test.ts` · `expropriation-split-land.anchor.test.ts` 단건 6건). ④⑫⑭ 배선을 태우는 테스트 0건. primary 정본 emit(`:656-657`)을 `undefined`로 뮤테이트해도 782파일 8,378건 반응 0 — **primary 경로의 ④조차 안전망이 없어 컴패니언 누락이 드러날 통로가 없었다.**

### 5.2 A17 — 상속개시일이 2014-01-01 전이면 G-1 부칙 게이트가 가업상속공제 입력 5필드를 조용히 버린다

**위치** `lib/tax-engine/transfer-tax-family-business.ts:259` · **유형** `reachability` · **검증** PARTIALLY 1 (medium → **low**)
**조문** 「소득세법」 부칙(법률 제12169호) §12 — **본문 미확인**(저장소 `data/family-business-cgt-era.ts:12-16`의 법제처 DRF 실측 인용을 옮긴 것). 본칙 §97의2④는 verbatim 확인(§2.4).

**결함** — `if (!isFamilyBusinessCgtEra(new Date(fb.inheritanceDate))) return null;`로 조기 반환하면 `familyBusinessDetail`이 붙지 않고 steps·warnings에도 아무것도 남지 않는다. `familyBusinessInheritance`는 이후 파이프라인 어디서도 소비되지 않아(소비자는 `:253`·`:277`뿐) **완전한 dead 입력**이 된다. 상류에도 신호가 없다 — ⑧(`transfer-tax-validate-asset.ts:764-774`)은 상속개시일 존재만 보고 시기를 보지 않고, ⑤ 입력 카드는 G-2/G-3(양도일 축, `isFamilyBusinessAssetScopeDecreeEra`) 안내만 렌더하며(`FamilyBusinessInheritanceTransferSection.tsx:249-261`) **G-1(상속개시일 축) 안내가 없는 데다 `:264-279`에서 의제취득가액 미리보기를 그대로 계산해 보여준다**. `isFamilyBusinessCgtEra` 전역 호출처가 `:259` 단 하나(나머지는 자기 단위테스트).

**실패 시나리오** — 상속개시일 2013-12-31의 가업상속 자산을 2026-01-01에 양도(토지 10억 양도 · 피상속인 취득 2005-01-01 · FB{2억, 5억, r=0.8}).

| 상속개시일 | `familyBusinessDetail` | 양도차익 | **총세액** | warnings |
|---|---|---|---|---|
| 2013-12-31 | **없음** | 500,000,000 | **137,566,000** | `undefined` |
| 2014-01-01 | 있음 | 740,000,000 | 204,097,080 | `undefined` |

**세액 영향** — **0원**. 경계 양쪽 모두 게이트 결론대로 계산되며 **게이트가 잡는 결론(특례 미적용) 자체는 법령상 옳다**.

**「흔적 없이 사라진다」는 절반만 맞다**(원 finding 정정) — 게이트 탈락 시에도 첫 step이 `양도차익 계산 / 양도가(1,000,000,000) - 취득가(500,000,000) - 경비(0)`를 표시하므로 **어떤 취득가액이 쓰였는지는 화면에 나온다**(미리보기 ~2.6억과 대조 가능). 없는 것은 **사유**와 명시적 「미적용」 문구다.

**더 강한 오정보가 같은 카드에 있다**(원 finding 누락) — `:281-288`의 rose 카드가 토글 ON이면 **무조건** 「소법 §97의2④ 본문 강제 적용 — 의제 취득가액이 일반 §97 취득가액보다 불리하더라도 **반드시 적용됩니다**」를 렌더한다. 2014-01-01 前 상속분에서 이 문장은 단순 누락이 아니라 **적극적 허위 서술**이다.

**처방** — ①엔진: 조기 반환 대신 `applyFamilyBusinessCgtStep`이 `warnings`를 받아 사유를 push(같은 파일이 §95④ 후단을 `fbLthdLatter`로 따로 실어 보내는 것과 같은 층위). ②⑤UI: 이미 import한 `isFamilyBusinessCgtEra`를 `fb.inheritanceDate` 축으로 호출해 G-1 안내를 추가하고 그때는 **미리보기와 rose 카드를 함께 조건부로 돌린다**. ③⑧: 차단 여부는 정책 판단이나 최소한 인라인 경고.
> ⚠️ 미리보기 수치는 **259,999,999**이지 260,000,000이 아니다(A22 부동소수) — 두 항목을 함께 고칠 것.

**안전망** — **부분적**. `fb-lthd-95-4-latter.anchor.test.ts:239-248`(G-1a)이 상속개시일 2013-12-31에서 양도차익 500,000,000·LTHD 120,000,000을 고정해 **세액은 지킨다**. 그러나 `familyBusinessDetail`이 undefined인지도, warnings·steps에 사유가 남는지도 단언하지 않는다. UI 커버리지 0건. 게이트 무력화 뮤테이션 → FB 관련 4파일 36건 중 **반응 1건**(G-1a, 세액만).

### 5.3 A19 — 재개발(§166) 조기반환 분기가 `inheritedAcquisitionStep`을 넘기지 않아 §163⑨ 상세 카드가 결과 화면에 뜨지 않는다

**위치** `lib/tax-engine/transfer-tax.ts:413` · **유형** `wiring` · **검증** PARTIALLY 1 (medium → **low**)
**조문** 「소득세법 시행령」 §163⑨ · 「소득세법 시행령」 §166 — **본문 미확인**(배선 결함이라 조문 해석에 의존하지 않는다). 엔진이 실제로 내보내는 근거 문자열은 verbatim 「소득세법 시행령 §163 ⑨ · 상증법 §60 · §61」.

**결함** — `transfer-tax-finalize.ts:604-605`가 **같은 `ctx.inheritedAcquisitionStep`에서 두 필드**를 싣는다:
```
604:  inheritedAcquisitionDetail: ctx.inheritedAcquisitionStep?.result,
605:  inheritedHouseValuationDetail: ctx.inheritedAcquisitionStep?.houseValuationResult,
```
STEP 0.65 재개발 분기는 `calculateRedevelopmentTax(...)`로 조기반환하면서 그 step을 전달하지 않는다(`transfer-tax-redevelopment.ts`는 `finalizeTransferTax`를 호출하지 않는다 — 파일 헤더 `:16` 명시). 그 분기는 바로 앞 `:312`에서 `resolveInheritedRedevelopmentAcqPrice(inheritedAcquisitionStep)`로 §163⑨ 확인가액을 **소비까지 하면서** 근거를 결과에 싣지 않는다. ⇒ `ReductionDetailCards.tsx:151`의 `hasAny`가 false가 되어 **카드 묶음 전체가 `return null`**.

**실패 시나리오** — 재개발 조합원입주권(종전자산 상속 2015-06-01 · 신고가액 2억 · 관리처분인가 2020-06-01 · 권리가액 5억 · 청산금 5천만 · 2024-06-01 6억 양도):

| | `inheritedAcquisitionDetail` | 양도차익 | 총세액 |
|---|---|---|---|
| redevelopment 없음 | PRESENT (200,000,000 / supplementary) | 400,000,000 | 118,206,000 |
| redevelopment 있음 | **undefined** | 350,000,000 | 100,102,999 |

⚠️ 원 finding의 「세액은 양쪽 동일(350,000,000)」은 자기 evidence와 모순된다 — 두 경로의 양도차익·세액은 **다르다**(재개발 §166 3분할이 청산금 5천만을 취득가에 얹기 때문이며 이건 정상 동작). 옳은 서술은 **「수정 전후의 세액이 같다(표시 전용)」**이고, 근거는 이 두 필드를 읽는 곳이 표시 계층뿐이라는 소비처 전수 확인이다(`ReductionDetailCards.tsx:109·172·175` · `MixedUseResultCard.tsx:264·507` · `transfer-tax-aggregate-pickers.ts:71` · `transfer-per-asset-summary.ts:520-527` — 마지막은 선행 분기 `else if (redevResultTotals)`(`:502`)가 먼저 잡아 도달하지 않는다).

**세액 영향** — **0원**. 금액 자체는 `steps` 배열의 「상속 취득가액 의제」 항목(label·formula·legalBasis·amount 전부)으로 남고 신고서 양식 취득가액 행에도 200,000,000이 표시된다(`e2e/redevelopment-inheritance-163-9-acquisition.spec.ts`가 그것을 단언하며 통과). 잃는 것은 설명 카드 **2장**(원 finding은 1장이라 적었다)과 그에 딸린 「출력 항목 선택」 엔트리다.

**범위가 넓다** — `EXCEL_13` 주택 미공시 fixture 실측: 일반 = 두 detail 모두 PRESENT / 재개발 = **둘 다 undefined** ⇒ `InheritedHouseValuationDetailCard`(§164⑤~⑦ 주택 미공시 환산 근거, `ReductionDetailCards.tsx:175-176`)도 함께 사라진다.
**STEP 2.5 임대주택 특례 조기반환(`:609-627`)도 동일**(원 finding은 「코드 확인만」으로 유보했으나 실측 확인): §155⑳ 시나리오 A(상속 신고가액 9억 · 양도가 15억 · 1세대1주택 고가주택) → 특례 미적용 detail PRESENT / 특례 적용 **detail undefined**, 총세액 양쪽 **6,943,200 동일**.

**처방** — `calculateRedevelopmentTax`의 5번째 옵션 인자에 `inheritedAcquisitionStep`을 통째로 넘겨 **두 필드를 함께** echo한다(`carryoverDetail`·`houseCountExclusion`이 같은 방식으로 이미 이관돼 있어 동형 확장). STEP 2.5 임대특례도 함께.

**안전망** — **0건**. `__tests__/tax-engine/transfer-tax/redevelopment/` 전체에 `inheritedAcquisitionDetail` 0건. `e2e/redevelopment-inheritance-163-9-acquisition.spec.ts`는 신고서 취득가액 행(200,000,000)만 단언하고 카드 셀렉터(「상속 취득가액 의제 계산」) 0건.

---

## 6. 수정 계획 — 12개 배치

**배치는 파일 충돌로 강제됐다.** 같은 객체 리터럴·같은 표현식·같은 함수를 편집하는 findings는 한 배치·한 워커여야 한다. 실측 확인된 공유 지점:

| 공유 파일 | findings |
|---|---|
| `lib/calc/transfer-tax-api.ts` | **A04**(:646) · **A09**(:141) · **A10**(:179-180) · **A15**(:179 — A10과 **동일 표현식**) · **A12**(:177) |
| `lib/calc/transfer-tax-api-helpers.ts` | **A01**(:241 `buildPre1990LandPayload`) · **A05**(`buildAssetPayload`) · **A12**(`buildAssetPayload`) |
| `lib/tax-engine/transfer-tax-family-business.ts` | **A17**(:259) · **A21**(:106·:196) · **A22**(:213-222) |
| `components/calc/results/transfer/FamilyBusinessImputedComparisonCard.tsx` | **A21**(:7·:119·:146) · **A22**(:105) |
| `components/calc/transfer/FamilyBusinessInheritanceTransferSection.tsx` | **A17**(G-1 안내·rose 카드) · **A22**(:58-63 미리보기) |
| `lib/tax-engine/transfer-reductions/phd-helper.ts` | **A11**(:104) · **A13**(:98) |
| `lib/calc/transfer-tax-validate-asset.ts` | **A04**(FB 차단) · **A09**(:369-372) · **A12**(컴패니언 다필지 차단) |
| `lib/api/transfer-tax-schema-sub.ts` · `app/api/calc/transfer/bundled-split-helpers.ts` | **A05** · **A12** |
| `lib/tax-engine/transfer-tax-multi-parcel-branch.ts` | **A02**(:70 필지 플래그) · **A20**(:50 구조분해 · :243 반환 객체) — 같은 `handleMultiParcelBranch` 본문 |

| 배치 | findings | 주 파일 | 충돌 위험 |
|---|---|---|---|
| 1 | A09, A04 | `transfer-tax-api.ts` · `multi-transfer-tax-api.ts` · `transfer-tax-validate-asset.ts` · `transfer-tax-validate-sec164.ts` · `CompanionAcquisitionCauseSection.tsx` | 높음(⑧ 파일 공유) |
| 2 | A10, A15 | `transfer-tax-api.ts:179-180` · `transfer-tax-api-parcels.ts` | **최고**(동일 표현식) |
| 3 | A01 | `transfer-tax-api-helpers.ts:241` | 낮음(한 줄) |
| 4 | A03 | `transfer-tax-api-inheritance.ts` · `sec164-required-fields.ts` | 낮음 |
| 5 | A02, **A20** | `transfer-tax-multi-parcel-branch.ts` · `multi-parcel-transfer.ts` · `transfer-tax-aggregate-pickers.ts` | 중간(A02 `:70` · A20 `:50`·`:243` — **같은 함수**라 한 배치 강제) |
| 6 | A07 | `inheritance-acquisition-helpers.ts:229·232·237` | 중간(단일 반환 객체 리터럴 3필드) |
| 7 | A06 | `transfer-tax-split-gain.ts` · `transfer-tax-validate-split.ts` | 중간 |
| 8 | A11, A13 | `transfer-tax-pre-housing-disclosure.ts` · `phd-helper.ts` · `inheritance-house-valuation.ts` · `transfer-tax-validate-reductions.ts` | 높음(같은 파일 인접 함수) |
| 9 | A08 | `AuctionBlock.tsx` · `transfer-tax-validate-expropriation.ts` | 낮음 |
| 10 | A17, A21, A22 | `transfer-tax-family-business.ts` · `FamilyBusinessImputedComparisonCard.tsx` · `FamilyBusinessInheritanceTransferSection.tsx` · `credits/family-business-cgt-credit.ts` | **최고**(3파일 전부 공유) |
| 11 | A18, A19 | `transfer-per-asset-summary.ts` · `transfer-tax.ts` | 낮음 |
| 12 | A16 | `gift-deemed-validate.ts` · `lib/validators/gift-deemed-input.ts` | 낮음(별 도메인) |
| ⏸ | A05, A12 | `transfer-tax-api-helpers.ts` · `transfer-tax-schema-sub.ts` · `bundled-split-helpers.ts` · `AssetSectionAcquisition.tsx` | 정책 결정 선행 · **배치 3 이후** |

**전 배치 공통 완료 조건**: 현행 동작을 고정하는 테스트가 있는 것은 **A03(2건) · A13(1건) · A17(1건)뿐**이고 나머지 18건은 고쳐도 red가 나지 않는다(§9). ⇒ **각 배치의 완료 조건에 characterization/anchor 신설을 반드시 포함**시킨다. anchor 없이 머지하면 다음 리팩터가 조용히 되돌린다.

### 배치별 근거·순서

**배치 1 — A09 → A04** (게이트 정의부 2건)
둘 다 `transfer-tax-api.ts`의 조건부 spread 게이트에 조건을 추가하는 동형 편집이고 ⑧ `transfer-tax-validate-asset.ts`를 공유한다. **A09 먼저** — 게이트 축(기간 + 모드)이 다건(`multi-transfer-tax-api.ts:33`)·⑧ 2파일로 전파되므로 반경이 넓고, A04는 그 위에 독립적으로 얹힌다. A09는 날짜 파생을 `deriveSec163_9BaseDate` 계열로 할 것(raw `acquisitionDate`만 보면 상속 과차단). A04는 ⑤ 렌더 술어와 **같은 술어**여야 GB 경로(71,242,600원)가 함께 닫힌다 — `acquisitionCause === "inheritance"` 단독 금지. 완료 조건: A09 anchor(1990-08-30 이후 취득 + stale 래치 → payload 미전송 · 다건 동일) · A04 anchor(purchase/gift/newConstruction 3종 + GB 경로 4케이스).

**배치 2 — A15 → A10** (`:179-180` 동일 표현식)
A15(환지 첫 필지 → 기산일이 양도일로 붕괴, 75,779,000원 과세초과)는 **조문 결정 없이도 명백한 버그**이므로 먼저 세운다: 실효 취득일 규약을 엔진(`multi-parcel-transfer.ts:217-231`)·페이로드(`transfer-tax-api-parcels.ts:77-80`)와 동일하게 맞추고 `|| form.transferDate` fallback을 제거해 확정 불가 시 ⑧에서 차단(「자동 안분 fallback 금지」와 같은 층위). **A10의 순서 무관 규칙 자체는 ⏸ 결정 후**(§8-1). ⚠️ `transfer-asset-date-order-warning.test.tsx:76-83` T-06(다필지에서 자산-수준 날짜 비교 스킵)과 충돌하지 않게 설계할 것. ⚠️ 이 배치는 배치 1과 같은 파일이므로 **직렬 실행**.

**배치 3 — A01** (한 줄)
`const areaSqm = resolveAcqAreaForStdPrice(primary) ?? 0;`. 회귀 0 실측(757파일 7,807건). 완료 조건: `partial-area-acq-std-price.anchor.test.ts`에 pre1990 케이스 추가(취득 300㎡/양도 100㎡ → 총부담 154,704,000). ⚠️ **일반 환산 partial 축은 이 한 줄로 안 덮인다**(§7).

**배치 4 — A03** (조기반환 좁히기)
`isFullyFilled(sec164House/Commercial/LandStatus)`를 ⑧과 공유해 술어를 단일화. **상속 전용으로 좁힐 것**(증여는 ⑧이 이미 차단). 완료 조건: L-04·N-03 anchor의 **JSDoc 계약 문구 개정** + 「② 완비 + ① 미입력」 anchor 3종(상가 §164⑥ · 주택 §164⑦ · 토지 §164④, 토지는 `pre1990Enabled` ON/OFF 양방향).

**배치 5 — A02** (다필지 미등기 전파)
배치 2 뒤에 둔다 — 배치 2가 다필지 기산일 규약을 확정한 뒤 anchor를 심어야 기대값을 두 번 안 고친다. `?? fallback` 형태 필수(필지별 축 보존). `estimatedDeductionRate()` SSOT 경유로 함께 정렬. 완료 조건: anchor 3건(LTHD 0 · 개산공제 3/1000 · 단건 대조군 462,000,000 동일).

**배치 6 — A07** (§163⑨ 지분 스케일)
`landValuationStdPrice`·`houseValuationStdPrice`가 **단일 반환 객체 리터럴**(`:229-238`)이라 한 배치 강제. `commercialValuationStdPrice`(§164⑥)는 코드 구조상 동일하나 미실측이므로 같은 배치에서 실측 후 판단. ⚠️ **`areaSqm`·`standardPriceAtAcquisition` 자체를 축소하지 말 것**(§7-⛔). 완료 조건: 「지분 모드 × §164④/⑥/⑦」 anchor 신설(현재 0건) — ratio 1.0 회귀 대조군 포함.

**배치 7 — A06** (PHD 필요경비)
**양도비 축만** 착수한다(§100② 후문 명문). 비-PHD `:531-537`과 동형 안분 + swap 자격 `|| landTransferExpense > 0` 확장. **자본적지출 축은 ⏸**(§8-4). ⚠️ 원 suggestedFix ③(⑧ 게이트 확대) 채택 금지(§7-⛔).

**배치 8 — A13 → A11** (`phd-helper.ts` 공유)
**A13 먼저** — fallback 제거가 A11의 판정 대상(Sum_F)을 오염원 없는 상태로 만든다. A11은 **1차 조치로 탐지 + ⑧ 차단만** 넣고(B·D 입력 필드 부재), 판정에 `same-adjustment-period-std-price.ts`의 `clause_1`/`clause_2` 축을 반드시 함께 가져올 것(§80①2호 구간에서 현행이 정답이므로 무조건 준용하면 새 오류). 3파일 전수(`transfer-tax-pre-housing-disclosure.ts` · `phd-helper.ts` · `inheritance-house-valuation.ts`). 완료 조건: A13은 `reduction-phd-helper.test.ts:70-81`을 **차단 기대로 개정**(현행은 잘못된 동작 고정), A11은 §80①1호/2호 양 구간 anchor.

**배치 9 — A08** (공매·경락 층 맞추기)
술어는 `asset.hasSeperateLandAcquisitionDate` 단독(1호의 `isSplitLandExprEligibleAssetKind` 복사 금지 — 주택 split이 남는다). 완료 조건: 다필지·건물 split·주택 split 3케이스에서 토글 미노출 + ⑧ 미요구 anchor.

**배치 10 — A21 → A22 → A17** (가업상속 3파일 전부 공유)
**A21 먼저**(라벨 5곳 정정, 위험 0) → **A22**(echo 필드 추가 + 미리보기를 엔진 leaf `calcFamilyBusinessImputedAcquisitionPrice` 직접 import로 교체 — capex 누락과 부동소수 1원이 함께 사라진다) → **A17**(G-1 warning + 미리보기·rose 카드 조건부화 — A22가 미리보기를 leaf로 바꾼 뒤라야 조건부화 지점이 하나다). **배치 1(A04) 뒤에 둔다** — A04가 FB payload 게이트를 좁히면 A17의 도달 격자가 줄어 anchor 설계가 단순해진다. 완료 조건: 카드 렌더 테스트 신설(현재 0건) + capex>0에서 「표시 산식 재구성값 = 표시 금액」 자기일관 anchor.

**배치 11 — A18, A19** (표시 전용, 파일 안 겹침)
맨 뒤로 — 엔진 배치들이 채워 넣는 값을 전제로 화면을 맞춰야 두 번 안 고친다. A18은 취득원인을 `inheritance`로 좁힐 것(`isSec163_9Cause`는 증여 포함), A-8 fixture에서 `inheritanceMode` 제거. A19는 `inheritedAcquisitionStep`을 통째로 넘겨 **두 필드**를 echo(STEP 2.5 임대특례 동반).

**배치 12 — A16** (증여의제 ⑧)
별 도메인이라 전 배치와 병렬 가능. ⚠️ 「미입력만 차단」과 「명시 0도 차단」 중 택일 필요(§8-6) — 논거와 수정이 어긋나면 안 된다.

---

## 7. ⛔ 고치면 안 되는 것

생존했지만 **제안된 수정 방향이 위험하거나 정책 위반**인 것들. 다음 세션이 같은 제안을 반복하지 않도록 남긴다.

- **A05의 「2필드를 `splitAcquisitionShape`·④·⑭에 추가」** — **실측 no-op**. 컴패니언 `standardPricePerSqmAtAcquisition` 채널이 없어 `calcSplitGain`이 그 앞에서 throw/null이므로 세액이 1원도 안 움직인다(주입 전후 THROW 동일). 제안된 「컴패니언 split+수용 anchor」도 현행에서 세액 단언이 아니라 `INVALID_INPUT` throw로 실패한다 — 그대로 쓰면 특례가 아니라 예외를 고정하는 테스트가 된다. **perSqm 채널을 먼저 열거나, 반대로 ⑤⑧에서 컴패니언을 차단하는 것이 정답.**
- **A06의 suggestedFix ③ — `validateSplitDirectInputs`의 `:108` 게이트를 `usePreHousingDisclosure`까지 확대** — 「파트 칸에 각각 입력하세요」가 뜨는데 그 구성(취득일 동일 PHD)에서 파트 칸은 **렌더되지 않는다**(`CompanionAcqPurchaseBlock.tsx:221` `isSplit = isSplitable && !!hasSeperateLandAcquisitionDate` → `:683` `isSplit && !isMixedUse`). API도 `isSplitPayloadActive`가 false라 전송하지 않는다(`transfer-tax-api-split.ts:203-208`). ⇒ **사용자가 해소할 수 없는 게이트** = 이 저장소가 반복 경계해 온 「UI 통과 ↔ validate 차단 모순 / 입력 칸 없는 dead-end」에 정면 저촉(`transfer-tax-validate-split.ts:157-161`·`:47-52`의 명시 경고).
- **A07에서 `pre1990Land.areaSqm` 또는 `standardPriceAtAcquisition` 자체를 축소** — 그 값은 **환산 분자로도 쓰여** 분자만 반토막 나고, `computeEstimatedDeduction`(`tax-utils.ts:97-102`)이 소비 시점에 다시 ratio를 곱해 **이중 축소**된다. 지분 반영은 **주입 지점(`:237`)에서만**.
- **A10에서 「필지를 세율군으로 갈라 `groupTaxes`로 합산」** — ⛔ 재제안 금지 목록 「§104⑤ 세율 같으면 쪼갠다」와 형태가 인접하다. 본 건은 하나의 자산 내부 파트가 아니라 취득시기가 다른 별개 필지이고 결함 주장(순서 의존) 자체는 금지 목록과 무관하지만, **그 형태로 구현하지 말 것**.
- **A11에서 `calcSec164_8AdjustedDenominator`를 그대로 이식** — 그 헬퍼(`commercial-building-valuation.ts:114`)와 형제 호출부(`:281`)는 **시행규칙 §80①1호/2호 연도 축을 판정하지 않고** 동일성만 보고 무조건 가목 산식을 태운다. 2호 구간(최초공시일 > 취득연도 다음 연도 말일)에서는 **현행이 정답인데 새 오류를 만든다**. `same-adjustment-period-std-price.ts`의 `clause_1`/`clause_2` 판정을 축째로 가져올 것.
- **A13에서 「§164⑤ 준용값을 대입」** — §164⑦ 후단의 발동요건은 verbatim 「나목의 가액이 **없는 경우**」(국세청장 고시 부존재)이지 「사용자 미입력」이 아니다. PHD 시나리오에서 최초공시 시점 건물 기준시가는 실재한다(저장소 자체가 「양도 취득 ≤2000」만 §164⑤ 산정기준율 경로로 보낸다 — `building-standard-price.ts:8`). 미입력의 정답은 **⑧ 차단**.
- **A13을 「자동 안분 fallback 금지 정책 위반」으로 프레이밍** — `CLAUDE.md:314`가 PHD §164⑦를 **명시 예외로 지목**한다. legal-accuracy 논거만 쓸 것.
- **A16의 ⑫ 동기화(`gift-deemed-input.ts` union superRefine에 같은 검사)** — Zod는 wire만 보므로 **미입력과 명시 0을 구분할 수단이 원리적으로 없다**(둘 다 `transactionPrice: 0`). ⑫에서 막으려면 `z.number().positive()`(0 자체 금지)가 되어 ⑧의 `!form.bargPrice`(0 허용)와 3중 패턴이 어긋난다. 「⑧↔⑫ 동일 검사」는 **0 금지를 택할 때만** 가능하다.
- **A18의 게이트를 `isSec163_9Cause`로 교체** — 그 술어는 `inheritance || gift`인데 증여의 신고가액 소스는 `fixedAcquisitionPrice`(다른 필드)라 무의미 분기가 된다. 취득원인을 `inheritance`로 좁힐 것. 또한 이 수정은 **단건만 고친다**(다건은 `isSingle` 게이트 밖) — 「다건도 고쳐졌다」로 보고 금지.
- **A22에서 미리보기의 자체 산식 복제를 유지한 채 capex만 인자로 추가** — 부동소수 `1 - r` 오차가 남는다(엔진 `:164` 주석이 명시 금지한 패턴). 엔진 leaf 직접 import가 정답(skill `single-source-engine-helper`).
- **A04에서 엔진 STEP 0.42에 취득원인 게이트 추가** — `baseTransferInput`(`mock-rates.ts:170-192`)이 `acquisitionCause`를 설정하지 않고 `types/transfer.types.ts:427`이 「미지정 시 매매로 간주」라 FB 엔진 테스트 5건이 전부 skip된다. 수정은 ④(+⑤⑧)에서만.
- **A02에서 `isUnregistered: effectiveInput.isUnregistered`(`??` 없이)** — required boolean이라 필지별 true를 false로 덮어써 leaf가 이미 지원하는 필지별 축을 조용히 죽인다.

### 이번에 「의도된 설계」로 확인된 것 (결함 아님)

- **A03의 `:82` 조기반환 자체** — L-04 anchor가 「값이 없으면 payload를 **보내지 않는 것**이 정답 — 빈 payload는 `legacyFallback` 면적곱으로 597,000,000을 가른다」를 근거까지 적어 봉인했다(⛔ R-14 재제안 금지 명시). 수정은 **제거가 아니라 좁히기**여야 한다.
- **A15/A10의 ⑧ 다필지 날짜 순서 스킵** — `getAssetDateOrderError`(`transfer-tax-validate-asset.ts:636`)의 `!a.parcelMode` 가드는 의도된 설계이고 T-06 회귀 테스트가 고정한다.
- **A22의 「자본적지출을 §97의2④1호 base에 가산」** — 저장소가 계획서 Q7에서 「해석례 미확보 상태의 채택(안 B)」으로 문서화한 기존 결정. 이 리뷰의 대상이 아니다.
- **A05/A12의 다건(여러 「건」) 경로 차단** — `multi-transfer-tax-validate.ts:93·96`이 parcelMode·FB를 명시 차단하는 것은 「침묵 오산보다 명시 차단이 안전하다」는 확립 규약의 적용이다.

---

## 8. 기각 목록

> ⚠️ **데이터 한계**: 병합 단계에서 제거된 3건(1차 2 · 2차 1)은 식별자가 생존 집합에 남지 않아 개별 재기록이 불가능하다. 그래서 **아래 「주장 단위 기각」을 재제안 방지의 정본으로 둔다** — 반증 41회에서 실제로 무너진 하위 주장 전부다. `verdict: REFUTED` 항목은 0건이다(결함 자체는 전부 실재).

| # | 기각된 주장 | 기각 사유 |
|---|---|---|
| **A05-1** | 「컴패니언 §164⑨1호 2필드 누락으로 44,586,668원 과대」 | 그 수치는 **단건(primary) leaf 값**이고 primary 경로는 이미 정상 배선. 컴패니언 세액 영향 **0원**(HTTP 500 또는 split 미성립) |
| **A05-2** | 「2필드를 3계층에 추가하면 고쳐진다」 | 실측 no-op — 상류 `standardPricePerSqmAtAcquisition` 부재로 여전히 THROW |
| **A06-1** | 「PHD 분기**만** 자본적지출을 안 읽는다」 | 비-PHD split(`:500`)도 안 읽는다(실측 429,936,871 불변). 차이는 차단·대체 경로 유무 |
| **A06-2** | 「정본 fixture 22,240,467원 과대(28,710,143 → 6,469,676)」 | **재현 불가·산술적으로 불가능**. 그 fixture 가목은 토지 393,631,473·건물 173,787,714라 나목 1.2억이 이길 수 없다(파트칸 직접입력해도 28,710,143 불변) |
| **A06-3** | 「현실 시나리오 18,941,473원 과대」 | PHD 11필드 중 6개 미공개로 재현 불가. 동형 재구성 실측 9,662,169 / 10,134,945로 대체 |
| **A07-1** | 「지분율이 낮을수록 커진다(최대 1/지분율 배)」 | 절대액은 **중간 지분에서 최대**(ratio 0.5 → 10,078,073 / 0.1 → 7,973,476). 상대오차만 저지분에서 폭증 |
| **A07-2** | 「단건 1/2 지분 자산으로 도달」 | `blocked-by-validate` — `transfer-tax-validate-asset.ts:733-735`가 「단독으로 계산할 수 없습니다」로 차단. 도달 형태는 2건 이상 지분분할 |
| **A09-1** | 「88,979,000원 과대」를 상수처럼 기재 | **등급 입력 종속**(61,409,855 ~ 178,196,271 실측). 방향도 양방향 |
| **A09-2** | 「완전한 침묵」 | 서브엔진 경고가 결과 카드에 `text-destructive`로 렌더된다(`pre-1990-land-valuation.ts:254-259` → `Pre1990LandValuationDetailCard.tsx:45-49`). 차단은 아니고 숫자는 그대로 틀림 |
| **A10-1** | 「§104①·② 명문 미확인」 | §104② 「해당 자산의 취득일부터 양도일까지」 + §104⑤ 후단 「한 필지의 토지가 … 각각을 별개의 자산으로 보아」 **verbatim 확인**. 필지별 기산이 원칙임이 확정 |
| **A11-1** | 「Sum_A === Sum_F이면 항상 틀린다」 | 시행규칙 **§80①2호 구간에서는 현행이 정답**. 결함 구간은 §80①1호 한정 |
| **A11-2** | 「31,250,000원 과대」 | **100분의 100 한도가 걸린 상한값**. 전형 트리거(C 1~4개월)에서는 1,657,458 ~ 8,196,722원 |
| **A11-3** | 「1파일 결함」 | 3곳(본체 + `phd-helper.ts:104` + `inheritance-house-valuation.ts:229`) |
| **A12-1** | statute 「소득세법 시행령 §162①6호(환지 취득시기)」 | §162①6호는 **점유취득시효**. 환지는 **§162①9호**(§1-②) |
| **A12-2** | 「14,713,600원 과소」 | **단건 격리 계산값**(검산 61,190,000 × 1.1 = 67,309,000). 일괄양도 실측 2,173,600 ~ 15,488,000, **양방향** |
| **A13-1** | 「저장소 자동 안분 fallback 금지 정책 위반」 | `CLAUDE.md:314`가 PHD §164⑦를 **명시 예외**로 지목 |
| **A13-2** | 「경년감가로 낮아지므로 취득시 기준시가 과소 산정」 | `calcBuildingStandardPrice` 실측 인접연도 6쌍 중 **3쌍 상승**. 방향 양방향 |
| **A15-1** | 「메시지가 가리키는 취득일 칸이 화면에 없다」 | 칸은 있고 ⑧이 **필수로 요구한다**. 정본은 「올바르게 채워도 ④가 버려 400이 사라지지 않는다」 |
| **A16-1** | 「§35① 본문이 대가 0을 배제한다」 | 본문 verbatim에 배제 명문 없음. 근거는 **§4①1호 ↔ §4①2호 구분** |
| **A16-2** | 「고가양도(sale)도 영향」 | `applied=false`·0원으로 떨어져 잘못된 값이 안 나온다. **`purchase` 전용** |
| **A17-1** | 「흔적 없이 사라진다」 | 취득가액 자체는 첫 step 산식에 표시된다. 없는 것은 **사유** |
| **A18-1** | 「상속·증여 자산이 영향」 | 증여는 `fixedAcquisitionPrice` 경로라 죽은 게이트에 **도달조차 안 한다**. **상속 전용** |
| **A19-1** | 「세액은 양쪽 동일(350,000,000)」 | 자기 evidence와 모순. 두 경로 세액은 다르다(118,206,000 vs 100,102,999 — §166 3분할). 옳은 서술은 「**수정 전후** 세액 동일」 |
| **A19-2** | 「카드 1장」 | `inheritedHouseValuationDetail`도 함께 사라져 **2장** |
| **A21-1** | 「오기 3곳」 | **5곳**(카드 `:7`·`:119`, 엔진 `:106`·`:196`, credits `:13`) |
| **A22-1** | 「카드 재구성값 259,999,999 · 괴리 80,000,001」 | 카드는 계산하지 않고 `toFixed(2)`만 찍는다 — `((1-0.8)*100).toFixed(2) = "20.00"`으로 **정확**. 재구성값 260,000,000, 괴리 **80,000,000**. capex=0에서 카드는 완전 자기일관 |
| **A02-1** | 「미등기가 기본공제**에만** 반영」 | 세율 70%에도 반영된다(실측 `appliedRate: 0.7`). 미반영은 **장특·개산공제 2건** |
| **A03-1** | 「증여 경로도 도달」 | ⑧이 step 0에서 「자산: 증여 신고가액을 입력하세요.」로 **차단**. **상속 전용** |
| **A03-2** | 「반응 테스트 1건(L-04)」 | 전건 실행 시 **2건**(L-04 + N-03 `redev-163-9-priority-notice.anchor.test.tsx`). N-03은 UI 안내 노출까지 함께 움직인다 |
| **A03-3** | 「전부 과대」 | 토지 §164④는 `pre1990Enabled` ON에서 **과소**로 부호 반전 |
| **A04-1** | 「매매로 변경한 경우」 | gift·newConstruction도 동일. 게다가 **취득원인을 안 바꿔도** assetKind→general_building만으로 71,242,600원 |
| **A04-2** | 「화면 어디에도 없다(완전 침묵)」 | 결과 화면에 `FamilyBusinessImputedComparisonCard`가 **렌더된다**. 입력 단계만 침묵 |
| **A08-1** | 「building split만」 | **주택 split도 동일**(실측 차 0원). 술어를 `isSplitLandExprEligibleAssetKind`로 잡으면 남는다 |
| **A01-1** | 「pre1990 경로의 면적**만**」 | 일반 환산 partial도 동일한 3배 부풀림(실측 동일 154,704,000원). pre1990은 **우회 경로가 0개**라 더 나쁜 것 |

**Low 미검증 8건** — 반증을 거치지 않았다. 이 문서에 실지 않는다(§10).

---

## 9. ⏸ 사용자 판단이 필요한 것

1. **A10 — 필지가 여럿일 때 세율 기산일 규칙.** 「소득세법」 §104②(「해당 자산의 취득일부터 양도일까지」)·§104⑤(「둘 이상 양도하는 경우 … 큰 것」, 후단이 「한 필지의 토지」조차 별개 자산으로 본다)는 verbatim 확인됐으나, **「한 자산 내 여러 필지」에 §104⑤를 적용할지 / 순서 무관 단일 규칙(예: 최근 취득일)으로 갈지**의 명문이 없다. 현행은 §104⑤ 1호도 2호도 아닌 **제3의 값**이다. ⛔ 세율군 분할 방향은 금지 목록 인접(§7).
2. **A12 · A05 — 컴패니언 배관: 정식 지원 vs 명시 차단.** A12는 (A) `parcels` 3계층 배선 / (B) ⑤ `isFirst` 한정 + ⑧ 명시 차단. A05는 (i) `standardPricePerSqmAtAcquisition` 채널 신설 / (ii) ⑤⑧에서 컴패니언 §164⑨1호 블록 차단. **둘은 같은 파일군을 공유하므로 한 번에 결정해야 한다.** (A) 채택 시 컴패니언에도 `firstParcelAcqDate` 대입(A10)을 적용할지 명시 결정 필요 — 안 맞추면 같은 입력이 primary/companion 위치에 따라 다른 세액을 낸다.
3. **A11 — 주택 §164⑧ 준용의 B(전기 기준시가합)·D(조정월수) 입력 신설 여부.** 현재 폼 필드가 없어(`cbPrevStdPriceSum`·`cbStdPriceAdjustMonths`의 PHD 대응 필드 grep 0건) **탐지는 되지만 산정이 불가능**하다(`calcSec164_8AdjustedDenominator(A, undefined, 24, 12) = null`). 1차 탐지·차단으로 갈지, ①②③⑤⑧⑫ 신규 입력을 함께 열지.
4. **A06 — 자본적지출 축: 안분 vs 차단.** 저장소가 **두 규약으로 갈려 있다**: `transfer-tax-validate-split.ts:417-441`은 「§100② 후문은 자본적지출을 안분 대상으로 열거하지 않습니다 … 귀속 파트를 알아야 한다」로 **차단**하는데, 겸용 PHD 엔진(`calcMixedUseTransferTax`)은 F18 anchor(P7-1·P7-2)에서 자본적지출 9억을 588,432,521 / 311,567,479로 **실제 안분한다**. 어느 쪽이 정본인지 확정해야 A06-2의 수정 범위가 정해진다. 취득일 동일 PHD에서는 **파트 칸 자체가 없어** 차단만으로는 못 고친다(입력 경로 신설 선행).
5. **A13 — 미입력 시 ⑧ 차단으로 갈지, 「선택」 라벨을 유지하되 다른 대체 규칙을 둘지.** ⑤ `ReductionPhdInput.tsx:253·286`이 「선택」 + 「미입력 시 취득시와 동일 가정」을 **화면에서 광고**하고 있어 차단으로 바꾸면 UX 변경이 수반된다. 영향 범위는 감면 8개 조문.
6. **A16 — 명시 「0」도 막을지, 미입력만 막을지.** 실측상 두 입력은 ④ 이후 구분 불가(§4.3). (a) 법령 논거를 밀면 0도 차단 → ⑧·⑫ 양쪽 `positive()`, (b) 정책·일관성 논거로 한정하면 ⑧에서 원문자열 검사만. **논거와 수정이 어긋나면 안 된다.**
7. **A01 — 일반 환산(비-pre1990) partial 축을 이번에 함께 고칠지.** 실측 동일 154,704,000원이나 원인이 다르다(⑤ `CompanionAcqPurchaseBlock.tsx:604` 취득시 `area={props.acquisitionArea}` 바인딩). ⑤ 수정 / ⑧ 차단 / 현행 유지(총액 칸 수기 우회 가능) 중 택일.

---

## 10. 이 리뷰가 닿지 않은 곳

**「리뷰했다」가 「전부 봤다」가 아니라는 기록**으로 남긴다.

### 정독 범위 밖 파일

- **기준시가 산정 본체 무감사** — `lib/tax-engine/building-standard-price.ts`(497) + `building-standard-price-helpers.ts`(693). A13이 `calcBuildingStandardPrice`를 **호출해 방향 반증에 쓴 것이 전부**이고 산식 자체는 검증되지 않았다. `commercial-building-valuation.ts`(§164⑥ 본체)도 A11의 형제 참조로만 열렸다.
- **가산세·수정신고 축 0건** — `transfer-tax-amendment.ts`·`transfer-tax-penalty.ts`·`lib/calc/transfer-amendment-*.ts`. A19가 STEP 2.5 임대특례 조기반환을 스치면서 같은 클래스의 결함이 그 경계에 있음을 확인했으나 축 자체가 없었다.
- **재개발·입주권 본체** — `transfer-tax-redevelopment.ts`(731)·`redevelopment.ts`(800)·`redevelopment-split`·types(803) 약 2,300줄. A19가 `transfer-tax.ts:413`의 **호출 지점만** 봤다.
- **겸용주택 9파일** — `transfer-tax-mixed-use*.ts`. A06이 F18 anchor를 **선례로 인용했을 뿐** 겸용 PHD 엔진 자체는 열지 않았다. A08의 겸용 우회 가능성(4번째 경로)도 **엔진 실측 미수행 — 미확인**.
- **주식양도세 전체** — `lib/tax-engine/stock-transfer/` 및 그 lib/calc·route·결과뷰·E2E. 이 리뷰 범위 밖이나 §163⑨·§164 축과 무관하지 않다(§165④ 비상장 80% 하한).
- **일반건물(GB) 축** — A04가 `CompanionAcquisitionCauseSection.tsx:58-66` 조기반환을 통해 GB 경로 71,242,600원을 발견했으나 `general-building-*` 파일군 자체는 미정독. **A04의 GB 케이스는 `buildTransferEngineInput` 직접 호출로만 관측했고 route의 general_building 분기는 통과시키지 않았다 — 미확인.**

### 판정 안 한 인접 지점

- **partial에서 원시 `acquisitionArea`를 기준시가 산정에 그대로 쓰는 나머지 지점** — `burdened-gift-acq-std-price.ts:58` · `transfer-tax-api-body-blocks.ts:158`(PHD `landArea`) · `transfer-tax-api-burdened-gift.ts:188` · `transfer-tax-api-inheritance.ts:99-100`. **미확인**(A01의 반경일 수 있다).
- **A07의 상가 §164⑥ `commercialValuationStdPrice` 지분 스케일** — 코드 구조는 동일하나 **미실측**.
- **A01의 `hasPre1990ForSec164` 경로(상속·증여 토지 §163⑨1호 ② 산출)** — 부풀려진 ②가 max(①,②)에서 잘못 이길 가능성이 있으나 **미실측**.
- **A11의 등가 케이스 실제 발생 빈도** — §164③ 규칙상 구조적으로 발생함은 확인했으나 **빈도는 데이터로 측정하지 않았다**.
- **A02의 부수 리드** — `parcelSchema`에 `capitalExpenditure`·`transferExpense`가 없는데 `buildParcelsPayload:107-113`은 두 필드를 전송한다(§97② 단서 swap 입력의 침묵 stripping 소지). **런타임 검증 실패**(순환 import로 tsx 죽음) — 정적 근거만 있는 미확인 리드.
- **A05의 다건 경로 세액** — `multi-transfer-tax-api.ts:237`도 같은 헬퍼를 호출하고 다건은 최상위 `acquisitionArea`를 아예 안 보내는데 **미실측**.
- **A19의 다른 조기반환 분기** — STEP 0.65·2.5 외에 `finalizeTransferTax`를 우회하는 분기가 더 있는지 **전수하지 않았다**.

### 실행하지 않은 modality

- **E2E 0건** — Playwright를 아무도 기동하지 않았다. 도달성 판정은 전부 **코드 경로 추적 + 엔진/route 직접 호출**이고 브라우저에서 확인되지 않았다. 제안된 수정이 기존 spec을 깨는지 미측정.
- **전체 회귀 0건** — 최대 실행이 1,459파일 16,428건(A11 probe)이고, 대부분은 `__tests__/tax-engine/` + `__tests__/calc/` 부분 범위다. 공용 경로(`transfer-tax-api-helpers`·`bundled-split-helpers`·`inheritance-acquisition-helpers`)를 건드리는 수정이 상속·증여·겸용에 미치는 회귀는 미측정.
- **브라우저 수동 확인 0건 · PDF 실제 생성 0건** — A18(사이드바 「-」)·A21·A22(카드 라벨)의 화면 상태는 렌더 실행이 아니라 컴포넌트 소스 판독으로 판정했다.
- **법령 확인 modality 편차** — KoreanLaw MCP가 세션 중 반복 실패(502 origin_bad_gateway · timeout)해 확인 경로가 항목마다 다르다. **본문 미확인으로 남은 조문**: 「소득세법」 부칙(법률 제12169호) §12(A17) · 「상속세 및 증여세법」 §18의2①(A04) · 「소득세법 시행령」 §166(A19). **오프라인 아카이브(`~/taxlaw-offline/`)·법제처 HTML img alt로 대체 확인한 것**: §95②·§163⑥1호(A02) · §163⑨ 본문·1호·2호(A03) · §164⑦ 산식 괄호·시행규칙 §80①·②·③3호·⑤(A11).
  > 🔑 **§164⑥·⑦의 괄호 단서는 조문 API·NTS 아카이브로는 재현되지 않는다** — 산식이 이미지이고 단서가 그 안에 있다. 법제처 `lsInfoR.do`의 `<img alt="@@LATEX@@…">`를 봐야 한다. 이 사실 자체가 이 영역의 재발 원인일 수 있다.

### 검증 커버리지 공백 (파이프라인 자체의 결함)

**적대적 반증자 4명이 API 오류로 사망**했고, 워크플로 스크립트가 「검증자 사망」과 「반증됨」을 구분하지 않았다. 결과:

| 사망한 검증자 | 대상 | 실제 영향 |
|---|---|---|
| `verify:A20/repro` | **A20** (medium → 1렌즈 배정) | **판정 자체가 소실돼 조용히 탈락.** 메인 루프가 직접 검증해 복구(§4.7) |
| `verify:A07/repro` | A07 (high → 3렌즈) | 재현 렌즈 없이 legal·design 2표로 판정 — **실측 재현 검증이 1회 부족** |
| `verify:A10/legal` | A10 (high → 3렌즈) | 조문 렌즈 없이 repro·design 2표로 판정 — **§162①9호 인용은 별건으로 확인됨**(§1-②) |
| `verify2:B06/repro` | B06 (high) | 남은 렌즈로 판정 |

추가로 `verify2:B05/repro`는 **안전성 분류기가 타임아웃**해 그 에이전트의 작업이 자동 검토되지 않았다.

⇒ **A07·A10·B06은 설계된 3렌즈가 아니라 2렌즈로 판정된 것**이다. 세 건 모두 실측 세액이 붙어 있어 결함 자체는 서지만, **검증 강도가 다른 high 항목과 동등하지 않다**는 것을 착수 전에 감안할 것.
⇒ 스크립트 결함 자체의 교훈: **`votes.length === 0`을 「반증됨」이 아니라 「미판정」으로 분기**시켜야 한다. 미판정을 기각으로 처리하면 결함이 조용히 사라진다.

### 워크트리 오염(방법론 기록)

리뷰 도중 **여러 검증 세션이 같은 워크트리를 공유**해 소스가 실시간으로 바뀌었다. 관측된 사례: `transfer-tax-api-helpers.ts:241`에 A01의 제안 수정이 적용됐다 원복됨(15:05~15:15) · `transfer-tax-multi-parcel-branch.ts:70`에 A02 수정이 적용됐다 원복됨(15:04) · `transfer-tax-api.ts:144`에 A09 수정이 적용됨(15:59) · `inheritance-acquisition-helpers.ts:237`에 A07 뮤테이션 잔존 · `transfer-tax-split-gain.ts`에 A06 뮤테이션 잔존 · `lib/tax-engine/bargain-transfer.ts`·`lib/calc/gift-deemed-validate.ts` 미원복 상태 관측.
⇒ 여러 검증자가 **`git show HEAD:` 사본** 또는 `git archive HEAD`로 워크트리 밖에 기준선을 떠서 측정했다. **후속 작업자는 반드시 HEAD 기준으로 재확인할 것** — 워킹트리만 보고 「이미 고쳐져 있다」고 판단하면 오판이다(`feedback_external_concurrent_edit_stale_read`).
✅ **정리 완료(메인 루프)** — 리뷰 종료 시점에 남아 있던 미커밋 변경 2건(`lib/calc/transfer-tax-api-inheritance.ts`의 `MUT-VERIFY` 3줄 · `lib/tax-engine/bargain-transfer.ts`의 `MUTATION_APPLY_THRESHOLD` 블록)과 미추적 probe 2건(`__probe_a16.ts` · `__probe_a16b.ts`)을 원복·삭제했고, 전 워크트리에서 `MUT-VERIFY`/`MUTATION_` 마커 잔존 0건을 grep으로 확인했다. **메인 트리와 다른 워크트리 3개(`b5-reduction`·`nbl-review`·`stock-input-ui`)는 오염되지 않았다.**
⇒ 근본 원인은 워크플로가 87개 에이전트를 **같은 워크트리에서** 돌린 것이다(`isolation: 'worktree'` 미사용). 다음 리뷰에서 mutation probe를 쓸 축은 **에이전트별 격리 워크트리**를 주거나, probe 축을 단일 에이전트로 직렬화할 것.

### 별건으로 남긴 것 (이 리뷰의 결함 목록 밖)

- **§162①9호 인용 드리프트 정정** — `legal-codes/transfer.ts:218` · `calc-wizard-asset.ts:298` · `AssetSectionAcquisition.tsx:214` · `ParcelListInput.tsx:197` 4곳이 §162①**6호**(점유취득시효)로 적혀 있고 `RedevelopmentBlockCards.tsx:64` · `receive-only-display.ts:14` 2곳은 맞게 적혀 있다. 상수 주석의 「환지처분 확정일 다음날」도 법문은 「환지처분의 **공고가 있은 날**의 다음날」(§1-②).
- **컴패니언 `standardPricePerSqmAtAcquisition` 채널 부재로 인한 HTTP 500** — A05의 원인이자 A05와 다른 결함(§5.1).
- **일반 환산(비-pre1990) partial 취득시 기준시가 면적** — A01과 동일 증상, 다른 원인(§9-7).
- **죽은 필드 `inheritanceMode` 자체의 제거** — 쓰기 지점 0건, 읽기 3곳(A18).
- **`phd-helper.ts`가 스스로를 §164⑤라 인용** — §164⑤는 「최초고시 기준시가 × 국세청장 고시 기준율」로 산식이 다르다(A11).
- **`transfer-tax-validate-asset.ts:62` 주석** 「다필지 자산 검증 — **primary 자산이** 다필지 모드일 때」가 코드의 실제 적용 범위(전 자산 루프)와 어긋난다(A12).
- **`multi-transfer-tax-api.ts:30` 주석** 「단건과 동일 게이트·공용 헬퍼」가 실제와 어긋난다(A09).

---

## 11. 안전망 관점의 결론 — 이 리뷰의 가장 중요한 부수 발견

**mutation probe 18회 중 15회가 반응 0건이다.**

| finding | 뮤테이션 지점 | 실행 규모 | 반응 |
|---|---|---|---|
| A01 | `transfer-tax-api-helpers.ts:241` | 90/1,015 · 750/7,712 · 757/7,807 (3회 독립) | **0** |
| A02 | `transfer-tax-multi-parcel-branch.ts:70` | 782파일 8,378건 (2회) | **0** |
| A04 | `transfer-tax-api.ts:646` | 336/3,334 · 506/5,380 · 6,837 | **0** |
| A05 | `transfer-tax-api-helpers.ts:656-657` | 782파일 8,378건 | **0** |
| A06 | `transfer-tax-split-gain.ts:715·730·738` | 501/5,277 · 1,296/14,750 | **0** |
| A07 | `inheritance-acquisition-helpers.ts:237` | 1,136파일 13,053건 | **0** |
| A08 | `transfer-tax-validate-expropriation.ts` 가드 | 209/2,091 · 757/7,807 · 463/4,368 | **0** |
| A09 | `transfer-tax-api.ts:141` | 336/3,334 · 274/2,756 · 1,213/13,882 | **0** |
| A10 · A15 | `transfer-tax-api.ts:179` (`parcels[0]`→`parcels[last]`) | 782/8,378 · 206/2,073 · 354+325파일 | **0** |
| A11 | `transfer-tax-pre-housing-disclosure.ts:108` | 666/6,820 · **1,459파일 16,428건** | **0** |
| A12 | `AssetSectionAcquisition.tsx:210` (`isFirst` 한정) | 633파일 5,861건 | **0** |
| A16 | `gift-deemed-validate.ts:36` 가드 | 247파일 2,389건 | **0** |
| A21 | 카드 라벨 문자열 | 279파일 2,235건 | **0** |
| **A03** | `transfer-tax-api-inheritance.ts:82` | **6,729 suites 18,763건** | **2** (L-04 · N-03) |
| **A13** | `phd-helper.ts:98` | 456파일 4,923건 | **1** (현행 오동작 고정) |
| **A17** | `transfer-tax-family-business.ts:259` | FB 4파일 36건 | **1** (세액만) |
| A18 · A19 · A22 | 정적 전수 grep(교집합 0건) | — | **0** |

**반응한 3건조차 안전망이 아니다**:
- **A13의 1건**은 `reduction-phd-helper.test.ts:70-81` 「최초공시 건물 미입력 시 취득시와 동일 가정」으로, **비법정 동작을 못 박은 고정장치**다. `:79` 주석은 「Sum_A = Sum_F → 비율 1 → P_A_est = P_F」라 적어 **A11의 §164⑧ 준용 누락까지 같은 케이스에서 고정한다**.
- **A17의 1건**(G-1a)은 세액만 지키고 `familyBusinessDetail` 존재·warnings·steps는 단언하지 않는다.
- **A03의 2건**은 둘 다 `right_to_move_in` + §164 필드 전무 fixture라 「② 완비 + ① 미입력」 조합을 다루지 않는다. 그중 L-04는 **현행 동작을 「정답」이라 봉인하면서 ⛔재제안 금지까지 달아 두었다** — 수정 시 그 JSDoc 계약을 함께 개정하지 않으면 다음 리뷰가 되돌린다.

**반응 0건이 「테스트가 없다」가 아니라 「테스트가 이 축을 보지 않는다」인 사례**가 반복됐다:
- `multi-parcel-transfer.test.ts:141-145`가 필지-수준 미등기 개산공제 117,894를 단언하지만 **서브엔진을 직접 호출**해 ⑬을 안 태운다(A02).
- `exchange-land-integration.test.ts:150·160`이 취득일이 다른 필지를 쓰지만 **둘 다 2년 초과라 어느 쪽이 대표여도 누진세율**이라 순서 의존을 원리적으로 관측 불가(A10).
- `pre1990`을 쓰는 30파일 중 `areaScenario`/`transferArea`를 한 글자라도 포함한 파일이 0건이라 **반응 가능한 테스트가 존재할 수 없다**(A01) — 같은 구조가 A07(지분 축)·A11(등가합 축)·A12(컴패니언 축)에서 반복된다.
- `expropriation-auction-clause2.anchor.test.ts` 9건이 전부 단건/컴패니언 aggregate이고 `parcels`·`landAcquisitionDate` 조합 0건(A08).

⇒ **이 영역의 테스트는 leaf 단위 계산은 촘촘히 고정하고 배선(④⑫⑬⑭)과 축 조합(partial·지분·다필지·컴패니언·등가합)은 거의 보지 않는다.** 20건 중 8건이 `wiring`, 3건이 `reachability`인 것이 그 결과다. 수정 배치의 완료 조건에 anchor 신설을 넣는 것이 이 리뷰의 실질적 산출물이며, **anchor 없이 수정만 머지하면 같은 결함이 재발한다.**

---

_12축 병렬 정독 · 항목별 적대적 반증 41회(CONFIRMED 17 · PARTIALLY_CONFIRMED 24 · REFUTED 0) · 완전성 비평. 모든 세액은 워크트리에서 무수정 소스를 직접 import해 관측한 값이며 산식 추론값이 아니다. 재현되지 않은 수치·확인하지 못한 조문 본문은 각 항목에 「미실측」·「본문 미확인」으로 명시했다._
