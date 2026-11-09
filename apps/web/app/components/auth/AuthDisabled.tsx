export function AuthDisabled() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-6 py-16">
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-bold uppercase tracking-widest text-slate-500">EdiCut account access</p>
        <h1 className="mt-3 text-2xl font-bold text-slate-950">Sign-in is temporarily unavailable</h1>
        <p className="mt-3 text-slate-600">We’re preparing an updated sign-in experience. Please try again later.</p>
        <a className="mt-6 inline-flex rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white" href="/">Return to EdiCut</a>
      </section>
    </main>
  );
}
