# C-3 — §104⑤ 교차 합산 **UI 설계**

**상태**: **C-3a ✅완료**(엔진 echo — 세액 변경 0) · 🔴 C-3b·C-3c 미착수 ·
선행 [[cross-engine-104-5-real-estate-other-asset.plan.md]] C-1 ✅#1030 · C-2 ✅#1032·#1034
**성격**: 기능 신설. **엔진은 이미 있다**(`comparative-104-5-cross.ts`) — 없는 것은 **호출자**다.
**작성** 2026-08-03 — 상위 계획서가 「C-3은 UI 설계가 선행이다. 통합 마법사인지 교차 입력
확장인지부터 정해야 한다」로 남긴 결정을 내리기 위한 문서.

---

## 1. 실측 전제 — 상위 계획서가 쓰인 뒤 확인된 4가지

상위 계획서 §4의 「구조적 제약」은 **단건 마법사만 보고 쓴 것**이었다. 실측하니 전제가 바뀐다.

| # | 실측 | 근거 |
|---|---|---|
| **T-1** | **부동산은 다자산 마법사가 이미 있다** — §104⑤ 비교과세를 **화면에 이미 낸다** | `/calc/transfer-tax/multi` → `/api/calc/transfer/multi`(`lib/calc/multi-transfer-tax-api.ts:301`) → `calculateTransferTaxAggregate` · 결과 카드 `MultiTransferTaxSummaryCard.tsx:88`(「소득세법 §104⑤ 비교과세」·`comparedTaxApplied` 뱃지·`calculatedTaxByGeneral` 참고) |
| **T-2** | **주식은 단건만 UI 연결** — `aggregate`는 API에 있으나 호출자가 없다 | `app/api/calc/stock-transfer/route.ts:76`(`"items" in body` 분기) · 마법사는 단건 body를 보낸다 |
| **T-3** | **양방향 기본공제 수동 입력이 이미 있다** | 부동산 `annualBasicDeductionUsed`(`lib/stores/multi-transfer-tax-store.ts:42`) · 주식 `realEstateGroupBasicDeductionUsed`(`lib/stores/calc-wizard-stock-store.ts:212`) — **R-2 회피 수단이 이미 제품에 있다** |
| **T-4** | **이력이 입력·결과를 통째로 보관한다** | `CalculationRecord.inputData`(폼) + `resultData`(엔진 결과) — `lib/storage/types.ts:68·70` · `LocalTaxType`에 `"stock_transfer"` 있음(`:7`) · 인덱스 `[userId+taxType+createdAt]`(`db.ts:135`) · 다자산은 `taxType:"transfer"` + `inputData.__multiTransfer` 플래그 + `taxLawVersion = String(form.taxYear)`(`MultiTransferTaxCalculator.tsx:333-338`) |
| **T-5** | **C-1 고지가 이미 3곳에 있다** — 진입점으로 쓸 수 있다 | `TransferTaxResultView.tsx:514` · `MultiTransferTaxResultView.tsx:776` · `StockTransferTaxResultView.tsx:567` |

## 2. 🔴 「4칸」은 틀렸다 — C-2b를 포함하면 **6칸**이고, 그래서 수동 입력은 폐기한다

상위 계획서 G-3은 4칸(과세표준 합계 · 8호 과세표준 · 8호 세액 · 산출세액)이라 했다.
그것은 **1호 교차(C-2b)를 뺀** 수다. §104⑤을 완전히 내려면:

| 필요한 값 | 쓰이는 곳 |
|---|---|
| 반대편 **전체 과세표준 합계** | §104⑤**1호** = `f₅₅(Σ 전체)` |
| 반대편 **§104①1호 과세표준** · **1호 세액** | 2호의 1호 버킷 = `f₅₅(양쪽 1호 합)` · 나머지 호 세액 역산 |
| 반대편 **§104①8호(9호) 과세표준** · **8호 세액** | 2호의 8·9호 버킷 = `f₈₉(8호+9호)` · 나머지 호 세액 역산 |
| 반대편 **산출세액** | `otherClausesTax = 산출세액 − 1호 세액 − 8호 세액` |

⇒ **6칸**. G-3이 4칸에서 이미 「4개 숫자 **오입력** 위험」을 들어 1칸으로 축소했다.
6칸은 그 판단을 더 강하게 만든다 ⇒ **수동 입력 노선(다)은 폐기한다.**

📌 세액까지 받아야 하는 이유는 **floor 규약 차이**다 — 과세표준만 받아 재계산하면 부동산의
2-floor와 어긋나 `otherClausesTax`가 1원 틀어진다(상위 계획서 F-5·R-1).

## 3. 설계 옵션

| 안 | 내용 | 평가 |
|---|---|---|
| **가 (권고)** | **이력 기반 합산 화면** — 같은 과세연도의 부동산·주식 **이력을 골라** §104⑤을 낸다 | **숫자 입력 0칸** · 두 마법사 **무변경**(회귀 0) · T-4 인프라 재사용 · `inputData`가 있어 **재계산까지 가능**(R-2 해소 경로) |
| 나 | **통합 마법사 신설** — 한 화면에서 부동산 N + 기타자산 M 입력 | 가장 정확하나 **가장 크다**(부동산 다자산 706줄 + 주식 4스텝 재현) · 두 마법사와 **3중 진실**이 된다 |
| 다 | **6칸 수동 입력** — G-3의 4칸 확장 | ❌ §2로 폐기. 오입력 위험이 값어치를 넘는다 |
| 라 | 부동산 다자산에 **「기타자산」 행** 추가(과세표준 직접 입력) | 주식 평가·9호 판정(비사토 과다보유 50%)·기본공제 그룹을 **손으로** 넣어야 한다 — 정확성이 오히려 내려간다 |

### 왜 「가」인가

1. **G-3의 오입력 위험이 구조적으로 사라진다.** 사람이 옮겨 적는 숫자가 0이다.
2. **두 마법사를 건드리지 않는다.** C-2까지의 anchor·E2E가 그대로 유효하다.
3. **R-2(§103② 기본공제 중복)를 진짜로 해소할 수 있다.** 이력에 **`inputData`(폼)**가 있으므로
   기본공제 배분을 조정해 **두 엔진을 재호출**할 수 있다. 조정 레이어만으로는 불가능했던
   것(상위 F-3)이 이력 경로에서는 가능해진다.
4. **진입점이 이미 있다**(T-5) — C-1 고지 카드가 「합산이 필요하다」고 말하는 바로 그 자리에서
   「합산하기」로 이어지면 흐름이 끊기지 않는다.

### 「가」의 한계 (설계에 명시할 것)

- 사용자가 **두 계산을 저장**해야 한다 → 자동 저장이 기본이므로(결과 화면 마운트 1회) 실무상 부담은 낮다.
- **구 이력에는 echo 필드가 없다**(`clause1*`·`clause9*`는 이번에 추가) → 「이 계산은 다시
  실행해야 합니다」로 안내하고 마법사로 보낸다.
- 한 과세연도에 같은 세목 이력이 여럿이면 **어느 것이 신고 대상인지** 사용자가 골라야 한다.

## 4. 권고안 상세

### 4.1 진입점

C-1 고지 카드(`CrossEngine1045Notice`)에 **「합산 계산하기」 버튼**을 추가한다.
지금 그 카드는 「같은 과세기간에 반대편 자산을 함께 양도했다면 이 결과는 과소일 수 있다」까지만
말하고 **막다른 길**이다. 3곳(T-5) 모두 같은 버튼을 얻는다.

보조 진입점: `/history`에서 2건 선택 → 「§104⑤ 합산」.

### 4.2 화면 — `/calc/cross-104-5`

```
[1] 과세연도 선택        (이력에서 후보 연도만 노출)
[2] 부동산 계산 선택      (그 연도의 taxType="transfer" 이력 · 다자산/단건 뱃지)
[3] 기타자산 계산 선택    (그 연도의 taxType="stock_transfer" 이력 · 기타자산 그룹 있는 것만)
[4] ⚠️ 기본공제 중복 감지 → 「재계산하여 조정」 토글 (R-2)
[5] 결과 — §104⑤ 1호 vs 2호 비교표 + 채택 호 + 두 계산 대비 증감
```

- **[3]의 필터**가 중요하다 — 주식(§94①3호)은 §104⑤ 대상이 **아니다**(본문이 3호를 열거하지
  않는다). `basicDeductionGroup === "real_estate_and_other_asset"`인 종목이 있는 이력만 후보다.
- **[5]는 세액을 「대체」하지 않고 「신고 시 이 금액」으로 제시**한다 — 두 마법사가 낸 개별
  신고서 금액은 그대로 유효하고(예정신고 단위), §104⑤은 확정신고 단위이기 때문이다.

### 4.3 데이터 흐름

```
이력 2건 → resultData 어댑터 → { totalTaxBase, clause1*, clause8/9*, 산출세액 }
                                        ↓
                          computeCross1045(comparative-104-5-cross.ts)  ← 이미 있다
                                        ↓
                          1호 vs 2호 MAX + 두 계산 대비 증감
```

`resultData` 구조가 경로마다 다르므로(`{mode:"single", result}` · `AggregateTransferResult` ·
`StockTransferResult`) **어댑터 1개**가 필요하다 — `lib/calc/cross-104-5-adapter.ts`.
❌ 어댑터가 세액을 **계산하지 않는다**. 저장된 값을 읽어 `Cross1045Input` 모양으로 옮길 뿐이다.

### 4.4 R-2(기본공제 중복) 처리

부동산과 기타자산은 **같은 §103②1호 그룹**이라 250만원은 **합쳐서 1회**다. 두 계산이 각각
썼는지는 이력의 `basicDeduction`으로 **감지**할 수 있다.

| 감지 | 처리 |
|---|---|
| 합계 ≤ 2,500,000 | 그대로 진행 |
| 합계 > 2,500,000 | ⚠️ 경고 + **「재계산하여 조정」** — `inputData`에 `annualBasicDeductionUsed`/`realEstateGroupBasicDeductionUsed`를 넣어 두 API를 **다시 호출**한다(T-3 — 필드가 이미 있다) |

⇒ **R-2가 여기서 실제로 해소된다.** 상위 계획서가 「C-3에서만 해소된다」고 한 것이 이 경로다.

## 5. ✅ C-3a — 선행 엔진 작업 (완료)

| # | 작업 | 결과 |
|---|---|---|
| **2b-1** ✅ | 부동산 `aggregateByGroup`에 **`clause1BucketTaxBase`·`clause1BucketTax`** echo (키가 정확히 `"104-1-1"`인 버킷 · `else` 분기) | 8호와 대칭 · `AggregateTransferResult`까지 배선 |
| **2b-2** ✅ | 주식 `otherAssetComparativeTax`에 같은 두 필드 | 버킷을 이미 나눠 계산 중이었다(`stock-transfer-aggregate.ts:178`) |
| **2b-3** ✅ | **주식 단건 결과에 `clause1Bucket*`·`clause9*`를 무조건 echo** | 종전 `cross1045Adjustment`는 `crossClause8TaxBase` 입력 시에만 생겼다 — 이력 기반은 **입력 없이도** 필요하다 |
| ~~2b-4~~ | ~~부동산 **단건** 결과에도 echo~~ | ❌ **불필요**(§7 O-1 실측) — 단건 이력은 **다자산 API로 재호출**해 얻는다 |

### 🔴 착수 중 발견 — **`clause1Tax` 이름 충돌**

주식 `OtherAssetComparativeTax.clause1Tax`는 이미 **§104⑤1호**(과세표준 합계액 × §55①)였다.
§104**①**1호 버킷을 같은 이름으로 넣으면 **인터페이스와 지역변수가 동시에 충돌**하고, 무엇보다
조정 레이어가 **다른 조항의 「1호」를 같은 이름으로** 읽게 된다.
⇒ **양쪽 엔진 모두 `clause1Bucket*`** 으로 확정했다(8호·9호는 §104⑤에 그 번호가 없어 접미사 없음).

### 검증

- anchor **14건** 신규 — 부동산 8(`clause1-bucket-echo`) + 주식 6(`clause-bucket-echo`)
- ⭐ **되돌림 실측**: `classifyRateGroup`의 분양권 분기를 제거하면 **기존 가드 3건 + 신규 A-2가
  함께** 빨개진다(§5-C H-1이 예고한 그대로 — 방어선이 echo 정확성까지 지탱한다)
- ⭐ **A-4 완전 분해**: 부분 비사토에서 `clause1Bucket + clause8 = 그룹`이 과세표준·세액 **양쪽 모두**
  정확히 성립(123,000,000 + 369,000,000 = 492,000,000 · 27,610,000 + 158,560,000 = 186,170,000)
- ⭐ **S-6 불변식**: 주식 `clause1BucketTax + clause9Tax === clause2Tax`
- 전체 **13,152건 통과 · 회귀 0** · typecheck 0 · lint 0 errors(신규 warning 0)
- 📌 **typecheck가 두 번째 조립 경로를 잡았다** — 비과세 `buildExemptResult`(`stock-transfer-exempt-result.ts`)도
  필드를 채워야 했다. optional로 뒀다면 침묵 누락이 됐을 자리다.

## 6. Phase 분해

```
C-3a  엔진 echo (세액 변경 0) ✅ **완료**
  - 2b-1·2b-2·2b-3 (2b-4는 O-1 실측으로 불필요 확정)
  → verified: anchor 14건 + 전체 13,152건 회귀 0 + 되돌림 적색 확인

C-3b  어댑터 + 조정 레이어 배선 (UI 없음)
  - lib/calc/cross-104-5-adapter.ts — resultData 3형태 → Cross1045Input
  - computeCross1045 호출 · 감면 유무 판정
  → verify: 어댑터 단위 테스트(형태별) + 도출값 anchor

C-3c  화면 /calc/cross-104-5
  - 이력 선택 UI · R-2 감지·재계산 · 결과 비교표
  - C-1 고지 카드 3곳에 「합산 계산하기」
  → verify: 브라우저 수동 + E2E(이력 2건 시드 → 선택 → 결과)

C-3d  (선택) 주식 aggregate UI 연결
  - 기타자산 2건 이상을 한 신고로 내는 경로가 지금 없다(T-2)
  - C-3과 독립이지만 같은 구역이라 함께 볼 가치가 있다
```

## 7. 미해결 — 착수 전에 답해야 하는 것

| # | 질문 | 현재 판단 |
|---|---|---|
| **O-1** ✅ | **부동산 단건 결과에 호별 버킷을 낼 수 있는가?** | ❌ **못 낸다 — 실측 확인.** `TransferTaxResult`(`types/transfer-result.types.ts:41`)에는 **`candidateClauses`·`rateClause`가 없다**(`splitDetail`만 있다·`:294`). `appliedRate`로 호를 역추론할 수도 없다(「단기 40%와 누진 40% 구간이 `appliedRate`로 구분되지 않는다」 — `transfer-tax-rate-clause.ts:16-18`). ⇒ **2b-4 대신, 어댑터가 단건 이력을 만나면 `inputData`로 다자산 API를 재호출**한다. R-2 재계산과 **같은 메커니즘**이라 새 배관이 아니다. ⚠️ 단건 폼 → 다자산 body 변환의 존재 여부는 **C-3b 착수 시 확인**(`lib/calc/multi-transfer-tax-api.ts`는 `MultiTransferFormData`를 받는다) |
| **O-2** 🟠 | **감면 호별 두 값**(상위 F-4 — `ifClause1`/`ifClause2`) | 이력에는 「그 엔진이 낸 감면세액」 1개뿐이다. 재계산해도 「1호를 택했을 때」의 감면은 각 엔진이 내야 한다. ⇒ **감면이 있으면 조정 미적용 + 경고**(C-2 방침 승계). 완전 해소는 별건 |
| **O-3** 🟠 | 두 이력의 **과세연도 일치** 판정 키 | 부동산 다자산은 `taxLawVersion = String(taxYear)` · 주식은 `transferDate`의 연도 · 부동산 단건은 `transferDate` ⇒ 어댑터가 세 경로에서 연도를 뽑아야 한다 |
| **O-4** 🟡 | 결과를 **이력에 저장**할 것인가 | 저장하면 `taxType`에 항목 추가(Supabase CHECK 동반 — memory `feedback_taxtype_enum_supabase_migration`). **1차는 저장하지 않는다**(화면 표시만) |

## 8. 착수 판단

- ✅ **C-3a 완료** — 세액 변경 0. **O-1은 실측으로 닫혔다**(단건 echo 불필요 — 재호출로 해결).
  ⚠️ 착수 중 `clause1Tax` **이름 충돌**이 드러나 양쪽 모두 `clause1Bucket*`으로 확정했다(§5).
- **C-3b·C-3c는 「가」안 승인 후**다. 「나(통합 마법사)」를 택하면 C-3b의 어댑터는 버려지고
  C-3a만 살아남는다 ⇒ **C-3a를 먼저 하는 것이 어느 쪽으로 가도 손해가 없다.**
- **O-2(감면)** 는 착수를 막지 않는다 — C-2가 이미 「감면 있으면 미적용 + 경고」로 살고 있다.
- ⚠️ **C-3이 들어오면 C-2의 조정액 카드 문구가 바뀐다** — 1호 비교가 생기면 「8호만 있을 때
  조정액 0」인 경우가 드러난다(상위 §5-C H-2). 카드·anchor 동반 수정 대상.
