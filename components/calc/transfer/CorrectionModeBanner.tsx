import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

/**
 * 정정(수정신고/경정청구) 작성 모드 상단 배너.
 * TransferTaxCalculator에서 격리 (800줄 정책). correctionKind별 tone/문구 분기.
 */
export function CorrectionModeBanner({
  amendmentMode,
  correctionKind,
}: {
  amendmentMode: boolean;
  correctionKind: TransferFormData["correctionKind"];
}) {
  if (!amendmentMode) return null;

  if (correctionKind === "refund_claim") {
    return (
      <div className="mb-4 rounded-xl border border-sky-300 bg-sky-50/60 px-4 py-3 text-sm text-sky-900 print:hidden dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-200">
        <p className="font-semibold">📄 경정청구 작성 중</p>
        <p className="mt-0.5 text-xs leading-relaxed">
          당초 신고 기준으로 불러왔습니다. 과다신고 항목(양도가액·취득가액·필요경비)을 정정하세요.
          당초 결정세액과 비교해 환급세액을 계산합니다.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50/60 px-4 py-3 text-sm text-amber-900 print:hidden dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
      <p className="font-semibold">📝 수정신고 작성 중</p>
      <p className="mt-0.5 text-xs leading-relaxed">
        당초 신고 기준으로 불러왔습니다. 양도가액·취득가액·필요경비를 수정하세요.
        당초 결정세액은 마지막 단계에서 자동 차감됩니다.
      </p>
    </div>
  );
}
