export default function PostLoading() {
  return (
    <div className="min-h-[70vh] bg-[#101418] text-[#e0e3e8] font-body selection:bg-[#40fe6d]/30">
      <div className="relative h-[70vh] min-h-[600px] w-full overflow-hidden px-6 pb-14 lg:px-20">
        <div className="absolute inset-0 bg-[linear-gradient(120deg,#152029_0%,#101418_50%,#1d2730_100%)]" />
        <div className="absolute inset-0 opacity-35 [background:repeating-linear-gradient(-8deg,rgba(255,255,255,0.03)_0px,rgba(255,255,255,0.03)_1px,transparent_1px,transparent_14px)]" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#101418] via-[#101418]/65 to-[#101418]/20" />

        <div className="relative z-10 mx-auto flex h-full w-full max-w-6xl animate-pulse flex-col justify-end">
          <div className="h-16 w-[min(88vw,420px)] rounded bg-[#2a363d] sm:h-20" />

          <div className="mt-8 flex items-center gap-3">
            <div className="h-11 w-11 rounded-full bg-[#2a363d]" />
            <div className="space-y-2">
              <div className="h-3 w-32 rounded bg-[#2a363d]" />
              <div className="h-3 w-36 rounded bg-[#2a363d]" />
            </div>
            <div className="ml-2 h-3 w-16 rounded bg-[#40fe6d]/70" />
          </div>
        </div>
      </div>
    </div>
  );
}
