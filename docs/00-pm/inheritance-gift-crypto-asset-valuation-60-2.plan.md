# 상속·증여재산 가상화폐(가상자산) 평가 §60② 구현 계획서

> **PDCA Phase: Plan** | 작성일: 2026-06-27 | 대상: 상속세·증여세 공통
> 엔진 시니어(`inheritance-gift-tax-senior` + `property-valuation-senior`) + UI 시니어(`inheritance-gift-tax-ui-senior`) 병렬 수립 → 통합
> 워크트리: `.claude/worktrees/crypto-asset` · 브랜치 `feat/inheritance-gift-crypto-asset`

---

## 0. 한 줄 요약

상속·증여 재산에 **가상화폐(가상자산)** 카테고리를 신규 추가한다. 평가는 상증법 §65② → 상증령 §60②의 법정 방식(**평가기준일 전·후 각 1개월간 일평균가액의 평균액**)을 엔진이 산정하며, 예금 §63④(`computeSavingsAccrual` 파생값 주입형)·지상권 §61③ 선례와 동일한 **EstateItem 신규 카테고리 추가 패턴**으로 21개 동기화 지점을 채운다. 상속·증여 양 세목 공용(`GIFT_CATEGORIES` 포함).

---

## 1. 법령 검증 결과 (KoreanLaw MCP 실측 — 완료)

### 1.1 본법 §65② (상증법, MST 276123, 시행일 2026-01-02)

> 제65조(그 밖의 조건부 권리 등의 평가) ② 「가상자산 이용자 보호 등에 관한 법률」 제2조제1호에 따른 가상자산은 해당 자산의 거래규모 및 거래방식 등을 고려하여 **대통령령으로 정하는 방법**으로 평가한다.

⚠️ **정의 인용 드리프트(메모 only)**: 본법은 「가상자산 이용자 보호법 §2①」을 인용하나, 시행령 §60②은 「특정 금융거래정보법(특금법) §2③」을 인용. 가리키는 가상자산 실체는 동일 — 법령코드 상수 작성 시 둘 다 정확 인용(상수화, 리터럴 금지).

### 1.2 시행령 §60② (상증령, MST 283637, 시행일 2026-02-27)

> 제60조 ② 법 제65조제2항에 따른 가상자산(특금법 §2③의 가상자산)의 가액은 다음 각 호의 구분에 따라 평가한 가액으로 한다.
> 1. 신고가 수리된 가상자산사업자 중 **국세청장이 고시하는** 가상자산사업자의 사업장에서 거래되는 가상자산: **평가기준일 전·이후 각 1개월 동안에 해당 가상자산사업자가 공시하는 일평균가액의 평균액**
> 2. 그 밖의 가상자산: …사업장에서 공시하는 **거래일의 일평균가액 또는 종료시각에 공시된 시세가액 등 합리적으로 인정되는 가액**

### 1.3 적용시기 (부칙 1단서, 2020.12.22. 신설 — 교재 이미지1)

- **2022.1.1. 이후 상속개시·증여분부터** §60②(1·2호) 적용.
- 그 이전(2021.12.31. 이전): **평가기준일 현재 시가**(거래일 최종시세가액 등 합리적 가액).
- → 평가기준일(상속개시일/증여일)을 게이트로 분기 필수.

### 1.4 국세청 고시 사업장 (국세청고시 제2024-37호, 2024.12.28 — 교재 이미지2)

| 상호 | 서비스명 | 지정기간 |
|---|---|---|
| 두나무㈜ | 업비트 | 2022.1.1. ~ |
| ㈜빗썸코리아 | 빗썸 | 2022.1.1. ~ |
| ㈜코빗 | 코빗 | 2022.1.1. ~ |
| ㈜코인원 | 코인원 | 2022.1.1. ~ |
| ㈜스트리미 | 고팍스 | **2025.1.1. ~** |

→ 고시사업장 집합은 평가기준일에 따라 변동(고팍스는 2025.1.1. 이후만 1호 대상). 1호(고시사업장 거래) / 2호(그 밖) 구분이 필요.

---

## 2. 평가 산식 (교재 사례로 확정 — 2단계)

§60②1호(주력 케이스)의 산식은 **2단계 단순평균**:

```
[1단계] 거래일 d마다, 그 코인을 거래하는 고시사업장들의 일평균가액을 단순평균
        → 그 날의 "일평균가액의 평균액"  P_d
[2단계] 평가기준일 전·후 각 1개월 기간(기산일 ~ 종료일)의 P_d 들을 단순평균
        → 1코인당 평가단가  U
[3단계] U × 보유수량 = 가상자산 평가액
```

### 2.1 교재 anchor (이미지2·3)

평가기준일 2022.2.5 → 기산일 2022.1.5, 종료일 2022.3.4 (총 59일).

| 사례 | 거래 고시사업장 | 2022.1.5 P_d (1단계) | 최종 평가단가 U (2단계) |
|---|---|---|---|
| 문1 | 4사(업비트·빗썸·코빗·코인원) | (11,000+12,000+13,000+13,000)/4 = **12,250** ✅확정 | 15,500 (교재 "가정") |
| 문2 | 3사(업비트·빗썸·코인원) | (11,000+12,000+13,000)/3 = **12,000** ✅확정 | 15,000 (교재 "가정") |

### 2.2 ★ anchor 주의 (검증 기준 — 추정 금지 정책)

- 교재의 **최종 평가단가(15,500 / 15,000)는 "(가정)" 표기** → 실제 59일 시계열을 주지 않으므로 **최종값은 anchor로 쓸 수 없다**.
- **확정 anchor는 1단계 P_d 산정 로직**(2022.1.5 → 12,250 / 12,000)뿐. 엔진 1단계(거래일별 사업장 평균) 정확성을 이 값으로 검증.
- 2단계(기간 평균) anchor는 **자체 합성 시계열**(예: P_d 3건 [10,000·20,000·30,000] → 평균 20,000)로 자기일관 anchor 작성. "교재값과 일치 예상" 단정 금지.

---

## 3. ★ 핵심 설계 결정점 — 데이터 입력 방식 (사용자 확정 필요)

§60② 산식 재현에 필요한 일평균가액 시계열(최대 59일 × 다수 사업장)을 **어떻게 입력받을지**가 최대 설계 분기다. 3안 비교:

| 안 | 입력 | 엔진 역할 | 장점 | 단점 |
|---|---|---|---|---|
| **A. 평균단가 직접입력** | 사용자가 산정한 1코인당 평가단가 U + 보유수량 | U×수량만 | 최소 구현·즉시 | §60② 산식 미재현(검증·투명성 0). "자동산정" 취지와 배치 |
| **B. 일자별 평균액 시계열** | 거래일별 P_d 목록(행 추가) + 보유수량 | 2단계 평균 산정(②단계) | 산식 재현·교재 ②단계 검증·투명 | 입력 행 다수(최대 59행) |
| **C. 거래소 API 자동조회** | 코인·평가기준일만 | 전후 1개월 일평균가액 수집(①②단계) | 입력 0·완전자동 | 거래소 API 인프라 신규(키움은 주식 전용) — 범위 大 |

### 3.1 추천: **B를 기본 + A를 간편 모드로 (2-mode 토글)**

예금 `balance/auto/manual` 3중 모드, 비상장주식 V1/V2 모드선택 선례와 동일한 `RadioCardGroup` 모드 토글:

- **모드 A "평가단가 직접입력"(간편)**: 세무사가 별도 산정한 1코인당 단가 직접입력 × 수량. 실무 다수.
- **모드 B "일평균가액 시계열"(정밀·법정재현)**: 거래일별 일평균가액 행 입력 → 엔진이 단순평균(U) 산정 → ×수량. 결과 카드에 ②단계 산식 분해 표시(`echo-field-pattern`).

1단계(사업장별 평균 P_d)는 입력 폭증(59×N)을 피하기 위해 **모드 B 입력 단위를 "거래일별 일평균가액의 평균액 P_d"**로 한다(사용자가 그날 고시사업장 평균을 미리 산정해 1값 입력, 또는 단일 사업장). 사업장별 매트릭스 입력은 **SCOPE OUT**(§7).

- C(자동조회)는 **이번 범위 밖**. 후속 PR로 거래소 API 인프라(`lib/crypto/` 등) 신설 시 모드 C 추가.

> **이 절(3.1)의 모드 구성·입력 단위가 본 계획의 사용자 확정 1순위.** §9 질문 참조.

---

## 4. 현황 (코드 선례 — 예금 §63④ · 지상권 §61③, Explore 실측)

가상화폐 카테고리는 **전무**(0건). 아래 두 선례가 신규 카테고리 추가의 완성 템플릿:

| 구성요소 | 예금(financial) §63④ | 지상권(superficies) §61③ |
|---|---|---|
| 타입 mixin | `types/inheritance-gift-deposit.types.ts:11-56` | `types/inheritance-gift-estate.types.ts:237-257` |
| 평가 함수 | `evaluateFinancial` `property-valuation.ts:519-583` | `evaluateSuperficies` `property-valuation.ts:98-138` |
| 파생값 산정 | `computeSavingsAccrual` `property-valuation-deposit.ts:26-61` | (현가환산 inline) |
| 평가기준일 주입 | `injectSavingsAccrualIfAuto` `property-valuation-deposit.ts:70-90` | `injectSuperficiesRemainingYears` `estate-item-valuation.ts:43-70` |
| dispatch switch | `evaluateEstateItem` `property-valuation.ts:592-630` | 동左 |
| Zod 스키마 | `financialItemSchema` `estate-item-schema.ts:296-311` | `superficiesItemSchema` `estate-item-schema.ts:323-346` |
| UI VariantBody | `EstateBodyFinancial` `variants/EstateBodyFinancial.tsx` | `EstateBodySuperficies` `variants/EstateBodySuperficies.tsx` |
| 카테고리 enum | `AssetCategory` `types/inheritance-gift-estate.types.ts:40-52` (**현재 12종**) |
| 라벨/아이콘/증여노출 | `components/calc/inheritance/estate-card/estate-category-meta.ts:16-53` (`CATEGORY_LABELS`·`CATEGORY_ICONS`·`GIFT_CATEGORIES`) |
| 상속 노출 배열 | **`INHERITANCE_CATEGORIES`** `lib/calc/deemed-category-policy.ts:28-39` (deposit 포함) |
| UI 추정 합계 | `computeEffectiveValuation` `estate-item-valuation.ts:96-180` |
| **진짜 dispatch** | **`VariantBody` switch `components/calc/EstateItemEditor.tsx:49-68`** (pickBodyVariant 아님) |
| Zod 스키마 | **`lib/validators/estate-item-schema.ts`** (discriminatedUnion 12멤버 + superRefine) |

### 4.1 ★ 카테고리 타입 메커니즘 (실측 확정)

- `SupportedCategory = Exclude<AssetCategory, "listed_stock" | "unlisted_stock">` (`deemed-category-policy.ts:20-23`). → `"crypto_asset"`를 `AssetCategory`에 추가하면 **SupportedCategory에 자동 포함**.
- `CATEGORY_LABELS`·`CATEGORY_ICONS`는 `Record<SupportedCategory, string>` → crypto_asset **누락 시 컴파일 에러**(좋은 가드, TS가 잡음).
- 단 **배열 2종은 수동 추가 필수**(TS 미감지): `INHERITANCE_CATEGORIES`(상속 노출)·`GIFT_CATEGORIES`(증여 노출). 둘 다 빠지면 폼에 안 보임.
- `VariantBody` switch(`EstateItemEditor.tsx:49-68`)는 **default 없음 → case 누락 시 침묵 빈 화면**(지상권 메모리 `silent-blank`). `VariantSupportedCategory`(동 파일 내 정의)에도 crypto_asset 추가 + switch case 추가 필수.

---

## 5. 21개 동기화 지점 (Definition of Done)

### 엔진측 (14)

1. `AssetCategory`에 `"crypto_asset"` 추가 — `types/inheritance-gift-estate.types.ts:40-52`
2. EstateItem 필드 mixin 신규 — `types/inheritance-gift-crypto.types.ts`(신규): `cryptoValuationMode?: 'direct'|'timeseries'`(**`.optional()`** — 선례 `savingsValuationMode` 동일), `cryptoQuantity`(소수 8자리), `cryptoUnitPrice`(모드A), `cryptoDailyPrices`(모드B **`number[]` 배열** — Map 금지 `feedback_engine_result_map_json_loss`), `cryptoIsListedProvider`(1호/2호), `cryptoUnitPriceComputed`(파생 echo).
   - ★ **mode default는 display fallback 3중 일치**(`?? 'direct'`)로 — UI 표시·API 변환·validate **3곳 동일 fallback**(`mirror-pattern`). 선례 `EstateBodyFinancial.tsx:103-116`처럼 **mount 자동 set·useEffect 금지**, onChange 핸들러에서만 `set()`(`feedback_useeffect_store_mirror_forbidden`). 별도 factory 없음(신규 item은 카테고리만 가진 객체).
3. `evaluateCryptoAsset(item): PropertyValuationResult` 신규 — `property-valuation.ts` (method `crypto_statutory`/`market_value`, breakdown 단계분해)
4. `computeCryptoUnitPrice` 파생 산정 — `property-valuation-crypto.ts`(신규): 시계열 단순평균 `Math.floor(Σ/N)`(원단위 절사). ★ 평가액 곱셈은 **`Math.floor(unit*qty)` 직접**(`safeMultiply` 금지 — 초과 시 수량 소수 소실, engine.design §4.2)
5. `evaluateEstateItem` switch에 `case "crypto_asset"` — `property-valuation.ts:592-630`
6. `evaluateAllEstateItems` 자동 반영 — `property-valuation.ts:642-662`
7. `computeEffectiveValuation` 분기 추가 — `estate-item-valuation.ts:96-180` (모드별 fallback: computed ?? unitPrice×qty ?? marketValue ?? 0). ★ **엔진 산식 재사용**(`computeCryptoUnitPrice` import) — UI 재구현 금지(`feedback_ui_engine_dual_truth_avoidance`)
8. `injectCryptoUnitPriceIfTimeseries` 평가기준일/모드 주입 — `estate-item-valuation.ts`
9. baseItemSchema 상속 — `lib/validators/estate-item-schema.ts:18-164`
10. `cryptoAssetItemSchema` 신규 + superRefine(모드별 필수필드) — `lib/validators/estate-item-schema.ts`
11. `estateItemSchema` discriminatedUnion에 추가 — `lib/validators/estate-item-schema.ts:485-499`
12. superRefine 좌표 차단 목록에 `"crypto_asset"` — `lib/validators/estate-item-schema.ts:501-537`
13. `buildGiftTaxInput` 주입 파이프라인에 `.map(injectCryptoUnitPriceIfTimeseries)` — `gift-api.ts:50-55` (+ 상속 `buildInput` 동일)
14. PropertyValuationResult breakdown 산식 분해(①거래일별 평균액 표시·②기간평균·③×수량) — `property-valuation.ts`

### UI측 (7)

15. `EstateBodyCryptoAsset` 신규 — `components/calc/inheritance/estate-card/variants/EstateBodyCryptoAsset.tsx` (RadioCardGroup 모드 토글 + 모드B 시계열 행 추가 UI)
16. `VariantBody` switch에 `case "crypto_asset"` + `VariantSupportedCategory` 타입에 추가 — **`components/calc/EstateItemEditor.tsx:49-68`** (default 없음 → 누락 시 침묵 빈 화면. variants `index.ts` export·`barrel` 등록)
17. `CATEGORY_LABELS`에 `"가상화폐(가상자산)"` — `components/calc/inheritance/estate-card/estate-category-meta.ts`
18. `CATEGORY_ICONS`에 아이콘(🪙) — 동 파일
19. **`INHERITANCE_CATEGORIES`(상속) `lib/calc/deemed-category-policy.ts:28` + `GIFT_CATEGORIES`(증여) `estate-category-meta.ts:43`** 둘 다 `"crypto_asset"` 추가 — ★ TS 미감지, 누락 시 폼 미노출
20. 상속 검증 — `lib/calc/inheritance-validate.ts`
21. 증여 검증 — `gift-api.ts` validateStep

> ⑫⑬⑭ 계열(Zod 입력객체·body spread·Route 매핑)은 TS 미감지 — grep 자가점검 필수(메모리 `feedback_api_zod_schema_sync`). ⑲의 배열 2종도 동일(TS 미감지).

---

## 6. 적용시기·1호/2호 게이트 (UI 분기)

- **평가기준일 < 2022.1.1.**: §60② 미적용 → 모드B/평균산정 숨김, "평가기준일 현재 시가" 직접입력 안내(amber). (법 근거 없이 불리 적용 금지 — 미입력은 검증오류 차단, 자동 안분 fallback 금지)
- **1호 토글(`cryptoIsListedProvider`)**: ON=국세청 고시사업장 거래(전후 1개월 평균) / OFF=2호(거래일 일평균가액·종료시각 시세 직접입력). OFF도 tone 유지.
- 고팍스 2025.1.1. 변천은 **안내 문구**로만(고시사업장 목록 자동판정은 SCOPE OUT — §7).

---

## 7. 범위 밖 (SCOPE OUT — 명시)

- 사업장별 일평균가액 매트릭스 입력(59일 × N사업장). → 모드B는 거래일별 단일 P_d 입력.
- 거래소 API 자동조회(모드 C). → 후속 PR.
- 고시사업장 목록 평가기준일 기반 자동 판정(고팍스 변천 등). → 안내 문구만.
- DeFi·NFT·스테이킹 보상 등 특수 가상자산 평가. → §60②2호 직접입력으로 흡수.

---

## 8. anchor 테스트 계획 (Pre-Do 우선 작성 — 정책)

| anchor | 입력 | 기대값 | 근거 |
|---|---|---|---|
| `crypto-daily-avg-4providers` | 4사 [11,000·12,000·13,000·13,000] | 12,250 | 교재 문1 1단계 ✅확정 |
| `crypto-daily-avg-3providers` | 3사 [11,000·12,000·13,000] | 12,000 | 교재 문2 1단계 ✅확정 |
| `crypto-period-avg-selfconsistent` | P_d [10,000·20,000·30,000], qty 2 | 단가 20,000 · 평가액 40,000 | 자기일관(②단계) |
| `crypto-mode-direct` | 단가 50,000 · qty 1.5 | 75,000 | 모드A |
| `crypto-pre-2022-gate` | 평가기준일 2021-12-31 | 모드B 차단/시가입력 안내 | 부칙 1단서 |

→ Pre-Do 단계에서 위 anchor 먼저 작성·실행(실패 확보) 후 Do 진입(메모리 `feedback_pre_anchor_verification`).

---

## 9. 사용자 확정 사항 (Plan 승인 — 2026-06-27 확정)

1. **모드 구성** — ✅ **2-mode 토글**(모드A 직접입력 + 모드B 시계열 평균) 확정. `RadioCardGroup`.
2. **모드B 입력 단위** — ✅ **거래일별 "일평균가액의 평균액 P_d" 단일값** 확정. 사업장별 매트릭스는 SCOPE OUT(§7).
3. **세목 범위** — ✅ **상속·증여 동시 구현** 확정(평가로직 공용, `GIFT_CATEGORIES` 포함).
4. **보유수량 정밀도** — ✅ **소수점 8자리**(0.00000001, 1 satoshi) 확정. `DecimalInput`(자릿수 8).

---

## 10. PDCA 다음 단계

Plan 승인 → Design(엔진/UI 설계 병렬 + 케이스 매트릭스 + `plan-self-review` 13단계 자가검증) → Pre-Do anchor → Do(엔진 타입·헬퍼·anchor 선처리 → UI ⑮~㉑) → Check(`ui-engine-sync-checker` 21지점 + `gap-detector`) → E2E(`e2e/*.spec.ts`) → Report.
