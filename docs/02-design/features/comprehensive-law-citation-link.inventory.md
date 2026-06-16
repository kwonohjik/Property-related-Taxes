# 종합부동산세 법조문 인용 인벤토리 + 검증표

> 작성일: 2026-06-16 · 계획서: `docs/00-pm/comprehensive-law-citation-link.plan.md`
> 워크플로: memory `feedback_law_citation_link_workflow` · 검증정책 `feedback_korean_law_citation_verify`
> 본 문서는 (A)검증의 **동결처** — Phase 2 본문대조 결과를 `검증` 열에 기입하여 확정한다.

## 범례

**종류**: `SH`=SectionHeader children · `BADGE`=row badge string(파랑 pill) · `VLABEL`=valueLabel string · `OPT`=Select 옵션 라벨 · `DESC`=ToggleCard/RadioCard description(런타임) · `HELP`=도움말 `<p>`/안내 · `CONST`=legal-codes 상수 문자열.

**링크처리**:
- `직접` — SectionHeader/HELP `<p>` 등 JSX child 위치 → `LawArticleModal` 직접 삽입 가능.
- `prop` — TaxRow/TaxLabelRow badge → **신규 `legalBasis?` prop**로 LawArticleModal 부착(badge string 텍스트는 dual-truth 보존).
- `우회` — 런타임 string(OPT/DESC/에러) → 링크 불가 → 인접 섹션 헤더 배지행으로 동일 조문 노출.
- `보류` — 구법(현행 부재) → 링크 제외, `(구법 — 연혁)` 텍스트 유지.

**검증**: `확인 필요`(이번 세션 KoreanLaw MCP 미연결 — Phase 2 `get_law_text` 대조 전) / `정합`(본문 일치 확인) / `정정`(오류 — 정정 내용 기재) / `보류`.

---

## 1. 1차 범위 — 입력폼

### 1-1. `app/calc/comprehensive-tax/Step1Basic.tsx` (451행)
| # | line | 인용 | 종류 | 링크 | 검증 |
|---|---|---|---|---|---|
| S1 | 33·37~43 | 시행령 §4의4①1·3·4·5·5의2·6·7호 (법인 세부유형 Select 옵션) | OPT | 우회(법인 섹션 헤더 배지 §4의4) | 확인 필요 |
| S2 | 44 | 상속세 및 증여세법 §16 (공익법인등) | OPT | 우회 | 확인 필요 |
| S3 | 51~63 | 시행령 §4의4①5·5의2·6호 / §9②1·2·3호 (요건 라벨) | OPT | 우회 | 확인 필요 |
| S4 | 70~79 | §9②1호·§9②2호·§9②3호 / §10 단서 (도출 배지) | OPT | 우회/prop | 확인 필요 |
| S5 | 113·118 | 종합부동산세법 §9① / §9①2호 (도움말) | HELP | 직접 | 확인 필요 |
| S6 | 124·127 | §10② (구법) / §10 (도움말) | HELP | S6a 보류(§10②) · S6b 직접(§10) | 보류/확인 필요 |

### 1-2. `app/calc/comprehensive-tax/page.tsx` (673행)
| # | line | 인용 | 종류 | 링크 | 검증 |
|---|---|---|---|---|---|
| P1 | 166 | §11 (종합합산 토지 ToggleCard title) | DESC | 우회(헤더 배지) | 확인 필요 |
| P2 | 230 | §12 (별도합산 토지 ToggleCard title) | DESC | 우회 | 확인 필요 |
| P3 | 307~312 | §9②3호 / 종합부동산세법 §10 단서 (법인 안내 카드) | HELP | 직접 | 확인 필요 |
| P4 | 323 | 종합부동산세법 §10② 구법 (세부담상한 description) | DESC | 보류 | 보류 |
| P5 | 354 | §10의2 준용 (부부 공동명의 상당액 description) | DESC | 우회 | 확인 필요 |
| P6 | 446 | §10② (상한율 표시) | DESC | 보류 | 보류 |
| P7 | 453 | 종합부동산세법 §10 (상한액 산식 안내) | HELP | 직접 | 확인 필요 |
| P8 | 536 | 시행령 §4의4 (검증 에러메시지) | 에러 | 링크불가(우회 불요) | 확인 필요 |

### 1-3. `components/calc/ExclusionInfoInput.tsx` (공용 dir — 종부세 합산배제 전용)
| # | line | 인용 | 종류 | 링크 | 검증 |
|---|---|---|---|---|---|
| E1 | 104 | 시행령 §3①10호 (단기민간임대 건설) | DESC | 우회(섹션 헤더 배지 §3) | 확인 필요 |
| E2 | 109 | 시행령 §3①11호 (단기민간임대 매입) | DESC | 우회 | 확인 필요 |
| E3 | 152 | 시행령 §3⑦ (승계 임대기간 합산) | DESC | 우회 | 확인 필요 |
| E4 | 174 | 시행령 §3① (말소일 경고) | HELP | 직접 | 확인 필요 |
| E5 | 271 | 시행령 §4①1호 (5년 이내 합산배제) | DESC | 우회 | 확인 필요 |
| E6 | 360 | 시행령 §4①3호 (임대료율 50%) | DESC | 우회 | 확인 필요 |

---

## 2. 1차 범위 — 결과뷰 `components/calc/results/ComprehensiveTaxResultView.tsx` (749행)
| # | line | 인용 | 종류 | 링크 | 검증 |
|---|---|---|---|---|---|
| R1 | 204 | §8①2호 (법인 기본공제 "적용 없음") | VLABEL→badge | prop(TaxLabelRow) | 확인 필요 |
| R2 | 215 | §8④ 1세대1주택자 의제 (조건부 label) | label | 직접 | 확인 필요 |
| R3 | 275·277·279 | §9②(법인 단일세율)·§9②1호·§9②2호 (getCalculatedTaxBadge) | BADGE(dual-truth) | prop(조문만) | 확인 필요 |
| R4 | 280 | §10의2 부부 공동명의 특례 | BADGE | prop | 확인 필요 |
| R5 | 283~286 | §8④1호·2호·3호·4호 (합산배제 의제 유형) | BADGE | prop | 확인 필요 |
| R6 | 294 | 구 §9①3호 (다주택 중과 — 구법) | BADGE | **보류** | 보류 |
| R7 | 295 | §9①2호 (3주택 12억 초과 중과) | BADGE | prop | 확인 필요 |
| R8 | 318 | getCalculatedTaxBadge() 산출세액 배지 | BADGE | prop(파생 조문 단위) | 확인 필요 |
| R9 | 321·336 | §9③ 재산세 비율안분 / **badge "시행령 §4의3"** | BADGE | prop | 🚩 **드리프트 — §4 참조** |
| R10 | 368·376 | §9⑦⑨ / "§9⑤~⑨ (§8④ 안분)" | label·BADGE | 직접·prop | 확인 필요 |
| R11 | 395 | §10 단서 — §9②3호 세율 법인 배제 | HELP | 직접 | 확인 필요 |
| R12 | 435 | 토지분 — 종합합산 (§11) | SH | 직접 | 확인 필요 |
| R13 | 490 | 토지분 — 별도합산 (§12) | SH | 직접 | 확인 필요 |

---

## 3. legal-codes `lib/tax-engine/legal-codes/comprehensive.ts` (313행)
| # | line | 상수 | 인용 | 검증 |
|---|---|---|---|---|
| C1 | 15·17 | BASIC_DEDUCTION_GENERAL/ONE_HOUSE | §8①3호(9억)·§8①1호(12억) | 확인 필요 |
| C2 | 21·23 | AGGREGATION_EXCLUSION_* | §8②1호·§8②2호 | 확인 필요 |
| C3 | 27 | TAX_RATE | §9① | 확인 필요 |
| C4 | 31·33·35 | ONE_HOUSE_*_CREDIT | §9⑥·§9⑧·§9⑤ 단서 | 확인 필요 |
| C5 | 39 | PROPERTY_TAX_CREDIT | **§9③, 시행령 §4의2** | 🚩 **드리프트 — §4 참조** |
| C6 | 43 | TAX_CAP_GENERAL | §10(150%) | 확인 필요 |
| C7 | 48 | RURAL_SPECIAL_TAX | 농어촌특별세법 §5①5호 | 확인 필요 |
| C8 | 52 | TAX_BASE_DATE | §3 | 확인 필요 |
| C9 | 67·81 | 고령자/장기보유 공제율 주석 | 시행령 §4의2 / §4의3 | 확인 필요 |

---

## 4. 🚩 드리프트 후보 (Phase 2 최우선)

**재산세 비율안분 공제 시행령 조번호 불일치**:
- C5 legal-codes: `§9③, 시행령 §4의2`
- R9 결과뷰 badge: `시행령 §4의3`
- C9 주석: 고령자공제율=§4의2 · 장기보유공제율=§4의3

→ 동일 항목(§9③ 재산세 비율안분)을 §4의2 / §4의3으로 혼재 인용. **Phase 2에서 현행 종부령 본문대조로 정답 확정 후 C5·R9 통일.** (재산세 §103의2 교훈: 인용검증이 드리프트 적발) ※ 이번 세션 KoreanLaw MCP 미연결 → 미해소, 두 후보 보존.

---

## 5. 집계 (작성 시점)
- 노출 인용: 입력폼 20 + 결과뷰 13 + legal-codes 9 ≈ **42건**(1차 범위). 2차(별지·payable-calc) 18건 별도.
- 현재 링크: **0건** (LawArticleModal import 자체 부재).
- 보류(구법): §10②(S6a·P4·P6) · 구 §9①3호(R6) — 4건.
- 드리프트 정정 대상: §4의2/§4의3 (C5·R9) — Phase 2 확정.
