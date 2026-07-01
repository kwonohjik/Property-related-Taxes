# 감면세액 산출근거 변수값 계산과정 표시 — 수정 계획서

> 대상: 양도소득세 결과뷰 "5단계 세액 산정 > 감면세액" 카드
> 목표: 감면세액이 **어떤 변수로 어떻게 산출됐는지** 전 과정을 변수값과 함께 화면에서 확인 가능하게 한다.
> 성격: **표시(UI) 전용 수정 — 엔진 계산 로직 변경 0**. 신규 세법 없음, echo 필드 이미 존재.

---

## 1. 문제 (현상)

스크린샷 기준, "감면세액" 카드는 다음 한 줄만 노출한다:

```
감면세액                                    16,607,063
  공익사업용 토지 수용(§77) 감면 16,607,063
  [조특법 §77↗]
```

`16,607,063`이 **산출세액 × 감면대상소득 / 과세표준** 중 어떤 값에서 나왔는지, 감면율·안분·기본공제 배정이 어떻게 됐는지 계산과정이 전혀 보이지 않는다.

## 2. 원인 (코드 근거 — 실측)

이 한 줄은 일반 감면 CalculationStep이다:

- `lib/tax-engine/transfer-tax-finalize.ts:222-224`
  ```ts
  label: "감면세액",
  formula: reductionType ? `${reductionType} 감면 ${reductionAmount.toLocaleString()}` : "감면 없음",
  amount: reductionAmount,
  ```
- `reductionType` 라벨 "공익사업용 토지 수용(§77)"은 `lib/tax-engine/transfer-tax-reductions-calc.ts:346`.

**핵심**: 엔진은 계산과정 변수를 이미 result에 담고 있다.

| 조문 | result 필드 | 담긴 계산과정 변수 |
|---|---|---|
| §77 공익수용 | `publicExpropriationDetail` (`PublicExpropriationReductionResult`) | `breakdown.{cashRate,bondRate,cashAmount,bondAmount,cashIncome,bondIncome,basicDeductionOnCash,basicDeductionOnBond,cashReduction,bondReduction,reducibleIncome}` + `rawReductionAmount`·`weightedRate`·`rateSetApplied`·`cappedByAnnualLimit`·`appliedAnnualLimit`·`useLegacyRates` |
| §77의2 대토보상 | `replacementLandDetail` (`ReplacementLandResult`) | `reductionRate`·`replacementRatio`·`replacementTaxableIncome`·`reducibleIncome`·`rawReductionAmount`·`cappedByAnnualLimit`·`appliedAnnualLimit` |
| §77의3 개발제한구역 | `gbDesignatedLandDetail` (`GbDesignatedLandResult`) | `reductionRate`·`appliedClause`·`reducibleIncome`·`rawReductionAmount`·`cappedByAnnualLimit`·`appliedAnnualLimit` |

산출세액·과세표준도 result 최상위에 있다: `transfer-result.types.ts:103 taxBase`, `:109 calculatedTax`.

**연결 누락이 진짜 원인**: 결과뷰가 감면 상세를 렌더하는 aggregator
`components/calc/results/transfer/ReductionDetailCards.tsx` (호출: `TransferTaxResultView.tsx:572`)는
자경농지·상속·신축·미분양·장기임대 카드는 렌더하지만 **§77·§77의2·§77의3 세 필드는 렌더 목록에 없다**
(`ReductionDetailCards.tsx:34-56` hasAny·`60-132` 렌더 블록 어디에도 부재).

**§77은 표시 컴포넌트가 이미 존재하나 고아(orphan) 상태**:
`components/calc/results/transfer/TransferReductionRows.tsx:70-126` `PublicExpropriationReductionRow`
— ①보상구성 ②안분 ③기본공제배정 ④자산별 감면금액 ⑤`감면세액 = 산출세액 × 감면대상소득 / 과세표준` 산식을
변수값으로 전부 렌더한다(`:117` capping 안내, `:120` `useLegacyRates` 안내). 그러나 프로젝트 전체 grep 결과
**호출부가 0건**(리팩터링 시 테이블에서 추출된 뒤 재연결 안 됨). 게다가 반환 루트가 `<tr><td>` 라
카드 컨텍스트(div)에 그대로 못 붙인다.

**스크린샷은 단건뷰(`TransferTaxResultView`) 경로**임을 확인:
스크린샷 라벨 "공익사업용 토지 수용(§77)"은 단건 엔진 라벨(`transfer-tax-reductions-calc.ts:346`)과 정확히 일치.
다건뷰(`MultiTransferTaxResultView`)의 라벨은 "공익사업 수용 (§77)"(`:123`)로 다르며, 다건뷰는
"감면세액 합산 재계산 내역" 카드(`:102-187` — `산출세액 × 감면대상소득/과세표준`·건별 배분표·§133 유형별 한도)를
**이미 별도로 렌더**한다(단, §77 특유의 현금/채권·기본공제 ①~④ breakdown은 다건뷰에도 없음). → 이번 작업의
1차 대상은 단건뷰 `ReductionDetailCards`. 다건뷰 대응은 §5 범위 결정 참조.

## 3. 해결 방침

**엔진 무변경. 결과뷰 aggregator에 §77 3형제 상세 카드를 연결**한다. 다른 감면(자경·신축 등)이 이미 쓰는
detail-card 패턴을 그대로 답습 → 일관성·회귀 위험 최소(Simplicity/Surgical).

대안 비교(택1):
- **(A) 조문별 상세 카드 추가 — 채택.** 기존 패턴과 동일, §77은 준비된 컴포넌트 재활용, 펼침/인쇄 토글·인용 링크 자연 적용.
- (B) 일반 감면 CalculationStep(`transfer-tax-finalize.ts:223`) 한 줄에 산식 인라인 — 반려. Step 레이아웃이
  다른 세목 step과 달라지고 긴 산식이 한 줄에 뭉개짐. 프로젝트 표준(상세 카드) 이탈.

## 4. 작업 항목

### 4-1. §77 공익수용 — 고아 컴포넌트를 카드로 전환 + 연결
- `TransferReductionRows.tsx`의 `PublicExpropriationReductionRow`(`<tr>` 반환)를
  **`PublicExpropriationDetailCard`** (div 카드)로 전환. 내부 ①~⑤ 산식 JSX(`:84-116`)는 그대로 유지.
  - props: `detail`, `calculatedTax`, `taxBase` (현행 시그니처 유지).
  - 신규: `rateSetApplied` 배지 노출("2025 개정율"·"현행 2018"·"종전(부칙 §53)") — result에 이미 있음
    (현행 컴포넌트는 `:120` `useLegacyRates` 여부만 표시 → `rateSetApplied` 3-state 배지로 보강).
  - **capping 시 최종액 표시 보강**: ⑤는 `rawReductionAmount`(한도 前)를 보여준다. 연간한도 초과 시
    step의 "감면세액"(한도 後 = `detail.reductionAmount`)과 달라지므로, capping 안내(`:117`) 아래
    "→ 적용 감면세액(한도 후) = `reductionAmount`" 라인 추가로 step 값과 자기일관 확보.
- `ReductionDetailCards.tsx`:
  - import 추가, `hasAny`에 `!!result.publicExpropriationDetail` 추가,
  - 렌더 블록에 `{result.publicExpropriationDetail && <PublicExpropriationDetailCard detail={...} calculatedTax={result.calculatedTax} taxBase={result.taxBase} />}`.

### 4-2. §77의2 대토보상 — 신규 카드
- 신규 `ReplacementLand77_2DetailCard.tsx`. 표시:
  - ① 대토비율 `replacementRatio` = 대토보상 / (현금+대토보상)
  - ② 대토보상분 소득 `replacementTaxableIncome` (기본공제 배정 후)
  - ③ 감면대상소득 `reducibleIncome` = 대토보상분 소득 × 40%
  - ④ `감면세액 = 산출세액 × 감면대상소득 / 과세표준` = `calculatedTax × reducibleIncome / taxBase = rawReductionAmount`
  - 한도 capping(`cappedByAnnualLimit`) 안내.
- `ReductionDetailCards`에 동일 방식 연결.

### 4-3. §77의3 개발제한구역 — 신규 카드
- 신규 `GbDesignatedLand77_3DetailCard.tsx`. 표시:
  - 적용 호·감면율 `appliedClause`/`reductionRate`(40%/25%)
  - 감면대상소득 `reducibleIncome` = (양도소득금액 − 기본공제) × 감면율
  - `감면세액 = 산출세액 × 감면대상소득 / 과세표준` = `rawReductionAmount`
  - 한도 capping 안내.
- `ReductionDetailCards`에 연결.

### 4-4. §99의3 신축주택 과세특례 — 고아 컴포넌트 카드화 (포함 권장)
- `New993ReductionRow`(`TransferReductionRows.tsx:14-67`)를 카드(div)로 전환. 적용/불가 사유·5년 안분
  `formulaSteps`·감면 양도소득금액·양도세 감면세액·농특세 렌더 유지.
- `ReductionDetailCards`에 `{result.new993Detail && <New993DetailCard detail={result.new993Detail} />}` 연결
  + `hasAny`에 `!!result.new993Detail` 추가.
- 표시 위치 주의: §99의3은 양도소득금액 차감 방식 → "감면세액" 카드 아닌 소득금액 상세로 위치 정합 확인.

### 4-5. 다건뷰 연결 (포함 확정)
- 4-1~4-4의 카드를 `MultiTransferTaxResultView` 자산별 영역에서도 재사용 렌더.
- 자산별 `TransferTaxResult` 접근 경로 확인 후 `detail`/`calculatedTax`/`taxBase`를 **자산 단위**로 전달.

### 4-6. 공통 규약 준수
- 금액 칸: `text-right font-mono tabular-nums whitespace-nowrap` (skill `amount-column-align`).
- 산식 표기: 한국어 풀어쓰기·변수 약어 금지(`floor()` 묵시) — 기존 §77 컴포넌트 스타일 유지.
- 인용 링크: `LawArticleModal`로 조특법 §77·§77의2·§77의3·§133② 배지.
- 인쇄 자동 펼침: `print-only-css-toggle` 패턴(다른 카드가 펼침 토글이면 동일 적용).
- 800줄 정책: 신규 카드는 각 파일 분리(§77 3형제 한 파일로 묶어도 무방하나 조문별 파일 권장).
- 참고 skill: `formula-display-builder`, `echo-field-pattern`(이미 echo 필드 존재 — 신규 echo 불요).

## 5. 변경 파일 (예상)

| 파일 | 변경 |
|---|---|
| `components/calc/results/transfer/TransferReductionRows.tsx` | `PublicExpropriationReductionRow`·`New993ReductionRow` → 카드 전환(`<tr>` 제거), §77 `rateSetApplied` 배지·capping 최종액 라인 |
| `components/calc/results/transfer/ReplacementLand77_2DetailCard.tsx` | 신규 (§77의2) |
| `components/calc/results/transfer/GbDesignatedLand77_3DetailCard.tsx` | 신규 (§77의3) |
| `components/calc/results/transfer/ReductionDetailCards.tsx` | import·`hasAny`·렌더 **4건** 연결(§77·§77의2·§77의3·§99의3) |
| `components/calc/results/MultiTransferTaxResultView.tsx` | 자산별 영역에 위 카드 재사용 렌더 (다건뷰 포함) |

엔진(`lib/tax-engine/**`)·API·validation·store: **무변경**. (14 동기화 지점 중 ⑦ 결과 카드 표시 only — 신규 입력/enum 없음.)

### 범위 결정 — 다건뷰(`MultiTransferTaxResultView`) — **포함 확정**
- 신규 3개 카드는 `result`(단일 `TransferTaxResult`) 기반 순수 표시 컴포넌트이므로,
  다건뷰의 자산별 카드 영역(`MultiTransferTaxResultView.tsx:487~` per-asset 렌더)에서도 **동일 컴포넌트 재사용**해
  자산별 §77·§77의2·§77의3 breakdown을 조건부 렌더한다.
- 다건뷰는 이미 §133 합산 재계산 카드(`:102-187`)가 있으나 현금/채권·기본공제 ①~④ 세부는 없어 상호 보완.
- **추가 검증 필요**: 다건뷰가 자산별 단일 `TransferTaxResult`에 접근하는 경로(`entry`/자산별 result 구조)를 확인해
  `detail`·`calculatedTax`·`taxBase`를 자산 단위로 정확히 전달(합산 값 오용 금지). §6에 다건 케이스 anchor 추가.

### §99의3 고아 컴포넌트(`New993ReductionRow`) — **포함 권장**
- 같은 `TransferReductionRows.tsx:14-67` `New993ReductionRow` — §99의3 신축주택 과세특례 계산과정
  (5년 안분 `formulaSteps`·감면 양도소득금액·양도세 감면세액·농특세)을 렌더하도록 만들어졌으나 **호출부 0건 고아**.
  `new993Detail`은 `ruralSurtax` 숫자·신고서 표에만 부분 소비, **상세 카드 미표시**(§77과 동일 유형 버그).
- 단, §99의3은 **양도소득금액 차감 방식**(감면세액 방식 아님) → 표시 위치는 소득금액 단계, 산식 형태 상이.
- 수정법 동일(`<tr>`→카드 + `ReductionDetailCards` 연결). 한계비용 낮음.
- **작업 항목**: 4-1과 동형으로 `New993ReductionRow`→카드 전환 + `ReductionDetailCards`에 `new993Detail` 연결.

## 6. 검증 (성공 기준)

1. **스크린샷 재현 케이스**: §77 공익수용, 감면세액 16,607,063 입력 → 결과뷰에 ①~⑤ 계산과정 카드 노출,
   ⑤가 `산출세액 × 감면대상소득 / 과세표준 = 16,607,063`로 자기일관.
   - `calculatedTax × reducibleIncome / taxBase`(각 result 값)이 `rawReductionAmount`와 원 단위 일치(자기일관 anchor).
2. **§77의2·§77의3·§99의3**: 각 적격 케이스에서 감면율·감면대상소득·산식 노출 확인
   (§99의3은 5년 안분 `formulaSteps`·감면 양도소득금액·농특세).
3. **다건뷰**: 다자산 §77 케이스에서 자산별 카드가 **자산 단위** `detail`/`calculatedTax`/`taxBase`로 렌더
   (합산 값 오용 없음) + 기존 §133 합산 재계산 카드와 공존.
4. **회귀 0**: 감면 없는 케이스·다른 감면(자경/신축) 케이스에서 새 카드 미노출(조건부 렌더 정상).
5. `npx tsc --noEmit` 0건 / `npx vitest run __tests__/tax-engine/transfer/` 통과(엔진 무변경이라 영향 없어야 함).
6. **브라우저(Playwright E2E)** 확인 — 단건·다건 §77 계산 후 상세 카드 DOM·⑤ 산식 텍스트 assert. (수동안내 대체 금지.)

## 7. 리스크·주의

- `PublicExpropriationReductionRow`가 `<tr>` 반환이므로 **카드 전환 시 레이아웃 확인 필수**
  (현재 테이블 밖 div 컨텍스트에서 렌더 예정 → 브라우저가 익명 table 래핑하던 깨짐 제거).
- §77 컴포넌트는 `useLegacyRates`(`:120`)만 표시 중 → `rateSetApplied`(2025 개정율) 배지 추가 시 라벨 정합 확인.
- 세 카드 모두 `calculatedTax`·`taxBase`를 result에서 그대로 전달 — 안분/capping 후 값이 아니라 **원 산식 분모·분자**임을 유지(엔진과 동일 변수).
- **capping 케이스 자기일관**: step "감면세액"(한도 後) ≠ ⑤ `rawReductionAmount`(한도 前)일 수 있음 → §4-1의 최종액 라인으로 반드시 화면상 연결(§6-1 anchor로 검증).
- 다건뷰 포함 여부는 §5 범위 결정 확정 후 진행(미확정 시 단건뷰만).

---

# 후속 보완 (Follow-up) — ④ 자산별 감면금액 "산출과정" 표시

> 배경: 1차 구현 결과 화면에서 ④ 자산별 감면금액이 **결과 숫자만**(예: `현금 12,728,523 (15%)`) 보이고,
> **어떻게 산출됐는지**(= (보상분 소득 − 기본공제) × 감면율) 산식이 생략됨. ①②③⑤는 산식을 보이는데 ④만 결과값.
> 목표: ④도 ⑤처럼 변수값 산식을 노출.

## F-1. 원인
`components/calc/results/transfer/TransferReductionRows.tsx` `PublicExpropriationDetailCard` ④ 블록이
`bd.cashReduction`·`bd.bondReduction` **결과값만** 렌더. 파생 산식 `(소득 − 기본공제) × 율` 미표시.
(§77의2 ③ `reducibleIncome`, §77의3 ② `reducibleIncome`도 동일 — 결과만 표시.)

## F-2. 값 가용성 (실측 — 엔진 변경 필요 여부)
| 조문 | ④/③/② 산식에 필요한 값 | 가용성 | 엔진 변경 |
|---|---|---|---|
| §77 | `cashIncome`·`basicDeductionOnCash`·`cashRate`·`cashReduction` (+채권) | breakdown에 **전부 존재** | **불요** |
| §77의2 | `replacementTaxableIncome`·`reductionRate`·`reducibleIncome` | detail에 **존재** | **불요** |
| §77의3 | base=(양도소득금액−기본공제)·`reductionRate`·`reducibleIncome` | reducibleIncome·rate만 존재, **base 미노출** | 단건=taxBase prop과 동일하나 **다건(집계)엔 taxBase 없음** → base echo 권장 |

## F-3. 작업
### F-3-1. §77 ④ 산출과정 (엔진 무변경)
`④ 자산별 감면금액 = (보상분 소득 − 기본공제) × 감면율`로 변경, 자산별 파생 노출:
```
현금 = (현금분 소득 87,356,825 − 기본공제 2,500,000) × 15% = 12,728,523
채권 = (채권분 소득 203,484,404 − 0) × 20% = 40,696,880
감면대상소득금액 = 현금 12,728,523 + 채권 40,696,880 = 53,425,403
```
- 모든 값 `bd.*`에서 직접(`cashIncome`·`basicDeductionOnCash`·`cashRate`·`cashReduction`·`bondIncome`·`basicDeductionOnBond`·`bondRate`·`bondReduction`·`reducibleIncome`).
- 기본공제 0인 자산(채권 등)은 `− 0` 대신 생략하거나 그대로 표기(일관성 위해 명시 권장).
- `aggregatedContext`(다건)에서도 동일 — 필요한 값 전부 breakdown에 있어 그대로 노출 가능.

### F-3-2. §77의2 ③ 산출과정 (엔진 무변경)
`③ 감면대상소득금액 = 대토보상분 소득 × 40%` 아래에 `replacementTaxableIncome × 40% = reducibleIncome` 산식 추가.

### F-3-3. §77의3 ② 산출과정
`② 감면대상소득금액 = (양도소득금액 − 기본공제) × 감면율` 아래 `base × rate% = reducibleIncome` 산식 추가.
- **단건**: base = 카드 `taxBase` prop (양도소득금액−기본공제 = 과세표준, 단일 자산이라 §77의3 taxableIncome과 동일). `taxBase × rate = reducibleIncome` 자기일관.
- **다건(aggregatedContext)**: `taxBase` 미전달 → base 산식 생략(label + reducibleIncome만) **또는**
  **`GbDesignatedLandResult.taxableIncome` echo 1필드 추가**(엔진 `gb-designated-land-reduction.ts:151` `taxableIncome` 이미 산출 → return에 노출)로 두 컨텍스트 모두 완전 표시. **권장: echo 추가**(단건도 coincidental taxBase 의존 제거).

## F-4. 변경 파일
| 파일 | 변경 |
|---|---|
| `TransferReductionRows.tsx` | §77 ④ 산식 파생 표시 |
| `ReplacementLand77_2DetailCard.tsx` | §77의2 ③ 산식 파생 표시 |
| `GbDesignatedLand77_3DetailCard.tsx` | §77의3 ② 산식 파생 표시 |
| (권장) `gb-designated-land-reduction.ts` + result 타입 | `taxableIncome` echo 1필드 (§77의3 다건 완전표시) |

## F-5. 검증
1. **자기일관 anchor(스크린샷 실측)**: §77 ④ 현금 `(87,356,825−2,500,000)×15% = 12,728,523`,
   채권 `203,484,404×20% = 40,696,880`, 합 `53,425,403`이 breakdown 값과 원 단위 일치.
2. `npx tsc --noEmit` 0 / 감면 유닛 무회귀.
3. **E2E**(`transfer-expropriation-77-2025.spec.ts`) 결과 카드 assert에 ④ 산식 텍스트(`× 15% =`·`감면대상소득금액 = 현금`) 추가.
