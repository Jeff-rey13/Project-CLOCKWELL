import { Tray } from '@phosphor-icons/react/dist/ssr';
import { EmptyState } from '@/components/ui/EmptyState';

export default function RequestsPage() {
  return (
    <>
      <h1 className="mb-4 text-2xl">Requests</h1>
      <EmptyState
        icon={<Tray size={32} aria-hidden />}
        title="No requests yet"
        body="Leave requests, medical claims and time fixes will show here with their status."
      />
    </>
  );
}
