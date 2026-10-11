import {
  FALSE_CONTRACT_PRICE_NOTICE_DETAIL,
  FALSE_CONTRACT_PRICE_NOTICE_LEAD,
  shouldShowFalseContractPriceNotice,
  type FalseContractPriceExposure,
} from "@/lib/calc/false-contract-price-notice";

/**
 * 소득세법 §91② 「매매계약서 거래가액 허위기재」 차감 — **범위 밖 고지** 한 줄 (결정 #48 A).
 *
 * 비과세·부분 비과세·감면 결과 안에 붙는 짧은 안내다. 경고 카드가 아니다 — 모든 비과세 결과에 눈에 띄는 경고를 달면
 * 대부분의 정직한 사용자에게 노이즈가 된다. 세액은 바꾸지 않는다(계약서 거래가액 입력 칸이 없다).
 *
 * 🔑 **노출 술어는 공용 `shouldShowFalseContractPriceNotice` 하나다.** 단건·다건·겸용·일괄·부담부증여 카드가 이 컴포넌트를
 *    쓰므로 뷰마다 조건을 따로 쓰지 않는다(`feedback_transfer_result_view_is_not_one`). 5곳 배선은
 *    `__tests__/components/false-contract-price-notice.guard.test.ts`가 지킨다.
 * 🔑 판정 메뉴(1세대1주택 비과세 판정)에는 두지 않는다 — §91②는 요건이 아니라 세액을 빼는 조항이라 판정 결론(비과세 해당)이
 *    바뀌지 않고, 판정 메뉴는 세액을 보여 주지 않는다(결정 #48 하위 2).
 */
/** 문구 본체 — 노출 판정은 하지 않는다(아래 두 공개 컴포넌트가 공용 술어로 거른 뒤 부른다). */
function NoticeText({ label, className }: { label?: string | undefined; className?: string | undefined }) {
  return (
    <div
      data-testid="false-contract-price-notice"
      className={"space-y-0.5 text-left text-caption text-muted-foreground" + (className ? ` ${className}` : "")}
    >
      <p>
        {label ? <b>{label} — </b> : null}
        {FALSE_CONTRACT_PRICE_NOTICE_LEAD}
      </p>
      <p>{FALSE_CONTRACT_PRICE_NOTICE_DETAIL}</p>
    </div>
  );
}

export function FalseContractPriceNotice({
  transferDate,
  isExempt,
  isPartialExempt,
  reductionAmount,
  className,
}: FalseContractPriceExposure & {
  transferDate?: string | Date | null | undefined;
  className?: string;
}) {
  if (!shouldShowFalseContractPriceNotice({ transferDate, isExempt, isPartialExempt, reductionAmount })) {
    return null;
  }
  return <NoticeText className={className} />;
}

/**
 * 여러 건(다건 · 일괄양도의 자산별 결과)을 한 번에 — 해당하는 건만 골라 **한 줄로** 묶는다.
 * 건마다 같은 두 문장을 반복하면 노이즈라 라벨만 이어 붙인다. 판정은 건별 공용 술어를 그대로 쓴다.
 */
export function FalseContractPriceNoticeForItems({
  items,
  className,
}: {
  items: ReadonlyArray<FalseContractPriceExposure & { label: string; transferDate?: string | Date | null | undefined }>;
  className?: string;
}) {
  const hit = items.filter((it) =>
    shouldShowFalseContractPriceNotice({
      transferDate: it.transferDate,
      isExempt: it.isExempt,
      isPartialExempt: it.isPartialExempt,
      reductionAmount: it.reductionAmount,
    }),
  );
  if (hit.length === 0) return null;
  // 모든 건이 해당하면 라벨은 생략한다 — 「일부 건만」일 때만 어느 건인지 밝힌다.
  const label = hit.length === items.length ? undefined : hit.map((it) => it.label).join(" · ");
  return <NoticeText label={label} className={className} />;
}
