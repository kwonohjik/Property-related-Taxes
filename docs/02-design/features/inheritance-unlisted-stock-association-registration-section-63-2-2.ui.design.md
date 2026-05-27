# UI Design — 비상장주식 §63②2호 거래소 상장신청·협회 등록 준비 중 평가 (PR-L2)

> **Engine Design**: `inheritance-unlisted-stock-association-registration-section-63-2-2.engine.design.md`
> **Plan**: `docs/00-pm/inheritance-unlisted-stock-association-registration-section-63-2-2.plan.md`
> **범위**: PR-L의 `PreIpoListingToggle`(section 9)에 **`preparationType` RadioCardGroup 추가** + 라벨/preview/결과/besshi 인용 동적 분기. **신규 토글·신규 섹션 없음**(PR-L 확장).

## 0. 적용 정책 메모리

- [[feedback_toggle_card_visibility]] · [[feedback_three_state_optional_mode_toggle]] — RadioCardGroup, 미선택도 tone 유지
- [[feedback_korean_law_82_vs_81_2_drift]] — D-1 거래소·협회 양쪽 병기, 단정 금지
- [[feedback_result_view_korean_formula]] — 인용 한국어 풀어쓰기
- [[feedback_browser_verify_with_playwright]] — e2e로 회귀 검증(특히 R-5 title 정규식)
- [[feedback_numeric_impact_verify_before_bug_claim]] — preparationType은 numeric 0, 표시 전용

---

## 1. 사용자 시나리오 (4건)

| # | 시나리오 | 기대 표시 |
|---|---------|----------|
| L2-1 | §63② ON·preparationType=**거래소 상장(IPO)** | PR-L 동작 그대로 — "§63②1호 … 거래소 상장 전" |
| L2-2 | §63② ON·preparationType=**거래소 상장신청·협회 등록** | "§63②2호 … 협회 등록 전" + D-1 병기 안내(거래소 상장신청·협회 등록) |
| L2-3 | L2-2·윈도우 내·공모가>보충적 | 결과 ⑥ = 공모가 + "§63②2호 + §57② MAX(공모가, 보충적평가)" |
| L2-4 | L2-2·윈도우 밖 | "§63②2호 … 협회 등록 전 윈도우 밖 — 미적용" 경고 |

---

## 2. `PreIpoListingToggle.tsx` 확장 (S-6)

기존 PR-L 토글(section 9, tone emerald) **내부**에 preparationType RadioCardGroup 추가. **ToggleCard·섹션 구조 무변경**.

```
ToggleCard (tone="emerald", section 9 — 무변경)
  title: "§63② 기업공개·상장신청 준비 중 법인 — 특례 평가"   ← ★ 일반화, "기업공개 준비 중 법인" 연속 substring 깨짐(E2)
  ON 시 children:
    ├ [신규] RadioCardGroup "preparationType" (tone emerald, layout stack) — 날짜 필드 앞 배치(C: 라벨이 ptype 의존)
    │    · exchange_listing       — "거래소 상장(IPO, 유가증권 신고) — §63②1호"
    │    · association_registration — "거래소 상장신청·협회 등록(K-OTC) — §63②2호"  ← D-1 양쪽 병기
    ├ FieldCard 공모가격 (무변경)
    ├ FieldCard 신고일 (라벨: "유가증권 신고일(미신고 시 {상장신청일|등록신청일})")  ← ptype 동적
    ├ FieldCard 상장일/등록일 (라벨: ptype="exchange"→"거래소 최초 상장일" / "association"→"협회 등록일(거래소 상장)")  ← C6
    └ 윈도우 preview ("[신고일 − N개월, {거래소 상장 전|협회 등록 전}) ...")  ← C6 동적
```

- **RadioCardGroup 기본값(factory)**: 토글 ON 시 `handleToggle` 기본 객체에 `preparationType: "exchange_listing"` 명시 주입(PR-L 하위호환).
- **RadioCardGroup display value(E, 3중 일치)**: `value={value.preparationType ?? "exchange_listing"}` — 저장된 PR-L 데이터(preparationType 미보유) 복원 시 미선택 방지. factory·engine ptype 해소·UI display **3중 일치**([[feedback_store_default_vs_ui_display_fallback]]).
- `patch({ preparationType })` — 선택 시 객체 갱신(taxKind와 동일하게 store write 직접).
- testid: 기존 `pre-ipo-listing-form`·`pre-ipo-window-preview` 유지 + 신규 `pre-ipo-preparation-type`.
- ★ **title substring 보존 불가 → e2e 갱신 필수(E2·R-5 정정)**: 현 PR-L title "§63②1호 기업공개 준비 중 법인 — 특례 평가"를 §63②2호 포함하도록 일반화하면 "·상장신청"/"·2호" 삽입으로 `/기업공개 준비 중 법인/` **연속 substring이 깨진다**(grep 검증). ∴ **"보존" 옵션 폐기 — PR-L e2e(T-L-1/2/3)를 안정 substring(`/특례 평가/`) 또는 toggle testid(`pre-ipo-listing-toggle` 신규 부착) 기반으로 동시 갱신 필수.** 갱신 없이 title 변경 시 기존 e2e 3건 깨짐.

---

## 3. 결과 카드 (`PerShareValuationResultCard.tsx`, S-7) — ★ 기존 하드코딩 수정 (DR-1)

PR-L이 하드코딩한 §63②1호 문자열을 `result.preIpoListingResult.preparationType` 분기로 **교체**:

- ⑥ hint: `preparationType === "association_registration"` → "§63②2호 거래소 상장신청·협회 등록 — MAX(공모가격 X, 보충적평가 Y)" / else "§63②1호 기업공개 준비 — MAX(...)".
- `result-pre-ipo-notice` 블록: 인용 법조문(§63②1호+§57① / §63②2호+§57②)·terminal("거래소 상장 전"/"협회 등록 전") 분기. MAX 비교·§54⑥ 범위 안내(L-5)는 PR-L 로직 재사용.
- **additive 아님** — 미수정 시 association도 §63②1호로 오표시(DR-1).

---

## 4. besshi (S-8) — ★ 기존 하드코딩 수정 (DR-1)

`BesshiForm4Buppyo3PrintView`의 `besshi-pre-ipo-note`(PR-L)가 "§63②1호(기업공개 준비 중)" 하드코딩 → `result.preIpoListingResult.preparationType` 분기:
- exchange: "§63②1호 + §57①" / association: "§63②2호 + §57② (거래소 상장신청·협회 등록)".
- testid `besshi-pre-ipo-note` 유지. note gated on `applied`(무변경).

---

## 5. 8 동기화 지점 (DoD)

| # | 지점 | 본 PR 작업 |
|---|---|---|
| ① 폼 타입 | `PreIpoListingInput.preparationType?` | S-1 (엔진 타입 = 폼 타입) |
| ② initial | toggle ON 기본 객체 | `preparationType: "exchange_listing"` 명시 |
| ③ normalize | normalizeBesshiInput | 변경 없음(preparationType은 string, 날짜 아님) |
| ④ API 변환 | 폼→v2 통째 spread | strip 0 grep(R-3) |
| ⑤ UI 위젯 | PreIpoListingToggle RadioCardGroup | §2 |
| ⑥ 사이드바 | — | 비대상(PR-L 동일) |
| ⑦ 결과 카드 | PerShareValuationResultCard | §3 (하드코딩 수정 DR-1) |
| ⑧ validation | Zod preparationType enum optional | S-4 (superRefine 불요 — 공모가>0은 PR-L PL-8 재사용) |

---

## 6. Cross-field / fallback

- preparationType은 `"exchange_listing" | "association_registration" | undefined` — undefined → exchange(엔진 ptype 해소). length-derive 아님.
- numeric 0 영향 — 표시·인용 전용([[feedback_numeric_impact_verify_before_bug_claim]]).
- taxKind(6/3개월)와 **직교** — preparationType은 terminal 시장·라벨만, windowMonths는 taxKind만.

---

## 7. Silent fallback 후보

- **없음** — preparationType 미입력 시 exchange(PR-L 동작 100% 불변). RadioCard 미선택 상태 없음(ON 시 기본 exchange 주입).

---

## 8. 브라우저 e2e (`e2e/inheritance-pre-ipo-listing.spec.ts` 확장)

- **T-L2-1 (협회 등록 선택)**: 상속 V2 formal → §63② ON → preparationType="거래소 상장신청·협회 등록" 선택 → preview "협회 등록 전" 표기 확인.
- **T-L2-2 (기본 거래소 상장)**: §63② ON → 기본 preparationType=exchange → preview "거래소 상장 전"(PR-L 동작) 확인.
- ★ **기존 T-L-1/2/3 정규식 갱신 필수(E2·R-5)**: title 일반화로 `/기업공개 준비 중 법인/`이 깨지므로 **3건의 토글 탐지 정규식을 `/특례 평가/` 또는 toggle testid로 선(先)교체** 후 T-L2 추가. "보존 후 재확인"이 아니라 **갱신**(미갱신 시 T-L-1/2/3 실패).

---

## 9. UI senior 사전 점검 체크리스트

- [ ] 엔진 S-1·S-3·S-4 선행 완료(preparationType warnings·appliedRules·echo·Zod) — 시퀀셜
- [ ] RadioCardGroup preparationType (emerald, 미선택도 tone) + ON 시 기본 exchange 주입
- [ ] 신고일·상장일/등록일·preview·윈도우 설명 ptype 동적 라벨(C6)
- [ ] 결과카드·besshi **기존 §63②1호 하드코딩 분기 수정**(DR-1, additive 아님)
- [ ] RadioCardGroup display value `value.preparationType ?? "exchange_listing"`(E, 3중 일치) + 날짜 필드 앞 배치(C)
- [ ] ToggleCard title 일반화 → **PR-L e2e 3건 정규식 `/특례 평가/` 또는 testid로 선교체**(E2·R-5, 보존 불가)
- [ ] 결과카드 §63②1호 하드코딩 4곳(162·165·182·200)+besshi 1곳 preparationType 분기 수정 후 잔존 §63②1호 grep 0(DR-1)
- [ ] `npx tsc --noEmit` 0 + `npm test`(PR-L 16 회귀 포함) + e2e T-L2-1/2 + 기존 T-L-1/2/3
