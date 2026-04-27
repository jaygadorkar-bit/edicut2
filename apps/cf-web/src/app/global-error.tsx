'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div className="flex flex-col items-center justify-center min-h-screen bg-background text-white p-6 text-center">
          <h2 className="text-2xl font-bold">Something went wrong!</h2>
          <p className="mt-2 text-muted-foreground max-w-md">{error.message || "A critical error occurred."}</p>
          <button
            onClick={() => reset()}
            className="mt-6 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-bold"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
