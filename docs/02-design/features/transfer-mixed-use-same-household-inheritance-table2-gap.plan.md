# 겸용주택 동일세대 상속 §154⑧3호 거주 통산 표2 반영 — 수정 계획서

> **후속 과제**: PR#703(`eaaa8d71`, 일반 주택 §154⑧3호 거주 통산)이 명시적으로 범위 밖으로 둔
> **겸용주택** 표2 통산을 구현한다. PR#703 계획서 §9.3 "범위 밖" 항목의 완결.
> 관련 메모리: `project_transfer_154_8_3_residence_consolidation_table2`

작성일: 2026-07-20 · 상태: **Do 완료 (앵커 8/8 GREEN · 전체 11,065 pass · tsc 0 · C4 코드리뷰 Critical/High 0, Medium·Low 정정) · 커밋/ship 승인 대기**

> **Do 결과**: Option A 채택. 앵커1 golden = 산출세액 510,017,988(현행 버그 표1 629,365,886 대비 −68,346,100·표2 40%).
> C4(transfer-tax-qa) Medium(표시-계산 drift) 수정 = `buildCalculationRoute`에 `table2ResidenceYears` 주입(재계산 제거).

---

## §1. 배경

PR#703은 동일세대 상속주택 **자체 양도** 시 소득세법 시행령 §154⑧3호의 "거주기간 통산"을
일반 주택 경로(`calcLongTermHoldingDeduction`)에 구현했다. 핵심은 **대상 판정(통산)/공제율(실거주) 분리**:

- **§95② 표2 대상 판정** = 상속개시 후 실거주 + 상속개시 전 동일세대 통산 거주 (`resolveExemptionResidenceMonths`)
- **표2 거주분 공제율** = 상속개시일부터 실거주(`residencePeriodMonths`)만 (사전법령해석재산 2021-202)

그러나 **겸용주택(주택+상가 복합)** 은 LTHD를 `calcLongTermHoldingDeduction`이 아닌 **별도 엔진 경로**로
계산하므로 이 수정이 도달하지 않았다. PR#703 계획서가 "deferred"로 명시한 부분이다.

## §2. 근본 원인 (실측)

겸용주택 LTHD 표2 게이트는 **`residenceYears`(실거주 연수) 단일값**만 보며,
게이트와 거주분 공제율에 **동일 값**을 사용한다 (PR#703의 분리가 없음).

| 위치 | 코드 | 문제 |
|---|---|---|
| `transfer-tax-mixed-use-helpers.ts:711` | `const useTable2 = isOneHouseExempt && residenceYears >= 2;` | 표2 게이트가 실거주만 봄 |
| `transfer-tax-mixed-use-period-split.ts:194` | `const useTable2 = isOneHouseExempt && residenceYears >= 2;` | 용도변경 기간분할 경로도 동일 |
| `transfer-tax-mixed-use-helpers.ts:621` | `const residencePart = Math.min(residenceYears * 0.04, 0.40);` | 거주분 공제율 (이건 실거주 유지가 정답) |

`residenceYears`의 출처: **클라이언트 어댑터**가 실거주만으로 계산해 단일값으로 전달.

```
lib/calc/transfer-tax-api-mixed-use.ts:143
  residencePeriodYears: Math.floor(
    deriveResidencePeriodMonths(primary, form.transferDate, form.residencePeriodMonths) / 12,
  ),  // ← 실거주만. decedentCohabitationResidenceMonths 미소비(침묵 drop)
```

`MixedUseAssetInput`(`types/transfer-mixed-use.types.ts:103`)에는 `residencePeriodYears: number` 하나뿐이고
통산 필드(`decedentCohabitationResidenceMonths`·`decedentSameHouseholdBeforeInheritance`·`acquisitionCause`)가
**타입에 존재하지 않는다**. PR#703이 폼-수준(`AssetForm`)에 추가한 통산 필드는 겸용 카드에서 렌더·설정되나
(**실측 확인** — 겸용 = `assetKind === "housing"` + `isMixedUseHouse`[`MixedUseSection.tsx:6`·`ExpropriationBlock.tsx:73`],
통산 입력 게이트 `CompanionAcqInheritanceBlock.tsx:64`가 `assetKind === "housing"`이므로 **상속취득 겸용에서 통산 필드 렌더됨**),
겸용 API 어댑터가 읽지 않아 엔진까지 도달하지 못한다.

**결론**: 동일세대 상속 겸용주택(실거주 0, 통산 거주 ≥2년)은 통산을 표현할 경로가 없어 **표1 강제**.

## §3. probe 실측 (현행 동작 확증 — 삭제한 throwaway probe)

`calcMixedUseTransferTax` 직접 호출. 40억 겸용(주택분 12억 초과), `isOneHouseExempt=true`,
보유 25~30년, `residencePeriodYears`만 변화:

| residencePeriodYears | 표 | 공제율 | 주택 양도소득금액 | 총부담세액 |
|---|---|---|---|---|
| **0** (동일세대 상속·실거주0) | **표1** | **0.30** | 966,510,509 | **629,365,886** |
| 2 (실거주 2년) | 표2 | 0.48 (보유40+거주8) | 717,979,235 | 506,342,906 |
| 25 (실거주 25년) | 표2 | 0.80 (보유40+거주40) | 276,145,860 | 296,624,092 |

- **현행 버그**: 실거주0 → 표1 0.30 고정. 표2는 **실거주 ≥2년에만** 열림.
- **정답 방향**(동일세대 통산 거주 ≥2년, 실거주0): 표2 게이트 열림 + 거주분=실거주0
  → 공제율 = **보유 40% + 거주 0% = 0.40** (현행 표1 0.30보다 공제↑ → 세액↓). 원단위 anchor는 Do에서 확정.

> ※ 이 방향은 법령상 정당한 결과이며 "납세자 유리" 표현이 아니라 §154⑧3호 명문 적용의 산물이다.

## §4. 법령 근거 (PR#703과 동일 — 재검증 완료)

- **소득세법 시행령 §154⑧3호**(현행 mst=286211): "상속개시 전에 상속인과 피상속인이 동일세대로서
  거주하고 보유한 기간"을 §154① 거주·보유기간에 통산. 자산 형태(단독·겸용)를 구분하지 않는다 →
  **겸용주택에도 동일 적용**이 법령 정합.
- **§95② 별표(표2)**: 1세대1주택 보유분(연 4%·최대 40%) + 거주분(연 4%·최대 40%), 합계 최대 80%.
- **사전법령해석재산 2021-202**: 표2 **대상 판정**은 통산 거주기간, **거주분 공제율**은 상속개시일부터
  실거주로 분리. 두 기간은 disjoint(상속개시 이전/이후)라 합산이 정확.
- 통산 규칙은 이미 `resolveExemptionResidenceMonths`(`transfer-tax-exemption.ts:131`)에 단일 소스로 존재.

## §5. 수정 설계

### §5.1 권장안 (Option A) — 클라이언트가 통산 연수를 별도 전달, 규칙은 엔진 헬퍼 재사용

겸용 경로는 이미 `residencePeriodYears`를 **클라이언트에서 pre-compute**하는 확립된 패턴
(`transfer-tax-api-mixed-use.ts:143`, 주석 "거주기간 단일 소스"). 그와 대칭으로 **통산 연수만** 하나 더 전달한다.
통산 **규칙**은 엔진의 `resolveExemptionResidenceMonths`를 그대로 호출해 **단일 소스**를 유지(규칙 중복 없음).

**변경**:

1. **타입** — `MixedUseAssetInput`(`types/transfer-mixed-use.types.ts`)에 추가:
   ```ts
   /** §154⑧3호 표2 '대상 판정'용 통산 거주 연수 (상속개시 후 실거주 + 동일세대 통산).
    *  미제공 시 residencePeriodYears로 fallback(비상속·별도세대 = 실거주). 거주분 공제율은
    *  residencePeriodYears(실거주)를 별도 사용. */
   table2ResidencePeriodYears?: number;
   ```

2. **규칙 코어 `consolidateResidenceMonths` 추출 → `transfer-tax-exemption.ts`에 co-locate(단일 소스).**
   ⚠️ **[자가검토 실측 정정 High #1]** `resolveExemptionResidenceMonths(input: ResidenceReqInput)`의 인자는
   **10-필드 Pick**(`acquisitionDate`·`transferDate`·`residencePeriodMonths`·`oneHouseExemptionProviso`·
   `regionCode`·`wasRegulatedAtAcquisition`·`residenceTransitionAcquisitionDate`·`acquisitionCause`·
   `decedentSameHouseholdBeforeInheritance`·`decedentCohabitationResidenceMonths` — `transfer-tax-exemption.ts:32-43` 실측)
   이라, 어댑터에서 3~4필드만 넘겨 그대로 호출하면 **TS 에러**(필수 필드 누락) → 최소입력 헬퍼가 필요하다:
   ```ts
   // transfer-tax-exemption.ts — resolveExemptionResidenceMonths 바로 위에 co-locate
   export function consolidateResidenceMonths(
     residencePeriodMonths: number,
     opts: {
       acquisitionCause?: TransferTaxInput["acquisitionCause"];  // 기존 union 재사용
       decedentSameHouseholdBeforeInheritance?: boolean;
       decedentCohabitationResidenceMonths?: number;
     },
   ): number {
     if (opts.acquisitionCause === "inheritance" && opts.decedentSameHouseholdBeforeInheritance === true) {
       return residencePeriodMonths + (opts.decedentCohabitationResidenceMonths ?? 0);
     }
     return residencePeriodMonths;
   }
   ```
   `resolveExemptionResidenceMonths(input)`는 `consolidateResidenceMonths(input.residencePeriodMonths, input)`로
   **위임**(동작 불변 → 기존 회귀 0). 어댑터·엔진 게이트는 `consolidateResidenceMonths`를 직접 import → 규칙 단일 소스.
   ✅ **[번들 우려 해소 — 실측]** `transfer-tax-exemption.ts`는 **이미 클라이언트 번들에 존재**한다:
   `app/calc/transfer-tax/steps/Step4.tsx:7`(client)이 `transfer-temp-two-house-judge`를 import →
   그 파일(`:12`)이 `transfer-tax-exemption.ts`를 **런타임 import**(type 아님). 따라서 어댑터가 이 파일에서
   `consolidateResidenceMonths`를 런타임 import해도 **신규 번들 부담 0** → 별도 leaf 파일 불필요(Simplicity First).

3. **어댑터** — `transfer-tax-api-mixed-use.ts`: `residencePeriodYears` 옆에 추가. 최소 헬퍼 직접 호출:
   ```ts
   const resMonths = deriveResidencePeriodMonths(primary, form.transferDate, form.residencePeriodMonths);
   // ...
   residencePeriodYears: Math.floor(resMonths / 12),  // 실거주 (거주분 공제율)
   table2ResidencePeriodYears: Math.floor(
     consolidateResidenceMonths(resMonths, {
       acquisitionCause: primary.acquisitionCause,
       decedentSameHouseholdBeforeInheritance: primary.decedentSameHouseholdBeforeInheritance,
       decedentCohabitationResidenceMonths: parseInt(primary.decedentCohabitationResidenceMonths) || 0,
     }) / 12,
   ),
   ```
   ※ `consolidateResidenceMonths`가 `acquisitionCause`/동일세대 게이트를 내부에서 판정하므로 어댑터는 원값만
   전달(비상속·별도세대면 자동으로 `resMonths` 반환 = 실거주). 게이트 조건 중복 없음.

   > **대안(신규 코드 0)**: `resolveExemptionResidenceMonths(buildResidenceReqInput(form))` 재사용도 가능하다 —
   > `buildResidenceReqInput`(`transfer-tax-api-residence.ts:12`, ④′ 빌더)이 **10-필드 ResidenceReqInput 전체**를
   > 이미 조립(같은 `deriveResidencePeriodMonths` 소스·통산 3필드 포함, `:18`)하므로 TS 에러 없이 통과.
   > 단점: 필요 이상으로 전체 입력을 구성하고 내부 `toDate(...)` throw 표면이 추가된다. **판단**: 순수·무-throw인
   > `consolidateResidenceMonths` 추출을 권장하되, 신규 export를 피하고 싶으면 이 재사용안 채택 — Do에서 확정.

4. **Zod** — `transfer-tax-schema-mixed-use.ts`: `table2ResidencePeriodYears: z.number().int().nonnegative().optional(),`
   (형제 `residencePeriodYears`와 대칭).

5. **엔진 게이트 분리** — **주택 표2 게이트는 정확히 2개 함수**(나머지 `calcLongTermRate` 호출부 —
   `-mixed-use-totals.ts:24`·`-period-split.ts:215·227`·`-helpers.ts:766·767·773`—는 전부 `(.., 0, false)`
   하드코딩된 상가·NBL 경로라 표2 무관):
   - `buildHousingPart`(`-helpers.ts:669`): 파라미터 `table2ResidenceYears: number` 추가.
     `:711` → `const useTable2 = isOneHouseExempt && table2ResidenceYears >= 2;`
     (게이트만 통산. `calcLongTermRate(holdingYears, residenceYears, useTable2)`는 **불변** —
     거주분 공제율은 실거주 `residenceYears` 유지 = PR#703 분리 원칙과 동일. buildHousingPart는 4부분
     안분(Case A) 경로도 담당 — `transfer-tax-mixed-use.ts:160`, `skipPeriodSplitForFourPart` 분기.)
   - `applyUsagePeriodSplit`(`-period-split.ts`): 동일하게 `table2ResidenceYears` 파라미터 추가,
     `:194` 게이트만 통산 (housing 호출부 `:199`·`:206`).

6. **caller** — `calcMixedUseTransferTax`(`transfer-tax-mixed-use.ts:145·160`):
   두 호출부에 `asset.table2ResidencePeriodYears ?? asset.residencePeriodYears` 전달(비상속 fallback = 실거주).

7. **표시 정합** — `buildCalculationRoute`(`transfer-tax-mixed-use.ts:274`)의
   `housingDeductionTableReason`이 `asset.residencePeriodYears`로 표2 사유를 서술 →
   게이트 값(`table2ResidencePeriodYears ?? residencePeriodYears`)으로 정합(표2인데 "거주 0년 <2년" 오표기 방지).

### §5.2 대안 (Option B) — 엔진 내부 통산 (raw 필드 주입)

`MixedUseAssetInput`에 raw 4필드(`acquisitionCause`·`decedentSameHouseholdBeforeInheritance`·
`decedentCohabitationResidenceMonths`·`residencePeriodMonths`)를 넣고 엔진이 `resolveExemptionResidenceMonths`로
통산을 계산. 메인 엔진과 완전 대칭이나 — 겸용은 현재 **개월이 아닌 연수**(`residencePeriodYears`)를 받으므로
거주 소스 모델을 개월로 재구성해야 함 → 변경 폭이 큼(회귀 위험↑).

### §5.3 권장 판단

**Option A 채택.** 근거:
- 겸용은 이미 거주 연수를 클라이언트에서 pre-compute → `table2ResidencePeriodYears` 추가가 **기존 패턴과 대칭**
  (새로운 dual-truth 도입 아님).
- 통산 **규칙**은 `consolidateResidenceMonths` 단일 헬퍼(§5.1-2) → 규칙 중복 0(엔진·어댑터 공유).
- 엔진 변경이 **게이트 1줄 × 2함수 + 파라미터 1개**로 surgical (Surgical Changes 원칙).
- **client import 우려 없음(실측)**: `transfer-tax-exemption.ts`는 이미 클라이언트 번들에 존재한다 —
  `Step4.tsx:7`(client) → `transfer-temp-two-house-judge.ts:12`가 `judgeTemporaryTwoHouseTiming`를 **런타임 import**.
  (`transfer-tax-api-residence.ts:10`은 `import type`=erase라 번들 무관.) ⇒ 통산 헬퍼 co-location이 신규 번들 부담 0.

> **trade-off 노출**: Option A는 통산 "연수 산출"을 클라이언트에 둔다(메인 엔진은 엔진 내부). 규칙은 공유하나
> 산출 위치가 분산되는 점은 겸용 아키텍처의 기존 특성을 따른 것. 완전 단일화를 원하면 Option B이나 회귀 비용이 크다.
> 자가검토/리뷰에서 최종 확정.

## §6. 동기화 지점 (겸용 서브객체 델타)

메인 엔진 14지점 중 폼-수준 ①②③(AssetForm·initial·migrate)은 **PR#703에서 이미 완료**.
이번 델타는 **겸용 payload 경로**에 한정:

| # | 지점 | 파일 | 작업 |
|---|---|---|---|
| A | MixedUseAssetInput 타입 | `types/transfer-mixed-use.types.ts` | `table2ResidencePeriodYears?` 추가 |
| B | 클라이언트 어댑터(④) | `lib/calc/transfer-tax-api-mixed-use.ts` | 통산 연수 산출·populate |
| C | Zod(⑫) | `lib/api/transfer-tax-schema-mixed-use.ts` | 필드 accept |
| D | 엔진 소비 | `-mixed-use-helpers.ts`·`-mixed-use-period-split.ts`·`-mixed-use.ts` | 게이트 분리·caller·표시 |
| E | 엔진 헬퍼(단일 소스) | `transfer-tax-exemption.ts` | `consolidateResidenceMonths` 추출·위임(§5.1-2) |

코드 변경이 **없는** 지점(실측 확인 — 배선만으로 자동 도달):

- **Route(⑭) — 별도 매핑 불필요**: `route.ts:685` `const mixedAsset = { ...data.mixedUse, ... }` **전체 스프레드**
  (실측). Zod(C)가 accept하면 `table2ResidencePeriodYears`가 그대로 엔진 input에 도달. 필드별 매핑 코드 없음.
- **⑤ UI 위젯 — 신규 렌더 0**: 동일세대 토글 + "동일세대 통산 거주기간(개월)" 입력은
  `CompanionAcqInheritanceBlock.tsx:64` `asset.assetKind === "housing"` 게이트로 렌더(실측). 겸용 =
  `assetKind === "housing"` + `isMixedUseHouse`이므로 **겸용에서도 이미 렌더됨**. UI 델타 0 — 값이 겸용
  어댑터·엔진까지 소비되게 배선하는 것이 전부. raw 통산 필드는 top-level companion schema(PR#703)에 존재 →
  어댑터가 `primary`에서 읽음.
- **⑦ 결과 화면 — 변경 0**: `components/calc/results/mixed-use/MixedUseResultCard.tsx:346`이
  `장기보유공제 (표${longTermDeductionTable}, ${공제율})`로 **데이터구동 표시**(실측). 표2 개방·공제율 40% 자동 반영
  (표2일 때 ":349-350 보유연수×4% + 거주연수×4%" 설명 — 실거주0이면 거주분 0%로 정확 표시).
- **⑧ Validation — N/A**: `table2ResidencePeriodYears`는 사용자 입력이 아닌 **파생값**이라 신규 validate 불필요.
  원입력 raw 통산 필드(`decedentCohabitationResidenceMonths` 등)는 자산-수준(assetKind="housing"=겸용 포함)이라
  PR#703에서 이미 검증됨(`transfer-tax-validate-asset.ts`). 겸용 전용 validate(`-validate-mixed-area.ts`)는 면적만.

## §7. 앵커 테스트 계획

`__tests__/tax-engine/transfer/mixed-use-inherited-cohabitation-table2.anchor.test.ts` (신규):

1. **동일세대 상속·실거주0·통산 24개월** → 표2 게이트 열림, 공제율 = 보유40% + 거주0% = **0.40**,
   총부담세액 < 현행 629,365,886 (원단위 `toBe()` — Do에서 엔진 실행값으로 고정).
2. **가드: 별도세대 상속**(`decedentSameHouseholdBeforeInheritance=false`) → 표1 유지(통산 미적용).
3. **가드: 통산 < 2년**(예: 통산 12개월·실거주0) → 표2 미개방(표1).
4. **가드: 매매취득**(`acquisitionCause="purchase"`) → 실거주 그대로(회귀 0).
5. **거주분 공제율 검증**: 실거주 12개월 + 통산 12개월 → 표2 개방(대상판정 24개월),
   거주분 = 실거주 1년 × 4% = 4% (통산분이 공제율에 침범하지 않음 확인).
6. **period-split 경로**: 용도변경 겸용 + 동일세대 상속 실거주0 통산≥2 → `applyUsagePeriodSplit`도 표2 게이트 개방.

## §8. 회귀·검증

- **비상속·별도세대 = fallback**(`table2ResidencePeriodYears ?? residencePeriodYears`) → 기존 겸용 anchor 전부 불변.
- 검증 순서: `npx vitest run __tests__/tax-engine/transfer-tax/`(겸용) →
  `__tests__/tax-engine/transfer/` → `__tests__/lib/calc/`(어댑터 anchor) → 전체 `npm test`.
- `npx tsc --noEmit` 0 · eslint 0.

## §9. 범위 밖 (명시)

1. **재개발 입주권**(`assetKind="redevelopment_apt"`): 표2 게이트가 `redevelopment-lthd.ts:336`(별도 함수)로,
   토글 미렌더라 통산 필드 미도달. PR#703 §9.3과 동일하게 **별도 후속 과제**.
2. **겸용 비과세 거주요건(Bug A analog)**: 겸용 `isOneHouseExempt`는 세대수 기준으로만 판정
   (`transfer-tax-api-mixed-use.ts:153`, `form.isOneHousehold && count`)하며 **조정지역 2년 거주요건을
   검증하지 않는다**. 따라서 PR#703의 Bug A(거주요건 미충족 → 전액과세) analog가 겸용에는 **존재하지 않음**.
   단, 조정지역 취득분 거주요건 미검증 자체는 별도 잠재 이슈일 수 있음 → **확인 필요·이번 범위 밖**.
   이번 과제는 사용자 요청대로 **표2(LTHD)** 통산에 한정.
3. **다건(multi) 양도 겸용**: `calcMixedUseTransferTax`는 **단건 route에만** 존재
   (`app/api/calc/transfer/route.ts:699` 유일 호출·grep 실측). 다건 route·`multi-transfer-tax-api.ts`에
   겸용 경로 없음 → 다건 배선 불필요(누락 아님·구조적 미지원).

## §10. 완료 정의

- [ ] Pre-Do 앵커 6종 작성 → RED 확인(현행 실거주0 = 표1)
- [ ] Option A 엔진·어댑터·타입·Zod·표시 배선
- [ ] 앵커 GREEN(원단위 anchor Do에서 확정) + 가드 4종
- [ ] 겸용·양도세 전체 회귀 0 · tsc 0 · eslint 0
- [ ] 코드리뷰(transfer-tax-qa) High/Medium 0
- [ ] 브라우저 수동 확인(겸용 카드 동일세대 토글 → 통산 입력 → 표2 반영) — headless 미수행 시 명시

## §11. 자가검토 결과 (plan-design-self-review-loop 1사이클)

**실행 방식(정직 기록)**: 3-way fork 병렬 검토를 시도했으나 이 세션에서 **fork 임무혼동이 재발**
(memory `feedback_fork_context_inheritance_task_confusion`) — 3개 fork 모두 자신을 메인으로 착각해 담당 범위를
넘어 전체 검토를 실행하고 **계획서를 동시 편집**. 메인 스레드가 나머지 2개를 중단하고 **모든 fork 주장·편집을
grep/Read로 실측 재검증**(memory `feedback_subagent_completion_report_scrutiny`) 후에만 채택. 아래는 확정 결과.

### 1회차 발견 (STEP 1~2)

| # | 카테고리 | 우선순위 | 위치 | 문제 | 정정 | 상태 |
|---|---|---|---|---|---|---|
| 1 | 오류 | **High** | §5.1-2 | `resolveExemptionResidenceMonths(input)`는 `ResidenceReqInput`=10필드 Pick(`transfer-tax-exemption.ts:32-43` 실측) → 어댑터 부분 호출 시 TS 에러 | `consolidateResidenceMonths(months, opts)` 추출·기존 함수 위임(단일 소스) | ✅ 반영 |
| 2 | 누락 | Medium | §6 | validation ⑧ 미언급 | ⑧=N/A(client-derived·raw는 PR#703 검증) 명시 | ✅ 반영 |
| 3 | 누락 | Low | §9 | 다건(multi) 겸용 미언급 | `calcMixedUseTransferTax` 단건 route 유일(route.ts:699 실측) → 구조적 미지원 명시 | ✅ 반영 |
| 4 | 모순 | — | §6 ⑭ | "Do에서 확정" 미확정 | `route.ts:685` `...data.mixedUse` 스프레드 실측 → **확인됨**으로 격상 | ✅ 반영 |
| 5 | 정책위반 | — | §5 fallback | — | 발견 0. `?? residencePeriodYears`=비상속 identity(정당·silent apportion 아님) | — |
| 6 | 개선 | Low | §5·§6 | 엔진 호출부 파급 미명시 | `calcLongTermRate` 표2 호출부 2함수만·나머지 6곳 `(..,0,false)` 상가/NBL 실측 명시 | ✅ 반영 |
| 7 | UI누락 | — | UI | — | 발견 0. 통산필드 겸용 렌더(`CompanionAcqInheritanceBlock.tsx:64`)·결과 자동표시 실측 | — |

### 2회차 발견 — fork 편집 결함을 실측 재검증으로 포착 (STEP 3 blast-radius)

fork가 남긴 편집을 그대로 믿지 않고 재검증하니 **3건의 결함**이 드러났다 — 이 재검증이 없었으면 Do에서 오설계로 진입할 뻔:

| # | 유형 | fork 편집 | 실측 판정·정정 |
|---|---|---|---|
| 8 | **오류(과잉설계)** | High #2 "lib/calc는 전부 `import type` → 무의존 신규 leaf `residence-consolidation.ts` 필요" | **전제 거짓**: `Step4.tsx:7`(client)→`transfer-temp-two-house-judge.ts:12`가 `transfer-tax-exemption.ts`를 **런타임 import**(실측) → 이미 클라이언트 번들. **신규 파일 폐기**, `consolidateResidenceMonths`를 `transfer-tax-exemption.ts`에 co-locate(§5.1-2 정정) |
| 9 | **오류(인용)** | §6 결과카드 `components/calc/transfer/results/MixedUseResultCard.tsx:346` | 경로 **파일 없음**(환각). 실제 `components/calc/results/mixed-use/MixedUseResultCard.tsx:346`(라인은 정확) → 경로 정정 |
| 10 | **모순(중복)** | §5.1-2(leaf)↔§6-E(exemption.ts)↔§5.3(번들 우려 없음) 3중 상충 + §6 ⑧·UI 이중 문단 | co-location 단일화로 3자 정합·§6 중복 문단 통합 |

**blast-radius(#1·#8 헬퍼 co-location) 파급**: `resolveExemptionResidenceMonths` 호출 5곳
(`transfer-tax.ts:532`·`-helpers.ts:471·512`·`-exemption.ts:78·161`) — 위임이라 **동작·anchor 불변**(회귀 0).
어댑터 신규 호출 1곳만 추가. 신규 불일치 없음.

**verdict: clean** — 미해소 Critical/High 0(#1·#8 반영 완료). Do 진입 게이트 통과.
**교훈**: fork "clean" verdict를 그대로 채택했다면 과잉설계(신규 leaf)·환각 인용(결과카드 경로)이 Do로 새어나갔다.
fork 임무혼동 3연속 재발 → 이 환경에서 계획검토 fork는 **read-only 제약도 무력**, 실측 재검증 필수(메모리 강화 대상).
