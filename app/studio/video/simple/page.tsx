import Link from "next/link";

export default function SimpleVideoStudioPage() {
  return (
    <main className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-8">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Simple Video</p>
          <h1 className="text-3xl font-semibold">Simple mode now runs on Studio V2</h1>
          <p className="text-sm text-zinc-400">
            This route is a thin wrapper over the Video V2 workflow. Use the V2 pages below to keep clip planning,
            orchestration, and run generation on the shared production path.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/studio/video/v2/create-clip?entry=simple"
            className="rounded-xl border border-cyan-400/50 bg-cyan-500/10 px-4 py-3 text-sm font-medium text-cyan-100 hover:bg-cyan-500/20"
          >
            Open V2 Create Clip
          </Link>
          <Link
            href="/studio/video/v2/working-packs-review?entry=simple"
            className="rounded-xl border border-zinc-700 px-4 py-3 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
          >
            Open V2 Working Pack Review
          </Link>
        </div>
      </div>
    </main>
  );
}
