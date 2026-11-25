export type MacroGuide = { about: string; affects: string };

const GUIDES: { test: RegExp; guide: MacroGuide }[] = [
  {
    test: /summary of economic projections|economic projections/i,
    guide: {
      about:
        'The Fed’s own forecasts for growth, unemployment, inflation, and the policy rate, published with some rate decisions. The “dot plot” is each official’s expected path for the federal funds rate.',
      affects:
        'A higher path for the policy rate usually lifts Treasury yields and the dollar, and weighs on stocks priced on earnings far in the future. Banks feel the path through net interest margins. A lower path does the reverse.',
    },
  },
  {
    test: /fomc minutes/i,
    guide: {
      about:
        'The detailed account of the last Federal Open Market Committee meeting, released about three weeks later. It shows the range of views behind the statement.',
      affects:
        'The reaction is usually smaller than on decision day. Yields, the dollar, and rate-sensitive stocks move when the minutes reveal a debate the statement did not.',
    },
  },
  {
    test: /beige book/i,
    guide: {
      about:
        'Anecdotes from the twelve regional Fed banks on wages, demand, prices, and credit, published two weeks before a policy meeting.',
      affects:
        'It rarely causes a sharp move. Traders use it as color for the next meeting. A clear shift in the wage or credit stories can nudge yields.',
    },
  },
  {
    test: /fomc rate/i,
    guide: {
      about:
        'The Federal Reserve’s decision on the federal funds target range, plus the statement and the chair’s press conference. This is the price of overnight money between banks, and the anchor for other interest rates.',
      affects:
        'Yields, the dollar, and stock index futures reprice within minutes. Growth stocks with profits far in the future are usually the most sensitive. Banks reprice with the outlook for margins and credit. A fully expected decision can still move markets if the statement changes the path ahead.',
    },
  },
  {
    test: /nonfarm|employment situation/i,
    guide: {
      about:
        'The monthly jobs report. Nonfarm payrolls is the change in employment outside farms, private households, and nonprofits. The same release includes the unemployment rate and average hourly earnings.',
      affects:
        'Strong hiring and hot wages tend to lift Treasury yields and the dollar, because they argue for a firmer Fed. Rate-sensitive growth stocks often fall on that mix. A weak report pulls yields down. Consumer and cyclical companies also move with what the report says about household income.',
    },
  },
  {
    test: /jobless claims/i,
    guide: {
      about:
        'New filings for unemployment insurance each week. It is an early, noisy read on layoffs, published before the monthly jobs report.',
      affects:
        'One week rarely resets the market. A run of higher claims is read as a cooling labor market, which tends to pull yields down and help bonds. Consumer and cyclical stocks follow the growth reading more than the single print.',
    },
  },
  {
    test: /jolts/i,
    guide: {
      about:
        'Job Openings and Labor Turnover: openings, hires, quits, and layoffs. Openings and quits are watched as signs of how tight the labor market is. The figures lag the week they describe.',
      affects:
        'A sharp drop in openings is read as less demand for workers and can pull yields down. The survey is revised often, so index futures move less than they do on payrolls day unless the surprise is large.',
    },
  },
  {
    test: /^cpi\b|consumer price index/i,
    guide: {
      about:
        'The Consumer Price Index tracks prices urban households pay, from rent and cars to food and energy. Core CPI leaves out food and energy, which jump around for reasons that are not always demand.',
      affects:
        'A hotter print usually lifts Treasury yields and the dollar. Stocks priced on distant earnings, including much of big tech, often fall when yields jump. Housing-related and other rate-sensitive names move with the yield reaction. A cooler print tends to reverse that pattern.',
    },
  },
  {
    test: /^ppi\b|producer price index/i,
    guide: {
      about:
        'Prices US producers receive. It sits upstream of consumer prices and is an early hint for CPI and for company margins.',
      affects:
        'Hot producer prices can lift yields if traders expect them to reach CPI. They also squeeze firms that cannot pass the cost on, which shows up in industrials, materials, and later in retailers. A tame print eases that pressure.',
    },
  },
  {
    test: /gdp by county|personal income by county/i,
    guide: {
      about:
        'Local estimates of output and income by county. They describe where growth happened, long after the national GDP release.',
      affects:
        'National yields, the dollar, and stock indexes almost never reprice on this release. It is background for regional economies, not a market event.',
    },
  },
  {
    test: /personal income|pce/i,
    guide: {
      about:
        'Personal income, consumer spending, and the PCE price index. PCE is the inflation measure the Fed emphasizes, because it covers a broader basket than CPI and updates the weights as people change what they buy.',
      affects:
        'Core PCE is the line rate markets watch. A hotter reading lifts yields and the dollar and weighs on long-duration stocks. The spending figures matter for retailers, travel, and other consumer businesses.',
    },
  },
  {
    test: /retail sales/i,
    guide: {
      about:
        'The advance estimate of sales at US retailers. It is mostly goods, not services, and it is an early look at household demand.',
      affects:
        'A strong print supports retailers, consumer discretionary, and payment networks, and can lift yields if demand looks too hot for the Fed. A weak print does the reverse. Service companies are only an indirect read.',
    },
  },
  {
    test: /industrial production/i,
    guide: {
      about:
        'Output of factories, mines, and utilities. It is a direct read on the goods-producing side of the economy.',
      affects:
        'Industrials, materials, and freight are the closest links. A weak print can still help growth stocks when yields fall because the economy looks cooler.',
    },
  },
  {
    test: /housing starts|building permits/i,
    guide: {
      about:
        'Housing starts are homes that broke ground. Building permits are authorizations and usually lead starts by a few months. Both are sensitive to mortgage rates.',
      affects:
        'Homebuilders, building products, and housing retail move with the surprise. The same release can push yields if it signals strong demand, which then works against the builders through mortgage rates.',
    },
  },
  {
    test: /durable goods/i,
    guide: {
      about:
        'New orders for goods meant to last at least three years. Aircraft orders make the headline swing wildly. Orders excluding transportation, and core capital goods, are the cleaner read on business investment.',
      affects:
        'Machinery, industrials, and aircraft suppliers are the usual links. A broad rise in core orders supports the growth story and can nudge yields up. A headline move that is only aircraft is often faded.',
    },
  },
  {
    test: /\bgdp\b/i,
    guide: {
      about:
        'Gross domestic product, the broad measure of US output. The advance estimate comes first. Later estimates revise the same quarter as more source data arrives.',
      affects:
        'A large surprise or revision moves Treasury yields and cyclical stocks. Index futures often react more to what the number implies for the Fed than to the growth figure alone.',
    },
  },
  {
    test: /new home sales/i,
    guide: {
      about:
        'Signed contracts for new single-family homes. The series is volatile and often revised.',
      affects:
        'Homebuilders and housing retail are the direct links. Mortgage rates and the yield reaction can matter as much as the sales count.',
    },
  },
  {
    test: /international trade/i,
    guide: {
      about:
        'The trade balance for goods and services, exports minus imports. A more negative number is a wider deficit. Net exports feed the GDP calculation.',
      affects:
        'Markets usually shrug unless the surprise is large enough to change tracking estimates for the quarter. Export-heavy industrials care about the composition more than the headline deficit.',
    },
  },
  {
    test: /import and export prices|import.*export prices/i,
    guide: {
      about:
        'Price changes for goods the US imports and exports. Import prices are an input to inflation and to the margins of companies that buy from abroad.',
      affects:
        'This is usually a low-impact release. A large jump in import prices can stir the inflation conversation and nudge yields, and it touches retailers and manufacturers that rely on imported inputs.',
    },
  },
  {
    test: /business inventories|wholesale inventories/i,
    guide: {
      about:
        'The value of goods sitting in stock at businesses or wholesalers. Inventory building adds to GDP, and a drawdown subtracts from it.',
      affects:
        'The release mostly matters when it changes the tracking estimate for the quarter. Retailers and wholesalers are the fundamental link. Index futures rarely gap on it.',
    },
  },
  {
    test: /factory orders/i,
    guide: {
      about:
        'New orders to manufacturers. It overlaps the durable-goods report and adds nondurable goods such as food and fuel.',
      affects:
        'Industrials are the closest link. Markets react when the revision to durable goods, or the nondurable piece, changes the growth picture.',
    },
  },
  {
    test: /construction spending/i,
    guide: {
      about:
        'Outlays on private and public construction, from houses to roads. The series is revised often.',
      affects:
        'Homebuilders, materials, and infrastructure-related companies are the link. It seldom moves the broad indexes unless the surprise changes the quarter’s GDP tracking.',
    },
  },
  {
    test: /productivity and costs/i,
    guide: {
      about:
        'Output per hour, and unit labor costs, which are wages adjusted for that productivity. Faster productivity lets wages rise with less pressure on prices.',
      affects:
        'A friendly mix, strong productivity and tame unit labor costs, eases the inflation worry and can pull yields down while supporting margins. A jump in unit labor costs does the opposite and matters for labor-heavy businesses.',
    },
  },
  {
    test: /treasury auction/i,
    guide: {
      about:
        'The US Treasury selling bills, notes, or bonds. The result that matters is the yield investors demanded and how strong the bidding was, not a statistical print about the economy.',
      affects:
        'A weak auction, a higher yield and thin bidding, can push that part of the yield curve up and weigh on rate-sensitive stocks the same day. A routine auction usually passes quietly.',
    },
  },
];

const FALLBACK: MacroGuide = {
  about: 'A scheduled US statistical release. The previous column is the prior period, and the actual appears after the agency publishes.',
  affects:
    'High-impact releases can move Treasury yields, the dollar, and stock index futures in the minutes around the number. A single company moves when the surprise changes the outlook for interest rates, demand, or its costs.',
};

export function explainRelease(name: string): MacroGuide {
  for (const entry of GUIDES) {
    if (entry.test.test(name)) return entry.guide;
  }
  return FALLBACK;
}

/** Short label for the price releases people scan for on an inflation day. */
export function releaseTopic(name: string): string | null {
  if (/^cpi\b|consumer price index|^ppi\b|producer price index|\bpce\b|personal income and outlays|import and export price/i.test(name)) {
    return 'Inflation';
  }
  return null;
}

export function formatPrint(value: string | null, unit: string): string {
  if (value == null || value.trim() === '') return '—';
  const number = Number(value);
  const shown = Number.isFinite(number) ? trimNumber(number) : value.trim();
  if (!unit) return shown;
  if (unit.startsWith('%')) return `${shown}${unit}`;
  return `${shown} · ${unit}`;
}

function trimNumber(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: Math.abs(value) >= 100 ? 1 : 2 });
}
