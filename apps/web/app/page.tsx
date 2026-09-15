export default function HomePage() {
  return (
    <main className="flex min-h-svh items-center justify-center px-6 py-12">
      <section
        aria-labelledby="dayflow-title"
        className="w-full max-w-lg rounded-3xl border border-line bg-panel p-8 text-center shadow-sm sm:p-12"
      >
        <h1 id="dayflow-title" className="text-4xl font-bold tracking-tight">
          Day<span className="text-accent">Flow</span>
        </h1>
        <p className="mt-4 text-lg">목표를 향해, 다시 시작하는 하루.</p>
        <p className="mt-6 text-sm">DayFlow가 정상적으로 실행되었습니다.</p>
      </section>
    </main>
  );
}
