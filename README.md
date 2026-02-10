# Aviation Assessment Analyzer

A Windows desktop application for comprehensive aviation quality assessment analysis powered by Claude AI.

## Features

- Assessment Import: Import JSON assessment data
- Document Library: Organize regulatory standards and entity documents
- AI-Powered Analysis: Claude AI compliance analysis
- Professional Reports: Generate PDF audit reports
- Modern Interface: Sleek UI with file management
- Secure & Local: All data stored locally

## Quick Start

1. Install dependencies: `npm install`
2. Run development: `npm run dev`
3. Build for production: `npm run build`

## Setup

1. Set `ANTHROPIC_API_KEY` in your server environment (Claude calls are server-side)
2. Import regulatory files (CFRs, IS-BAO, EASA)
3. Import entity documents (manuals, procedures)
4. Import assessment JSON files
5. Run analysis and export PDF reports

## Technology Stack

- Frontend: React + TypeScript + Tailwind CSS
- Desktop: Electron
- AI: Claude Sonnet 4.5
- PDF: pdf-lib

## File Storage

Files are stored in AppData/Roaming/aviation-assessment-analyzer/

## License

MIT License
