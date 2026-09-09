import { redirect } from 'next/navigation';

export default async function CrossCheckPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = new URLSearchParams({ view: 'cross-check' });
  if (typeof params.universe === 'string') query.set('universe', params.universe);
  redirect(`/scanner?${query.toString()}`);
}
