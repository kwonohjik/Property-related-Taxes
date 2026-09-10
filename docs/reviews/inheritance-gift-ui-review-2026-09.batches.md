# 상속·증여세 UI 리뷰 — 잔여 154건 처리 배치 (2026-09-11)

대장: [`inheritance-gift-ui-review-2026-09.md`](inheritance-gift-ui-review-2026-09.md).
BLOCKER 10건은 **PR #1581로 종결**. 이 문서는 **MAJOR 81 + MINOR 73 = 154건**의 처리 단위다.

전건 재분류를 스크립트로 검증했다 — **할당 154 · 누락 0 · 중복 0**.

## 묶는 기준은 「파일」이 아니라 «한 번 판단하고 N번 적용하는 단위»다

154건을 파일순으로 훑으면 파일마다 다른 판단을 새로 해야 한다. 대신 **수정 행위가 같은 것**끼리 묶으면
판단 1회를 N건에 분할상환할 수 있고, **검증 수단도 배치마다 하나로 고정**된다. 배치가 곧 PR이고,
배치가 곧 「이 PR에서 값이 바뀌었는가」의 판정 단위다.

| # | 배치 | 건수 | MAJOR | MINOR | 파일 | 수정 행위 | 검증 수단 |
|---|---|---:|---:|---:|---:|---|---|
| ~~G1~~ ✅ | ~~문구·조문표기~~ | 33 | 6 | 27 | 28 | 라벨·hint·조문 인용 1~3줄 | typecheck + 기존 테스트 (값 무변동) |
| G2 | 엔진 단일소스 위임 | 23 | 16 | 7 | 22 | UI 로컬 재구현 삭제 → 엔진 헬퍼 import | 「UI 표시값 == 엔진 값」 anchor |
| G4 | 게이트 OFF 값 정리 | 16 | 9 | 7 | 12 | 게이트가 닫힐 때 patch에서 값도 정리 | RTL anchor (OFF → store 키 부재) |
| G5 | 공용컴포넌트·인쇄·저장 | 13 | 3 | 10 | 11 | 저장소 확립 패턴으로 교체 | RTL + E2E 셀렉터 |
| G6 | 결과뷰·별지서식 | 14 | 13 | 1 | 13 | 화면 ↔ 별지 값·산식 불일치 해소 | 결과뷰 anchor + PDF 행 대조 |
| G7 | 재산카드·주식평가 | 10 | 7 | 3 | 9 | 카드별 게이트·목록 정합 | RTL anchor |
| G8 | 입력폼 구조·사후관리 | 20 | 9 | 11 | 16 | 위젯 신설·죽은 경로 판정 | RTL anchor + 개별 판단 |
| G3 | 미입력→0 (⑧validate·fallback) | 25 | 18 | 7 | 18 | 차단 추가 · `\|\| undefined` 방향 교정 | **E2E 전건** |
|  | **합계** | **154** | **81** | **73** | | | |

## 순서에 근거가 있다 — 임의 배열이 아니다

```
G1 → G2 → G4 → G5 → G6 → G7 → G8 → G3
```

- **G1이 먼저인 이유**: 값이 안 바뀌는 유일한 배치다. 뒤로 미뤄 값 변동 배치와 섞으면
  「이 PR에서 금액이 달라졌는가」를 더 이상 한눈에 판정할 수 없다.
- 🔴 **G4가 G3보다 반드시 먼저다**: `IG-020`·`IG-022`는 「숨겨진 행을 ⑧validate가 계속 요구해
  **영구 차단**」이다. 숨은 값을 정리하지 않은 채 G3에서 차단을 더 추가하면 **새 영구 차단이 생긴다.**
- 🔴 **G3이 마지막인 이유**: 차단 validation 추가는 그 칸을 채우지 않던 **기존 E2E를 전건 회귀**시킨다
  (메모리 `feedback_blocking_validation_full_e2e_regression`). E2E 스펙 수정을 동반하므로,
  다른 배치가 모두 끝난 뒤 돌려야 실패 원인이 이 배치임을 단정할 수 있다.

**병렬은 파일이 겹치지 않는 쌍만.** 전 쌍 겹침을 실측했다 — 겹치는 조합은
G1×G2·G1×G3·G1×G5~G8 · G2×G3·G2×G5·G2×G7·G2×G8 · G3×G5·G3×G7·G3×G8 · G4×G7·G4×G8 · G5×G6·G5×G7.
**겹침 0인 조합만 worktree 병렬**로 돌린다: `G4×G5` · `G4×G6` · `G6×G7` · `G6×G8` · `G7×G8`.

> `StockItemEditor.tsx`는 G1·G2·G5·G7 **네 배치**에 걸린다(IG-129·127·128·056).
> 이 파일만은 **G2에서 4건을 한 번에** 처리하고 나머지 배치의 목록에서 뺀다.

## G1 종결 기록 (2026-09-11)

전건 33건 수정 완료. 착수 전 예상과 어긋난 것 셋을 남긴다 — 뒤 배치에도 그대로 적용된다.

**① 「문구만」이라는 전제가 세 번 깨졌다.** 예고했던 값-변동 3건(`IG-100`·`118`·`159`) 외에
`IG-137`(taxKind를 화면·PDF 5단계로 배선) · `IG-141`(라벨을 행 배열에서 파생) ·
`IG-146`(**엔진 result에 echo 필드 1개 추가**) · `IG-160`(prop 배선)이 코드 변경을 요구했다.
⇒ **배치 이름이 곧 작업 규모의 상한은 아니다.** 다음 배치도 착수 시 건별로 다시 잰다.

**② 대장의 제안이 저장소 정책과 충돌한 것이 1건.** `IG-150`의 제안 문구
「공제액 = MIN(㉠ 산정액, ㉡ 한도 2억)」을 그대로 넣었더니
`__tests__/components/minmax-function-notation-policy.test.ts`가 막았다 — 표시 산식은
한국어 풀어쓰기가 정본이고 `MIN(`은 함수 표기다. ⇒ **제안은 참고이지 명세가 아니다.**

**③ 통과하던 테스트 2건이 결함을 지키고 있었다.** `prior-gift-table-view.test.tsx`의
D-4는 제목부터 「증여세 모드 → doneeRelation 라벨만」이었는데, 그게 바로 `IG-066`이 지적한
결함이다(증여세 모드의 doneeRelation은 증여자 관계가 복사된 값). 계약 자체를 뒤집고
헤더 분기 anchor(D-6)를 더했다. BLOCKER 때의 `BT-E2E-4`와 같은 층위다.

**뮤테이션 프로브에서 배운 것**: 상수만 단언한 `IG-141` anchor는 «호출부를 되돌리는»
뮤테이션에 **구별력 0**이었다(라벨 함수는 맞는데 표가 `{}`를 넘겨도 통과). 렌더 anchor를
짝으로 추가해야 「컴포넌트가 그 단일 소스를 부른다」가 증명된다
(memory `feedback_library_anchor_does_not_prove_component_uses_it`).

## 배치별 착수 노트

### G1 — 문구·조문표기 (33건)
- ⚠️ **법령 인용 정정 4건은 KoreanLaw 본문 확인이 착수 조건이다**(메모리 ★★★ `feedback_korean_law_citation_verify`):
  `IG-079`(§22① 1호↔2호 뒤바뀜) · `IG-134`(§49의2④ → ⑤·⑥) · `IG-142`(§14①3호 → 2호) · `IG-151`(법/령 층위 누락).
- ⚠️ **「문구만」이 아닌 3건**이 섞여 있다 — 표시 금액이 실제로 바뀐다:
  `IG-100`(만원 절사 제거) · `IG-118`(옵션 카운트) · `IG-159`(`7.000000000000001%`).
- `IG-023`·`IG-035`는 「문구를 고칠지 구현을 고칠지」 택일이다. `IG-035`는 **구현 쪽이 정합**이라 G3으로 보냈다.

### G2 — 엔진 단일소스 위임 (23건)
- 축 하나가 절반을 차지한다: **평가기준일(`valuationDate`/`deathDate`) 미전달 10건** —
  `IG-027`·`034`·`041`·`053`·`083`·`085`·`127`·`149`·`153`·`155`. 수정이 사실상 동일하다.
- 나머지는 「UI가 엔진 산식을 로컬 재구현」(`IG-030`·`033`·`067`·`088`·`089`·`105`·`156`)과
  「엔진 echo를 안 읽음」(`IG-078`·`091`·`140`).
- 검증은 **표시값과 엔진 값의 동치**를 단언한다. 뮤테이션 프로브로 구별력 확인 필수.

### G3 — 미입력→0 (25건) · **가장 위험**
- `lib/calc/gift-deemed-validate.ts`·`gift-tax-form-validate.ts`·`capital-forms.tsx` 세 파일에 집중.
- 두 방향이 한 축이다: **⑧이 안 막아 0이 흘러가는 것**(13건)과 **④가 0을 보내 엔진 `?? fallback`을 죽이는 것**(12건).
  둘 다 저장소 정책 「자동 안분 fallback 금지 · 미입력은 검증 오류로 차단」의 같은 위반이다.
- `IG-014`·`IG-051`·`IG-120`은 **`|| undefined`가 0을 삼키는** 동일 함정 — 셋을 같은 형태로 고친다.

### G4 — 게이트 OFF 값 정리 (16건)
- BLOCKER `IG-006`(카테고리 변경 시 §14 유령 담보채무)과 **동형**이다. 그 수정을 선례로 쓴다.
- ⚠️ 방향이 정반대인 두 경우가 섞여 있다 — 키가 **없으면** 원본이 살아남고, 키를 **명시적 undefined**로
  넣어야 지워진다(메모리 `feedback_multikey_patch_stale_spread_overwrite`). 건마다 어느 쪽인지 먼저 판정.

### G5 — 공용컴포넌트·인쇄·저장 (13건)
- 하위 5축: 인쇄 언마운트 3(`IG-071`·`090`·`148`, 완전 동일 패턴) · native→공용 3 ·
  `RestartFromScratchButton` 2 · 죽은 `data-testid` 3 · 공통 저장 헬퍼 2.
- ⚠️ `data-testid` 3건은 **E2E 셀렉터가 걸린다** — 옮기기 전에 참조 spec을 grep할 것.

### G6 — 결과뷰·별지서식 (14건) · MAJOR 비중 최고(13/14)
- 「화면 값 ≠ 별지 값」이 반복 주제다(`IG-052`·`054`·`062`·`081`·`082`).
- `IG-039`(rowSpan 재설계)와 `IG-052`(PDF Props 확장)는 이 배치에서 가장 큰 단위 — 먼저 착수.

### G7 — 재산카드·주식평가 (10건) / G8 — 입력폼 구조·사후관리 (20건)
- G8에는 **위젯 신설 1건**(`IG-025` 중소기업 여부 토글 — 세율 10%→20%가 걸린다)과
  **죽은 경로 판정 5건**(`IG-095`·`101`·`111`·`135`·`154` — 살릴지 지울지 결정이 선행)이 있다.
- 사후관리 시뮬레이터 4건(`IG-011`~`013`·`095`)은 `app/calc/family-business-postmgmt/page.tsx` 한 파일이다.

## 전건 목록

### G1 문구·조문표기

- `IG-042` **MAJOR** · E-표시법령 · `components/calc/inheritance/estate-card/variants/EstateBodyDeposit.tsx:36` — 전세보증금 반환채권 카드가 엔진이 쓰지 않는 「÷12%」 산식을 라벨로 표시
- `IG-066` **MAJOR** · E-표시법령 · `components/calc/prior-gift/PriorGiftTableView.tsx:71` — 증여세 모드 「수증자」 칸이 증여자 관계를 보여주고, donor는 표에 없다
- `IG-069` **MAJOR** · E-표시법령 · `components/calc/results/GiftDonorPaidGrossUpSection.tsx:68` — gross-up 결과를 「최종 과세표준」으로 표기 — 실제는 공제 전 과세가액
- `IG-074` **MAJOR** · E-표시법령 · `components/calc/results/GiftTwoStreamDetailSection.tsx:34` — 「일반 증여 산출세액」 라벨에 결정세액을 표시한다
- `IG-079` **MAJOR** · E-표시법령 · `components/calc/results/deduction-breakdown/FinancialDeductionDetailCard.tsx:140` — 금융재산공제 §22① 1호·2호 인용이 서로 뒤바뀜
- `IG-097` **MINOR** · E-표시법령 · `app/calc/public-interest-postmgmt/page.tsx:110` — 페이지 부제가 1호·4호만 적혀 있으나 실제로는 6개 사유를 제공한다
- `IG-100` **MINOR** · E-표시법령 · `components/calc/exemption/ExemptionSummaryCard.tsx:15` — 결과 카드 금액이 만원 단위로 절사돼 실제 차감액과 다르게 표시
- `IG-108` **MINOR** · E-표시법령 · `components/calc/inheritance/FarmingCategorySection.tsx:91` — 내부 enum 값 corporate_stock이 화면 힌트로 그대로 노출
- `IG-109` **MINOR** · E-표시법령 · `components/calc/inheritance/FamilyBusinessCategorySection.tsx:95` — 내부 enum 값 corporate_stock이 화면 힌트로 그대로 노출
- `IG-116` **MINOR** · E-표시법령 · `components/calc/inheritance/besshi-buppyo-2/Buppyo2HeirSheet.tsx:47` — 부표2 화면에 「(앞쪽)」·용지 규격 표기가 빠져 형제 서식과 어긋난다
- `IG-118` **MINOR** · E-표시법령 · `components/calc/inheritance/estate-card/chip-config.ts:304` — 옵션 카운트가 최대주주 §22②를 안 세어 칩과 숫자가 어긋난다
- `IG-124` **MINOR** · E-표시법령 · `components/calc/inheritance/estate-card/variants/EstateBodyReceivable.tsx:205` — 「회수불가능 사유」 hint가 존재하지 않는 별지 표기를 약속한다
- `IG-126` **MINOR** · E-표시법령 · `components/calc/inheritance/listed-stock/besshi/Page2DailyClosingTable.tsx:44` — 평가조서(을) 금액 칸에 font-mono 누락 — 형제 평가조서는 준수
- `IG-129` **MINOR** · E-표시법령 · `components/calc/inheritance/stock/StockItemEditor.tsx:236` — 종가 평균 칸 placeholder가 「주당 순손익 입력」이라고 다른 항목을 지시
- `IG-130` **MINOR** · E-표시법령 · `components/calc/inheritance/unlisted-stock-v2/CrossHoldingResultCard.tsx:59` — 발행법인명 미입력 시 내부 rowId(UUID)를 화면에 그대로 노출
- `IG-132` **MINOR** · E-표시법령 · `components/calc/inheritance/unlisted-stock-v2/PerShareValuationResultCard.tsx:394` — 영업권 배제 사유를 내부 enum 문자열 그대로 화면에 출력
- `IG-133` **MINOR** · E-표시법령 · `components/calc/inheritance/unlisted-stock-v2/PerShareValuationResultCard.tsx:401` — 최대주주 할증 배제 사유도 내부 enum 문자열 그대로 노출
- `IG-134` **MINOR** · E-표시법령 · `components/calc/inheritance/unlisted-stock-v2/EvaluationCommitteeFilingGuideCard.tsx:102` — 신청·통지 기한 근거를 §49의2④로 인용 — 실제는 ⑤·⑥
- `IG-136` **MINOR** · E-표시법령 · `components/calc/inheritance/unlisted-stock-v2/UnlistedStockV2Card.tsx:357` — 영업권 섹션 번호 11이 화면상 8·9·10보다 위에 그려진다
- `IG-137` **MINOR** · E-표시법령 · `components/calc/inheritance/unlisted-stock-v2/besshi/Page1CoverSection.tsx:136` — 증여세 평가에서도 별지 총계 행이 "상속재산가액"으로 표시된다
- `IG-141` **MINOR** · E-표시법령 · `components/calc/inheritance/unlisted-stock-v2/besshi/besshi-form-constants.ts:162` — ⑲ 소계 산식 라벨이 보험준비금 3행을 포함하지 않아 값과 맞지 않는다
- `IG-142` **MINOR** · E-표시법령 · `components/calc/results/DebtAllocationResultCard.tsx:149` — 장례비 한도 근거를 §14①3호로 인용 — 3호는 채무, 장례비는 2호
- `IG-144` **MINOR** · E-표시법령 · `components/calc/results/GiftTwoStreamDetailSection.tsx:92` — 「= 일반 + 특례」 산식 라벨이 합산배제 스트림을 빠뜨린다
- `IG-145` **MINOR** · C-공용컴포넌트 · `components/calc/results/GiftTaxValuationFormTable.tsx:125` — 부표1 금액 칸에 font-mono 누락 — 콤마 세로 정렬 깨짐
- `IG-146` **MINOR** · E-표시법령 · `components/calc/results/allocation-breakdown/ComputedTaxDetailCard.tsx:66` — 「배부대상 산출세액 = ⑦ − 영리법인 면제」 산식이 차감항 하나를 빠뜨렸다
- `IG-147` **MINOR** · E-표시법령 · `components/calc/results/RelatedCorpResultSection.tsx:141` — 교재 예제의 고정 금액을 모든 §45의3 결과에 「본 시스템 산출」로 표시
- `IG-150` **MINOR** · E-표시법령 · `components/calc/results/deduction-breakdown/FinancialDeductionDetailCard.tsx:152` — 금융재산공제 소계 라벨의 산식이 실제 값과 다르다
- `IG-151` **MINOR** · E-표시법령 · `components/calc/results/payment-in-kind/PaymentInKindCard.tsx:158` — 충당순서 인용에 법/령 구분이 없어 §74②가 다른 조문으로 읽힌다
- `IG-158` **MINOR** · E-표시법령 · `components/calc/TaxCreditBreakdownCard.tsx:305` — §69 산출근거 각주의 「3%」가 하드코딩돼 연도율과 어긋난다
- `IG-159` **MINOR** · E-표시법령 · `components/calc/TaxCreditBreakdownCard.tsx:486` — 신고세액공제 율 표시가 2017년에 「7.000000000000001%」로 나온다
- `IG-160` **MINOR** · E-표시법령 · `components/calc/TaxCreditBreakdownCard.tsx:290` — §69 신고분 세액 산식에 §71 농지감면 차감항이 빠져 등식이 안 맞는다
- `IG-164` **MINOR** · E-표시법령 · `components/calc/results/source-summary/PriorGiftSummaryTable.tsx:130` — 기본(auto) 모드에서 증여재산공제·과세표준 열과 소계가 항상 0
- `IG-023` **MAJOR** · E-표시법령 · `components/calc/exemption/ExemptionChecklistPanel.tsx:104` — 칩 툴팁이 「값 보존」이라 하지만 해제 시 입력값이 삭제된다

### G2 엔진 단일소스

- `IG-027` **MAJOR** · E-표시법령 · `components/calc/gift/SpecialTreatmentAssetSelector.tsx:35` — 특례 귀속 자산 평가액을 자체 산식으로 뽑아 주식·부동산이 0으로 표시
- `IG-030` **MAJOR** · E-표시법령 · `components/calc/inheritance/CorporateNonBusinessAssetsSection.tsx:61` — 차감 미리보기의 주식가액이 엔진 §60 평가순위와 달라 카드가 안 뜬다
- `IG-032` **MAJOR** · E-표시법령 · `components/calc/inheritance/FamilyBusinessEligibilitySection.tsx:165` — 자격 미리보기가 자동판정 전 입력으로 판정해 항상 미충족
- `IG-033` **MAJOR** · E-표시법령 · `components/calc/inheritance/DebtAllocationInput.tsx:115` — 장례비 합계가 §9②1호 500만 최소보장을 빠뜨려 엔진과 다름
- `IG-034` **MAJOR** · E-표시법령 · `components/calc/inheritance/FamilyBusinessEligibilitySection.tsx:173` — 공제 한도 미리보기가 deathDate 없이 계산돼 개정 전 상속에 오표시
- `IG-036` **MAJOR** · B-3중패턴 · `components/calc/inheritance/InheritanceReviewSummary.tsx:96` — 계산 전 요약이 체크리스트 게이트를 무시해 미적용 공제를 「적용 예정」으로 표시
- `IG-041` **MAJOR** · E-표시법령 · `components/calc/inheritance/estate-card/EstateChipInlineExpand.tsx:128` — 협의분할 패널 기준액이 평가기준일을 빼고 계산돼 칩 평가액과 다르다
- `IG-049` **MAJOR** · E-표시법령 · `components/calc/inheritance/family-business/FbDecedentRequirementsSection.tsx:54` — 피상속인 지분 임계 40/20 하드코딩 — 엔진은 상속개시일 시기별
- `IG-053` **MAJOR** · E-표시법령 · `components/calc/inheritance/listed-stock/ListedStockValuationPreviewCard.tsx:42` — 평가액 미리보기가 평가기준일 미전달 — §53⑧2호 배제를 못 본다
- `IG-067` **MAJOR** · E-표시법령 · `components/calc/results/DebtAllocationResultCard.tsx:64` — 장례비 500만원 최소 인정 미반영 — 카드 합계가 엔진 공제액과 다름
- `IG-078` **MAJOR** · E-표시법령 · `components/calc/results/allocation-breakdown/CorporateGiftCreditDetailCard.tsx:31` — 영리법인 과세표준 역산값이 법인별 한도 산식 분자와 일치하지 않는다
- `IG-083` **MAJOR** · E-표시법령 · `components/calc/EstateItemTableView.tsx:62` — 평가액 칸이 평가기준일 없이 계산돼 엔진값과 어긋난다
- `IG-085` **MAJOR** · E-표시법령 · `components/calc/PropertyValuationForm.tsx:327` — 「재산 합계 (예상)」가 평가기준일을 안 넘겨 날짜기반 자산이 0원
- `IG-088` **MAJOR** · E-표시법령 · `components/calc/property-valuation-preview.tsx:45` — 미리보기 §66 담보채권액이 신용보증기관 보증액을 안 뺀다
- `IG-089` **MAJOR** · E-표시법령 · `components/calc/results/source-summary/PresumedInheritanceTable.tsx:98` — 소명대상 금액이 §15 임계 분기를 무시하고 1년+2년을 그대로 더한다
- `IG-091` **MAJOR** · E-표시법령 · `components/calc/results/source-summary/PriorGiftSummaryTable.tsx:133` — 영리법인 사전증여 산출세액을 corporateGiftComputedTax에서 안 읽어 항상 공란
- `IG-105` **MINOR** · E-표시법령 · `components/calc/inheritance/CohabitAncillaryLandBlock.tsx:86` — §154⑦ 지역별 배율이 UI 안에서만 두 번 재선언(엔진과 3중)
- `IG-127` **MINOR** · B-3중패턴 · `components/calc/inheritance/stock/StockItemEditor.tsx:372` — 협의분할 기준 평가액만 평가기준일 fallback을 빼먹어 테이블과 갈린다
- `IG-140` **MINOR** · E-표시법령 · `components/calc/prior-gift/AggregationSummary.tsx:85` — 「§28 공제 대상」 합계에 제척기간 만료 회차가 그대로 들어간다
- `IG-149` **MINOR** · E-표시법령 · `components/calc/results/deduction-breakdown/PersonalDeductionDetailCard.tsx:45` — 인적공제 카드가 현행 금액·연령을 하드코딩 — 2016년 前 상속에서 라벨≠금액
- `IG-153` **MINOR** · E-표시법령 · `components/calc/CohabitantTableView.tsx:101` — 미성년·연로자 배지가 연령 임계를 19/65로 하드코딩 — 2016년 개정 전 tier 미반영
- `IG-155` **MINOR** · E-표시법령 · `components/calc/StockValuationForm.tsx:54` — 주식 합계 미리보기가 단일진실 헬퍼를 우회해 할증 판정이 갈린다
- `IG-156` **MINOR** · E-표시법령 · `components/calc/HeirTableView.tsx:169` — 미성년 배지가 사용자 지정 override를 무시해 엔진과 어긋난다

### G3 미입력→0 (validate+fallback)

- `IG-014` **MAJOR** · B-3중패턴 · `components/calc/deemed-gift/capital-forms.tsx:211` — 합병대가 미입력 → ④가 0을 보내 엔진 `?? face` fallback이 죽고 §28③2가 항상 0원
- `IG-015` **MAJOR** · A-배관 · `components/calc/deemed-gift/capital-forms.tsx:521` — 저가감자 단일 — 산식 인자 2칸이 ⑧에 없고, ⑧이 지키는 칸은 산식에 안 쓰인다
- `IG-016` **MAJOR** · A-배관 · `components/calc/deemed-gift/capital-forms.tsx:256` — 증자 §39 「이익 귀속 주식수」가 ⑧ 미검증 — 0이면 사실과 다른 제외 사유가 뜬다
- `IG-017` **MAJOR** · A-배관 · `components/calc/deemed-gift/capital-forms.tsx:205` — 합병 §38 주식교부 단일모드 「대주주등 주식수」가 ⑧ 미검증 → 0원
- `IG-018` **MAJOR** · A-배관 · `components/calc/deemed-gift/convertible-stock-form.tsx:118` — 전환주식 «분모 신주수» 미입력을 ⑧validate가 안 봐 증여이익이 조용히 0원
- `IG-019` **MAJOR** · F-도달가능성 · `components/calc/deemed-gift/other-forms.tsx:206` — 초과배당 «정산 입력»을 켜도 증여자 관계를 안 고르면 정산이 조용히 계산되지 않는다
- `IG-028` **MAJOR** · B-3중패턴 · `components/calc/inheritance/CorporateNonBusinessAssetsSection.tsx:88` — 지운 연도 칸이 0으로 저장돼 5년 평균을 끌어내린다
- `IG-029` **MAJOR** · A-배관 · `components/calc/inheritance/CorporateNonBusinessAssetsSection.tsx:87` — 연도 칸을 건너뛰면 배열에 구멍 → Zod가 null을 거절해 계산 차단
- `IG-031` **MAJOR** · D-타입 · `components/calc/inheritance/CorporateHeirFields.tsx:187` — ⑩ 지분율 입력이 부동소수 왕복으로 깨져 두 자리 입력 불가
- `IG-035` **MAJOR** · E-표시법령 · `components/calc/inheritance/FamilyBusinessEligibilitySection.tsx:340` — 「미입력 시 기준 미충족」 hint가 엔진 동작과 정반대
- `IG-048` **MAJOR** · B-3중패턴 · `components/calc/inheritance/family-business/FamilyBusinessHeirSelector.tsx:118` — 자동선택 경로에서 생년월일 칸이 항상 뜨고 입력값은 엔진에서 무시된다
- `IG-050` **MAJOR** · B-3중패턴 · `components/calc/inheritance/listed-stock/ListedStockBesshiAttributesSection.tsx:211` — 최대주주 할증 기업규모가 '중소기업'으로 보이나 store는 미입력
- `IG-051` **MAJOR** · A-배관 · `components/calc/inheritance/listed-stock/ListedStockBesshiAttributesSection.tsx:319` — 직전기 배당률 0을 입력할 수 없는데 validate는 0을 요구
- `IG-057` **MAJOR** · A-배관 · `components/calc/inheritance/unlisted-stock-v2/EvaluationCommitteeToggle.tsx:40` — 평가심의위 토글 ON 기본값 0이 Zod positive()에 걸려 계산 전체가 400
- `IG-059` **MAJOR** · B-3중패턴 · `components/calc/inheritance/unlisted-stock-v2/NetAssetCalculationTable.tsx:115` — 보험법인 토글이 useState 로컬 캐시라 이력 자동채움 후 OFF로 남는다
- `IG-060` **MAJOR** · B-3중패턴 · `components/calc/inheritance/unlisted-stock-v2/ValuationDeltaTable.tsx:334` — 총액 모드 평가차액 입력이 음수를 못 받아 부호가 조용히 반전된다
- `IG-063` **MAJOR** · A-배관 · `components/calc/inheritance/unlisted-stock-v2/UnlistedStockV2Card.tsx:127` — currentClientId가 부모에서 안 넘어와 세무사 모드에서 이력 조회가 항상 0건
- `IG-086` **MAJOR** · A-배관 · `components/calc/gift-tax-form-validate.ts:339` — 증여 ⑧이 납부지연가산세 ON의 미납액·법정납부기한 미입력을 안 막는다
- `IG-092` **MINOR** · A-배관 · `app/calc/family-business-postmgmt/page.tsx:169` — 이자율 칸을 비우면 게이트를 통과해 이자상당액이 조용히 0
- `IG-094` **MINOR** · A-배관 · `app/calc/public-interest-postmgmt/Clause2Form.tsx:115` — undefined 센티널 가드가 IntegerInput 앞에서 무력화된다
- `IG-102` **MINOR** · A-배관 · `components/calc/gift/GiftCreditChecklist.tsx:433` — ⑧이 동시증여를 `simultaneousGifts`로만 보고 대납 조합을 못 막아 API 400
- `IG-103` **MINOR** · B-3중패턴 · `components/calc/gift/GiftCreditChecklist.tsx:472` — 새 동시증여 건이 donor="father" 기본값으로 생성돼 즉시 동일그룹 차단
- `IG-117` **MINOR** · A-배관 · `components/calc/inheritance/estate-card/variants/BurdenedGiftTransferSection.tsx:52` — 날짜 역변환에 new Date() 직접 호출 — date-coerce 정책 위반
- `IG-120` **MINOR** · B-3중패턴 · `components/calc/inheritance/estate-card/variants/EstateBodyFinancial.tsx:251` — 원천징수율 0% 입력이 `|| undefined`에 먹혀 항상 14%로 되돌아감
- `IG-161` **MINOR** · A-배관 · `components/calc/gift-tax-form-validate.ts:446` — ⑧ 대납 차단 목록에 「동시증여 다중 건」이 없어 ⑫에서 400이 난다

### G4 게이트 OFF 값정리

- `IG-020` **MAJOR** · A-배관 · `components/calc/deemed-gift/related-corp-form.tsx:166` — 간접출자법인 섹션이 숨겨져도 ⑧validate가 그 행을 계속 요구 — 영구 차단
- `IG-021` **MAJOR** · F-도달가능성 · `components/calc/deemed-gift/related-corp-form.tsx:146` — 화면에서 사라진 간접출자법인 행이 그대로 전송돼 증여의제이익을 바꾼다
- `IG-022` **MAJOR** · A-배관 · `components/calc/deemed-gift/related-corp-form.tsx:326` — §⑭ 지배주주등 보유비율 행이 숨겨져도 validate가 계속 요구
- `IG-045` **MAJOR** · F-도달가능성 · `components/calc/inheritance/estate-card/variants/EstateBodySupplementaryValuation.tsx:194` — §61 경로 A 전환 시 공실 3필드가 남아 숨겨진 채 평가액을 올린다
- `IG-047` **MAJOR** · F-도달가능성 · `components/calc/inheritance/estate-card/variants/RtmsSimilarSalesModal.tsx:322` — 평가기간 외 행은 체크는 켜지지만 평균·채우기에서 침묵 제외된다
- `IG-055` **MAJOR** · F-도달가능성 · `components/calc/inheritance/steps.tsx:177` — 협의분할 모드 진입이 봉안비만 안 지워 숨겨진 값이 계속 공제된다
- `IG-064` **MAJOR** · A-배관 · `components/calc/prior-gift/GiftRowEditor.tsx:509` — §53의2 칸이 관계 변경으로 사라져도 값이 남아 validate가 영구 차단
- `IG-065` **MAJOR** · A-배관 · `components/calc/prior-gift/GiftRowEditor.tsx:479` — 영리법인 수증자를 고르면 과세표준이 지워지는데 manual 모드 플래그는 남는다
- `IG-084` **MAJOR** · F-도달가능성 · `components/calc/HeirEditor.tsx:475` — 대습상속인 토글을 켜면 「상속인 여부」의 유일한 입력 경로가 사라진다
- `IG-098` **MINOR** · B-3중패턴 · `components/calc/deemed-gift/contribution-form.tsx:215` — 현물출자 소액주주 의제 토글은 명부 ON 시 사라지지만 값은 계속 전송된다
- `IG-112` **MINOR** · F-도달가능성 · `components/calc/inheritance/Step4Deductions.tsx:458` — 재해손실공제 카드가 자기 토글을 끄면 스스로 언마운트된다
- `IG-115` **MINOR** · F-도달가능성 · `components/calc/inheritance/estate-card/CategoryChangeDialog.tsx:98` — 다이얼로그가 항상 마운트돼 있어 재오픈 시 이전 선택이 남는다
- `IG-119` **MINOR** · A-배관 · `components/calc/inheritance/estate-card/variants/EstateBodyConvertibleBond.tsx:186` — 거래소 ON이 전환 토글을 언마운트하는데 ⑫는 그 안의 칸을 계속 요구
- `IG-131` **MINOR** · F-도달가능성 · `components/calc/inheritance/unlisted-stock-v2/EstimatedProfitToggle.tsx:116` — 추정이익 폐기 확인 게이트가 기관명·사유를 데이터로 안 본다
- `IG-138` **MINOR** · F-도달가능성 · `components/calc/inheritance/unlisted-stock-v2/PreIpoListingToggle.tsx:105` — 폐기 확인 게이트가 신고일·준비유형 입력을 데이터로 세지 않는다
- `IG-139` **MINOR** · F-도달가능성 · `components/calc/prior-gift/GiftRowEditor.tsx:280` — 증여자를 「선택」으로 되돌리면 사망일 입력칸이 사라지고 빈 문자열이 남는다

### G5 공용컴포넌트·인쇄·저장

- `IG-071` **MAJOR** · F-도달가능성 · `components/calc/results/InheritanceTaxResultView.tsx:535` — 「재산 평가 내역」은 접힘 시 언마운트되어 인쇄가 빈 껍데기다
- `IG-075` **MAJOR** · C-공용컴포넌트 · `components/calc/results/InheritanceTaxResultView.tsx:696` — 「처음으로」가 확인 없이 전체 입력을 폐기한다
- `IG-090` **MAJOR** · C-공용컴포넌트 · `components/calc/results/source-summary/SourceDataSummarySection.tsx:77` — {open && ...} 언마운트라 인쇄 시 4표가 통째로 빠진다
- `IG-093` **MINOR** · C-공용컴포넌트 · `app/calc/inheritance-postmgmt/page.tsx:283` — 분기 토글을 native checkbox로 작성 — ToggleCard 강제 규칙 위반
- `IG-096` **MINOR** · C-공용컴포넌트 · `components/calc/deemed-gift/SpecificCorpShareholderTable.tsx:124` — native `<input type="checkbox">` — ToggleCard 강제 규칙 위반
- `IG-099` **MINOR** · D-타입 · `components/calc/deemed-gift/other-forms.tsx:188` — ToggleCard에 직접 넘긴 data-testid 6건이 DOM에 도달하지 않는다
- `IG-106` **MINOR** · D-타입 · `components/calc/inheritance/CohabitRequirementBlock.tsx:133` — ToggleCard에 넘긴 data-testid는 DOM에 닿지 않는 죽은 prop
- `IG-122` **MINOR** · D-타입 · `components/calc/inheritance/estate-card/variants/EstateBodyCryptoAsset.tsx:119` — 공용 RadioCardGroup·ToggleCard에 넘긴 data-testid가 DOM에 나가지 않음
- `IG-128` **MINOR** · C-공용컴포넌트 · `components/calc/inheritance/stock/StockItemEditor.tsx:228` — 전후 2개월 종가 평균이 CurrencyInput 대신 native input이다
- `IG-143` **MINOR** · C-공용컴포넌트 · `components/calc/results/GiftTaxResultView.tsx:744` — 「처음으로」가 폐기 확인 없이 전체 입력을 초기화
- `IG-148` **MINOR** · F-도달가능성 · `components/calc/results/deduction-breakdown/DeductionBreakdownSection.tsx:66` — 상속공제 상세 내역은 접힌 상태로 인쇄하면 내용이 통째로 빠진다
- `IG-162` **MINOR** · C-공용컴포넌트 · `components/calc/gift-tax-save-handler.ts:28` — 증여세만 공통 저장 헬퍼를 안 써 미결(임시) 저장이 안 된다
- `IG-163` **MINOR** · C-공용컴포넌트 · `components/calc/gift-tax-save-handler.ts:48` — 증여세 저장 토스트에만 이력 한도 경고가 없다

### G6 결과뷰·별지서식

- `IG-039` **MAJOR** · E-표시법령 · `components/calc/inheritance/deduction-besshi/Besshi6_2Section2.tsx:176` — 별지6호의2 상속인별 표 — thead의 rowSpan={7}이 tbody를 못 덮어 본문이 한 칸 어긋난다
- `IG-052` **MAJOR** · E-표시법령 · `components/calc/inheritance/filing-form-9/FilingForm9PdfDownloadButton.tsx:57` — 별지9호 PDF가 물납·분납액 인자를 안 받아 화면과 다른 값 출력
- `IG-054` **MAJOR** · A-배관 · `components/calc/inheritance/listed-stock/besshi/Page1CoverSection.tsx:224` — §53⑧2호 게이트 실패 라벨이 어느 화면에도 표시되지 않는다
- `IG-062` **MAJOR** · E-표시법령 · `components/calc/inheritance/unlisted-stock-v2/besshi/Page2NetAssetTable.tsx:41` — 별지 2쪽 「다」가 §55① 후단 0 하한을 빼먹어 다+라 ≠ 마
- `IG-068` **MAJOR** · E-표시법령 · `components/calc/results/GiftTaxResultView.tsx:280` — 「증여세 결정세액」 라벨 아래에 가산세 포함 총 납부세액 표시
- `IG-070` **MAJOR** · A-배관 · `components/calc/results/InheritanceTaxResultView.tsx:261` — 납부지연가산세만 있으면 총 납부세액 행이 통째로 사라진다
- `IG-072` **MAJOR** · E-표시법령 · `components/calc/results/GiftTaxResultViewHelpers.tsx:88` — 연부연납 안내가 가산율 「연 1.8%」를 하드코딩 — 현행 3.1%
- `IG-073` **MAJOR** · E-표시법령 · `components/calc/results/GiftTaxValuationFormTable.tsx:260` — 부표1이 §47② 합산 제외 사전증여까지 A24 본문 행으로 찍는다
- `IG-076` **MAJOR** · F-도달가능성 · `components/calc/results/deduction-breakdown/DeductionBreakdownSection.tsx:164` — 동거주택공제 「미적용」 표시 경로가 게이트에 갇혀 영구 도달 불가
- `IG-077` **MAJOR** · E-표시법령 · `components/calc/results/deduction-breakdown/DeductionLimitDetailCard.tsx:79` — §24 한도 산정에서 상속포기 차감액이 같은 값으로 두 번 표시된다
- `IG-080` **MAJOR** · E-표시법령 · `components/calc/results/useInheritanceResultDerived.ts:144` — 분납 신고기한이 비거주자 9개월(§67④)을 무시하고 항상 6개월
- `IG-081` **MAJOR** · E-표시법령 · `components/calc/results/useInheritanceResultDerived.ts:130` — 물납 요건 미충족인데 별지9호 ㊵에 물납액이 찍힌다
- `IG-082` **MAJOR** · E-표시법령 · `components/calc/results/inheritance/CulturalHeritageDeferralCard.tsx:65` — 「납부할세액 (별지9호 ㊳)」이 가산세를 뺀 다른 값이다
- `IG-152` **MINOR** · F-도달가능성 · `components/calc/results/deduction-breakdown/FarmingDeductionDetailRowExport.tsx:78` — 화면에 없는 영농 복제본이 30억 고정 — 유일한 UI 테스트가 그것을 본다

### G7 재산카드·주식평가

- `IG-040` **MAJOR** · C-공용컴포넌트 · `components/calc/inheritance/estate-card/CategoryChangeDialog.tsx:51` — 카테고리 목록을 단일 출처에서 복제하면서 crypto_asset을 빠뜨렸다
- `IG-043` **MAJOR** · F-도달가능성 · `components/calc/inheritance/estate-card/variants/EstateBodyRealEstate.tsx:251` — §23의2 동거주택 공제 토글이 「상업용 건물」 자산에도 열린다
- `IG-044` **MAJOR** · A-배관 · `components/calc/inheritance/estate-card/variants/EstateBodyConvertibleBond.tsx:86` — 상장 신주인수권증서의 유일한 입력칸을 ⑫Zod가 검증하지 않아 미입력 통과
- `IG-046` **MAJOR** · F-도달가능성 · `components/calc/inheritance/estate-card/variants/RtmsSimilarSalesModal.tsx:550` — 후보 0건 안내가 가리키는 「평가기간 외 목록」이 렌더되지 않는다
- `IG-056` **MAJOR** · A-배관 · `components/calc/inheritance/stock/StockItemEditor.tsx:249` — §63②3호 토글이 unlistedShareMode를 안 써서 validate가 숨은 칸을 요구한다
- `IG-058` **MAJOR** · E-표시법령 · `components/calc/inheritance/unlisted-stock-v2/EvaluationCommitteeResultCard.tsx:129` — 평가심의위 신청 기한 카운트다운이 신고기한 자체를 기한으로 표시
- `IG-061` **MAJOR** · F-도달가능성 · `components/calc/inheritance/unlisted-stock-v2/ValuationDeltaTable.tsx:110` — 행 모드 토글 OFF가 확인 없이 입력 행을 전부 삭제한다
- `IG-121` **MINOR** · F-도달가능성 · `components/calc/inheritance/estate-card/variants/EstateBodyRealEstate.tsx:332` — RTMS 자동조회 버튼이 평가기준일 미입력을 disabled 조건에서 빠뜨려 클릭 무반응
- `IG-123` **MINOR** · E-표시법령 · `components/calc/inheritance/estate-card/variants/FbAdditionalBusinessesSection.tsx:183` — 복수가업 미리보기가 자격 미충족일 때도 0이 아닌 공제액을 보여준다
- `IG-135` **MINOR** · F-도달가능성 · `components/calc/inheritance/unlisted-stock-v2/GoodwillCalculationTable.tsx:30` — onIntangibleDeductionChange는 아무 데도 연결되지 않은 죽은 prop

### G8 입력폼구조·사후관리

- `IG-011` **MAJOR** · F-도달가능성 · `app/calc/family-business-postmgmt/page.tsx:364` — 정당사유 17개가 위반 유형과 무관하게 전부 노출 — 엔진은 무조건 면제
- `IG-012` **MAJOR** · E-표시법령 · `app/calc/family-business-postmgmt/page.tsx:471` — ③의 「4호 위반: 아니오」와 ②의 4호 추징이 같은 화면에서 모순
- `IG-013` **MAJOR** · E-표시법령 · `app/calc/family-business-postmgmt/page.tsx:215` — 수정신고 기한을 첫 번째 위반 사건 날짜로만 계산
- `IG-024` **MAJOR** · F-도달가능성 · `components/calc/gift/SimultaneousGiftCard.tsx:272` — 동시증여 서브카드 안에 또 동시증여 토글이 열리고 입력은 ④가 폐기
- `IG-025` **MAJOR** · A-배관 · `components/calc/gift/StockBurdenedDebtSection.tsx:230` — 중소기업 여부 입력 위젯이 없어 ④가 항상 false 전송 (세율 10%→20%)
- `IG-026` **MAJOR** · E-표시법령 · `components/calc/gift/PriorGiftHistoryModal.tsx:315` — 상속세 모드에서 적용되지 않은 필터 조건을 적용된 것처럼 표시
- `IG-037` **MAJOR** · F-도달가능성 · `components/calc/inheritance/Step4Deductions.tsx:179` — groupBVisibleCount가 heirWaiver를 안 세어 활성이어도 칸이 가려짐
- `IG-038` **MAJOR** · B-3중패턴 · `components/calc/inheritance/Step4Deductions.tsx:461` — 감정평가수수료만 ④에 체크리스트 게이트가 없어 「계산 제외」가 거짓
- `IG-087` **MAJOR** · F-도달가능성 · `components/calc/UnlistedStockSimpleFields.tsx:44` — §54④ 6호 선택 시 순손익 3칸이 사라져 영업권 입력 경로가 없어진다
- `IG-095` **MINOR** · F-도달가능성 · `app/calc/family-business-postmgmt/page.tsx:300` — 「직접입력 모드로 공제받은 사례」 토글이 아무것도 하지 않는다
- `IG-101` **MINOR** · F-도달가능성 · `components/calc/exemption/ExemptionChecklistPanel.tsx:85` — 칩의 amber 경고 점 분기가 구조적으로 도달 불가
- `IG-104` **MINOR** · F-도달가능성 · `components/calc/inheritance/AutoSuggestBadge.tsx:60` — 호출부가 fallback 값을 넘겨 「채우기」 미도달·「되돌리기」 무동작
- `IG-107` **MINOR** · A-배관 · `components/calc/inheritance/EstateCommonAttributesSection.tsx:153` — 영농·가업 토글을 동시에 켤 수 있으나 validate가 계산을 차단
- `IG-110` **MINOR** · E-표시법령 · `components/calc/inheritance/FarmingEligibilitySection.tsx:548` — 자격자 전부 해제(빈 배열) 상태에서 안내문이 정반대 규칙을 설명
- `IG-111` **MINOR** · F-도달가능성 · `components/calc/inheritance/HeirAllocationInput.tsx:243` — showAreaInput을 true로 넘기는 호출부가 없어 분배 면적 입력 경로가 없다
- `IG-113` **MINOR** · A-배관 · `components/calc/inheritance/Step4DeductionChecklist.tsx:304` — 배우자 칩은 배우자 상속인이 없어도 「직접 입력 가능」이라 안내한다
- `IG-114` **MINOR** · B-3중패턴 · `components/calc/inheritance/SubstituteHeirPanel.tsx:139` — 기존 대습 그룹 선택 시 피대습자 성명만 동기화하고 원래순위는 안 맞춘다
- `IG-125` **MINOR** · F-도달가능성 · `components/calc/inheritance/family-business/FbDecedentRequirementsSection.tsx:85` — 대표이사 재직구간 절반 입력 시 '입력 필요'가 아니라 '미충족' 표시
- `IG-154` **MINOR** · F-도달가능성 · `components/calc/GiftTaxForm.tsx:361` — 입력 화면의 저장하기 버튼 2개가 구조적으로 항상 disabled
- `IG-157` **MINOR** · E-표시법령 · `components/calc/InheritanceTaxForm.tsx:449` — 한국어 라벨 오류 포매터가 미배선 — Zod 내부 경로가 그대로 노출