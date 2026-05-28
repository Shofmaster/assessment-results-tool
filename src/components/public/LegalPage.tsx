import { Link } from 'react-router-dom';
import SeoMeta from '../seo/SeoMeta';
import { absoluteUrl } from '../../seo/seoContent';
import { LEGAL_DOCS, type LegalDoc } from '../../legal/legalContent';
import { PRODUCT_INTENT_COMPANY_NAME } from '../../config/productIntent';

type LegalPageProps = {
  doc: LegalDoc;
};

export default function LegalPage({ doc }: LegalPageProps) {
  const other = LEGAL_DOCS.find((d) => d.path !== doc.path);

  return (
    <div className="min-h-dvh bg-gradient-to-br from-navy-900 via-navy-800 to-navy-700 text-white">
      <SeoMeta
        title={doc.title}
        description={doc.description}
        canonicalUrl={absoluteUrl(doc.path)}
        ogType="article"
      />
      <main className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        <header className="mb-8">
          <Link to="/" className="text-sm text-sky-light hover:text-white transition-colors">
            &larr; Back to {PRODUCT_INTENT_COMPANY_NAME}
          </Link>
          <h1 className="mt-5 text-3xl font-bold leading-tight sm:text-4xl">{doc.documentTitle}</h1>
          <p className="mt-2 text-sm text-white/55">Last updated: {doc.lastUpdated}</p>
          <div className="mt-5 space-y-3">
            {doc.intro.map((paragraph, i) => (
              <p key={i} className="text-base leading-relaxed text-white/80">
                {paragraph}
              </p>
            ))}
          </div>
        </header>

        <div className="space-y-8">
          {doc.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-lg font-semibold text-white">{section.heading}</h2>
              {section.paragraphs?.map((paragraph, i) => (
                <p key={i} className="mt-3 leading-relaxed text-white/75">
                  {paragraph}
                </p>
              ))}
              {section.bullets?.length ? (
                <ul className="mt-3 list-disc space-y-2 pl-6 text-white/75">
                  {section.bullets.map((bullet, i) => (
                    <li key={i} className="leading-relaxed">
                      {bullet}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>

        {other ? (
          <footer className="mt-12 border-t border-white/10 pt-6 text-sm text-white/60">
            See also:{' '}
            <Link to={other.path} className="text-sky-light hover:text-white transition-colors">
              {other.documentTitle}
            </Link>
          </footer>
        ) : null}
      </main>
    </div>
  );
}
