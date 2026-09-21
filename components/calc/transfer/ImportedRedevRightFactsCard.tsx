"use client";

/**
 * 1세대1입주권 — 계산기 쪽 **세액 안내 + 읽기 전용 요약** (P6-c-1)
 *
 * ## 왜 두 가지를 한 카드에 담는가
 *
 * 계산기에서 `RedevelopmentRightExemptionSection`을 뺐다. 그 컴포넌트가 들고 있던 것은
 * 두 종류였고 **행선지가 갈린다**:
 *
 * | 내용 | 성격 | 행선지 |
 * |---|---|---|
 * | 4필드 입력(§89①4호 가목 요건) | **판정 사실** | 판정 메뉴 |
 * | §95② 장기보유특별공제 구조 안내 | **세액 맥락** | **계산기** ← 이 카드 |
 *
 * 세액 안내까지 함께 옮기면 계산기가 「인가전 차익만 LTHD 대상」을 말할 곳을 잃는다 —
 * 그건 판정 메뉴가 할 말이 아니다(판정 메뉴는 세액을 말하지 않는다).
 *
 * ## 🔴 요약이 필요한 이유 — 보이지 않는 값이 세액을 바꾼다
 *
 * 4필드는 `AssetForm` flat이고 ④가 계속 읽는다(`transfer-tax-api-redev.ts`). 위젯만
 * 없앴으므로 값은 살아서 세액을 바꾼다 — P6-c-1 **이전**에 저장한 이력을 다시 열었을 때가
 * 정확히 그 경우다(OH-21). 화면이 말하지 않으면 그 상태를 알 수 없다.
 *
 * 🔑 **선언된 것만 보여 준다.** 4필드를 전부 나열하면 「—」가 쌓여 실제 선언이 묻힌다.
 */
import Link from "next/link";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 계산기에서 편집 위젯이 사라진 §89①4호 판정 사실 4필드 (P6-c-1). */
export type ImportedRedevRightSlice = Pick<
  AssetForm,
  | "redevExemptionEligibleAtApproval"
  | "redevOtherHouseAcquisitionDate"
  | "redevPriorHouseHoldingMonths"
  | "redevPriorHouseResidenceMonths"
>;

const ELIGIBLE_LABEL: Record<string, string> = {
  yes: "충족 선언",
  no: "미충족 선언",
};

type Row = { label: string; value: string };

function factsRows(a: ImportedRedevRightSlice): Row[] {
  const rows: Row[] = [];
  const push = (label: string, value: string | undefined) => {
    if (value) rows.push({ label, value });
  };
  push(
    "인가일 현재 기존주택 소유 (§89①4호 가목)",
    ELIGIBLE_LABEL[a.redevExemptionEligibleAtApproval ?? ""],
  );
  push("다른 주택 취득일 (나목 3년 기산)", a.redevOtherHouseAcquisitionDate);
  push(
    "종전주택 보유기간",
    a.redevPriorHouseHoldingMonths ? `${a.redevPriorHouseHoldingMonths}개월` : undefined,
  );
  push(
    "종전주택 거주기간",
    a.redevPriorHouseResidenceMonths ? `${a.redevPriorHouseResidenceMonths}개월` : undefined,
  );
  return rows;
}

export function ImportedRedevRightFactsCard({ asset }: { asset: ImportedRedevRightSlice }) {
  const rows = factsRows(asset);

  return (
    <div className="space-y-3" data-testid="redev-right-calc-card">
      {/* §0-A — 입주권 양도 LTHD 구조. **세액 맥락**이라 계산기가 갖는다. */}
      <div className="rounded-md bg-sky-50 border border-sky-200 p-3 text-caption text-sky-900 leading-relaxed">
        <p className="font-semibold mb-0.5">관리처분 인가 후 조합원입주권 양도 — 과세 구조 안내</p>
        <p>
          인가전 양도차익만 장기보유특별공제 대상입니다 (§95② 본문 괄호 + §94①2호). 인가후 분 및 청산금 분 양도차익에는 장기보유특별공제가 적용되지 않습니다.
        </p>
        <p className="mt-1">
          비과세 적용 시 전액 비과세이며, 양도가액이 12억을 초과하면 초과분만 과세됩니다.
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <LawArticleModal legalBasis="소득세법 §95 ②" label="§95② 본문 괄호" />
          <LawArticleModal legalBasis="소득세법 §94 ① 2호" label="§94①2호" />
          <LawArticleModal legalBasis="소득세법 §89 ① 4호" label="§89①4호 가목" />
        </div>
      </div>

      {rows.length > 0 ? (
        <div
          className="rounded-md border border-violet-200 bg-violet-50/60 p-3 space-y-1.5"
          data-testid="imported-redev-right-facts"
        >
          <p className="text-xs font-semibold text-violet-700">
            판정 메뉴에서 넘겨받은 사실 — 1세대1입주권{" "}
            <LawArticleModal legalBasis="소득세법 §89 ① 4호" label="법 §89①4호" />
          </p>
          <p className="text-caption text-muted-foreground">
            이 화면에서는 수정할 수 없습니다 — 고치려면 판정 메뉴로 돌아가 다시 판정하세요.
          </p>
          <dl className="space-y-1 text-sm">
            {rows.map((r) => (
              <div key={r.label} className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">{r.label}</dt>
                <dd className="font-medium">{r.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <div
          className="rounded-md border border-sky-200 bg-sky-50/60 p-3 text-sm text-sky-900"
          data-testid="redev-right-handoff-notice"
        >
          <p>
            1세대1입주권 비과세 요건(§89①4호)은{" "}
            <Link
              href="/calc/one-house-exemption"
              className="font-medium underline underline-offset-2"
              data-testid="redev-right-handoff-link"
            >
              1세대1주택 비과세 판정
            </Link>
            에서 판정한 뒤, 1단계의 「📋 판정 불러오기」로 가져오세요.
          </p>
          <p className="mt-1 text-caption text-muted-foreground">
            판정을 거치지 않으면 이 계산은 <strong>비과세 없음</strong>으로 산출됩니다.
          </p>
        </div>
      )}
    </div>
  );
}
