# 사전증여 Phase 2 — 영리법인 토글 제거·기납부 증여세 자동계산 (설계)

> Plan: `docs/00-pm/inheritance-prior-gift-donee-phase2.plan.md`
> 선행: `inheritance-prior-gift-donee-redesign`(Phase 1, `9d9990c`)
> 성격: 엔진 산식 변경 0 (Heir.isForProfit 타입 1개 + 순수 헬퍼 2종 + UI 재구성). 폼 키 의미 불변.

---

## Context

상속세 사전증여 입력에서 (1) 영리법인 토글·CorporateGiftFields 폐지 → Step1 영리법인 체크로 이전, (2) 수증인 드롭다운 통일(영리법인 포함), (3) 기납부 증여세 자동계산(단순 1건 독립), (4) §3의2② 산출세액 상당액 자동 대체.

---

## ★ 케이스 인벤토리 (필수)

| # | 수증자 | isForProfit | beneficiaryType | doneeRelation | giftAmount | 자동계산 | 라우팅 |
|---|---|---|---|---|---|---|---|
| P1 | 배우자 | — | heir | spouse | 760m | (760m−600m)×§56 = **22,000,000** | giftTaxPaid (이미지26) |
| P2 | 자녀(성인기준) | — | heir | lineal_descendant | 500m | (500m−50m)×§56 = 80,000,000 | giftTaxPaid |
| P3 | 영리법인 | true/미설정 | corporate | undefined | 700m | (700m−0)×§56 = **150,000,000** | corporateGiftComputedTax·giftTaxBase=undefined·giftTaxPaid=0 (이미지25) |
| P4 | 비영리법인 | false | legatee | undefined | 700m | (700m−0)×§56 = 150,000,000 | giftTaxPaid (§3의2② 미적용·후속 정밀화) |
| P5 | 수유자 | — | legatee | undefined | 300m | (300m−0)×§56 = 50,000,000 | giftTaxPaid |
| P6 | 미선택+관계수동 | — | 수동 | other_relative(수동) | 300m | (300m−10m)×§56 = 48,000,000 | giftTaxPaid (경로2) |
| P7 | 자동값 수정 | — | — | — | 760m | 자동 22m → 사용자 20m | 20m 고정(터치 후 덮어쓰기 금지) |
| P8 | 기타친족 | — | heir | other_relative | 100m | (100m−10m)×§56 = 9,000,000 | giftTaxPaid |

---

## 법령 근거

- §53 증여재산공제(`gift-deductions.ts:34` 한도 표) / §56 누진세율(`DEFAULT_INHERITANCE_GIFT_BRACKETS`)
- §55 단서 — 과세표준 50만원 미만 비과세
- §13①2호 — 비상속인(수유자·영리법인) 5년 합산 / §3의2②·집행기준 28-0-1 — 영리법인 면제
- §4의2③ — 영리법인 증여세 비과세(giftTaxPaid=0)

---

## 신규/변경 (엔진 산식 0)

### T1. `Heir.isForProfit?: boolean` (타입 확장)
- `inheritance-gift.types.ts` Heir에 추가. `undefined`=영리법인(기존 호환), `false`=비영리.
- Zod `heirSchema`(`property-valuation-input.ts:476`)에 `isForProfit: z.boolean().optional()` 추가(strip 방지, 14지점 ⑫).

### T2. `deriveBeneficiaryTypeFromHeir(h)` 영리/비영리 분기 (`prior-gift-donee-derive.ts` 수정)
```ts
if (h.relation === "corporate") return h.isForProfit === false ? "legatee" : "corporate";
if (!deriveIsHeirFromHeir(h)) return "legatee";
return "heir";
```
> ★ relation vs beneficiaryType 이원 구조: `isForProfit`는 relation 불변(corporate 유지) — beneficiaryType 도출만 분기. 27곳 `relation==="corporate"` 판정(협의분할·법정상속분·배부 제외) 무변경.

### T3. `autoComputePriorGiftTax(giftAmount, doneeRelation)` (신규 `lib/calc/prior-gift-auto-tax.ts`)
```ts
import { calcRelationDeduction } from "@/lib/tax-engine/deductions/gift-deductions";
import { calcInheritanceGiftTax } from "@/lib/tax-engine/inheritance-gift-common";

export function autoComputePriorGiftTax(giftAmount, doneeRelation): number {
  if (giftAmount <= 0) return 0;
  const deduction = doneeRelation
    ? calcRelationDeduction({ donorRelation: doneeRelation, priorUsedDeduction: 0 }, giftAmount).relationDeduction
    : 0;
  const taxBase = Math.max(0, giftAmount - deduction);
  if (taxBase < 500_000) return 0;        // §55 단서
  return calcInheritanceGiftTax(taxBase);  // brackets 기본값 DEFAULT_INHERITANCE_GIFT_BRACKETS (명시 불필요 — C1)
}
```
- 순수 함수. lib/calc → lib/tax-engine 정방향 의존(Phase 1 패턴 동일).
- ✅ **실증 완료**(throwaway probe): P1 22,000,000 / P3 150,000,000 / P2 80,000,000 / P5 50,000,000 / P8 9,000,000 — 케이스 인벤토리 전수 일치.
- ✅ `DEFAULT_INHERITANCE_GIFT_BRACKETS`(`inheritance-gift-common.ts:29`) export 확인. `calcInheritanceGiftTax(taxBase)` 기본값 사용.

---

## 계산 알고리즘 (UI onChange 흐름)

> ★ `userTouchedTax`(카드-local useRef) 플래그 1개를 **자연인 giftTaxPaid·영리법인 corporateGiftComputedTax 공통** 관리(D1 정정).
> 두 값은 같은 "세액 입력란"의 두 라우팅이므로 단일 터치 플래그로 자동 덮어쓰기 제어 → 영리법인 산출세액 상당액도 수정 가능(이미지26 요구 충족).

```
applyAutoTax(next):                                  // 공통 자동계산 적용 헬퍼
  tax = autoComputePriorGiftTax(next.giftAmount, next.doneeRelation)
  if next.beneficiaryType === "corporate":
      patch corporateGiftComputedTax=tax, giftTaxPaid=0, giftTaxBase=undefined   // 단 userTouchedTax면 corporateGiftComputedTax 유지
  else (heir/legatee):
      patch giftTaxPaid=tax                                                       // 단 userTouchedTax면 유지

[수증자 드롭다운 선택] handleDoneeSelect(heirId)
  → doneeId·isHeir·beneficiaryType·doneeRelation 4필드 set (Phase 1 + T2 분기)
  → !userTouchedTax 이면 applyAutoTax (giftAmount>0 시 값, 아니면 0)

[증여재산가액 입력] onChange(giftAmount)
  → 관계 확정(doneeRelation 파생 or 수동) + !userTouchedTax 이면 applyAutoTax

[세액 입력란 수동 수정] onChange (자연인=giftTaxPaid / 영리법인=corporateGiftComputedTax)
  → userTouchedTax=true (useRef) → 이후 자동 덮어쓰기 금지. 둘 다 동일 플래그

[수증자 미선택 + 관계 수동 선택] (P6)
  → doneeRelation 수동값으로 경로2 applyAutoTax (관계 미선택 시 자동계산 skip)
```

> 세액 입력란 라벨: 영리법인="§3의2② 산출세액 상당액 (자동·수정 가능)" / 그 외="기납부 증여세 (자동·수정 가능)".

---

## Silent fallback / 자동 안분 식별

- ❌ 자동 안분 없음. 자동계산은 사용자 명시 액션(수증자 선택·가액 입력) 기반 derive — 정책 위반 아님.
- `giftTaxBase`는 영리법인에서 undefined로 두어 엔진 `?? giftAmount` fallback 사용(공제 0이라 동일) — UI 입력란 제거.
- 사용자 수정값은 useRef 터치 플래그로 보호(mirror-pattern).

---

## 테스트 약속 (Pre-Do anchor)

| anchor | 케이스 | 검증 |
|---|---|---|
| A1 | autoComputePriorGiftTax P1 | 배우자 760m → 22,000,000 (이미지26) |
| A2 | autoComputePriorGiftTax P3 | 영리법인 700m → 150,000,000 (이미지25) |
| A3 | autoComputePriorGiftTax P2·P5·P6·P8 | 자녀·수유자·기타친족 |
| A4 | §55 단서 | taxBase < 50만원 → 0 |
| A5 | deriveBeneficiaryTypeFromHeir | corporate+isForProfit=false→legatee / +미설정→corporate |
| A6 | 라우팅 corporate | corporateGiftComputedTax set·giftTaxPaid=0·giftTaxBase undefined |
| A7 | 라우팅 자연인 | giftTaxPaid set |
| A8 | P7 mirror | 수동 수정 후 giftAmount 변경 시 giftTaxPaid 덮어쓰기 금지 |
| A9 | P6 경로2 | doneeId 미선택+doneeRelation 수동 → 자동계산 |
| A10 | corporate mirror(D1) | 영리법인 corporateGiftComputedTax 수동 수정 후 giftAmount 변경 시 덮어쓰기 금지(userTouchedTax 공유) |

---

## UI 통합 위임 (8지점)

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 상태 | Heir.isForProfit | ★타입 추가 |
| ② initial | 신규 corporate Heir | isForProfit 기본 undefined(=영리) |
| ③ normalize | — | 무영향 |
| ④ API 변환 | callInheritanceTaxAPI | heirs 그대로(isForProfit 포함) |
| ⑤ UI 위젯 | HeirComposition·GiftRowEditor | ★핵심 (UI 디자인 문서) |
| ⑥ 사이드바 | — | 무영향 |
| ⑦ 결과 카드 | ⑩a/b/c 비영리 안내 | A2 배지 |
| ⑧ validation | — | 무영향(isForProfit optional) |
| ⑨~⑭ Zod·route | heirSchema isForProfit | ★⑫ 추가 |

상세 UI 명세는 `inheritance-prior-gift-donee-phase2.ui.design.md`.
