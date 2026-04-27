import Link from "next/link";


export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-white">
      <h1 className="text-4xl font-bold">404 - Page Not Found</h1>
      <p className="mt-4 text-muted-foreground">The resource you are looking for does not exist.</p>
      <Link href="/" className="mt-8 text-primary hover:underline">Return Home</Link>
    </div>
  );
}
