# 양도소득세 — 미결 항목 구현 계획서

**작성**: 2026-07-28 · **기준 master**: `0253fc30` · **선행 완료**: PR #845·#846·#847·#849·#851·#852·#854·#855·#856·#857

이번 세션에서 **확인은 됐으나 처리하지 않은** 항목을 실측 근거와 함께 정리한다.
각 항목은 "왜 지금 안 했는가"를 명시한다 — 미룬 이유가 사라지면 그때가 착수 시점이다.

---

## 0. 우선순위 요약

| # | 항목 | 사용자 영향 | 규모 | 블로커 | 권고 |
|---|---|---|---|---|---|
| ~~R1-a~~ | ~~평가·판정 10종~~ | — | — | — | **✅ 완료 (PR 후속)** |
| ~~R1-b~~ | ~~`splitDetail`·`pre1990LandValuationDetail`~~ | — | — | — | **✅ 완료** |
| ~~R2~~ | ~~초과부담부 가드 구조적 미발동~~ | — | — | — | **✅ 종결 — 가드 정상, 별건 §63 결함 수정** |
| ~~R3~~ | ~~§66 담보채권액 지분 대응분 해석~~ | — | — | — | **✅ 종결 — 현행 정의 유지** |
| R4 | 지분 부담부증여 정식 지원 | 기능 부재 (차단됨) | 대 | **제품 결정** | 보류 |
| R5 | 800줄 초과 파일 9개 | 없음 (유지보수) | 중 | 없음 | 기회주의적 |
| R6 | PR #737 집합건물 전유면적 | 기능 미배포 | — | **실 API 검증** | 환경 대기 |
| R7 | #591 양도세 감사 백로그 | 미상 (99건 미검증) | 대 | 항목별 재검증 | 별도 세션 |

---

## R1. 일괄(bundled) 결과 상세 카드 — 감면 외 12종

### 현황

PR #857로 **감면·취득가액 24종**을 복구했다(집계 Detail 4 → 25 — 계약 24종 + `penaltyDetail`, 순증 21). 같은 패턴으로 나머지를 넓힌다.

**미전달 16종 중 실제 대상은 12종**이다:

| 제외 | 사유 |
|---|---|
| `mixedUseDetail` · `redevelopmentDetail` · `generalBuildingValuationDetail` | 해당 자산이 **일괄에서 차단**됨(PR #854) → 도달 불가 |
| `amendmentDetail` | 집계 최상위에 **이미 존재**(`transfer-aggregate.types.ts:313`) |

**대상 12종** — 단건 결과뷰 참조 수(= UI 추출 난이도 지표):

| Detail | 단건뷰 참조 | 성격 |
|---|---|---|
| `commercialBuildingValuationDetail` | 2 | 상가 환산 §164⑥ (실측으로 소실 확인) |
| `nonBusinessLandJudgmentDetail` | 2 | 비사업용토지 판정 |
| `multiHouseSurchargeDetail` | 2 | 다주택 중과 |
| `expropriationValuationDetail` | 2 | 공익수용 §164⑨ |
| `housingExpropriationValuationDetail` | 2 | 주택 수용 평가 |
| `auctionValuationDetail` | 2 | 경매 평가 |
| `preHousingDisclosureDetail` | 2 | PHD §164⑤ |
| `rentalHousingExceptionDetail` | 2 | 임대주택 비과세 §155⑳ |
| `familyBusinessDetail` | 2 | 가업상속 §97의2④ |
| `carryoverTaxationDetail` | 3 | 이월과세 §97의2 |
| **`pre1990LandValuationDetail`** | **13** | 1990 토지등급 환산 — 인라인 다수 |
| **`splitDetail`** | **28** | 토지·건물 분리 — 인라인 다수 |

### 방안 — PR #857 패턴 재사용

1. `TransferValuationDetailSource` 계약 타입 신설(`transfer-result.types.ts`)
2. `PerPropertyBreakdown extends` 에 추가
3. `pickValuationDetails()` 단일 주입 지점(`transfer-tax-aggregate.ts`)
4. `BundledAllocationCard`의 `PropertyCard`에서 렌더

**2단 분할 권고**:

- **R1-a (10종, 참조 2~3)**: 각 Detail이 전용 카드 컴포넌트를 이미 가지므로 **거의 배관만**.
  `ReductionDetailCards`처럼 묶음 컴포넌트를 하나 더 만들어 단건·일괄이 공유한다.
- **R1-b (`splitDetail`·`pre1990LandValuationDetail`)**: 단건뷰에 인라인 렌더가 각각
  28·13곳이라 **컴포넌트 추출이 선행**돼야 한다. 추출 자체가 단건뷰 리팩터링이므로 별건.

### 왜 지금 안 했는가

사용자 요청이 "감면 상세부터"였다. 나머지는 **세액에 영향이 없고**(계산은 정상 — anchor로 고정)
배관이 이미 깔려 확장 비용이 낮아졌다.

### 검증 기준

- 계약 타입 ↔ `pickValuationDetails` **1:1 동기화 소스 가드**(PR #857과 동일 — 타입만 넓히고
  헬퍼를 빠뜨리면 값이 조용히 빈다)
- Detail별 행위 anchor 1건씩(라우트 하네스)
- E2E 1건(화면 노출)
- **복원 검증**: 헬퍼를 되돌리면 정확히 실패

---

## R2. 초과부담부 가드가 구조적으로 발동하지 않는다 — ✅ 조사 종결 (가드는 정상 · 별건 결함 1건 수정)

### 조사 결론 (2026-07-28, KoreanLaw 실측)

**가드는 수정 대상이 아니다.** 아래 조문 실측으로 "거의 안 걸리는 것이 정상"이 확정됐다.

| 조문 | 실측 내용 |
|---|---|
| 상증법 §66 | 담보 기준 평가액과 §60 평가액 중 **큰 금액** |
| 상증령 §63①3호 | 근저당 설정 재산 = "평가기준일 현재 당해 재산이 담보하는 **채권액**" |
| 상증령 §63② 전단 | 채권최고액이 채권액보다 **적을** 때만 채권최고액 |
| 상증령 §63② 후단 | 다수 채권(전세금·임차보증금 포함) 담보 시 **합계액** |

⇒ 담보평가 = 임대보증금 + `min(채권최고액, 담보채권액)` ≤ 인수채무액이고,
설정액 ≥ 채무액인 통상의 경우 **정확히 채무액과 같다**. §66의 max가 이를 하한으로 삼으므로
`C ≥ B`가 구조적으로 성립한다. 가드가 유효한 창은 §63② 전단(설정액 < 채무액)뿐이며,
anchor B11이 이미 그 구간을 고정하고 있다.

### 함께 발견된 실제 결함 — 구법 규칙 잔존 (수정 완료)

종전 구현은 `mortgageSetAmount ?? mortgageDebtAmount`로 **설정액을 무조건 우선**했다.
이는 **구** 상속세법 시행령 §5의2 3호(근저당 = **채권최고액**)의 규칙이다.
그 시기 조세심판례(국심1997부0752·국심1994서3198 등 1989~1997년)가 다수 검색되어
현행 근거로 오인하기 쉽다 — 심판례 [325252]가 구 시행령 문언을 명시 인용해 드리프트를 증명한다.

설정액은 통상 채권액의 120%이므로 구법 규칙 적용 시:
증여가액 C 과대 → §159 채무비율 B/C 과소 → 취득가액 과소 → **양도차익 과대(납세자 불리)**.
법령 근거 없는 불리 적용이므로 `feedback_no_unfavorable_application_without_legal_basis` 위반.

**수정**: `computeMortgageValuation()` 단일 산정 지점 신설(`burdened-gift-apportionment.ts`).
`computeSangjeungbeopValuation`·`assertBurdenedGiftEligible` 두 중복 산정부를 이 함수로 통일.
anchor `burdened-gift-63-secured-claim.anchor.test.ts` 9건 + 복원 검증(되돌리면 5건 실패).

### (기록) 조사 전 현황

`assertBurdenedGiftEligible`(`burdened-gift-apportionment.ts`)이 `채무액 > 증여가액`을 차단하는데,
`mortgageSetAmount` 미입력 시 `mortgageDebtAmount`로 fallback되어 **담보평가 = 채무액**이 된다.
→ `giftValuation = max(..., 담보평가)` ≥ 채무액이 **항상 성립**해 가드가 걸릴 수 없다.
설정액 < 실제 잔액인 경우에만 발동한다(anchor B11이 그 구간을 고정).

### 선행 과제 — 가드의 의도 확정

**법령상 이게 정상일 수 있다.** 상증법 §66은 저당권 설정 재산을 "담보채권액과 시가 중 **큰 금액**"으로
평가하므로, 채무액이 평가액의 **하한**이 되는 구조가 조문 취지와 맞을 여지가 있다.
그렇다면 가드는 "거의 안 걸리는 것이 정상"이고 **수정 대상이 아니다**.

→ **KoreanLaw로 §66·상증령 §63 위임 체인을 먼저 확인**한 뒤 판단한다.
코드부터 고치면 법령에 없는 제약을 만들 위험이 있다(`feedback_no_unfavorable_application_without_legal_basis`).

### 왜 지금 안 했는가

본 세션 이전부터 있던 성질이고, 의도 확인 없이 손대면 **잘못된 차단**을 만든다.
상가를 근거 없이 막지 않은 것과 같은 판단이다.

---

## R3. §66 담보채권액의 지분 대응분 해석 (조사) — ✅ 조사 종결 (현행 정의 유지)

### 확보한 해석례

**조심2013서0051** (2013.12.06, 조세심판원 재결 ID 102460) — 1/7 공유지분 취득분에 대한
임대보증금 채무의 부담부증여 여부. 주문이 명시적이다:

> "청구인이 실제로 임대보증금 채무를 인수하였는지 여부 등을 재조사하고, 그 결과에 따라
> **증여재산가액과 임대보증금 채무액 중에서 청구인 지분(1/7)가액을 산출하여**
> 각 증여세 과세표준과 세액을 경정한다."

보강: 국심1998서2062·국심1998서2071(둘 다 **취소**) — 전세보증금 채무액 중 일정부분을
과세관청이 임의로 부담부증여로 본 처분이 뒤집혔다. 국심1994중5434(기각)도 같은 축.

### 결론 — 현행 정의가 맞다

두 축이 함께 읽힌다: **① 실제 인수 여부가 우선**(상증법 §47③, 위 재결이 "실제로 인수하였는지
재조사"를 주문의 조건으로 세움) → **② 인수가 인정될 때 지분 상당액으로 산출**.

현행 구현은 **사용자가 해당 지분의 인수분을 직접 입력**하는 정의다. 이는 ①과 정확히 맞다 —
엔진이 채무를 ×지분율로 자동 분할하면 실제 인수 사실과 무관한 값을 만들고, 과세관청의 임의
안분이 뒤집힌 국심1998서2062의 구도를 코드가 재현하는 셈이다. 자동 안분 fallback 금지 정책과도
같은 방향이다(`feedback_no_silent_apportion_fallback`).

⇒ **UI hint·validate 변경 없음.** 조사 착수 조건이었던 "결과가 현재 정의와 다르면"이 성립하지 않는다.
R4(지분 부담부증여 UI 개방)를 진행하게 되면, hint 문구는 "지분 상당액"이 아니라
**"실제로 인수하는 채무액"**으로 쓸 것 — 위 재결의 우선순위를 반영해야 한다.

---

## R4. 지분 부담부증여 정식 지원 (제품 결정 필요)

### 현황

- **엔진은 준비됨** — PR #851이 §159의 A·C 지분 축소를 구현하고 23건 anchor로 고정
- **UI는 차단 중** — 단건 지분(`validate-asset.ts:638`) · fullFractional(`validate.ts:86`)

즉 **정확히 계산할 수 있는데 입구가 닫혀 있다.**

### 열려면 필요한 것

지분 분할 모드의 양도가액 모델은 `총계약가 × 지분율`인데, 부담부증여는 `양도가액 = 인수채무액`이라
**두 모델이 비양립**이다(`validate.ts:85` 주석이 이미 지적). 지분 분할 UI에서 §159 경로를
별도 분기로 태우는 재설계가 필요하다.

### 판단 근거

**수요 확인이 선행**돼야 한다. 공유지분을 부담부증여하는 실사용 빈도가 낮다면
현행 차단이 합리적이다(잘못 계산하느니 막는 것이 낫다).

---

## R5. 800줄 정책 초과 파일 9개

| 파일 | 줄수 |
|---|---|
| `lib/tax-engine/types/inheritance-gift-estate.types.ts` | 1,059 |
| `lib/tax-engine/property-valuation.ts` | 1,025 |
| `lib/tax-engine/legal-codes/transfer.ts` | 840 |
| `lib/tax-engine/general-building-valuation.ts` | 833 |
| `lib/tax-engine/inheritance-tax.ts` | 831 |
| `lib/tax-engine/deductions/inheritance-deductions.ts` | 815 |
| `lib/tax-engine/types/transfer-redevelopment.types.ts` | 803 |
| `lib/tax-engine/transfer-tax.ts` | 803 |
| `lib/api/transfer-tax-schema-sub.ts` | 801 |

**타입 전용 파일 2건**(`*-estate.types.ts` · `transfer-redevelopment.types.ts`)과
상수 파일(`legal-codes/transfer.ts`)은 CLAUDE.md 예외 조항 대상 — 분리 가치가 낮다.

**나머지 6건은 분리 대상**이나, 정책이 정한 방식은 **기회주의적 분리**다 —
기능 작업으로 그 파일을 이미 열었을 때 함께 처리한다. 분리 전용 PR은 고정비(리뷰·전체 테스트)만 든다.

---

## R6. PR #737 — 집합건물 세대 전유+공용 연면적 자동조회

rebase 완료, `MERGEABLE`, 전체 게이트 통과(1,057파일 11,901테스트).
**블로커는 코드가 아니라 실 API 응답 형식 검증**(`dongNm`/`hoNm` 정규화)이며 배포환경 없이 풀 수 없다.
검증되는 즉시 머지 가능.

---

## R7. #591 양도세 감사 백로그

브랜치 `review/transfer-tax` 보존. 26개 감사 테스트 파일 · **99건 실패 단언**.
전부 AssertionError(계산 로직)이며 런타임 크래시는 없다.

**재착수 지침**: 전부 실패한 7개 파일부터. 각 항목을 **현재 master 기준으로 법령 재검증**할 것 —
일부 기대값은 PR #845·#846의 절사 규약 정정 이후 **낡았다**. 주제별 소규모 PR로 분할한다.

---

## 권고 순서

1. ~~R1-a·R1-b~~ ✅ — 평가·판정 12종 + `nblSurchargeExcluded` 복구(집계 Detail 25 → 37).
   - R1-a: 기존 anchor `expropriation-companion.anchor.test.ts`가 고정하던 표시 갭이 해소되어 단언을 뒤집었다.
   - R1-b: 단건 뷰 인라인 블록을 `SplitGainDetailSection`·`Pre1990LandValuationDetailCard`로 추출
     (`TransferTaxResultView` 684 → 581줄). **`<PrintSection>` 래퍼는 단건 뷰가 계속 소유**해
     인쇄 선택 출력 기능을 건드리지 않았다. `formData.assets[0].assetKind` 직접 참조는
     `assetKind` prop으로 좁혔다 — 다자산에서 자산 0번 고정 참조는 틀린 문구를 낸다.
2. **R2 조사** → 결과에 따라 수정 여부 결정
3. **R3 조사** (R2와 함께 KoreanLaw 세션으로 묶으면 효율적)
4. R1-b · R5는 관련 기능 작업 시 기회주의적으로
5. R4는 수요 확인 후, R6는 환경 확보 후, R7은 별도 세션

---

## 이 계획서의 검증 원칙 (본 세션에서 얻은 것)

- **marker 부재 ≠ 결함** — 산출값(양도차익·필요경비)까지 비교해야 표시 갭과 계산 결함이 갈린다.
  상가에서 정확히 오진할 뻔했다.
- **단건 대조군이 녹색이어야 판별이 성립** — 양쪽 다 실패하면 fixture 미비지 결함 근거가 아니다.
- **"validate 통과"만으로 도달 가능이라 결론 내리지 말 것** — 엔진이 그 경로를 읽는지,
  UI가 그 조합을 제공하는지를 따로 확인한다.
- **차단 테스트만으로는 부족** — 차단이 풀리면 무슨 일이 생기는지를 대조 구조로 고정해야
  왜 막는지가 코드에 남는다.
