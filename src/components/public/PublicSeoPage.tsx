import { Link } from 'react-router-dom';
import SeoMeta from '../seo/SeoMeta';
import { absoluteUrl, type SeoPage } from '../../seo/seoContent';

type PublicSeoPageProps = {
  page: SeoPage;
};

function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Aviation Quality Company',
    url: 'https://www.aerogaptechnologies.com',
    brand: 'AeroGap',
    sameAs: ['https://www.aerogaptechnologies.com'],
  };
}

function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'AeroGap',
    url: 'https://www.aerogaptechnologies.com',
    potentialAction: {
      '@type': 'SearchAction',
      target: 'https://www.aerogaptechnologies.com/?q={search_term_string}',
      'query-input': 'required name=search_term_string',
    },
  };
}

function breadcrumbSchema(page: SeoPage) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://www.aerogaptechnologies.com/',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: page.h1,
        item: absoluteUrl(page.path),
      },
    ],
  };
}

function pageSchema(page: SeoPage) {
  if (page.type === 'service') {
    return {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: page.h1,
      description: page.description,
      serviceType: page.primaryKeyword,
      provider: {
        '@type': 'Organization',
        name: 'Aviation Quality Company',
        url: 'https://www.aerogaptechnologies.com',
      },
      areaServed: 'United States',
      url: absoluteUrl(page.path),
    };
  }

  if (page.type === 'product') {
    return {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: page.h1,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description: page.description,
      url: absoluteUrl(page.path),
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
      provider: {
        '@type': 'Organization',
        name: 'Aviation Quality Company',
        url: 'https://www.aerogaptechnologies.com',
      },
    };
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: page.h1,
    description: page.description,
    mainEntityOfPage: absoluteUrl(page.path),
    keywords: [page.primaryKeyword, ...page.secondaryKeywords].join(', '),
    author: {
      '@type': 'Organization',
      name: 'Aviation Quality Company',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Aviation Quality Company',
      url: 'https://www.aerogaptechnologies.com',
    },
  };
}

function faqSchema(page: SeoPage) {
  if (!page.faq?.length) return undefined;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: page.faq.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

export default function PublicSeoPage({ page }: PublicSeoPageProps) {
  const schemaGraph = {
    '@context': 'https://schema.org',
    '@graph': [organizationSchema(), websiteSchema(), breadcrumbSchema(page), pageSchema(page), faqSchema(page)].filter(Boolean),
  };

  return (
    <div className="min-h-dvh bg-gradient-to-br from-navy-900 via-navy-800 to-navy-700 text-white">
      <SeoMeta
        title={page.title}
        description={page.description}
        canonicalUrl={absoluteUrl(page.path)}
        ogType={page.type === 'article' ? 'article' : 'website'}
        jsonLd={schemaGraph}
      />
      <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
        <header className="mb-10">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-sky-light">US Aviation Compliance</p>
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{page.h1}</h1>
          <p className="mt-5 max-w-3xl text-base text-white/75 sm:text-lg">{page.intro}</p>
        </header>

        <section className="space-y-7">
          {page.sections.map((section) => (
            <article key={section.heading} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <h2 className="text-xl font-semibold text-white">{section.heading}</h2>
              <p className="mt-3 leading-relaxed text-white/75">{section.body}</p>
            </article>
          ))}
        </section>

        {page.faq?.length ? (
          <section className="mt-12 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <h2 className="text-xl font-semibold">Frequently asked questions</h2>
            <div className="mt-5 space-y-4">
              {page.faq.map((item) => (
                <article key={item.question}>
                  <h3 className="font-medium text-white">{item.question}</h3>
                  <p className="mt-2 text-white/75">{item.answer}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-12 rounded-2xl border border-sky/35 bg-sky/10 p-6">
          <h2 className="text-lg font-semibold text-white">Related resources</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {page.internalLinks.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm text-white/90 hover:bg-white/10"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
