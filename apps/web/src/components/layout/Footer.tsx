import { site } from "@/lib/site";

const link =
  "rounded text-gray-300 underline-offset-4 hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-mia-accent";

export function Footer() {
  const links = [
    { href: site.repoUrl, label: "Source on GitHub" },
    { href: site.linkedinUrl, label: "LinkedIn" },
    { href: site.resumeUrl, label: "Résumé" },
  ].filter((l) => l.href);

  return (
    <footer className="border-t border-gray-800 bg-mia-panel px-4 py-5 text-sm sm:px-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-gray-400">
          Built by{" "}
          <a href={site.githubUrl} className={`${link} underline`}>
            {site.author}
          </a>
          : the rooftop receiver, the ingestor, and this site.
        </p>
        <nav aria-label="Project links" className="flex flex-wrap gap-x-4 gap-y-1">
          {links.map((l) => (
            <a key={l.label} href={l.href} className={link} rel="noopener noreferrer">
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
