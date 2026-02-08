export default function SkeletonCard() {
  return (
    <div className="rounded-xl bg-white shadow-md ring-1 ring-gray-100 overflow-hidden">
      <div className="aspect-[16/10] w-full bg-slate-200 animate-pulse" />
      <div className="p-4">
        <div className="h-5 w-3/4 rounded bg-slate-200 animate-pulse" />
        <div className="mt-2 flex gap-3">
          <div className="h-3.5 w-1/3 rounded bg-slate-200 animate-pulse" />
          <div className="h-3.5 w-1/4 rounded bg-slate-200 animate-pulse" />
        </div>
        <div className="mt-3 border-t border-slate-100 pt-3">
          <div className="h-6 w-1/2 rounded bg-slate-200 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
