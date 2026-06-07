# 상속세 재해손실공제(상증법 §23) — 엔진 설계

> 계획서: `docs/00-pm/inheritance-casualty-loss-deduction.plan.md`
> UI 설계: `docs/02-design/features/inheritance-casualty-loss-deduction.ui.design.md`
> 작성일: 2026-06-07 / 13단계 자가검토 STEP 5

## Context

상속세 §23 재해손실공제는 **상속공제 7종 중 하나**(기초·그밖의인적·일괄·배우자·금융재산·**재해손실**·동거주택)인데 현재 **완전 미구현**이다. 신고기한(§67) 내에 재난으로 상속재산이 멸실·훼손되면 그 손실가액을 과세가액에서 공제해야 하나, 엔진 `rawTotal` 합산(`inheritance-deductions.ts:700`)에 §23 항목이 없다. `INH.DISASTER_DEDUCTION="상증법 §23"`(`legal-codes/inheritance-gift.ts:40`) 상수는 정의됐으나 **사용처 0건**, 파일 헤더 주석에는 나열돼 주석-구현 드리프트 상태다.

기존 `disasterLossDeduction` 필드는 §23이 아니라 **§24③ 분자 보정용**(=사전증여에 적용된 §54 *증여세* 재해손실공제)이다. 부표3 ㉘ "재해손실공제"(`deduction-besshi-data.ts:182`)도 현재 이 §54값을 잘못 echo 중이다 — §23으로 교체 필요(dual-truth 해소).

---

## ★ 케이스 인벤토리 (필수)

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|----------|-------------|-----------|------|
| 1 | 부분 보전 — 손실 5억·보험금 1.5억 → 공제 3.5억 | §23① 본문 + 단서, §20② | 교재 산식 (재해손실재산가액−보전가능금액) | `casualty-loss-deduction.test.ts` | ☐ TODO |
| 2 | 전액 보전 — 손실 2억·보전 2.5억 → 공제 0 | §23① 단서 (보전 가능분 제외) | 교재 단서 도출 | `casualty-loss-deduction.test.ts` | ☐ TODO |
| 3 | 보전 미입력 — 손실 3억·보전 0 → 공제 3억 | §23① 본문 | 교재 본문 | `casualty-loss-deduction.test.ts` | ☐ TODO |
| 4 | 신고기한 경과 — `isWithinFilingDeadline=false` → 공제 0 | §23① "§67 신고기한 이내" | 조문 요건 | `casualty-loss-deduction.test.ts` | ☐ TODO |
| 5 | §24 한도 통합 — 과세가액 8억(유증·사전증여 0 → ceiling=8억)·기존rawTotal 7.5억·재해 1억 → rawTotal 8.5억, limitedDeduction 8억(capping) | §24 본문(§23 포함) | §24 ceiling 산식 | `casualty-loss-deduction.test.ts` | ☐ TODO |
| 6 | 회귀 — `casualtyLoss=undefined` → 기존 결과 완전 동일 | (회귀) | 기존 anchor 불변 | `casualty-loss-deduction.test.ts` | ☐ TODO |
| 7 | 부표3 ㉘ 자기일관 — `d.casualtyLossDeduction` = 부표3 ㉘ 표시값 (≠ §54 `lim.disasterLossDeduction`) | §23 / dual-truth 해소 | 부표3 build 자기일관 | `deduction-besshi-data.test.ts` | ☐ TODO |
| 8 | 자동 기한판정 (선택) — `disasterDate`+`deathDate`(거주자) 6개월 **상한** 경계 + **하한**(재난이 상속개시 전 `disasterDate<deathDate` → 공제 0) | §67 + §20① + §23① "상속개시…이내" | date 양방향 경계 | `casualty-loss-deduction.test.ts` | ☐ (v1 보류 가능) |

**규칙**: 행≥1 충족. 행 7은 계획서 §4.5 dual-truth 해소 검증용. 행 8은 override-only v1 채택 시 보류 가능(상태 ☐ 유지).

---

## 법령 근거 (KoreanLaw MCP 검증 완료)

```
상증법 §23 (재해손실 공제) — INH.DISASTER_DEDUCTION
① 거주자 사망 상속개시 + §67 신고기한 이내 + 대통령령 재난으로 상속재산 멸실·훼손
   → 손실가액을 상속세 과세가액에서 공제.
   단서: 손실가액에 대한 보험금 수령 또는 구상권 행사로 보전받을 수 있으면 제외.
② 손실가액·손실내용·증명서류를 관할세무서장에게 제출.

상증령 §20 (재난의 범위 등)
① 재난 = 화재·붕괴·폭발·환경오염사고 및 자연재해 등으로 인한 재난.
② 공제 손실가액 = 재난으로 인하여 손실된 상속재산의 가액.
③ 재해손실공제신고서(별지 제6호) + 입증서류 제출.

상증통 23-20…1: 보전 가능 가액 미확정 시 재난 종류·발생원인·보험금 종류·구상권 분쟁 진상 참작 적정가액.

상증법 §24 (공제 적용 한도) — §18·§18의2·§18의3·§19~§23·§23의2 공제는 과세가액에서 1~3호 차감 한 금액 한도.
   → §23은 §24 한도 "대상 공제". rawTotal 합산 후 ceiling capping.
   3호: 사전증여 가산가액에서 §53·§53의2·§54 공제액 차감. (여기 §54 = 증여세 재해손실공제, §23과 별개)
```

상수: `INH.DISASTER_DEDUCTION`(`legal-codes/inheritance-gift.ts:40`) 재사용. 문자열 리터럴 금지.

---

## 엔진 input 타입

```ts
// types/inheritance-gift.types.ts — 신규
/** §23 재해손실공제 입력 (상증법 §23 + 상증령 §20) */
export interface CasualtyLossInput {
  /** 재해손실 상속재산 가액 (상증령 §20②) — 원 단위 정수 */
  lossValue: number;
  /** 보전 가능 금액 (보험금 + 구상권, §23① 단서) — 미입력 시 0 */
  compensatedValue?: number;
  /** 재난 종류 (상증령 §20① — 표시·신고서용, 산식 무영향) */
  disasterType?: "fire" | "collapse" | "explosion" | "environmental" | "natural" | "other";
  /** 재난 발생일 (YYYY-MM-DD) — §67 신고기한 검증용. string 비교, Date 변환 금지 */
  disasterDate?: string;
  /** §67 신고기한 내 발생 override (undefined: 자동/미정 → 기한 내 가정, true·false: 명시) */
  isWithinFilingDeadline?: boolean;
}

// InheritanceDeductionInput 에 추가 (기존 disasterLossDeduction §54용은 유지):
casualtyLoss?: CasualtyLossInput;
```

## 엔진 result 타입

```ts
// InheritanceDeductionResult 에 추가 (deductionDetail 경유로 부표3가 접근):
casualtyLossDeduction: number;                       // §23 공제액 (top-level number)
casualtyLossDeductionDetail?: CasualtyLossDeductionDetail;

// types/inheritance-deduction-detail.types.ts 에 추가 (289줄 → 여유):
export interface CasualtyLossDeductionDetail {
  lossValue: number;          // 재난 손실 상속재산 가액 (§20②)
  compensatedValue: number;   // 보전 가능 금액 (보험금+구상권)
  netDeduction: number;       // = max(0, lossValue − compensatedValue)
  isWithinFilingDeadline: boolean;
  disasterType?: CasualtyLossInput["disasterType"];
  disasterDate?: string;
}
```

> ⚠️ 결과는 **Map 금지 → Record/일반 객체 필드** (`feedback_engine_result_map_json_loss`).
> ⚠️ `casualtyLossDeduction`은 `InheritanceDeductionResult`의 **top-level number** — 부표3 `buildBuppyo3Data`가 `d.casualtyLossDeduction`로 읽음(`deduction-besshi-data.ts:166·182`).

---

## 계산 알고리즘 (단계별)

신규 파일 `lib/tax-engine/deductions/casualty-loss-deduction.ts` (800줄 정책 — `inheritance-deductions.ts` 793줄이라 인라인 불가):

```
calcCasualtyLossDeduction(casualtyLoss?, deathDate, decedentType?):
  1. casualtyLoss 미제공 → return { deduction: 0, lossValue:0, compensatedValue:0,
                                     netDeduction:0, isWithinFilingDeadline:true }
  2. 신고기한 내 발생 판정:
     a. isWithinFilingDeadline 명시 → 그 값 (기존 isFiledOnTime 패턴 일관)
     b. disasterDate+deathDate 제공 시 자동 (양방향 — §23 "상속개시…§67 신고기한 이내"):
        filingDeadline = endOfMonth(deathDate) + (거주자 6개월 / 비거주자 9개월)
        조건 = deathDate ≤ disasterDate ≤ filingDeadline   ← 하한(상속개시 후) + 상한 모두 검사
        (date-fns endOfMonth+addMonths 산정 후 YYYY-MM-DD string 비교 복귀)
        ※ decedentType 미제공 시 v1은 거주자(6개월) 기준 — 비거주자는 isWithinFilingDeadline override로 처리
     c. 둘 다 미제공 → true (기한 내 가정, 입력 강제는 validate ⑧ 담당)
  3. 기한 외 → return { deduction: 0, isWithinFilingDeadline:false, ... }
  4. deduction = Math.max(0, lossValue − (compensatedValue ?? 0))   // 정수, floor 불요
  5. return { deduction, lossValue, compensatedValue, netDeduction: deduction,
              isWithinFilingDeadline:true, disasterType, disasterDate }
```

`calcInheritanceDeductions()` 통합 (`inheritance-deductions.ts:700`):
```
const casualtyResult = calcCasualtyLossDeduction(input.casualtyLoss, baseDate /*, decedentType */);
const casualtyLossDeduction = casualtyResult.deduction;
const rawTotal = spouseDeduction + chosenBasicPersonal + financialDeduction
               + casualtyLossDeduction          // ← §23 신규 (§23의2 동거주택 앞 — 조문 순서)
               + cohabitationDeduction + farmingDeduction + familyBusinessDeduction;
```
→ `applyDeductionLimit(rawTotal, ...)`는 **무수정** (§24 ceiling capping 자동).
→ `appliedLaws`(`:772~782`)에 `INH.DISASTER_DEDUCTION` **조건부 추가**(`casualtyLossDeduction > 0`일 때만 — 미입력 케이스 법령 노출 방지).
→ result에 `casualtyLossDeduction` + `casualtyLossDeductionDetail` 주입.

부표3 교체 (`deduction-besshi-data.ts:182`): `disaster: lim?.disasterLossDeduction ?? 0` → `disaster: d.casualtyLossDeduction ?? 0`.

---

## Silent fallback / 자동 안분 후보 식별

- `compensatedValue` 미입력 → `?? 0` 허용 (보전금액 없음 = 손실 전액 공제, 법령 정합). **자동 안분 아님** — 사용자가 토글 ON+손실가액 입력한 명시 의사.
- `isWithinFilingDeadline` 미제공 → 기한 내 가정. 단 토글 ON 시 `disasterDate` 입력 강제는 **validation ⑧** 담당 (자동 채움 금지).
- `lossValue` 미입력 + 토글 ON → validation 차단 (미입력=검증오류, `feedback_no_silent_apportion_fallback`).
- ⑧ ↔ API fallback 동기화: API가 `max(0, loss−comp)` 적용하면 validate도 동일(공제 0 허용, 손실가액 0/음수만 차단).

---

## 테스트 약속

- 케이스 인벤토리 1~7행 anchor 필수 (행 8은 v1 보류 가능).
- 행 5: §24 한도 capping 통합 anchor — rawTotal 증가가 ceiling 초과 시 limitedDeduction 정확.
- 행 6: 회귀 — `casualtyLoss=undefined`로 기존 anchor 전부 불변 (`npm test` 전체).
- 행 7: 부표3 자기일관 — `buildBuppyo3Data(result).deduction.disaster === result.deductionDetail.casualtyLossDeduction` (§54값과 분리 확인).
- **Pre-Do anchor 우선**(`feedback_pre_anchor_verification`): 행 1을 Do 진입 전 작성·실행 → 실패 확보 → 설계 환류.

---

## UI 통합 위임

- UI 명세: `inheritance-casualty-loss-deduction.ui.design.md`.
- 14개 동기화 지점은 UI 시니어 책임. 엔진 시니어는 `CasualtyLossInput`/`InheritanceDeductionResult.casualtyLossDeduction`/`CasualtyLossDeductionDetail` 타입 + `calcCasualtyLossDeduction` + rawTotal 통합까지.
- **부표3 교체(`deduction-besshi-data.ts:182`) 담당**: 이 파일은 `lib/calc`(클라이언트 변환 레이어)이나 신규 엔진 result 필드(`d.casualtyLossDeduction`)에 직접 의존하므로 **엔진 시니어가 result 필드 확정 직후 1줄 교체**, UI 시니어가 부표3 자기일관 anchor(케이스 행 7)로 검증. (레이어 경계 모호 → 의존성 기준 엔진 시니어 우선)
- 엔진 선행 → UI 후행 (시퀀셜 위임).
