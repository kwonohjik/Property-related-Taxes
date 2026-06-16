# NBL 갭 2 — 이농 DEAD 필드 복구 (§83의5④2호) + isFactoryAdjacent legalBasis 정정

> 직접 작성(메인 루프) — nbl-gaps-plan 워크플로의 본 갭 planner가 KoreanLaw 429에 막혀, 1차 검증 verdict + 실제 코드 정독(`unconditional-exemption.ts`·`UnconditionalExemptionSection.tsx`·store/factory/normalize/Zod/form-mapper-helpers grep)으로 보강. 마스터: [nbl-remaining-gaps.plan.md](../nbl-remaining-gaps.plan.md)

- **제안 PR**: 단독 PR-B (소규모). 다른 NBL 갭과 분리. 이유: 엔진·request builder가 이미 동작하므로 결선 6지점만 추가하는 최소 변경. store/Zod 파일을 3a·3b와 공유하나 추가 필드가 distinct라 순차 머지로 충돌 회피.
- **복잡도**: S
- **선행(blocker)**: 없음. (§83의5④2호 본문은 1차 검증 workflow가 KoreanLaw `get_law_text`로 확인 — 단, 단서·날짜는 Do 진입 시 본문 1건 재확인 권장.)

## 0. 한 줄 요약

§168의14③5호 → 시행규칙 §83의5④2호 **이농 농지**(2006.12.31 이전 이농자가 이농 당시 소유한 농지를 2009.12.31까지 양도)는 무조건 사업용 의제 사유다. 엔진은 이미 이를 **완전히 소비**(`unconditional-exemption.ts:130-144`, `u.isInong`/`u.inongDate`)하고, `buildNonBusinessLandRaw`는 prefix-pick(`k.startsWith("nbl")`)이라 store에 `nbl` 접두 필드를 추가하면 ④⑬을 자동 운반한다. 그러나 **store·factory·normalize·Zod·form-mapper-helpers·UI 6지점에 입력 채널이 전무**(`nblExemptInong`/`nblExemptInongDate` 부재, grep 0건)해 엔진 필드가 UI 경로로 절대 도달하지 못하는 **wired-but-disconnected**다. 본 갭은 그 6지점을 결선한다. 더불어 동일 파일의 `isFactoryAdjacent` legalBasis 드리프트("공익사업법 연계 (레거시)" → 시행규칙 §83의5④1호)와 이농 legalBasis("구법 이농 조항 (레거시)" → 시행규칙 §83의5④2호)를 정정한다.

## 1. 법령 근거

- **소득세법 시행령 §168의14③5호** → **시행규칙 §83의5④** 위임. (1차 검증 workflow가 KoreanLaw `get_law_text(mst=286379, jo=제83조의5)` 본문으로 확인: §83의5④ 7종 부득이 사유.)
  - **2호 = 이농**: 2006.12.31 이전 「농지법」 §6②5호에 따라 이농(離農)한 자가 이농 당시 소유하고 있던 농지로서 **2009.12.31까지 양도**하는 토지.
  - **1호 = 공장 인접**: 공장의 가동으로 인한 매연·소음 등으로 생활환경 오염피해가 발생하는 인접 토지로서 그 공장용 부속토지의 소유자가 취득한 토지(= 현행 코드의 `isFactoryAdjacent`).
- **현행 엔진의 cutoff 정합 확인**(`unconditional-exemption.ts:38-39`): `INHERITANCE_CUTOFF = 2006-12-31`, `TRANSFER_CUTOFF = 2009-12-31`. 이농 분기(line 135-136)가 `u.inongDate <= 2006-12-31 && transferDate <= 2009-12-31`로 §83의5④2호와 일치. **법령 정합 — 코드 추가 없이 입력만 결선하면 정확 동작.**
- **드리프트 정정 대상**:
  - `unconditional-exemption.ts:126` `legalBasis: "공익사업법 연계 (레거시)"` (isFactoryAdjacent) → `"소득세법 시행규칙 §83의5④ 1호"`.
  - `unconditional-exemption.ts:142` `legalBasis: "구법 이농 조항 (레거시)"` (isInong) → `"소득세법 시행규칙 §83의5④ 2호"`.
  - `unconditional-exemption.ts:120` 주석 "현행 §168-14③ 미명시, 보상법 연계 판례 반영" → §168의14③5호·시행규칙 §83의5④1호 명시로 갱신.
  - UI `UnconditionalExemptionSection.tsx:122-127` 공장 인접 ToggleCard 라벨("구법 특례"·"소득령 §168-14③ 구법") → §83의5④1호 정식 인용.
- **⚠ Do 진입 전 재확인 권장**: §83의5④1호의 정확한 요건(공장 부속토지 소유자 "요구에 의한 매수" vs "취득") — 현행 코드 detail "소유자 요구에 의한 매수"가 본문과 일치하는지 KoreanLaw 본문 1건 재확인. (numeric 무영향·충실도, [[feedback_korean_law_citation_verify]])

## 2. Scope

### IN (본 PR-B)
1. store 6지점 결선: `nblExemptInong: boolean` + `nblExemptInongDate: string` 신규 필드.
2. UI: `UnconditionalExemptionSection.tsx`에 이농 ToggleCard(DateInput 포함) 추가 + `anyExempt` 헬퍼에 `nblExemptInong` 합류.
3. 드리프트 정정: isFactoryAdjacent·isInong legalBasis 2건 + 주석 + 공장인접 UI 라벨.
4. Pre-Do anchor + 결선 anchor.

### OUT (분리 후속)
- §83의5④ 호3~7(기업구조조정촉진법·채권은행협의회·산업집적법§39·방조제·채무자회생법§242 회생계획) — 엔진 타입·로직 전무. 별도 갭(낮은 우선순위, 트리거 희소).
- §168의14③1의2호 8년 재촌자경 **실질검증**(현행 무검증 boolean) + §168의14④ 경작기간 통산 — 별도 고난도 갭. 본 PR은 이농(③5호 2호)만.
- `isUrbanFarmlandJongjoongOrInherited`·`isJongjoongOwned` 등 기존 의제 사유는 변경 없음.

## 3. 데이터 모델 변경

엔진 타입은 **이미 완비** — 추가 없음:
- `UnconditionalExemptionInput.isInong?: boolean` (`types.ts:163`), `inongDate?: Date` (`types.ts:164`) — 존재.
- `UnconditionalExemptionReason`에 `"inong"` 리터럴 — `unconditional-exemption.ts:140`이 이미 사용 → 타입에 존재.

store 신규 필드(2개):
- `AssetForm.nblExemptInong: boolean` (`calc-wizard-asset.ts:438` 뒤).
- `AssetForm.nblExemptInongDate: string` (동상). (날짜는 store에서 문자열, route에서 `parseDate` 변환.)

## 4. 14 동기화 지점 — 실제 건드릴 것 enumerate

NBL prefix-pick(`buildNonBusinessLandRaw`가 `k.startsWith("nbl")` 자동 운반, `non-business-land-request.ts:64-66`) → ④⑬ 자동. 신규 필드명에 `nbl` 접두 필수(`nblExemptInong`/`nblExemptInongDate`).

| # | 지점 | file:line | 변경 |
|---|---|---|---|
| ① | 폼 상태(AssetForm) | `lib/stores/calc-wizard-asset.ts:438` | `nblExemptInong: boolean;` + `nblExemptInongDate: string;` 추가 (nblExemptUrbanFarmlandJongjoong 뒤) |
| ② | initial(factory) | `lib/stores/calc-wizard-asset-factory.ts:187` | `nblExemptInong: false, nblExemptInongDate: "",` 추가 |
| ③ | normalize(NBL_DEFAULTS) | `lib/stores/calc-wizard-asset-nbl.ts:160` | `nblExemptInong: false, nblExemptInongDate: "",` 추가 (sessionStorage 복원 fallback) |
| ④ | API 변환(raw 빌더) | `lib/calc/non-business-land-request.ts:64` | **자동**(prefix-pick) — 코드 무변경 |
| ⑤ | UI 위젯 | `components/calc/transfer/nbl/UnconditionalExemptionSection.tsx:14-21, 168` | (a) `anyExempt`에 `a.nblExemptInong` 합류 (b) 종중 ToggleCard 뒤(line 168 후)에 이농 ToggleCard 추가 — tone="violet", title "2006.12.31 이전 이농 농지 (2009.12.31까지 양도)", checked=`asset.nblExemptInong`, children에 "이농일" DateInput(`asset.nblExemptInongDate`), LawArticleModal legalBasis "소득세법시행령 §168조의14" label "소득령 §168-14③5호 (시행규칙 §83의5④2호)" |
| ⑥ | 사이드바 합계 | (해당 없음) | NBL 판정은 금액 합계 무관 — 변경 없음 |
| ⑦ | 결과 카드 | `components/calc/NonBusinessLandResultCard.tsx` | **변경 없음**(데이터-드리븐). 이농 의제 시 엔진이 `reason:"inong"`·정정된 legalBasis를 judgment에 채워 적용법령 배지·detail 자동 표시 |
| ⑧ | validation | `lib/calc/transfer-tax-validate-asset.ts` | 이농 ToggleCard ON 시 `nblExemptInongDate` 필수 차단(다른 의제 날짜 필드와 동일 패턴). 단, 농지(`farmland`)가 아니면 의제 미적용이므로 안내. **3중 패턴**: UI 미입력=오류 → validate 동일 차단(자동 fallback 없음) |
| ⑨ | Zod enum 메인 | (해당 없음) | nonBusinessLandRaw는 ⑫에서 처리 |
| ⑩ | Zod 컴패니언+refines | (해당 없음) | companion 자산은 NBL raw 미전송 |
| ⑪ | 자산-수준 acquisitionDate fallback | (해당 없음) | 이농일은 독립 필드(`inongDate`) — acquisitionDate fallback 불요 |
| ⑫ | **Zod 입력객체 정의** | `lib/api/transfer-tax-schema-sub.ts:139` | **명시 추가 필수**(TS 미감지 침묵 strip): `nblExemptInong: z.boolean().optional(),` + `nblExemptInongDate: z.string().optional(),` |
| ⑬ | callTransferTaxAPI body spread | `lib/calc/transfer-tax-api.ts`·`multi-transfer-tax-api.ts` | **자동**(④ prefix-pick으로 운반) — 코드 무변경 |
| ⑭ | Route handler 엔진 input 매핑 | `app/api/calc/transfer/route.ts:213`·`multi/route.ts:145` | **자동**(`buildNblEngineInput`→`mapAssetToNblInput`→`buildUnconditionalExemption`이 nested 변환). 단 **`buildUnconditionalExemption` 본문 수정 필요**(아래 §5) — 신규 필드 매핑 |

**⑫⑭ grep 자가점검**: `grep -n "nblExemptInong" lib/api/transfer-tax-schema-sub.ts lib/tax-engine/non-business-land/form-mapper-helpers.ts lib/stores/calc-wizard-asset.ts` — 3 파일 모두 hit 확인.

## 5. 엔진/변환 로직

### 5.1 form-mapper-helpers.ts: buildUnconditionalExemption 확장 (현재 line 83-105)
- **has 게이트**(line 88-91)에 이농 추가:
  ```
  asBool(a.nblExemptUrbanFarmlandJongjoong) || asBool(a.nblExemptInong);
  ```
- **매핑 객체**(line 94-103)에 추가:
  ```
  isInong:   asBool(a.nblExemptInong),
  inongDate: parseDate(asString(a.nblExemptInongDate)),
  ```
- 이로써 `mapAssetToNblInput`이 `unconditionalExemption.isInong/inongDate`를 채워 엔진(`unconditional-exemption.ts:131-137`)이 즉시 동작.

### 5.2 unconditional-exemption.ts: legalBasis 드리프트 정정 (로직 무변경)
- line 126: `"공익사업법 연계 (레거시)"` → `"소득세법 시행규칙 §83의5④ 1호"`.
- line 142: `"구법 이농 조항 (레거시)"` → `"소득세법 시행규칙 §83의5④ 2호"`.
- line 120 주석 갱신. **판정 산식·cutoff는 무변경**(이미 정합).

### 5.3 legal-codes/transfer.ts (선택)
- NBL 상수에 `UNCONDITIONAL_INONG`·`UNCONDITIONAL_FACTORY_ADJACENT` 상수 신설 후 엔진이 문자열 리터럴 대신 상수 참조(법령코드 상수 정책). 단 현행 다른 의제 사유도 문자열 리터럴 직접 사용 중이므로 일관성 위해 본 PR은 리터럴 정정만 하고 상수화는 후속 통일 작업으로 분리 가능.

## 6. UI 변경 (UnconditionalExemptionSection.tsx)

1. `anyExempt`(line 14-21)에 `|| a.nblExemptInong` 추가 — 의제 활성 배너·opacity 게이트에 이농 포함.
2. 종중 ToggleCard(line 156-168) 뒤에 이농 ToggleCard 추가:
   - `tone="violet"`, title "2006.12.31 이전 이농 농지", description/hint로 "농지 한정 · 2009.12.31까지 양도분".
   - `checked={asset.nblExemptInong}`, `onCheckedChange={(v)=>onAssetChange({nblExemptInong:v})}`.
   - children: "이농일" 라벨 + `DateInput value={asset.nblExemptInongDate} onChange={(v)=>onAssetChange({nblExemptInongDate:v})}`.
   - trailing: `LawArticleModal legalBasis="소득세법시행령 §168조의14" label="소득령 §168-14③5호 (시행규칙 §83의5④2호)"`.
3. 공장 인접 ToggleCard(line 120-132) 라벨 정정: "공장 인접지 (구법 특례)" → "공장 인접 매수 토지 (§83의5④1호)", label "소득령 §168-14③ 구법" → "소득령 §168-14③5호 (시행규칙 §83의5④1호)".
4. ToggleCard·DateInput·LawArticleModal 기존 import 재사용 — 신규 컴포넌트 없음.

## 7. Edge case · Risk

1. **농지 한정**: 이농 의제는 `categoryGroup === "farmland"`에서만(`unconditional-exemption.ts:134`). 임야·목장 선택 시 toggle ON이어도 미적용 — UI hint로 "농지 전용" 안내. validate에서 농지 외 + 이농 ON 시 안내(차단 아님 — 다른 지목은 의제 미적용일 뿐 오류 아님).
2. **날짜 경계**: `inongDate <= 2006-12-31` AND `transferDate <= 2009-12-31` 모두 충족해야 의제. 양도일이 2009.12.31 초과면 미적용 — 현실적으로 거의 모든 현재 양도가 미적용(트리거 희소). numeric 영향은 2009 이전 양도 사례에 국한 → 충실도(법령 완전성) 성격이 큼.
3. **드리프트 정정 회귀**: legalBasis 문자열 변경이 기존 테스트의 문자열 단언을 깨는지 확인 — `grep -rn "공익사업법 연계\|구법 이농" __tests__/` 0건이면 안전(검증 필요).
4. **prefix-pick 신뢰**: ④⑬ 자동이라 store 추가만으로 raw 운반되나, **⑫ Zod 누락 시 침묵 strip** — Zod 추가가 본 PR의 진짜 게이트. grep 자가점검 필수.
5. **3a·3b와 store/Zod 파일 공유**: `calc-wizard-asset.ts`·`factory`·`asset-nbl.ts`·`transfer-tax-schema-sub.ts`를 3a·3b도 수정 → 순차 머지 + rebase로 충돌 회피(마스터 시퀀싱 참조).
6. **800줄 정책**: `UnconditionalExemptionSection.tsx` 171줄 → ToggleCard 1개 추가로 ~200줄(여유).

## 8. Pre-Do anchor (Do 진입 전 우선 실행)

**AT-INONG-PREDO (isPreDo)**: 농지·도시지역 밖, 자경 0년(기간기준 미충족 → baseline 비사업용), 이농 toggle ON·이농일 2005-06-01·양도일 2009-06-01.
- **현행(FAIL)**: UI/store에 `nblExemptInong` 부재 → raw 미전송 → `unconditionalExemption.isInong` undefined → 의제 미진입 → `isNonBusinessLand === true`. 풀 파이프라인 anchor(`buildNblEngineInput(raw)` → `judgeNonBusinessLand`)에서 `nblExemptInong:true` raw를 넣어도 현행 Zod/매퍼가 strip → `isNonBusinessLand === true` 로 FAIL.
- **구현 후(PASS)**: `isNonBusinessLand === false`(무조건 사업용 의제), `judgment` reason="inong", legalBasis "소득세법 시행규칙 §83의5④ 2호".
- **대조 anchor**: 동일 입력에 양도일 2010-06-01(2009.12.31 초과) → `isNonBusinessLand === true`(의제 미적용, cutoff 경계 확인).

## 9. 작업 순서 (Do)
1. Pre-Do anchor 작성·실행 → 현행 strip으로 FAIL 확보.
2. ⑫ Zod(transfer-tax-schema-sub.ts:139) → ① store → ②③ factory/normalize → ④ form-mapper-helpers(has게이트+매핑) → ⑤ UI ToggleCard+anyExempt → 드리프트 정정(unconditional-exemption.ts:126·142·120).
3. ⑧ validation(이농 ON 시 이농일 필수).
4. grep 자가점검(⑫⑭ nblExemptInong 3파일 hit).
5. Pre-Do anchor PASS + 대조 anchor.
6. `npx tsc --noEmit` 0 → `npx vitest run __tests__/tax-engine/non-business-land/ __tests__/lib/calc/nbl-*` → 전체 `npm test`.
7. E2E(worktree E2E_PORT=3101): 농지 자산 → 이농 toggle+이농일 입력 → 계산 → Network 탭 `nonBusinessLandRaw.nblExemptInong` 전송 확인 + 결과 무조건 사업용 판정 확인(미수행 시 명시).


---

## 🔍 R1 자가검토 정정 (2026-06-16, plan-design-self-review-loop · 실측 검증)

> 7-에이전트 검토(인용 grep/Read 실측) 결과. 정정은 본 절을 우선(본문 인용과 충돌 시 본 절 기준).

| 우선 | 카테고리 | 정정 |
|---|---|---|
| **Critical** | 누락 | **anyExempt 이중 집계(실측)**: `NblSectionContainer.tsx:53-60`에 두 번째 anyExempt가 있고 정밀판정 폼 나머지의 `opacity-50 pointer-events-none` 게이트(:96)를 제어. **두 곳 모두**(NblSectionContainer:53-60 + UnconditionalExemptionSection:14-21)에 `\|\| asset.nblExemptInong` 추가 필수. ⑤에 반영. 향후 단일 헬퍼 추출 권고([[single-source-engine-helper]]). |
| High | 오류 | ⑧ validation: "다른 의제 날짜 필드와 동일 패턴" **부재**(상속일·고시일·종중취득일 필수차단 grep 0건). 정책 **(b) 채택** — 이농일 미입력=의제 미적용(엔진 cutoff 위임), 단일 토글만 비일관 차단 금지([[feedback_validation_sync_8th_point]]). §8·§9 정정. |
| Medium | 모순 | ⑦: 결과타입 `unconditionalExemption`(types.ts:395-399)에 **legalBasis 필드 없음**, 강조배너(NonBusinessLandResultCard.tsx:36-43)는 **하드코딩 "§168-14③"+detail만**. 정정 legalBasis는 `judgmentSteps` 배지(step.legalBasis)에만 노출. 배너 표시 원하면 결과타입 legalBasis 추가+바인딩(추가 ⑦ 작업) scope 명시. |
| Low | 오류 | 공장인접 라벨: "매수"는 법문에 없음. §83의5④1호="소유자 **요구로 취득**한 공장 부속토지의 **인접토지**"(면제대상=인접토지). label/detail "공장 오염피해 인접토지 (소유자 요구로 취득)"로. **SR-8 확인필요는 본 검토로 해소**(취득·인접토지 구조 확정 — Do 재확인 불요). |
| Low | 개선 | ④ prefix-pick=**transport만**; nested 매핑(buildUnconditionalExemption §5.1)은 ⑭ 수동 필요(미반영 시 isInong strip). §0·④ 행 문구 통일. |
| Low | 오류 | "inong" 리터럴 **정의=types.ts:150**(UnconditionalExemptionReason), 사용=unconditional-exemption.ts:140. §3 정정. |
| Low | 누락 | NBL 전용 E2E baseline **부재**(e2e/ nbl 매칭 0건) → 신규 spec **단독 통과**를 충족 기준(전체 사전존재 실패와 분리 [[feedback_e2e_preexisting_failures]]). |

---

## ✅ Do 구현 완료 (2026-06-16, worktree feat/nbl-gap2)

**변경(코드 8 + 테스트 1)**:
- store/factory/normalize/Zod (①②③⑫): `nblExemptInong: boolean`·`nblExemptInongDate: string` 신규 — `calc-wizard-asset.ts`·`-factory.ts`·`-nbl.ts`·`transfer-tax-schema-sub.ts`.
- form-mapper-helpers (④/⑭): `buildUnconditionalExemption` has 게이트 + 매핑에 `isInong`/`inongDate` 추가 → `mapAssetToNblInput`→`buildNblEngineInput`(route 무변경).
- UI (⑤): `UnconditionalExemptionSection` 이농 ToggleCard(violet·이농일 DateInput) + **anyExempt 이중 합류**(`UnconditionalExemptionSection.tsx:14-21` + `NblSectionContainer.tsx:55-63` 둘 다 — R1 SR-11 Critical) + 공장인접 라벨 정정.
- 드리프트(`unconditional-exemption.ts`): `isFactoryAdjacent` legalBasis "공익사업법 연계 (레거시)"→"시행규칙 §83의5④ 1호"·detail("매수"→"취득"·인접토지), `isInong` legalBasis "구법 이농 조항 (레거시)"→"§83의5④ 2호", 주석 2건. **판정 산식·cutoff 무변경**(이미 정합).

**R1 적용**: ⑧ validation 비차단(기존 의제 날짜 필드 패턴 부재→엔진 cutoff 위임), ⑦ 결과 강조배너는 하드코딩 "§168-14③" 불변·정정 legalBasis는 judgmentSteps 배지만, SR-8 해소(§83의5④1호=취득·인접토지 구조 확정).

**14지점**: ①②③⑫⑤(추가)·④⑬⑭(prefix-pick+form-mapper-helpers 자동·route 무변경)·⑥⑦⑧(N/A·무변경).

**검증**: Pre-Do anchor(`__tests__/lib/calc/nbl-inong-exemption.test.ts`) 현행 FAIL(isInong undefined·isNonBusinessLand true) → 구현 후 PASS(isInong true·false, 대조 2010 양도 true). ⑫⑭ grep 7파일 hit. tsc 0 · 전체 vitest **8452 passed / 0 failed**. E2E 미수행(엔진 anchor로 실증·ToggleCard 재사용).
