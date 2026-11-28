/**
 * 국외자산 양도소득세 입력 화면 공용 선택지 — 주식(`stock-transfer/`)과 부동산(`transfer/foreign/`)이 함께 쓴다.
 *
 * 계획서: `docs/02-design/features/transfer-foreign-realestate.ui.plan.md` §11 U0
 * 복제하면 갈라진다 — 두 자산 종류의 옵션은 이 파일 하나가 단일 소스다.
 */
import { TRANSFER_FOREIGN_RE } from "@/lib/tax-engine/legal-codes/transfer-foreign-realestate";

// ── 지원 국가 목록 ──
export const COUNTRY_OPTIONS = [
  { value: "US", label: "미국 (USD)" },
  { value: "JP", label: "일본 (JPY)" },
  { value: "CN", label: "중국 (CNY)" },
  { value: "HK", label: "홍콩 (HKD)" },
  { value: "GB", label: "영국 (GBP)" },
  { value: "DE", label: "독일 (EUR)" },
  { value: "FR", label: "프랑스 (EUR)" },
  { value: "OTHER", label: "기타" },
];

// ── 외국납부세액 처리 방법 (§118의6①) ──
//
// 🔑 **과세기간(신고) 단위 택일이다** — 종목마다 다르게 고를 수 없다.
//    §118의6①이 「다음 각 호의 방법 중 **하나를 선택**하여 적용할 수 있다」이고,
//    1호 산식의 A(국외 산출세액 합)·C(국외 양도소득금액 합)가 **과세기간 총량**이라
//    종목마다 갈리면 C의 구성이 명문 없이 정해진다(계획서 §4.2 · 2026-09-01 확정).
export const FOREIGN_TAX_METHOD_OPTIONS = [
  {
    value: "credit",
    label: `세액공제 (${TRANSFER_FOREIGN_RE.SECTION_118_6_1_1_CREDIT})`,
    description: "한도 = 국외 산출세액 합 × 해당 종목 양도소득금액 / 국외 양도소득금액 합",
  },
  {
    value: "expense",
    label: `필요경비 산입 (${TRANSFER_FOREIGN_RE.SECTION_118_6_1_2_EXPENSE})`,
    description: "양도차익 계산 시 필요경비로 처리",
  },
];
