# 양도소득세 — 미결 항목 구현 계획서

**작성**: 2026-07-28 · **기준 master**: `0253fc30` · **선행 완료**: PR #845·#846·#847·#849·#851·#852·#854·#855·#856·#857

이번 세션에서 **확인은 됐으나 처리하지 않은** 항목을 실측 근거와 함께 정리한다.
각 항목은 "왜 지금 안 했는가"를 명시한다 — 미룬 이유가 사라지면 그때가 착수 시점이다.

---

## 0. 우선순위 요약

| # | 항목 | 사용자 영향 | 규모 | 블로커 | 권고 |
|---|---|---|---|---|---|
| ~~R1-a~~ | ~~평가·판정 10종~~ | — | — | — | **✅ 완료 (PR 후속)** |
| **R1-b** | `splitDetail`·`pre1990LandValuationDetail` | 산출근거 미노출 (세액 무관) | 중 | 컴포넌트 추출 선행 | 그다음 |
| **R2** | 초과부담부 가드 구조적 미발동 | 잘못된 입력 미차단 | 소 | 법령 해석 선행 | 그다음 |
| R3 | §66 담보채권액 지분 대응분 해석 | 없음 (회피 중) | 소 | 해석례 부재 | 조사만 |
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

## R2. 초과부담부 가드가 구조적으로 발동하지 않는다

### 현황

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

## R3. §66 담보채권액의 지분 대응분 해석 (조사)

공유물 전체에 설정된 근저당을 **지분** 증여 시 §66 담보채권액으로 얼마 보는지 —
명시 조문·해석례를 확보하지 못했다.

현재는 **사용자가 해당 지분의 인수분을 입력**하는 정의로 회피 중이며 동작 문제는 없다
(엔진이 ×지분율로 쪼개면 자동 안분 fallback 정책 위반이므로 이 정의가 정책상으로도 맞다).

**할 일**: 조세심판원·국세청 해석례 검색(`feedback_historical_statute_value_via_tribunal` 경로).
결과가 현재 정의와 다르면 UI hint와 validate를 조정한다.

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

1. ~~R1-a~~ ✅ — 평가·판정 10종 + `nblSurchargeExcluded` 복구(집계 Detail 25 → 35). 기존 anchor
   `expropriation-companion.anchor.test.ts`가 고정하던 표시 갭이 해소되어 단언을 뒤집었다.
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
