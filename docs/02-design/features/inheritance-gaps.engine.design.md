# 상속세 잔여 갭(5a·4) — 엔진 설계

> 계획서: `docs/00-pm/inheritance-gaps.plan.md`. 본 문서는 **엔진/데이터 변경분**만 다룬다.
> 갭3(영농 prefill)·갭5a UI는 `inheritance-gaps.ui.design.md`. 갭5b(§48)는 별도 시뮬레이터 — 스코프 외.
> 검증: 2026-06-19 실측(file:line)·KoreanLaw §16②·§48 본문(20260102 시행).

## Context

- **갭5a (§16② 공익법인 동족주식 한도 자동계산)**: `exemption-evaluator.ts:95-121`은 동족주식 초과분 과세를 지원하나, 사용자가 `excessStockAmount`를 **손계산해 입력**해야 한다. 미입력 시 else 분기(`:116`)가 `exemptAmount=claimedAmount`로 **전액 불산입→과소과세**. 한도(10/20/5%)를 엔진이 자동 계산해 초과분을 도출하면 과소과세를 차단한다. 병행: 상속 불산입 lawRef가 `§48①`(증여)로 차용된 드리프트를 §16①로 정정.
- **갭4 (물납 자산 자동분류)**: `derivePaymentInKindAssets`(`payment-in-kind.ts:174-212`)가 `eligibleSecuritiesValue`·`heirResidenceValue`를 EstateItem 플래그 부재로 0 하드코딩. 물납은 결정세액 미영향 투영 → numeric 0, **안내 충실도** 개선.

---

## ★ 케이스 인벤토리 (행≥1 — Do 진입 게이트)

### 갭5a — §16② 동족주식 한도

| # | 시나리오 | 법령 근거 | anchor (원단위) | 테스트 파일 | 상태 |
|---|---|---|---|---|---|
| 5a-1 | 일반 공익법인 10% 초과 | §16②2호 본문 | 발행10만·출연1.5만·기보유0·주당1만 → 한도1만주·초과5천주·`excess=50,000,000` | `public-interest-stock-limit.test.ts` | ☐ TODO |
| 5a-2 | 자선·장학·사회복지+의결권미행사 20% | §16②2호 가목 | 동일입력·가목 → 한도2만주 ≥ 출연1.5만 → `excess=0`(전액 불산입) | 〃 | ☐ TODO |
| 5a-3 | 상호출자제한 특수관계 5% | §16②2호 나목 | 동일입력·나목 → 한도5천주·초과1만주·`excess=100,000,000` | 〃 | ☐ TODO |
| 5a-4 | §48⑪ 요건 미충족 5% | §16②2호 다목 | 나목과 동일 비율 | 〃 | ☐ TODO |
| 5a-5 | 기보유분 차감 | §16②1호 가목 | 발행10만·일반10%·기보유3천·출연1만 → 한도(1만−3천)=7천·초과3천 | 〃 | ☐ TODO |
| 5a-6 | **미입력 과소과세 회귀** | §16②(역) | claimedAmount 1억·`relatedStockExceeded` 미설정 → **현재 `taxableOverflow=0`**(과소). 자동계산 후 50M | 〃 | ☐ TODO(Pre-Do) |
| 5a-7 | lawRef 정정 | §16① | 상속 출연 breakdown `lawRef="상증법 §16①"`(현 §48①) | 〃 | ☐ TODO |
| 5a-8 | §16③ 예외(Phase2) | §16③1·2·3호 | 요건 충족 시 초과해도 불산입 | (Phase2) | ☐ 보류 |
| 5a-9 | §16④ 사후산입(Phase2) | §16④1·2호 | 상속인 귀속·3년 미매각 사후 산입 | (Phase2) | ☐ 보류 |

### 갭4 — 물납 자산 자동분류

| # | 시나리오 | 법령 근거 | anchor | 테스트 파일 | 상태 |
|---|---|---|---|---|---|
| 4-1 | 상속인 거주주택 flag → heirResidence=평가액·realEstate 포함 | §74②6호 | `isHeirResidenceProperty=true` → `heirResidenceValue`=5억·`realEstateValue`=14억 | `inheritance/payment-in-kind.test.ts` | ✅ 통과 |
| 4-1b | 충당순서 순위3 거주주택 제외·순위6 분리 | §74②3·6호 | 순위3=9억(14−5)·순위6=5억 | 〃 | ✅ 통과 |
| 4-3 | §73④ 비상장 캡 — heirResidence 차감 | §73④ | cap(0)=1억 / cap(5억)=6억 | 〃 | ✅ 통과 |
| 4-5 | 요건1 분자·eligible·limit1 불변 (numeric 0) | §73①1호 | flag 유무 동일 (거주주택 realEstate 유지) | 〃 | ✅ 통과 |
| 4-2 | 국채·공채/처분제한상장 분류 | §74②1·2호 | **후속 분리** — §73①3호 "금융재산" 정의와 이중계상 검증 필요(국채=금융재산이자 유가증권) | (deferred) | ⏸ 보류 |

---

## 법령 근거 (KoreanLaw 본문 검증 2026-06-19)

```
상증법 §16② (상속 — 공익법인 동족주식 한도):
  출연 주식등 + §16②1호(가 기보유·나 출연자 타공익법인 출연·다 상속인 타공익법인 보유)
  > 발행주식총수등 × 비율 → 초과가액 상속세 과세가액 산입.
  비율(2호): 본문 10/100 · 가목(의결권 미행사+자선장학사회복지) 20/100
            · 나목(상호출자제한 특수관계) 5/100 · 다목(§48⑪ 미충족) 5/100.
상증법 §16① (상속 — 공익법인 출연재산 불산입 본칙): 신고기한까지 출연분 불산입.   ← lawRef 정정 대상
상증법 §48① (증여 — 공익법인이 출연받은 재산): 별개 납세자(공익법인 본인). 상속 룰에 차용 금지.
상증법 §74② (물납 충당순서 6단계): 1국채·공채 2처분제한상장 3국내부동산 4그밖유가증권 5비상장주식 6상속인거주주택.
```

상수 (`legal-codes/inheritance-gift.ts`):
- 신설 `INH_RELATED_STOCK_RATIO = { general: 0.1, charity_no_voting: 0.2, mutual_investment_restricted: 0.05, art48_11_unmet: 0.05 }`
- 신설 `INH_PUBLIC_CONTRIBUTION = "상증법 §16①"` (상속 불산입 본칙 — `PUBLIC_INTEREST="§48①"` 차용 정정)
- 기존 `INH_RELATED_STOCK="상증법 §16 ②"`(294) 재사용

---

## input / result 타입 변경

### 갭5a — `types/inheritance-exemption.types.ts` `ExemptionCheckedItem`(line 14) 확장

```ts
// 신규 (모두 optional — 기존 수동 fallback 보존, 3중 패턴)
publicInterestType?: "general" | "charity_no_voting" | "mutual_investment_restricted" | "art48_11_unmet";
relatedStockDonatedShares?: number;    // 출연 주식수
relatedStockTotalShares?: number;      // 발행주식총수등(자기주식 제외)
relatedStockPriorHeld?: number;        // §16②1호 합산 기보유분(사용자 입력, Phase1)
relatedStockValuePerShare?: number;    // 주당 평가액
// 기존 보존: excessStockAmount?(24)·relatedStockExceeded?(26) — 수동 입력 fallback
```

result: 기존 `ExemptionItemResult.{exemptAmount, taxableOverflow, breakdown, warnings}` 구조 재사용. 신규 echo 없음(Map 금지 — Record/원시값, memory `feedback_engine_result_map_json_loss`).

### 갭4 — `types/inheritance-gift.types.ts` `EstateItem`(line 81) 확장

```ts
paymentInKindSecurityType?: "government_bond" | "restricted_listed";  // 충당순위2
isHeirResidenceProperty?: boolean;                                    // 충당순위6 (부동산 한정)
```

`PaymentInKindAssets`는 변경 없음 — `derivePaymentInKindAssets`가 플래그를 읽어 채움.

---

## 알고리즘

### 갭5a — `computeRelatedStockExcess` (신규 `public-interest-stock-limit.ts`)

```
입력: { donatedShares, totalShares, priorHeld, type, valuePerShare }
ratio = INH_RELATED_STOCK_RATIO[type]
limitShares = Math.floor(totalShares * ratio) - priorHeld     // 한도 = 발행×비율 − 기보유
excessShares = Math.max(0, donatedShares - Math.max(0, limitShares))
excessStockAmount = applyRate-식 정수 곱: excessShares * valuePerShare   // floor, 음수가드
return excessStockAmount
```
- 정수 연산: `Math.floor(totalShares * ratio)` 후 차감. 금액은 `safeMultiply(excessShares, valuePerShare)`.
- evaluator(`:97`) 통합 — **precedence 명시**: ① `publicInterestType` + 주식수 입력 → `computeRelatedStockExcess` 자동값을 `taxableOverflow`로(`relatedStockExceeded`/`excessStockAmount` 무시). ② 자동 입력 부재 + `relatedStockExceeded && excessStockAmount>0` → 수동값 fallback(기존 동작 보존). ③ 둘 다 없으면 기존 else(전액 불산입)+미입력 경고. lawRef는 `INH_PUBLIC_CONTRIBUTION`(§16①)로 정정.

### 갭4 — `derivePaymentInKindAssets` 수정 (`payment-in-kind.ts:174`)

```
for item of estateItems:
  ...기존 분기...
  if item.paymentInKindSecurityType: eligibleSecuritiesValue += v                  // 0 하드코딩 제거
  if item.isHeirResidenceProperty && cat==="realEstate": heirResidenceValue += v   // 0 하드코딩 제거
```

✅ **(#12 RESOLVED — KoreanLaw §73·§74 본문 검증 2026-06-19, subset 태그 확정)**:
- §73①1호 요건1 분자는 "물납 충당 가능 부동산·유가증권"이고 §74①1호 "국내 소재 부동산"에 거주주택도 포함 → **거주주택은 요건1 분자에 포함**(realEstateValue 유지).
- 시행령 §74②3호 명문: "국내에 소재하는 부동산(**제6호의 재산을 제외한다**)" → 충당순서에서만 거주주택(6호)을 일반 부동산(3호)과 분리.
- **구현(subset 태그)**: `derivePaymentInKindAssets`에서 거주주택을 `realEstateValue`에 유지 + `heirResidenceValue` 별도 누적. fillOrder 순위3 = `realEstateValue − heirResidenceValue`, 순위6 = `heirResidenceValue`. 요건1 분자·`eligible`·`limit1` 불변(anchor 4-5 통과).

- **numeric 판정**: 상속세 **결정세액**은 불변(물납=투영, anchor 4-4). 단 **물납 카드의 `eligible` 판정·한도·충당순서 표시**는 분류 변경 시 변동 가능 — "결정세액 불변 ≠ 물납 안내 불변". 안내 충실도 개선이 목적.

---

## 동기화 지점 (8지점 — `tax-field-add` 스킬)

| # | 갭5a (ExemptionCheckedItem) | 갭4 (EstateItem) |
|---|---|---|
| ① 폼 | ExemptionChecklist 폼 상태 | EstateItemEditor 폼 |
| ② initial | undefined | undefined |
| ③ normalize | 마이그레이션 호환 | 〃 |
| ④ API | `lib/calc/inheritance-exemption-checklist.ts` | `inheritance-api.ts` 직렬화(물납 카드는 직접) |
| ⑤ UI | ExemptionChecklist 유형 라디오+주식수 | EstateItemEditor 토글 |
| ⑥ 사이드바 | N/A | N/A |
| ⑦ 결과 | breakdown(기존)+lawRef§16① | PaymentInKindCard(자동) |
| ⑧ validation | `inheritance-validate-exemption.ts` — 자동 fallback 금지 | 미설정=0+경고 |

---

## 회귀·리스크

- 갭5a: 기존 수동 `excessStockAmount` 경로 보존(3중 패턴) → 기존 테스트 무영향. §16③·④는 Phase2 분리.
- 갭4: 결정세액 불변 anchor(4-4)로 numeric 0 보증. 거주주택 realEstate 이중합산 가드 필수. **물납 카드 `eligible`/한도/충당순서 표시 변동은 회귀 아닌 의도된 충실도 개선** — 기존 물납 테스트가 거주주택을 realEstate로만 기대했다면 #12 결정에 따라 baseline 갱신.
- 800줄: 갭5a 헬퍼는 신규 파일 분리(evaluator 비대 방지).
