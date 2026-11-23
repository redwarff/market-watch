import { TickerView } from '@/components/ticker-view';

export default async function TickerPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  return <TickerView symbol={decodeURIComponent(symbol).toUpperCase()} />;
}
