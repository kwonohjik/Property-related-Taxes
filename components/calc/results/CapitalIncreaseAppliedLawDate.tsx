/**
 * §39 3경로(단건·전환주식·cap-table) 적용 법령 기준일 블록 — #37·#94.
 *
 * §45의3·§45의5는 **법률이 직접** 증여시기를 정하지만, §39①은 「주식대금 납입일 등 **대통령령으로 정하는
 * 날**」로 전부 위임하고 「상증령」§29①이 갈래를 정한다. 그래서 라벨이 형제 블록과 다르다 — 같은 삼항
 * 라벨에 흘리면 「거래한 날 — 상증법 §45의5①」이 붙는다(anchor ALV-1).
 * testid는 형제 블록과 같다(`deemed-applied-law-date`) — 한 결과에 둘이 함께 뜨는 일은 없다.
 */
export function CapitalIncreaseAppliedLawDate({
  appliedLawDate,
  eraNotice,
  conversion = false,
}: {
  appliedLawDate: string;
  eraNotice?: string;
  /** 전환주식이면 기준일 = 전환한 날(§29①2호) */
  conversion?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-sm" data-testid="deemed-applied-law-date">
      <p className="text-slate-800">
        <b>적용 법령 기준일</b> <span className="font-mono tabular-nums">{appliedLawDate}</span>{" "}
        <span className="text-muted-foreground">
          ({conversion ? "전환주식을 전환한 날 — 상증령 §29①2호" : "증여일 — 상증령 §29①(상증법 §39① 위임)"})
        </span>
      </p>
      <p className={`mt-1 text-caption ${eraNotice ? "text-amber-700" : "text-muted-foreground"}`}>
        {eraNotice ?? "상증법 §39·상증령 §29는 2017.2.7. 이후 개정되지 않아 이 기준일의 조문과 현행이 같습니다."}
      </p>
    </div>
  );
}
