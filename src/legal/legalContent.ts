import {
  PRODUCT_INTENT_COMPANY_NAME,
  PRODUCT_INTENT_COMPANY_SITE_URL,
} from '../config/productIntent';

export type LegalSection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type LegalDoc = {
  path: string;
  /** Page <title> + og:title. */
  title: string;
  /** Meta description. */
  description: string;
  /** On-page H1. */
  documentTitle: string;
  /** Human-readable last revised date. */
  lastUpdated: string;
  intro: string[];
  sections: LegalSection[];
};

const LEGAL_ENTITY = 'Aviation Quality Company';
const PRODUCT = 'AeroGap';
const SUPPORT_EMAIL = 'support@aerogap.com';
const SITE = PRODUCT_INTENT_COMPANY_SITE_URL;
const LAST_UPDATED = 'May 28, 2026';

const PRIVACY: LegalDoc = {
  path: '/privacy',
  title: `Privacy Policy | ${PRODUCT}`,
  description: `How ${PRODUCT_INTENT_COMPANY_NAME} collects, uses, and protects information when you use the ${PRODUCT} aviation compliance platform.`,
  documentTitle: 'Privacy Policy',
  lastUpdated: LAST_UPDATED,
  intro: [
    `This Privacy Policy explains how ${LEGAL_ENTITY} ("${PRODUCT}", "we", "us", or "our") collects, uses, discloses, and safeguards information when you use the ${PRODUCT} aviation quality and compliance platform and related websites (the "Service").`,
    `By using the Service, you agree to the collection and use of information in accordance with this policy. If you do not agree, please do not use the Service.`,
  ],
  sections: [
    {
      heading: '1. Information we collect',
      paragraphs: ['We collect the following categories of information:'],
      bullets: [
        'Account information you provide through our authentication provider (Clerk), such as your name, email address, and profile image.',
        'Organization and project data you create in the Service, including company profiles, certificates, roster details, and assessment configurations.',
        'Documents and content you upload or import (for example, manuals, records, logbooks, and regulatory references), along with text extracted from them for analysis and search.',
        'Integration credentials and tokens you choose to connect, such as Google Drive authorization and Avianis connection settings.',
        'Billing information processed by our payment provider (Stripe). We do not store full payment card numbers on our systems.',
        'Usage and product event data, such as features used and actions taken, used to operate and improve the Service.',
        'Technical data such as log information and device/browser metadata generated when you access the Service.',
      ],
    },
    {
      heading: '2. How we use information',
      paragraphs: ['We use the information we collect to:'],
      bullets: [
        'Provide, maintain, secure, and improve the Service.',
        'Authenticate users, manage accounts, and enforce access controls and entitlements.',
        'Process subscriptions, trials, invoices, and related billing operations.',
        'Generate assistive analysis, audit simulations, document review, and search results that you review and control.',
        'Communicate with you about your account, support requests, and material changes to the Service.',
        'Detect, prevent, and address security incidents, fraud, and abuse.',
        'Comply with legal obligations.',
      ],
    },
    {
      heading: '3. Service providers and sub-processors',
      paragraphs: [
        'We rely on trusted third parties to operate the Service. These providers process information on our behalf under their own terms and security commitments:',
      ],
      bullets: [
        'Clerk — authentication and user identity management.',
        'Convex — application database and backend infrastructure.',
        'Stripe — payment processing and subscription management.',
        'Anthropic — large language model processing for assistive analysis features. Content you submit for analysis may be transmitted to Anthropic to generate results.',
        'Google — when you connect Google Drive to import documents.',
        'Vercel — application hosting and serverless functions.',
      ],
    },
    {
      heading: '4. AI processing of your content',
      paragraphs: [
        `The Service uses assistive models to help analyze documents, simulate audits, and answer questions. When you run these features, relevant content (such as document text and your prompts) is sent to our model provider to generate a response.`,
        `Outputs are assistive only. You remain responsible for reviewing, accepting, editing, or rejecting every result. ${PRODUCT} does not make regulatory or airworthiness decisions on your behalf.`,
      ],
    },
    {
      heading: '5. Data retention',
      paragraphs: [
        'We retain your account and content for as long as your account is active or as needed to provide the Service. You may request deletion of your account and associated data, subject to legal and operational retention requirements (for example, billing records we are required to keep).',
      ],
    },
    {
      heading: '6. Data security',
      paragraphs: [
        'We use administrative, technical, and organizational measures designed to protect information. Access to your data is restricted based on role and organization membership. No method of transmission or storage is completely secure, and we cannot guarantee absolute security.',
      ],
    },
    {
      heading: '7. Your choices and rights',
      paragraphs: [
        'Depending on your location, you may have rights to access, correct, export, or delete your personal information, and to object to or restrict certain processing. To exercise these rights, contact us using the details below. You can also disconnect integrations (such as Google Drive) at any time from Settings.',
      ],
    },
    {
      heading: '8. International data transfers',
      paragraphs: [
        'The Service is operated from the United States. If you access it from outside the United States, your information may be transferred to, stored, and processed in the United States and other countries where our providers operate.',
      ],
    },
    {
      heading: "9. Children's privacy",
      paragraphs: [
        'The Service is intended for use by organizations and professionals and is not directed to children under 16. We do not knowingly collect personal information from children.',
      ],
    },
    {
      heading: '10. Changes to this policy',
      paragraphs: [
        'We may update this Privacy Policy from time to time. When we make material changes, we will update the "Last updated" date and, where appropriate, provide additional notice.',
      ],
    },
    {
      heading: '11. Contact us',
      paragraphs: [
        `If you have questions about this Privacy Policy or our data practices, contact ${LEGAL_ENTITY} at ${SUPPORT_EMAIL} or visit ${SITE}.`,
      ],
    },
  ],
};

const TERMS: LegalDoc = {
  path: '/terms',
  title: `Terms of Service | ${PRODUCT}`,
  description: `The terms governing your use of the ${PRODUCT} aviation compliance platform, including subscriptions, acceptable use, and the assistive-only nature of its outputs.`,
  documentTitle: 'Terms of Service',
  lastUpdated: LAST_UPDATED,
  intro: [
    `These Terms of Service ("Terms") govern your access to and use of the ${PRODUCT} aviation quality and compliance platform and related websites (the "Service") provided by ${LEGAL_ENTITY} ("${PRODUCT}", "we", "us", or "our").`,
    `By accessing or using the Service, you agree to be bound by these Terms. If you are using the Service on behalf of an organization, you represent that you have authority to bind that organization to these Terms.`,
  ],
  sections: [
    {
      heading: '1. The Service',
      paragraphs: [
        `${PRODUCT} provides software to help aviation organizations organize compliance documents, run assessments and audit simulations, review paperwork, track findings, and produce reports. The Service includes assistive analysis features powered by third-party models.`,
      ],
    },
    {
      heading: '2. Assistive use and no professional/regulatory advice',
      paragraphs: [
        `THE SERVICE IS AN ASSISTIVE TOOL, NOT A SUBSTITUTE FOR PROFESSIONAL JUDGMENT. Analysis, audit simulations, citations, currency checks, and other outputs are generated to assist your review and may contain errors, omissions, or outdated information.`,
        `${PRODUCT} does not provide legal, regulatory, engineering, or airworthiness advice and does not make compliance determinations on your behalf. You are solely responsible for independently verifying all outputs against authoritative sources and applicable regulations. The accountable signatory and final compliance decisions always remain with your personnel.`,
      ],
    },
    {
      heading: '3. Accounts and eligibility',
      paragraphs: [
        'You must provide accurate account information and keep it current. You are responsible for safeguarding your credentials and for all activity under your account. You must promptly notify us of any unauthorized use. Accounts may be subject to approval for certain tiers.',
      ],
    },
    {
      heading: '4. Subscriptions, trials, and billing',
      paragraphs: [
        'Paid plans are billed on a recurring basis through our payment processor, Stripe. By subscribing, you authorize recurring charges to your payment method until you cancel.',
      ],
      bullets: [
        'Free trials, where offered, automatically convert to a paid subscription at the end of the trial unless canceled before the trial ends.',
        'You may cancel at any time; cancellation takes effect at the end of the current billing period, and you retain access until then.',
        'Fees are charged in advance and, except where required by law, are non-refundable for partial periods.',
        'We may change pricing or plan features with reasonable notice; changes apply to subsequent billing periods.',
        'You are responsible for applicable taxes.',
      ],
    },
    {
      heading: '5. Acceptable use',
      paragraphs: ['You agree not to:'],
      bullets: [
        'Use the Service in violation of any applicable law or regulation.',
        'Upload content you do not have the right to use, or that infringes the rights of others.',
        'Attempt to gain unauthorized access to the Service, other accounts, or our systems.',
        'Interfere with or disrupt the integrity or performance of the Service.',
        'Reverse engineer, resell, or sublicense the Service except as expressly permitted.',
      ],
    },
    {
      heading: '6. Your content',
      paragraphs: [
        'You retain all rights to the documents and data you upload or create ("Your Content"). You grant us a limited license to host, process, and transmit Your Content as necessary to operate and provide the Service, including transmitting relevant content to our model and infrastructure providers to deliver assistive features. You are responsible for the accuracy, legality, and appropriateness of Your Content.',
      ],
    },
    {
      heading: '7. Intellectual property',
      paragraphs: [
        `The Service, including its software, design, and content (excluding Your Content), is owned by ${LEGAL_ENTITY} and its licensors and is protected by intellectual property laws. These Terms do not grant you any rights to our trademarks or branding.`,
      ],
    },
    {
      heading: '8. Third-party services',
      paragraphs: [
        'The Service integrates with third-party services such as Clerk, Convex, Stripe, Anthropic, Google, and Vercel. Your use of those services may be subject to their own terms and policies. We are not responsible for third-party services.',
      ],
    },
    {
      heading: '9. Disclaimer of warranties',
      paragraphs: [
        'THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR THAT OUTPUTS WILL BE ACCURATE OR COMPLETE.',
      ],
    },
    {
      heading: '10. Limitation of liability',
      paragraphs: [
        `TO THE MAXIMUM EXTENT PERMITTED BY LAW, ${PRODUCT} AND ITS PROVIDERS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, DATA, OR GOODWILL, ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICE. OUR TOTAL LIABILITY FOR ANY CLAIM WILL NOT EXCEED THE AMOUNTS YOU PAID FOR THE SERVICE IN THE TWELVE MONTHS PRECEDING THE CLAIM.`,
      ],
    },
    {
      heading: '11. Indemnification',
      paragraphs: [
        `You agree to indemnify and hold harmless ${LEGAL_ENTITY} from any claims, damages, or expenses arising out of Your Content, your use of the Service, or your violation of these Terms or applicable law.`,
      ],
    },
    {
      heading: '12. Termination',
      paragraphs: [
        'You may stop using the Service at any time. We may suspend or terminate your access if you violate these Terms or if necessary to protect the Service or other users. Upon termination, your right to use the Service ends, and we may delete Your Content subject to applicable retention requirements.',
      ],
    },
    {
      heading: '13. Governing law',
      paragraphs: [
        `These Terms are governed by the laws of the United States and the state in which ${LEGAL_ENTITY} is established, without regard to conflict-of-law principles.`,
      ],
    },
    {
      heading: '14. Changes to these Terms',
      paragraphs: [
        'We may update these Terms from time to time. When we make material changes, we will update the "Last updated" date and, where appropriate, provide additional notice. Your continued use of the Service after changes take effect constitutes acceptance.',
      ],
    },
    {
      heading: '15. Contact us',
      paragraphs: [
        `Questions about these Terms can be sent to ${LEGAL_ENTITY} at ${SUPPORT_EMAIL} or via ${SITE}.`,
      ],
    },
  ],
};

export const LEGAL_DOCS: LegalDoc[] = [PRIVACY, TERMS];

export const LEGAL_DOC_BY_PATH = new Map(LEGAL_DOCS.map((doc) => [doc.path, doc]));

export const LEGAL_PATHS = LEGAL_DOCS.map((doc) => doc.path);
