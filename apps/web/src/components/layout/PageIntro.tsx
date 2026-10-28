/** Server-rendered page heading, so each page has real content before JavaScript loads. */
export function PageIntro({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 pt-5 sm:px-6">
      <h1 className="text-xl font-semibold text-gray-100">{title}</h1>
      <p className="mt-1 max-w-3xl text-sm text-gray-400">{children}</p>
    </div>
  );
}
