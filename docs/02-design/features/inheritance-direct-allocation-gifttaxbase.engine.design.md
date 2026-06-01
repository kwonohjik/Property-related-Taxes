# 상속인별 직접배부 §53 증여재산공제 자동 도출 — 엔진 설계

> 계획서: [docs/00-pm/inheritance-direct-allocation-gifttaxbase-fallback.plan.md](../../00-pm/inheritance-direct-allocation-gifttaxbase-fallback.plan.md)
> 13단계 자가 검토 디자인 산출물 (D1 검토 반영).

## 0. 메타

- **세목**: 상속세 (inheritance)
- **대상 모듈**: `lib/tax-engine/inheritance-allocation.ts` (STEP 13 배부), 신규 `lib/tax-engine/inheritance-prior-gift-taxbase.ts`
- **버그**: 상속인별 배부표 직접배부에 §53 증여재산공제 미반영 (이미지 53) → 정답(이미지 54·55) 불일치
- **채택안 (구현 확정)**: **대안 B (STEP 0.5 전체 정규화)**. `preGifts`를 §19·§24·STEP13 전 STEP에서 일관 사용 → dual-truth 동시 해소. 회귀 위험은 "도출=명시 정합" anchor(BASE==STRIP 완전 동일)로 무력화 확인.
- **심각도**: 충실도(배부표 표시) 오류. 시나리오 B에서 **총 납부세액은 정확** (자기상쇄). 시나리오 C(doneeRelation까지 無)만 총세액 영향.

## 1. 법령 근거 (KoreanLaw MCP 검증)

| 조문 | 내용 | 검증 상태 |
|---|---|---|
| 상증법 §53 | 증여재산공제 (배우자 6억·직계존속 5천(미성년 2천)·직계비속 5천·4촌혈족/3촌인척 1천, **수증자 기준 10년 통산**) | ✅ KoreanLaw mst 276123 검증 (2026-06-01) — 코드 상수 완전 일치 |
| 집행기준 19-17-1 | 상속인별 과세표준상당액 = 직접배부 + 간접배부 | 계획서 §1 인용 (PDF 책 1864) — KoreanLaw 검증 필요 |
| 상증법 §28 | 사전증여세액공제 (배부표 하류) | 기존 구현 |

> ⚠️ §53 한도 수치는 `gift-deductions.ts:GIFT_DEDUCTION_LIMIT` 상수 재사용(실측 확인: 배우자 600_000_000·lineal_descendant 50_000_000·lineal_ascendant_adult 50_000_000·lineal_ascendant_minor 20_000_000·other_relative 10_000_000). Do 전 KoreanLaw로 §53 본문 cross-check. [[feedback_korean_law_82_vs_81_2_drift]]

## 2. 입력·출력 타입 변경

- **입력 타입 변경 없음**. `PriorGift.giftTaxBase`(optional) 이미 존재 — 신규 필드 0.
- **출력 타입 변경 없음**. `HeirTaxBreakdown.directTaxBaseShare`·`indirectTaxBaseShare`·`taxBaseShare` 기존 필드에 정정값이 담김.
- 14 동기화 지점 영향: **엔진 내부 정정만** → ①~⑭ 신규 동기화 불필요 (대안 A). Phase 2(UI override)에서만 ⑤⑦⑧ 발생.

## 3. 케이스 인벤토리 (필수 — 행 ≥ 1)

derive 우선순위: ① giftTaxBase 명시 → ② doneeRelation → ③ doneeId→relation → ④ 도출불가 시 giftAmount.

| # | giftTaxBase | doneeRelation | doneeId | Heir.relation | 현행 직접배부 | 수정 후 | derive 경로 |
|---|---|---|---|---|---|---|---|
| 1 | 명시 | — | — | — | giftTaxBase | giftTaxBase (무변경) | ① |
| 2 | 없음 | spouse | 有 | — | 760M ❌ | 160M ✅ | ② |
| 3 | 없음 | 없음 | spouse | spouse | 760M ❌ | 160M ✅ | ③ |
| 4 | 없음 | 없음 | son | child | 1,500M ❌ | 1,450M ✅ | ③ |
| 5 | 없음 | 없음 | corp | corporate | giftAmount | giftAmount (정상) | ④ 관계 undefined |
| 6 | 없음 | 없음 | 없음 | — | giftAmount(배부제외) | 동일 | ④ doneeId 無 |
| 7 | 없음 | 없음 | orphan | (삭제) | giftAmount | 동일 | ④ Heir 매칭 실패 |
| 8 | 없음 | 없음 | son(2건) | child | giftAmount×2 ❌ | doneeId 합산 §53 1회 ✅ | ③+합산 |

## 4. 계산 알고리즘 (의사코드)

```ts
// lib/tax-engine/inheritance-prior-gift-taxbase.ts
export function derivePriorGiftTaxBase(gifts: PriorGift[], heirs: Heir[]): PriorGift[] {
  const relById = new Map(heirs.map(h => [h.id, h.relation]));
  // ② doneeRelation 우선, ③ 없으면 doneeId→relation 매핑
  const resolveRel = (g: PriorGift): DonorRelation | undefined => {
    if (g.doneeRelation) return g.doneeRelation;
    if (!g.doneeId) return undefined;
    const r = relById.get(g.doneeId);
    return r ? mapHeirRelationToDonor(r) : undefined; // legatee/corporate/orphan → undefined
  };
  // doneeId 단위 grossByDonee 합산 (giftTaxBase 미명시 & 관계 도출 가능 건만)
  const grossByDonee = new Map<string, number>();
  for (const g of gifts) {
    if (g.giftTaxBase !== undefined) continue;     // ① 명시 보존
    if (!g.doneeId || !resolveRel(g)) continue;    // ④ 도출불가 제외
    grossByDonee.set(g.doneeId, (grossByDonee.get(g.doneeId) ?? 0) + g.giftAmount);
  }
  // doneeId 단위 §53 공제 1회 → 비례배분 (잔액 흡수)
  const dedByDonee = new Map<string, number>();
  for (const [id, gross] of grossByDonee) {
    const rel = resolveRel(gifts.find(g => g.doneeId === id)!)!;
    dedByDonee.set(id, calcRelationDeduction({ donorRelation: rel, priorUsedDeduction: 0 }, gross).relationDeduction);
  }
  // 각 gift에 giftTaxBase 부여 (비례배분 + 마지막 건 잔액 흡수)
  return mapWithProportionalDeduction(gifts, grossByDonee, dedByDonee); // max(0, giftAmount − 배분공제)
}
```

**적용 (대안 A)** — `inheritance-tax.ts` STEP 13:
```ts
const cutoffFilteredGifts = derivePriorGiftTaxBase(
  (input.preGiftsWithin10Years ?? []).filter(g => isWithin13Cutoff(g, input.deathDate)),
  input.heirs,
);
// → calcHeirAllocation({ priorGifts: cutoffFilteredGifts, ... })
```

> `mapHeirRelationToDonor` = `deriveDoneeRelationFromHeir`(`lib/calc/prior-gift-donee-derive.ts`) 재사용. 엔진→lib/calc import 선례 있음(`inheritance-farming-deduction.ts:20`). 단일 진실 위해 deriveDoneeRelationFromHeir를 엔진으로 이동 + lib/calc re-export 권장 (Do 결정).

## 5. anchor 테스트 매트릭스

> ★ tolerance 주의 (D1 실측): 기존 comprehensive 테스트에서 배우자 direct/indirect·차남 indirect(554,849,527)·손녀 indirect(160,361,135)는 `toBe`(정확)이나, **장남 indirect(208,469,476)는 `±1원` tolerance**(PDF round-half-up .494 오기)·자진납부세액들도 ±1원·T10 잔액흡수 +1원. AL-1은 기존 테스트와 **동일한 matcher(정확 toBe / ±1 tolerance)** 를 항목별로 그대로 사용.

| ID | 입력 | 검증 |
|---|---|---|
| AL-1 메인 | fixture에서 giftTaxBase만 제거(doneeId 유지) | 배우자 direct 160,000,000·indirect 941,319,862·taxBaseShare 1,101,319,862 (toBe) / 장남 direct 1,450,000,000(toBe)·indirect 208,469,476(±1) / indNum 1,865,000,000 / 차남 indirect 554,849,527(toBe) / 손녀 indirect 160,361,135(toBe) — **= 기존 comprehensive I-06~I-19 값과 동일** |
| AL-2 회귀 | fixture 원본(giftTaxBase 명시) | 기존 82 anchor 무변경 |
| AL-3 corporate | 케이스 #5 | corporate `finalTax === 0` 유지 (direct 700M echo는 별도 anchor 없음 — 면제 결과만 검증) |
| AL-4 다건 | 동일 doneeId 2건 giftTaxBase 제거 | §53 1회 합산 + 비례배분 (Σ == giftAmount합 − 공제) |
| AL-5 orphan | doneeId 미매칭 | 크래시 없음, giftAmount 유지 |
| AL-6 시나리오 C | doneeRelation·giftTaxBase 無 | 대안 A: total 1,330,991,657(미해소·문서화) / 대안 B: 1,179,260,233 |
| AL-통합 | 시나리오 B | total finalTax 1,179,260,233 불변, per-heir 정답 일치 |

## 6. 통합 지점 (14 동기화)

- **대안 A**: 엔진 내부 정정 → ①~⑭ **신규 동기화 없음**. result 타입·필드 무변경.
- **Phase 2(UI override, 별도 PR)**: ⑤ GiftRowEditor 입력란 · ⑦ 결과 배부표(기존 표시 재활용) · ⑧ validate(giftTaxBase ≤ giftAmount). ①폼·⑨Zod는 PriorGift.giftTaxBase 기존 정의로 충족.

## 7. 회귀 영향 분석

- **대안 A**: §19·§24·corporate 면제 코드 무변경 → 해당 anchor 영향 0. allocation만 정정.
- 기존 comprehensive 82 anchor: giftTaxBase 명시 fixture → derive ① 보존 → 무변경 (회귀 가드 역할).
- `corporateGiftTaxBase`(line 542)는 priorGift 원본에서 별도 산정 — derive 대상(미명시)과 무관(corporate는 giftTaxBase 700M 명시). 영향 0.

## 8. Edge Case·예외

- **미성년 자녀** (R1-P6): `deriveDoneeRelationFromHeir`가 child→lineal_descendant(성인 5천)만 → 미성년(2천) 미구분. §19·§24 공유 한계. 별도 과제.
- **floor 비례배분** (다건): 기존 `scaleMapToTotal`(`inheritance-allocation.ts:183`) 잔액 흡수 패턴 재사용 — 마지막 건이 `gross − Σ(앞 건 공제)` 흡수로 Σ 보존 [[feedback_floor_residual_absorption]].
- **legatee/corporate/orphan**: 관계 undefined → giftAmount 유지 (배부에서 §53 미적용이 정상).
- **시나리오 C**: 대안 A는 총세액 미교정(문서화) — 대안 B 후속.

## 9. 구현 작업 분할 (Do 단계)

1. KoreanLaw로 §53·집행기준 19-17-1 재검증 (Do 전).
2. `deriveDoneeRelationFromHeir` 엔진 이동 + lib/calc re-export (또는 import).
3. `inheritance-prior-gift-taxbase.ts` 신규 (derivePriorGiftTaxBase + 비례배분).
4. `inheritance-tax.ts` STEP 13 적용 (cutoffFilteredGifts에 derive).
5. anchor AL-1~AL-5 + 통합 작성.
6. 회귀: inheritance 전체 + npm test + tsc.
7. E2E (Playwright): 수증자 select + 가액만 입력 → 배부표 160M 확인.

## 9-1. 계획↔디자인 통합 비교 (11단계 — 1:1 매핑)

| 항목 | 계획서 | 디자인 | 일치 |
|---|---|---|---|
| 채택안 | 대안 A(allocation 한정) 1차 | §0 대안 A | ✅ |
| derive 우선순위 | §4-1 ①②③④ | §3·§4 ①②③④ | ✅ |
| 케이스 인벤토리 | §5 8행 | §3 8행 | ✅ |
| AL-1 배우자 direct | 160,000,000 | 160,000,000 | ✅ |
| AL-1 indNum | 1,865,000,000 | 1,865,000,000 | ✅ |
| AL-1 차남/손녀 indirect | 554,849,527 / 160,361,135 | 동일 | ✅ |
| 장남 indirect tolerance | ±1원 (P AL-1) | ±1 (§5) | ✅ |
| AL-3 corporate | finalTax 0 | finalTax === 0 | ✅ |
| 총 finalTax(시나리오 B) | 1,179,260,233 | §0·§5 동일 | ✅ |
| 시나리오 C total | 1,330,991,657(대안A 미해소) | §5 AL-6 동일 | ✅ |
| import 방향 | §8 farming 선례 | §4 동일 | ✅ |
| 비례배분 | scaleMapToTotal 재사용 | §8 동일 | ✅ |
| 미성년 자녀 한계 | §8 R1-P6 | §8 동일 | ✅ |

## 10. 검증 체크리스트

- [ ] §53 KoreanLaw 재검증
- [ ] AL-1 메인 anchor (이미지 54·55 원단위 일치)
- [ ] 기존 82 anchor 무변경 (회귀 가드)
- [ ] corporate·orphan·다건 anchor
- [ ] `npx tsc --noEmit` 0
- [ ] `npm test` 전체 통과
- [ ] E2E spec 통과
