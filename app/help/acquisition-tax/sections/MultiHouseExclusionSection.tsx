/** §6 다주택 중과 제외 18+α종 전체 표 (시행령 §28의2) */
export function MultiHouseExclusionSection() {
  return (
    <section id="multi-house-exclusion" className="space-y-4">
      <h2 className="text-lg font-bold text-foreground">6. 다주택 중과 제외 18+α종 (시행령 §28의2)</h2>
      <p className="text-sm text-muted-foreground">
        아래 주택을 취득하거나 보유 중인 주택이 해당되면 다주택 중과 산정에서 제외됩니다.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse min-w-[600px]">
          <thead>
            <tr className="bg-sky-50 text-sky-800">
              <th className="border border-sky-200 px-2 py-2">#</th>
              <th className="border border-sky-200 px-2 py-2 text-left">유형</th>
              <th className="border border-sky-200 px-2 py-2 text-left">조건</th>
              <th className="border border-sky-200 px-2 py-2 text-left">근거</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            {[
              ["1", "시가표준액 한도 이하", "수도권 1억 이하 / 비수도권 2억 이하 (정비구역 제외)", "§28의2 1호"],
              ["2", "공공주택사업자 매입임대", "환매 포함", "§28의2 2호"],
              ["2의2", "공공주택사업자 분양", "2년 이상 임대 후 분양", "§28의2 2의2호"],
              ["2의3", "공공주택사업자 환매", "매입확약 포함", "§28의2 2의3호"],
              ["3", "노인복지주택", "1년 내 직접 사용", "§28의2 3호"],
              ["3의2", "도시재생사업 현물보상", "—", "§28의2 3의2호"],
              ["4", "문화유산·천연기념물", "지정·등록 문화재", "§28의2 4호"],
              ["5", "공공지원민간임대주택", "임대사업자 등록", "§28의2 5호"],
              ["6", "가정어린이집", "1년 내 직접 사용", "§28의2 6호"],
              ["7", "부동산투자회사 매입", "매도자 1주택 + 5억 이하", "§28의2 7호"],
              ["8", "멸실 목적 주택", "3년 내 멸실, 7년 내 신축", "§28의2 8호"],
              ["9", "미분양 시공자 취득", "3년 한정", "§28의2 9호"],
              ["10", "채권변제 취득", "3년 내 처분 조건", "§28의2 10호"],
              ["11", "농어촌 주택", "대지 660㎡·연면적 150㎡·6,500만 이내", "§28의2 11호"],
              ["12", "사원 임대용 60㎡", "공동주택, 1년 내 직접 사용", "§28의2 12호"],
              ["13~13의3", "분할·합병 취득", "적격분할", "§28의2 13호"],
              ["14", "리모델링조합", "—", "§28의2 14호"],
              ["15", "토지임대부 분양주택", "—", "§28의2 15호"],
              ["16", "기업구조조정 리츠", "수도권 외 미분양 아파트", "§28의2 16호"],
              ["17", "미분양 아파트 한시", "2026년, 수도권 외 85㎡·6억 이하", "§28의2 17호"],
              ["18", "인구감소지역 임대주택", "2026년, 60일 내 등록", "§28의2 18호"],
            ].map(([num, type, cond, basis], i) => (
              <tr key={i} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                <td className="border border-border px-2 py-2 text-center">{num}</td>
                <td className="border border-border px-2 py-2 font-medium text-foreground">{type}</td>
                <td className="border border-border px-2 py-2">{cond}</td>
                <td className="border border-border px-2 py-2">{basis}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
