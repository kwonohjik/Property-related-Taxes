# 수정 계획서 — 3시점 일괄 모달 시점별 구조·용도 분리 입력 (용도지수 체계 매핑)

- 영역: 건물 기준시가 3시점 일괄 계산기(PHD §164⑤) — 배치 어댑터 + 모달 UI + 스냅샷 재구성
- 상태: **Plan (착수 전)** · 작성 2026-07-07 · 스코프 **옵션 B(3시점 각각 별도)** 사용자 확정
- 관련: [[project_transfer_phd_3point_batch_stdprice]] · [[feedback_ui_input_path_enumeration]] · [[feedback_engine_result_map_json_loss]] · [[feedback_store_default_vs_ui_display_fallback]] · [[feedback_subagent_completion_report_scrutiny]] · [[feedback_korean_law_citation_verify]]
- 선행: `building-std-acq-base-rate-8-5-durable-substitution-fix.plan.md`(§8⑤ — 커밋 1c9a58ba, 별개 완료)

---

## §0 증상 & 근본 원인 (홈택스 실측 확정)

시멘트블록조·단독주택·신축1966·취득1999·최초공시2005·양도2026·면적115.
- 홈택스 취득당시 = 5,520,000 × 1.095 = **6,044,400** (용도지수 **1.0**)
- 우리 앱 = 5,414,775 (용도지수 **0.9**) — **용도지수만 불일치**

**근본 원인**: 용도 번호가 국세청 체계 개정마다 재편되어 **연도 간 안정적이지 않음** —

| 체계 | #1 | #2 |
|---|---|---|
| 2001·2002 | **단독주택·아파트** | 다중·다가구·연립·다세대 등 |
| 2003~2013 | 아파트 | 단독주택 |
| 2014~(현행) | 아파트 | **단독주택(다중·다가구·연립·다세대 통합)** |

`PhdBuildingStdPriceModalButton`은 부분별 구조·용도를 **하나만**(`optionYear`=양도연도=2026 체계) 받아 3시점 전부 재사용(`:116-119`·`:147`). 취득(2001)엔 현행 #2(단독)를 넘기지만 2001 체계 #2는 "다중·다가구·연립·다세대"(지수 0.9)라 오산출. 현행 #2(통합)는 옛 체계로 **단순 번호 매핑 불가**(2001은 단독=#1, 2003~13은 다세대=#3 분리) → **각 시점 용도를 해당 연도 체계로 직접 선택**받아야 정확(홈택스·메인 폼 `BuildingStdPriceForm.tsx:414` 방식).

**엔진은 정상**: `calcBuildingStandardPrice`는 시점별 구조·용도(취득 point vs 양도 point, 복합 `acqUsageNo`)를 이미 지원(§8⑤ anchor에서 usageNo=1→6,044,400 실증). 결함은 **배치 어댑터·모달이 단일 용도로 collapse**하는 데 있음.

## §1 스코프 (옵션 B — 3시점 각각 별도)

부분(층/구역)마다 **취득당시·최초공시·양도당시** 구조·용도를 각 시점 연도 체계로 독립 선택. 연면적은 시점 공통(증축 미고려 — 현행 유지). 시점별 공시지가는 이미 분리됨.

**영향 파일 5**:
1. `lib/calc/phd-building-std-batch.ts` — `PhdBatchPart` 타입 시점별화 + `valuationStdPrice`/`acqBaseStdPrice`/`computeCategory` 시점 구조·용도 사용
2. `components/calc/building-std-price/PhdBuildingStdPriceModalButton.tsx` — `PartRow` 시점별 필드 + UI 3블록 + `handleCalc`
3. `lib/calc/phd-batch-snapshots.ts` — `phdBatchToSnapshots` 시점별 구조·용도로 스냅샷
4. Case A 상가 `acqFirstUsageNo` 정합 (아래 §3)
5. 테스트 4종 (§5)

## §2 데이터 모델 (PhdBatchPart 시점별화)

```ts
export interface PhdBatchPartAtPoint { structureKey: string; usageNo: number; }
export interface PhdBatchPart {
  floorArea: number;
  category: PhdPartCategory;
  /** 양도시(필수 — 항상 산출). 기존 structureKey/usageNo 대체. */
  transfer: PhdBatchPartAtPoint;
  /** 취득당시(해당 연도 체계). 취득 산출 시 필수. */
  acquisition?: PhdBatchPartAtPoint;
  /** 최초공시(해당 연도 체계). 최초공시 산출 시 필수. */
  firstDisclosure?: PhdBatchPartAtPoint;
}
```
- **기존 `structureKey`/`usageNo`/`acqFirstUsageNo` 평면 필드 폐지** → 시점 객체로 이관. (호출부 실측 전수: `phd-building-std-batch.ts`·`phd-batch-snapshots.ts`·모달·테스트 3종뿐 — 전량 갱신.)
- 시점 미입력 → 해당 시점 산출 skip(unsupported 기록, 현행 `computeCategory` 패턴 유지). silent fallback 금지.
- **단일 진실 리졸버(dual-truth 방지)**: `partAtPoint(part, pointKey) → { structureKey, usageNo, floorArea }`를 `phd-building-std-batch.ts`에 두고 **어댑터(`computeCategory`)와 스냅샷(`buildValuationSnapshot`) 둘 다** 이 함수로 시점 구조·용도를 해석. 각자 재구현 금지(엔진 산출값 ↔ 계산서 재유도 드리프트 차단 — [[feedback_engine_result_display_drift]]). `computeCategory`/`valuationStdPrice`/`acqBaseStdPrice`는 이미 시점 해석된 `{structureKey,usageNo,floorArea}[]`를 받도록 시그니처 변경.

## §3 Case A 상가 정합 (acqFirstUsageNo 제거·시점별로 흡수)

기존: 겸용 Case A(취득·최초공시 상가 = 당시 주택 용도, 재일46014-2396)를 `acqFirstUsageNo` 자동주입으로 처리(모달 `:150-156`, 어댑터 `:194-198`).

시점별화 후: **상가 부분의 `acquisition`/`firstDisclosure` = 그 시점 주택 대표부분의 구조·용도**를 모달이 자동 주입(현행 auto 로직 유지, 단 대상이 "주택부분의 해당 시점 값"). 상가의 `transfer`만 상가 용도. → `acqFirstUsageNo` 필드 제거, Case A는 "상가.acquisition = firstHousing.acquisition" 대입으로 표현.
- `commercialAcqFirstMode` OFF(Case B·단독): 상가 acquisition/firstDisclosure 미주입 → 취득·최초공시 상가 미산출(현행 동작 유지).
- **`acqFirstUsageNo` 참조 전수 제거·이관**(실측): 어댑터 타입·로직(`:35·191-198`)·스냅샷 로직(`:12·93-95`)·모달(`:61·154`) + 테스트 `phd-batch-snapshots.test.ts:63`·`phd-building-std-batch-mixed.test.ts:105,133`(A5/A6). A5/A6는 "상가.acquisition=주택 용도" 형태로 재작성(단언값 유지 — 등가).
- **스냅샷 `buildValuationSnapshot`에 `pointKey` 인자 추가**(현재 `parts,builtYear,point`만) → `partAtPoint`로 해당 시점 구조·용도 선택.

## §4 UI (모달 3블록 — 부분 카드 내)

부분 카드에 시점별 구조·용도 블록. 각 `BuildingStructureSelect`/`BuildingUsageSelect`의 `year`를 **해당 시점 연도**로:
```
부분 N (연면적 공통)
 ├ [amber] 취득당시 (year=취득연도)   구조 · 용도
 ├ [violet] 최초공시 (year=최초공시연도) 구조 · 용도
 └ [emerald] 양도당시 (year=양도연도)   구조 · 용도
   연면적 ㎡ (공통)
```
- 색조: 취득=amber·양도=emerald·최초공시=violet (components/calc CLAUDE.md tone 규약).
- 시점 연도 미확정(사용자가 취득/양도 연도 미입력) 시 해당 블록 disabled + 사유. (연도는 모달 상위 `points`에서.)
- **옵션 커버리지**: 각 시점 select가 그 연도 체계 옵션만 표시(`listUsageOptions(year)`). 취득 ≤2000 → 2001 체계 옵션(엔진 acqBase가 2001표 사용과 정합, 메인폼 `acqIndexYear` 동일 규칙).
- Case A 상가: 취득·최초공시 구조·용도 블록 **숨김**(자동=주택), 안내 문구 유지.

## §5 anchor & 테스트

**Pre-Do gold anchor(홈택스)**: `computePhdThreePointStdPrice` 사용자 케이스 —
- 취득 부분 `acquisition={cement_block, usageNo:1(2001 체계 단독)}` → housing 취득 = **6,044,400**
- 최초공시 `firstDisclosure={cement_block, usageNo:2(2005 체계 단독)}` → 3,220,000
- 양도 `transfer={cement_block, usageNo:2}` → 10,235,000
- (선행 §8⑤ anchor `transfer-pre2001.test.ts`의 6,044,400과 정합.)

**회귀 갱신**: `phd-3point-batch.anchor.test.ts`·`phd-batch-snapshots.test.ts`·`phd-building-std-batch-mixed.test.ts`·`building-std-report-phd-section.test.ts` — PhdBatchPart 시점별 구조로 입력 형태 변경. 값 anchor는 **기존 값 유지**(양도·최초공시는 무변화, 취득만 용도 정확화로 변동 가능 → 정정). self-consistency(스냅샷 재유도) 테스트는 등가라 구조 변경만 반영.

**UI E2E**(Playwright): 3시점 모달에 취득/최초공시/양도 구조·용도 각 입력 → "3시점 계산" → 취득 6,044,400 표시 → "모두 적용". (memory `feedback_browser_verify_with_playwright` — 수동 안내 대신 E2E.)

## §6 회귀 영향 & 리스크

- **R1 (스냅샷 재유도 정합)**: `phdBatchToSnapshots`가 시점별 구조·용도를 `valStructureKey`/`valUsageNo`로 각 시점 스냅샷에 반영해야 결과탭 「건물 기준시가 계산서」가 시점별 정확. self-consistency 테스트로 가드. — 중.
- **R2 (Case A 상가 정합)**: acqFirstUsageNo 제거 → "상가.acquisition=주택.acquisition" 대입 누락 시 Case A 상가 취득 미산출 회귀. mixed 테스트로 가드. — 중.
- **R3 (입력 부담↑)**: 부분당 구조·용도 3배. 대부분 동일값이라 UX 저하 — "양도 입력값을 취득·최초공시로 복사" 편의 버튼 고려(선택, Do 시 판단). — 낮음.
- **R4 (시점 연도 의존)**: 취득/양도 연도가 상위 모달 상태에서 옴. 미입력 시 블록 비활성 — validation 명확화. — 낮음.
- **엔진 무변경**: `calcBuildingStandardPrice` input/result 타입 불변(이미 시점별 지원). 14 동기화 지점 중 엔진·Zod·Route 무관 — 배치 어댑터/모달/스냅샷 국한.

## §7 Definition of Done

- [ ] `PhdBatchPart` 시점별 구조(`transfer`/`acquisition?`/`firstDisclosure?`)로 재정의, 평면 필드 폐지
- [ ] `partAtPoint(part, pointKey)` 단일 리졸버 — 어댑터·스냅샷 공유(dual-truth 차단)
- [ ] `computePhdThreePointStdPrice`·`valuationStdPrice`·`acqBaseStdPrice` 시점 구조·용도 사용
- [ ] `phdBatchToSnapshots`·`buildValuationSnapshot`(+pointKey) 시점별 스냅샷
- [ ] Case A 상가: acqFirstUsageNo 전수 제거(어댑터·스냅샷·모달·테스트 A5/A6) → 시점별 주택 용도 대입
- [ ] 모달 UI 3블록(시점별 연도 체계 옵션·tone·disabled 사유) + `handleCalc` 시점별 parts
- [ ] gold anchor: 사용자 케이스 취득 6,044,400·최초공시 3,220,000·양도 10,235,000
- [ ] 회귀 테스트 4종 입력 형태 갱신 + 값 정합
- [ ] `npx tsc --noEmit` 0 · `npx vitest run __tests__/tax-engine/building-standard-price/ __tests__/calc/` · 전체 `npm test` 회귀 0
- [ ] Playwright E2E: 3시점 모달 취득 6,044,400 표시
- [ ] 코드 품질 정적 검토 게이트
