# 증여의제 계산 이력 등록 — #72·#100·#103 설계

> 출처: `docs/review/gift-39/I-gift-tax-handoff.md:145`(#72 medium) · `:249`(#100 low) · `J-safety-net.md:309`(#103 low)
> 선행 계획: `docs/00-pm/gift-deemed-transfer.plan.md:487` R12 (결과→마법사 이관 시 IndexedDB·`sourceCalculationId` 연동)
> 상태: PR ① ✅ **머지(#1842 · 2026-09-28)** · PR ② ✅ **구현 완료(2026-09-28)** — 사용자 채택: 2개 PR · 예외 5건 사유 등재

## 1. 실측 (master `54a010e9`)

| # | 결함 | 실측 |
|---|---|---|
| #72 | 증여의제 계산기의 입력·결과가 어느 계층에도 저장되지 않는다 | `DeemedGiftCalculator.tsx:28` `useState(INITIAL_DEEMED)` — store·자동저장 0건. `LOCAL_TAX_TYPES`(`lib/storage/types.ts`) 9종에 없음. 이관된 증여세 record에는 `giftItems[0]`(금액 1개)과 `giftDate`만 남는다 |
| #100 | 사실관계가 다른 두 §39 건이 같은 금액이면 증여세 이력 1건으로 합쳐진다 | A(10,000원·100,000주·5,000원·100,000주·실권 40,000) · B(20,000원·50,000주·10,000원·50,000주·실권 20,000) 둘 다 100,000,000 → 이관 payload 동일 → contentHash 동일 → `created:false`(리뷰 실측) |
| #103 | 세목 등록 가드가 `LOCAL_TAX_TYPES`를 순회해 「등록되지 않은 계산기」를 못 본다 | page에서 import를 끝까지 따라가 `useAutoSaveCalculation(` 도달 여부를 잰 결과 15개 계산 라우트 중 **6개 미도달**: cross-104-5 · family-business-postmgmt · **gift-deemed** · inheritance-postmgmt · public-interest-penalty · public-interest-postmgmt |

⚠️ `sourceCalculationId`만으로는 #100이 풀리지 않는다 — `content-hash.ts:101` `VOLATILE_ID_KEY = /^(?:id|[A-Za-z]+Id)$/`가
`…Id` 키의 값을 해시에서 토큰화한다(설계상 id는 휘발). 해시를 가르려면 **사실(인자)** 이 inputData에 있어야 한다.

## 2. 설계

### PR ① — #72·#103: 증여의제를 로컬 세목으로 등록 + 라우트 도달 가드

선례 `a76dd4e1`(one_house_exemption 등록, 17파일)의 체크리스트를 그대로 따른다.

| 지점 | 변경 |
|---|---|
| `lib/storage/types.ts` | `LOCAL_TAX_TYPES`에 `"gift_deemed"` |
| `tax-type-routes.ts` | `/calc/gift-deemed` |
| `TAX_LABEL` | 「증여이익(의제)」 |
| `title-generator.ts` | 「증여의제 — {유형 라벨} · {증여일}」 |
| `business-key.ts` | `null`(content 폴백) — 인적 식별 필드가 없다(증여세와 같음) |
| `backup-validate.ts` · 이력 필터 | 런타임 목록 파생이면 자동, 아니면 추가 |
| `history-resume-entry.ts` | 폼만 복원(결과는 재계산 — one_house 선례와 같은 이유) |
| `DeemedGiftCalculator.tsx` | `useAutoSaveCalculation({ taxType:"gift_deemed", inputData: form, resultData: result, taxLawVersion: giftDate })` + 재개 payload 수신 |
| Supabase | `calculations.tax_type` CHECK 마이그레이션 파일(선례대로 **파일만** — 런타임 영향 없음, 원격 적용은 별도) |
| 가드(#103) | `app/calc/**/page.tsx` → import 전이 탐색 → `useAutoSaveCalculation(` 도달 **또는** 사유 주석이 달린 예외 목록(5건). 새 계산 라우트가 둘 다 아니면 실패 |

### PR ② — #100 + R12: 이관 payload에 출처를 싣는다

- `buildGiftWizardPrefill` 반환에 `deemedSource: { type, input(엔진 입력), deemedGiftValue }` + `sourceCalculationId`(PR ①의 `savedId`).
- 증여세 `FormState`에 두 선택 필드 추가 → `inputData`에 실려 contentHash가 사실관계로 갈린다.
- ✅ 구현: 출처는 **폼 최상위가 아니라 이관 항목(`giftItems[]`)마다** 붙인다 — 항목을 지우면 출처도 함께 사라지고,
  §33처럼 항목이 여럿인 분기도 전부 받는다. 분기 9개에 흩뿌리지 않고 `buildGiftWizardPrefill` **출구 한 곳**에서 붙인다.
  `EstateItem.deemedSource`(보존 전용 · Zod가 모르므로 서버 엔진에 닿지 않음).
- ⚠️ staleness: 사용자가 이관 후 금액을 고치면 `deemedSource.deemedGiftValue ≠ giftItems 금액`이 된다. 현재 소비자가 없으므로 **보존만** 하고, 소비자를 만들 때 비교하도록 JSDoc에 적는다.

## 3. Pre-Do anchor (fail-first + 짝)

- ① `LOCAL_TAX_TYPES` ∋ gift_deemed · 라우트·라벨·제목 · 재개가 폼을 복원하고 결과는 비운다 · 계산 후 record 1건(E2E: 계산 → 이력에 1건 → 편집 → 폼 값 복원)
- ① 가드: 예외 목록에서 gift-deemed를 빼면 실패하는지(구현 전 fail) · 예외 목록에 **도달하는 라우트**가 있으면 실패(목록 부패 방지)
- ② A·B 두 번 이관·저장 → record **2건**(현행 1건 — fail) · 같은 A 두 번 → 1건(짝)
