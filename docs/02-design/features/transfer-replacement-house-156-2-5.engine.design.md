# 대체주택 비과세 특례 (§156의2⑤) — 엔진 설계 (사례 43)

> 축 B (§89②·§156의2 비과세 특례) 첫 구현. 갭 매트릭스 N-4.
> 엔진: `lib/tax-engine/transfer-tax-exemption.ts` `checkExemption()` E-5 분기 신규.
> **redevelopment.ts(축 A 양도차익)와 무관** — 대체주택은 일반 주택 양도, 특별한 건 비과세 판정뿐.

---

## 1. 사례 43 동결 (지문·정답)

재개발氏: 마포구 단독주택(2001.4.9 취득·거주) → 재개발 편입·조합원 → 시행기간 중 인근 **대체주택**(북아현동) 취득·거주 → **대체주택 양도**.

| 항목 | 값 |
|---|---|
| 사업시행인가일 | 2015.05.16 |
| 신축주택 준공일 | 2023.04.17 |
| **대체주택** 취득일(가액·필경) | 2017.04.13 (2.5억 · 2천만) |
| **대체주택** 양도일(가액) | 2026.02.23 (3.2억) |
| 대체주택 거주 | 취득 후 계속 (2017.04.13~2026.02.23 ≈ 106개월) |

**정답: 대체주택 양도 = 전액 비과세 (3.2억 < 12억) → 산출세액 0.**

## 2. 법령 §156의2⑤ 요건 (KoreanLaw 검증 2026-07-03, 시행령 mst=286211)

> "국내에 1주택을 소유한 1세대가 그 주택에 대한 재개발·재건축·소규모재건축사업등의 **시행기간 동안 거주하기 위하여 다른 주택(대체주택)을 취득**한 경우로서 다음 요건을 모두 갖추어 대체주택을 양도하는 때에는 1세대1주택으로 보아 §154①을 적용한다. **보유기간 및 거주기간의 제한을 받지 않는다.**"

| # | 요건 | 사례 43 |
|---|---|---|
| ① | 사업시행인가일 **이후** 대체주택 취득 + **1년 이상 거주** | 2017.04.13 ≥ 2015.05.16 ✓ / 106개월 ✓ |
| ② | 신축주택 완성 후 **3년(2023.01.12 이후 양도분; 구 2년)내 세대전원 이사** | (전제) |
| ③ | 신축주택에서 **1년 이상 세대전원 거주** | (전제 — 사후관리) |
| ④ | 신축주택 **완성 전 또는 완성 후 3년내 대체주택 양도** | 완성 2023.04.17 +3년 = 2026.04.17 ≥ 양도 2026.02.23 ✓ |
| — | §154① **보유·거주 요건 면제** (2년 미적용) | — |
| 사후관리 | §156의2⑬ — ②③ 미충족 시 추징 (사유발생 과세연도 신고·납부) | 안내(경고) |

- **3년/2년 경계**: 양도일 ≥ 2023.01.12 → 3년. 사례 43(2026) → **3년**.
- **③ 전제 하 비과세**: 대체주택 양도일 현재 신축주택 1년 거주 미충족이어도 "1년 이상 거주 전제"로 비과세. 이후 미충족 시 §156의2⑬ 추징 → **자기선언 + 경고 카드**(사례 36 C-1 안전장치 패턴 차용).

## 3. 입력 variant (E-3 `temporaryTwoHouse` 미러)

`TransferTaxInput.replacementHouse?` 신규 (양도 대상 = 대체주택 → `acquisitionDate`·`transferDate`·`transferPrice`·`acquisitionPrice`·`expenses`는 대체주택 값):

```ts
replacementHouse?: {
  businessApprovalDate: Date;        // 사업시행계획인가일 (① 취득시점 하한)
  completionDate: Date;              // 신축주택 준공일 (②④ 기산)
  replacementResidenceMonths: number;// 대체주택 거주개월 (① ≥12)
  willResideNewHouse: boolean;       // 신축주택 1년거주 자기선언 (③ 전제, 사후관리)
};
```

- 대체주택 취득당시 1주택자 요건: `isOneHousehold=true` + 시나리오 전제(신축주택 1채 편입). 별도 flag 불요(취득당시 판정은 지문 전제).
- `householdHousingCount=2` (양도일: 신축주택 + 대체주택). E-3처럼 2주택이지만 특례로 1세대1주택 의제.

## 4. checkExemption E-5 알고리즘 (E-3 앞·동일 계층)

```
E-5: §156의2⑤ 대체주택 특례
 if (input.replacementHouse):
   rh = input.replacementHouse
   ① acqAfterApproval = acquisitionDate >= rh.businessApprovalDate
   ① replacementResided = floor(rh.replacementResidenceMonths/12) >= 1
   ④ deadlineYears = transferDate >= 2023-01-12 ? 3 : 2
      transferOk = transferDate < rh.completionDate            // 완성 전 양도
                   || transferDate <= addYears(rh.completionDate, deadlineYears)
   ③ willResideNew = rh.willResideNewHouse === true            // 전제(사후관리)
   if (① && ① && ④ && ③):
     price = burdenedGiftDenominator ?? totalPropertyTransferPrice ?? transferPrice
     if price <= rule.maxExemptPrice → { isExempt:true, exemptReason:"대체주택 특례 비과세 (§156의2⑤)" }
     else → { isPartialExempt:true, exemptReason:"대체주택 특례 고가주택 (§156의2⑤)" }   // 12억 안분 재사용
   // 미충족 → fall through (일반 과세)
```

- 위치: `checkExemption` 최상단 게이트(`isOneHousehold && propertyType==="housing"`) **직후**, E-3 앞.
- **보유·거주 요건 면제**: E-5는 `meetsOneHouseHoldingResidence` 게이트를 **거치지 않음**(§154① 제한 없음) — E-3과 동일하게 요건 통과 시 즉시 반환.
- `isPartialExempt=true` 경로는 기존 §160 12억 안분(transfer-tax.ts:459)을 그대로 탐 — 대체주택=일반 주택이라 신규 안분 불요.

## 5. 결과 / 사후관리

- `isExempt` → `buildExemptEarlyResult`(세액 0) + step "대체주택 특례 비과세 (§156의2⑤)".
- **사후관리 경고**(§156의2⑬): `warnings`에 "신축주택 3년내 이사·1년 거주 미충족 시 비과세 추징" 추가(자기선언 `willResideNewHouse` 전제 노출). 결과 타입 신규 필드 불요 — 기존 `warnings` 재사용.

## 6. 케이스 매트릭스 (anchor)

| ID | 케이스 | 입력 차이 | 기대 |
|---|---|---|---|
| **RH-1** | 사례 43 (전액 비과세) | 양도가 3.2억, 요건 전부 충족 | isExempt=true, 세액 0 ★ |
| RH-2 | 12억 초과 대체주택 | 양도가 15억 | isPartialExempt=true, 12억 안분 과세 |
| RH-3 | ④ 기한 초과 | 양도 2026.05(완성+3년 초과) | 비과세 X, 일반 과세 |
| RH-4 | ① 인가 전 취득 | 대체주택 취득 2015.01(인가 전) | 비과세 X |
| RH-5 | ③ 자기선언 false | willResideNewHouse=false | 비과세 X (또는 경고 후 과세) |
| RH-6 | 2년 경계(구법) | 양도 2022(완성+2년) | deadlineYears=2 적용 |

## 7. 14 동기화 지점

| 지점 | 대상 |
|---|---|
| ①폼 | `AssetForm.replacementHouse*` FLAT 필드 (사업시행인가일·준공일·대체주택거주월·신축거주선언) |
| ②initial·③normalize | factory 기본값 + normalize |
| ④API 변환 | `lib/calc/transfer-tax-api.ts` — FLAT → `replacementHouse` nested 조립 |
| ⑤UI 위젯 | 대체주택 특례 ToggleCard + 4입력 + 사후관리 경고 카드(rose) |
| ⑥사이드바 | 비과세 시 "대체주택 특례 비과세" 라벨 |
| ⑦결과 카드 | 비과세 사유 + 사후관리 경고 |
| ⑧validate | 요건 필드 필수(토글 ON 시) — 자동 fallback 금지 |
| ⑨⑩Zod | enum·refine (replacementHouse 객체) |
| ⑪ | acquisitionDate fallback N/A |
| **⑫Zod 입력객체** | `replacementHouse` Zod object 정의 |
| **⑬body spread** | `callTransferTaxAPI` body에 replacementHouse |
| **⑭Route 매핑** | route handler Date 변환(businessApprovalDate·completionDate) |

## 8. Pre-Do anchor (본 커밋)

`__tests__/tax-engine/transfer-tax/replacement-house-156-2-5.test.ts` — RH-1(사례 43):
`isExempt===true` && `calculatedTax===0`. **구현 전 FAIL** 확인(현행: 2주택 housing 양도 → 과세) → 갭 실증 후 Do 진입.

## 9. Do 범위 (확인 후 진행)

E-5 엔진 로직 → RH-1~6 anchor → 14지점(⑫⑬⑭ 포함) → validate 매트릭스 → UI(ToggleCard+경고) → E2E. **엔진 result 타입 신규 필드 0**(warnings 재사용) → 규모 "중". 12억 안분·비과세 조기반환은 기존 인프라 재사용.
