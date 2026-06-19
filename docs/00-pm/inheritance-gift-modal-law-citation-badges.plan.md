# 상속·증여 탭 — 입력 카드/모달 조문 링크화(배지) 수정 계획서

> 작성일: 2026-06-19 · 대상: 상속세·증여세·의제증여 탭의 ToggleCard/RadioCard/FieldCard 내 조문 평문
> 트리거: 의제증여 "저가양수·고가양도" 모달의 §35①·§35②·§35③·법인세법 §52② 등이 평문이라 클릭 불가(이미지 6)
> 성격: **순수 표시(읽기 전용) UI** — 엔진·Zod·계산식·결과값 무변경

## 1. 배경 / 목표

상속·증여 탭의 입력 카드·모달에는 조문 표기(`§35①`, `상증법 §60`, `시령 §49①`, `법인세법 §52②` 등)가 **`ToggleCard.title`·`RadioCard.option.label`·`description`·`hint`에 평문**으로만 들어가 있어, 결과뷰처럼 클릭해 본문을 볼 수 없다. 결과뷰·일부 입력 섹션은 이미 `LawArticleModal`로 링크화(PR#196 등)되어 있으나 **입력 카드/모달은 누락**.

목표: 상속·증여 탭의 모든 입력 카드/모달 조문 표기를 **클릭 가능한 법령 배지**로 노출. (다른 탭은 후속 — 이번 계획서 범위 외.)

## 2. 사용자 결정 (인터뷰 확정)

| # | 항목 | 결정 |
|---|---|---|
| 1 | 링크 방식 | **제목 옆 별도 배지 링크** — 제목 §평문은 그대로, 우측에 `[§35①]` 클릭 배지 |
| 2 | 대상 텍스트 | **제목·설명·라벨·힌트 전부** — 카드 내 모든 §를 링크 대상으로 |
| 3 | 범위 | **상속·증여 탭 전체(188건) 한 번에** |

→ 정합 통합: **카드별 "법령 배지 클러스터"**. 각 카드(ToggleCard/RadioCard option)의 title·description·hint에 등장하는 **서로 다른 조문을 모아** 카드 우측/하단에 `LawArticleModal` 배지 줄로 렌더. 평문은 그대로 두고(문장 흐름 유지), 배지가 모든 인용 조문을 클릭 가능하게 만든다.

## 3. 현황 (실측)

- **규모**: 상속 159건 / 증여 7건 / 의제증여 22건 = **188건, 47개 파일**. (집계: `§` grep 기준.)
- **공용 컴포넌트 제약**:
  - `ToggleCard` (`components/calc/inputs/ToggleCard.tsx`): `title: string`(ReactNode 불가), `description?: ReactNode`, `trailing?: ReactNode`, `children?: ReactNode`.
  - `RadioCardGroup` (`components/calc/inputs/RadioCardGroup.tsx`): `option.label: string`, `option.description?: ReactNode`, `option.hint?: ReactNode`, `option.trailing?: ReactNode`.
- **재사용 인프라 (완성)**:
  - `LawArticleModal` (`components/ui/law-article-modal.tsx`): `{ legalBasis: string; label?: string; className? }`. 클릭 → law.go.kr 본문 팝업 + 항(①~⑮) 하이라이트.
  - 파서 (`lib/utils/law-url.ts`): `parseLawRefsForModal(s)`(복합 인용 분리·`시행령` 직전 본법 상속), `parseLawRef(s)`, `extractClauseMarkers(s)`, `buildLawUrl(s)`.
- **기존 부분 적용(통합 대상)**: `DebtItemEditor.tsx`·`CasualtyLossSection.tsx` 등은 이미 `trailing`/`children`에 `LawArticleModal`을 두되 **제목 §평문은 여전히 비링크** → 배지 클러스터로 일원화.

## 4. 설계

### 4-1. 신규 헬퍼 — `extractInlineLawRefs(text, defaultLaw)`
위치: `lib/utils/law-url.ts` 에 추가.

- 입력: 카드 텍스트(예: `"특수관계인 간 거래 (§35①)"`, `"끄면 특수관계인 외 거래 (§35②)"`, `"법인세법 §52② 시가 해당"`, `"상증법 §60①·시령 §49①"`)와 **기본 법령명**(상속·증여 탭 = `"상증법"`).
- 동작: 텍스트를 정규식으로 스캔해 `§`/`제N조` **각 출현마다** → 그 **§ 직전에 인접한 법령명 토큰**(`법인세법`·`국세기본법`·`소득세법`·`지방세법`·`시령`/`시행령`)만 역방향으로 짧게 탐색, 있으면 그 법령·없으면 `defaultLaw`. `시행령`/`시령` 단독은 직전 본법의 시행령으로 매핑(`상증법 → 상속세및증여세법 시행령`).
- 출력: `{ label: string; legalBasis: string }[]` (중복 dedupe, 등장 순서 유지).
  - **`label`은 항(項) 마커 포함**(예: `"§35①"`) — `LawArticleModal`이 `extractClauseMarkers(label ?? legalBasis)`(`law-article-modal.tsx:118`)로 항을 강조하므로 label에 `①`이 있어야 ① 하이라이트가 동작.
  - `legalBasis`는 정제 인용(예: `"상증법 §35①"`).

> ⚠️ **[E-1 정정] 기존 `parseLawRefsForModal`는 그대로 재사용 불가.** 그 함수의 `extractNamePart`(`law-url.ts:31-34`)는 **§ 앞 전체 구절을 법령명으로 간주**하므로, 자유 텍스트 `"특수관계인 간 거래 (§35①)"`을 넣으면 lawName이 `"특수관계인 간 거래 ("`(쓰레기)로 나온다. 즉 기존 파서는 **이미 정제된 인용 문자열 전용**이다. 신규 헬퍼는 **§ 직전 인접 토큰만 보는 새 스캔 로직**을 직접 작성하고, 재사용은 `resolveLawAlias`·`ARTICLE_RE`(가지번호 `의` 처리 포함)·`extractClauseMarkers`로 한정한다.
>
> 대안: 카드마다 **정제 인용 문자열을 명시 `lawRefs`로 직접 전달**하면 기존 파서를 안전하게 쓸 수 있으나 188건 수기 작성 부담. → 신규 스캔 헬퍼(자동) 채택하되 §5 Pre-Do 테스트로 오인 케이스를 선검증.

### 4-2. 신규 컴포넌트 — `LawRefBadges`
위치: `components/ui/law-ref-badges.tsx`.

- props: `{ refs: { label; legalBasis }[]; className? }` 또는 `{ text: string; defaultLaw: string }`(내부에서 extract).
- 렌더: `refs.map` → `<LawArticleModal legalBasis={r.legalBasis} label={r.label} />` 를 `flex flex-wrap gap-1` 작은 배지 줄로. refs 0건이면 `null`.

### 4-3. 공용 카드 컴포넌트 확장 (opt-in, 타 세목 무영향)
- `ToggleCard`: prop `lawLinks?: string`(기본 법령명, 예: `"상증법"`) 추가. 지정 시 컴포넌트가 자신의 `title`(항상 string) + `description`(**`typeof === "string"`일 때만**) 텍스트에서 `extractInlineLawRefs(…, lawLinks)` 로 조문을 모아 `LawRefBadges` 렌더. 명시 override가 필요하면 `lawRefs?: { label; legalBasis }[]` 직접 전달도 허용(자동 추출 대신 사용).
  - 기본값 미지정(off) → 기존 동작 그대로 → **양도·취득·재산·종부세 등 타 세목 사용처 무영향**(off-by-default 회귀 가드 §8).
- `RadioCardGroup`: 그룹 레벨 `lawLinks?: string` 추가 → 각 option의 `label`(string) + `description`/`hint`(string인 경우)에서 추출해 option 행에 배지. option별 override는 `option.lawRefs?`.
- **[O-3] ReactNode 텍스트 처리**: `description`·`hint`가 JSX·삼항(JSX 반환)·보간 등 **비-string**이면 자동 스캔 불가 → 해당 카드는 `lawRefs`로 **수동 명시**(Do 단계에서 비-string description 카드를 grep으로 식별해 별도 처리).
- **[C-1] 배치 원칙**(결정 1 = "제목 옆" + 결정 2 = "전부"): 배지 클러스터는 **제목 행 우측**(Switch=`trailing`과 분리된 슬롯)에 두되, 한 카드에서 제목§+설명§+힌트§가 합쳐져 폭을 넘으면 **제목 바로 아래 줄로 wrap**. 즉 "제목 옆"을 기본 위치로, 다건일 때 아래로 흘림. ON/OFF tone 유지.

> **[중복 노출 트레이드오프]** description/hint의 §평문은 문장 안에 그대로 남고 배지로도 노출됨(문장 흐름 보존 위해 의도). `title` 인라인 링크화(ReactNode 전환)는 사용자가 배지 방식을 택했으므로 미채택.

### 4-4. 호출부 변경 패턴 (188건, 기계적)
각 상속·증여 카드에 `lawLinks="상증법"` 한 줄(또는 RadioCard는 그룹/옵션 레벨) 추가. 텍스트는 손대지 않음 → diff 최소, 회귀 위험 낮음. 자동 추출이 오인하는 소수 케이스만 `lawRefs={[…]}` 명시 override.

## 5. Pre-Do 파서 검증 (필수 게이트)
구현 착수 전, **신규 `extractInlineLawRefs` 스캐너**(기존 `parseLawRefsForModal` 아님 — [E-1])가 자유 텍스트를 정확히 분해하는지 **throwaway 단위 테스트**로 확증(정책 `pre-do-anchor-verification`). 특히 §1번 케이스가 쓰레기 lawName(`"특수관계인 간 거래 ("`)으로 나오지 않는지(= 기존 파서 오용 방지)를 1순위로 확인. 샘플:

| 입력 | 기대 |
|---|---|
| `"특수관계인 간 거래 (§35①)"` | 상증법 §35 (항 ①) |
| `"법인세법 §52② 시가 해당"` | 법인세법 §52 (항 ②) |
| `"상증법 §60①·시령 §49①"` | 상증법 §60 + 상증령 §49 |
| `"§16③1호나"` | 상증법 §16 (항 ③) |
| `"§18의3"` / `"§45의2③"` / `"§71②1가"` | 상증법 §18-3 / §45-2(③) / §71(②) — **의/호/가 분해 확인** |
| `"영리법인 사전증여 (§13①2호 + §3의2②)"` | 상증법 §13 + §3-2 |

⚠️ `의`(§18의3)·`호`·`가`·복합(`+`·`·`) 분해가 부정확하면 헬퍼를 먼저 보강. law.go.kr 조회는 articleNum 정확도에 의존.

## 6. 작업 단위 (파일 그룹 — 총 188건 = 의제 22 + 상속 159 + 증여 7)
공용 컴포넌트(4-1~4-3) 먼저 → 파일 그룹별 `lawLinks` 주입. 그룹 단위로 tsc/E2E 통과 후 다음 그룹.

> 아래 건수는 **잠정 분배**(합 = 188 고정). 정확한 파일별 건수는 Do 시작 시 `§` grep으로 동결(케이스 매트릭스). 상속 159건을 G2~G5에 정확 배분하며, 잔여는 G5(기타)가 흡수.

| 그룹 | 대표 파일 | 건수(잠정) |
|---|---|---|
| G1 의제증여(트리거) | `components/calc/deemed-gift/shared.tsx`·`capital-forms.tsx`·`presumption-forms.tsx` | 22 |
| G2 상속 공제/세액 | `inheritance/Step4Deductions.tsx`·`InstallmentInputSection.tsx` | ~25 |
| G3 상속 가업/영농 | `FarmingEligibilitySection.tsx`·`FamilyBusinessEligibilitySection.tsx`·`HeirAssessmentCard.tsx` | ~32 |
| G4 상속 자산/평가 모달 | `estate-card/variants/EstateBodyRealEstate.tsx`·`RtmsSimilarSalesModal.tsx`·`CategoryChangeDialog.tsx`·비상장주식 | ~40 |
| G5 상속 기타 + 기존 링크 일원화 | 나머지 inheritance 파일·`CasualtyLossSection`·`DebtItemEditor` | **상속 잔여(159−G2~G4)** |
| G6 증여 | `gift/StockBurdenedDebtSection.tsx`·`PriorGiftHistoryModal.tsx` | 7 |

### [O-1] 기존 수동 `LawArticleModal` 중복 제거 (G4·G5 필수)
`DebtItemEditor`·`CasualtyLossSection` 등은 이미 `trailing`/`children`에 `LawArticleModal`을 둠. `lawLinks` 자동추출을 켜면 **동일 조문 배지 2중 노출**. → 해당 카드는 **둘 중 하나만**: ⑴ 기존 수동 `LawArticleModal` 제거하고 `lawLinks` 자동 클러스터로 일원화(권장), 또는 ⑵ 그 카드만 `lawLinks` off + 기존 수동 유지. Do 시작 시 `LawArticleModal` 사용처 grep으로 충돌 카드 목록 동결 후 일괄 정리.

## 7. 조문 정확성 검증 게이트
- 평문 §는 기존 코드에 이미 존재 — 선행 PR(예: #196)의 검수 여부는 **확인 필요**(추정 금지). 이번 작업은 **링크화**일 뿐 새 인용 추가는 아니나, 배지가 가리키는 본문이 맞는지 **대표 표본을 KoreanLaw MCP로 직접 대조**(정책 `korean-law-citation-verify`·메모리 `feedback_law_citation_link_workflow`). 특히 `§18의3`·`§45의2`·`§3의2` 같은 "의" 가지번호가 law.go.kr `/api/law/article`에서 정확히 열리는지.
- alias/MST 선확인: `상증법`·`상증령`·`법인세법`·`국세기본법` 별칭이 `parseLawRef`/aliases에 등록돼 있는지 사전 확인(미등록 시 보강). 법인세법 §52·국세기본법 시행령 §1의2 등 비-상증 법령 누락 주의.

## 8. 동기화 지점 (Definition of Done)
순수 표시 UI → 엔진 14/8 지점 대부분 N/A. 실제 체크:
- [ ] ⑤ UI: 배지 렌더, 토글/라디오 클릭과 간섭 없음, ON/OFF tone 유지
- [ ] 자동 추출 헬퍼 단위 테스트(§6 표) green
- [ ] 대표 조문 KoreanLaw 본문 일치 확인
- [ ] `lawLinks` 미지정 시 타 세목 카드 시각/동작 무변경(스냅샷/E2E)
- [ ] `npx tsc --noEmit` 0건 · `npm run lint` 0건
- N/A: ①②③④⑥⑦⑧⑨~⑭ (입력값·엔진·결과 무관)

## 9. E2E / 검증
- 대표 3 spec(전수 아님 — 패턴 검증):
  - 의제증여 모달(기존 `gift-deemed-detail-modal.spec.ts` 확장): BargainFields의 `§35①` 배지 클릭 → law 팝업 노출.
  - 상속 공제 단계(`Step4Deductions`): 배지 클릭 → 팝업.
  - 상속 자산 평가 모달(`EstateBodyRealEstate`/`RtmsSimilarSalesModal`): 모달 안 배지 클릭(이중 Dialog 닫기 순서 주의).
- 회귀: `npx vitest run`(엔진 무영향), `npm test`. 함정(메모리): 이중 Dialog backdrop·`data-testid` 동결·E2E 진입 셀렉터(`getByLabel("일")` 오매칭류).

## 10. 위험·함정 (메모리 인용)
- `feedback_law_citation_link_workflow`: 재검증 grep **경로 직접 나열**(zsh 변수 단어분할 거짓 0건)·항(項) 하이라이트·alias/MST 세목별 선확인·KoreanLaw 본문 대조(조문 존재만으론 부족).
- `feedback_explicit_prop_mapping_strip`: 컴포넌트 신규 optional prop은 TS 미감지 침묵 누락 — `lawLinks` 주입 grep 자가점검.
- 공용 ToggleCard/RadioCard는 **6세목 공용** → 변경은 반드시 opt-in(off-by-default)으로 타 세목 무영향 보장. 스냅샷/타 세목 E2E로 확인.
- 800줄 정책: 헬퍼·배지 컴포넌트는 신규 소형 파일로 분리.

## 10.5 구현 완료 (2026-06-19)

- **인프라**: `extractInlineLawRefs(text, defaultLaw)`(`lib/utils/law-url.ts`, 신규 스캐너) + `LawRefBadges`(`components/ui/law-ref-badges.tsx`). `ToggleCard`/`RadioCardGroup`에 opt-in `lawLinks`/`lawRefs` 추가(off-by-default).
- **Pre-Do(E-1) 게이트**: 스캐너 단위 테스트 `__tests__/unit/extract-inline-law-refs.test.ts` 17건. Pre-Do가 버그 2개 선검출(① `{2,}`→`+` "시령" 누락 / ② "공제"의 제→§3 오인 lookahead 차단) + 혼합 다법령 carry-over 간격 판정.
- **적용**: 129개 카드 `lawLinks="상증법"`(의제 29 + 상속·증여 100, 35파일). 199개 실제 카드 문자열 감사 → 쓰레기 lawName 0건.
- **a11y 회귀 수정**: 배지가 `<label>` 안 → Switch accessible name 오염으로 기존 테스트 3건 실패 → `ToggleCard` Switch에 `aria-label={title}` 고정(이름=title)으로 해결.
- **O-1 중복 정리**: `CasualtyLossSection`(trailing §23 제거→배지 일원화), `DebtItemEditor`(§22 toggle lawLinks 제거, 기존 §22·§19 전용 행 유지). `trailing={<LawArticleModal>}` 중복 0건 확인.
- **약칭 정정**: `FarmingEligibilitySection` 설명 "조세범/외감법"→"조세범처벌법/외부감사법"(토큰 인식 정확화).
- **검증**: `tsc` 0 · `eslint`(43파일) 0 · `vitest` 8963 pass(0 fail) · 의제증여 E2E 6/6(배지 클릭→법령 팝업 M-6 포함). KoreanLaw MCP로 §18의3·외부감사법 약칭·§35(라이브) 인용 정확성 확인.
- **알려진 범위 한계(후속)**: `FieldCard`/`CurrencyInput` 의 `hint` 및 평문 텍스트·표 안의 §(예: CurrencyInput hint "(§61① 단서)")는 카드-prop 메커니즘 밖이라 미배지. 비-string(JSX) description의 §는 title에 없으면 미배지. 양도·취득·재산·종부세 탭은 범위 외(동일 패턴 재사용 가능).

## 11. 자체 검토 정정 이력 (2026-06-19, 실측 기반)
인프라 실측(`law-url.ts`·`ToggleCard.tsx`·`RadioCardGroup.tsx`·`law-article-modal.tsx`) 후 정정:
- **E-1** [치명]: `parseLawRefsForModal` 자유텍스트 재사용 불가(`extractNamePart`가 § 앞 전체를 법령명 처리) → §4-1 신규 스캐너로 정정, §5 1순위 검증 추가.
- **E-2** [중]: §6 그룹 합 166≠188 → 총계 188 고정·잔여 G5 흡수로 정정.
- **E-3** [경]: §7 "추정" → "확인 필요"로 정정.
- **O-1** [치명]: 기존 수동 `LawArticleModal` 중복 노출 → §6에 중복 제거 절차 추가.
- **O-2** [중]: 항(項) 하이라이트 위해 `label`에 `①` 마커 포함 → §4-1 출력 스펙 명시.
- **O-3** [중]: 비-string description/hint 자동스캔 불가 → §4-3에 수동 `lawRefs` 경로 명시.
- **C-1** [중]: "제목 옆"(결정1)↔"전부"(결정2) 배치 충돌 → §4-3 wrap 규칙으로 해소.
- 검증 정확 확인: 건수 188/파일 47, `ToggleCardProps`·`RadioCardOption`·`LawArticleModal` props.

## 12. 범위 외
- 양도·취득·재산·종부세·주식양도 탭(후속 — 동일 패턴 재사용).
- `title`을 인라인 클릭 §로 바꾸는 방식(사용자가 배지 방식 선택).
- 새 조문 인용 추가/조문 내용 수정 — 기존 평문의 링크화만.
- 특수관계인 자동 판정 등 계산 기능.
