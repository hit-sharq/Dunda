import { useEffect, useRef, useState } from "react";
import { useGlobalSearch, useMarkAllNotificationsRead, useGetNotificationUnreadCount, useGetNotifications, useUpdateNotification } from "@/lib/api-client-react/src";
import { timeAgo } from "./ui";

interface Hit {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

const typeIcon: Record<string, string> = {
  product: "▣",
  order: "≡",
  table: "◫",
  reservation: "◷",
  event: "✦",
  customer: "◍",
  staff: "◉",
  stock: "▤",
};

export function GlobalSearch({
  onNavigate,
}: {
  onNavigate: (href: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 20);
  }, [open]);

  const search = useGlobalSearch(
    { q: term },
    {
      query: {
        enabled: open && term.trim().length >= 2,
        queryKey: ["globalSearch", term],
      },
    },
  );
  const hits: Hit[] = search.data?.results ?? [];

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="hidden items-center gap-2 rounded-xl bg-[#f0ebe0] px-3 py-2 text-xs text-[#7b8780] hover:bg-[#e7e1d6] md:flex"
        data-testid="button-open-search"
      >
        <span>Search anything</span>
        <kbd className="rounded border border-[#d8d1c2] bg-[#fbf9f3] px-1.5 py-0.5 font-mono text-[10px]">
          ⌘K
        </kbd>
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-[#162329]/40 p-4 pt-[12vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-[#ded7ca] bg-[#fbf9f3] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Search"
      >
        <input
          ref={inputRef}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search orders, products, tables, customers, staff…"
          className="w-full border-b border-[#e8e1d6] bg-transparent px-5 py-4 text-sm outline-none"
          data-testid="input-global-search"
        />
        <div className="max-h-[52vh] overflow-y-auto">
          {term.trim().length < 2 && (
            <p className="px-5 py-8 text-center text-xs text-[#859089]">
              Type at least two characters to search.
            </p>
          )}
          {search.isFetching && (
            <p className="px-5 py-6 text-center text-xs text-[#859089]">Searching…</p>
          )}
          {search.isError && (
            <p className="px-5 py-6 text-center text-xs text-[#a3452e]">
              Search is unavailable right now.
            </p>
          )}
          {!search.isFetching && term.trim().length >= 2 && hits.length === 0 && (
            <p className="px-5 py-8 text-center text-xs text-[#859089]">
              No matches for “{term}”.
            </p>
          )}
          {hits.map((hit) => (
            <button
              key={`${hit.type}-${hit.id}`}
              onClick={() => {
                onNavigate(hit.href);
                setOpen(false);
                setTerm("");
              }}
              className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-[#f0ebe0]"
              data-testid={`search-hit-${hit.id}`}
            >
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#e8e1d6] text-[#69736f]">
                {typeIcon[hit.type] ?? "•"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{hit.title}</span>
                <span className="block truncate text-xs text-[#859089]">{hit.subtitle}</span>
              </span>
              <span className="rounded-full bg-[#ece8de] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#7c8780]">
                {hit.type}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const unread = useGetNotificationUnreadCount();
  const list = useGetNotifications({ unread: false, limit: 20 });
  const markRead = useUpdateNotification();
  const markAll = useMarkAllNotificationsRead();

  const items = list.data ?? [];
  const unreadCount = unread.data?.count ?? 0;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative grid h-10 w-10 place-items-center rounded-xl text-[#68726f] hover:bg-[#eae5da]"
        data-testid="button-notifications"
        aria-label="Notifications"
      >
        ⃝
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#f07a4b] px-1 font-mono text-[9px] font-bold text-[#182127]">
            {unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-40 w-80 overflow-hidden rounded-2xl border border-[#ded7ca] bg-[#fbf9f3] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[#e8e1d6] px-4 py-3">
            <span className="font-display text-sm font-bold">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAll.mutate()}
                className="text-[10px] font-semibold text-[#4a8877]"
                data-testid="button-mark-all-read"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && (
              <p className="px-4 py-8 text-center text-xs text-[#859089]">
                Nothing needs your attention.
              </p>
            )}
            {items.map((n: (typeof items)[number]) => (
              <button
                key={n.id}
                onClick={() => {
                  if (!n.read) markRead.mutate({ notificationId: n.id, data: { read: true } });
                }}
                className={`block w-full border-b border-[#f0ebe1] px-4 py-3 text-left last:border-0 ${
                  n.read ? "" : "bg-[#fdf4ee]"
                }`}
                data-testid={`notification-${n.id}`}
              >
                <p className="text-sm font-semibold">{n.title}</p>
                <p className="text-xs text-[#65716b]">{n.message}</p>
                <p className="mt-0.5 font-mono text-[10px] text-[#9aa19b]">
                  {timeAgo(n.createdAt)}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
