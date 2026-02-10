# Ralph Loop Iteration 3 - Implementation Plan

**Start Date:** 2026-02-05
**Status:** Planning Phase
**Objective:** Enhance document analysis capabilities with Word support, OCR, caching, PDF export improvements, progress tracking, and document preview

---

## 🎯 Iteration Goals

This iteration will significantly enhance the document analysis system by adding:

1. ✅ **Word Document Support** - Support .doc and .docx files using mammoth library
2. ✅ **OCR Support** - Extract text from scanned PDFs using Tesseract.js
3. ✅ **Document Analysis Caching** - Reduce API costs by caching analysis results
4. ✅ **Enhanced PDF Report Export** - Include document findings in generated reports
5. ✅ **Progress Indicators** - Show real-time progress for multi-document analysis
6. ✅ **Document Text Preview** - Allow users to preview extracted text before analysis

---

## 📋 Feature Breakdown

### Feature 1: Word Document Support (.doc, .docx)

**Why:** Many aviation quality documents are in Word format (procedures, manuals, work instructions)

**Implementation Steps:**
1. Install `mammoth` library for .docx support
2. Update Electron `main.ts` to handle Word document extraction
3. Add Word file types to file picker filters
4. Update `extractDocumentText` handler to support Word formats
5. Add error handling for corrupted Word files

**Files to Modify:**
- `package.json` - Add mammoth dependency
- `electron/main.ts` - Add Word extraction handler
- `electron/preload.ts` - Update file picker filters
- `src/components/AnalysisView.tsx` - Update UI to show Word support

**Technical Approach:**
```typescript
// In electron/main.ts
import mammoth from 'mammoth';

// Handler for Word documents
if (filePath.endsWith('.docx') || filePath.endsWith('.doc')) {
  const result = await mammoth.extractRawText({ path: filePath });
  return { success: true, text: result.value };
}
```

**Testing Criteria:**
- ✅ .docx files extract text correctly
- ✅ .doc files extract text correctly
- ✅ Formatting is preserved where reasonable
- ✅ Large Word files (>10MB) are handled
- ✅ Error messages for corrupted files are clear

---

### Feature 2: OCR Support for Scanned PDFs

**Why:** Many aviation documents are scanned paper documents without searchable text

**Implementation Steps:**
1. Install `tesseract.js` for browser-based OCR
2. Create OCR service module in `src/services/ocrService.ts`
3. Add OCR fallback when PDF text extraction returns empty/minimal text
4. Add OCR progress indicator in UI
5. Add option to force OCR even if text exists (for better accuracy)

**Files to Create:**
- `src/services/ocrService.ts` - OCR processing service

**Files to Modify:**
- `package.json` - Add tesseract.js dependency
- `electron/main.ts` - Add OCR handler or pass PDF buffer to renderer
- `src/components/AnalysisView.tsx` - Add OCR progress UI
- `src/store/appStore.ts` - Add OCR state management

**Technical Approach:**
```typescript
// In src/services/ocrService.ts
import { createWorker } from 'tesseract.js';

export class OCRService {
  async extractTextFromImage(imageBuffer: Buffer): Promise<string> {
    const worker = await createWorker('eng');
    const { data: { text } } = await worker.recognize(imageBuffer);
    await worker.terminate();
    return text;
  }

  async processScannedPDF(pdfBuffer: Buffer): Promise<string> {
    // Convert PDF pages to images
    // Run OCR on each page
    // Combine results
  }
}
```

**Testing Criteria:**
- ✅ Scanned PDFs extract text via OCR
- ✅ OCR progress shows percentage complete
- ✅ OCR can be cancelled mid-process
- ✅ Multi-page scanned documents work correctly
- ✅ OCR language can be configured (default: English)

---

### Feature 3: Document Analysis Caching

**Why:** Reduce Claude API costs by caching analysis results for identical documents

**Implementation Steps:**
1. Create cache service with file hash-based storage
2. Hash document contents using SHA-256
3. Store analysis results in local JSON cache
4. Check cache before calling Claude API
5. Add cache management UI (view, clear cache)
6. Add cache expiration (30 days default)

**Files to Create:**
- `src/services/cacheService.ts` - Analysis cache management
- `src/components/CacheManager.tsx` - UI for cache management

**Files to Modify:**
- `src/services/claudeApi.ts` - Add cache checking before API calls
- `src/components/Settings.tsx` - Add cache settings section
- `src/store/appStore.ts` - Add cache statistics
- `electron/main.ts` - Add cache file storage handlers

**Technical Approach:**
```typescript
// In src/services/cacheService.ts
import { createHash } from 'crypto';

export class AnalysisCacheService {
  private cacheDir = 'analysis-cache';

  generateDocumentHash(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }

  async getCachedAnalysis(docHash: string): Promise<DocumentAnalysis | null> {
    // Check if hash exists in cache
    // Return cached result if found and not expired
  }

  async setCachedAnalysis(docHash: string, analysis: DocumentAnalysis): Promise<void> {
    // Save analysis with timestamp
  }

  async clearExpiredCache(daysOld: number = 30): Promise<number> {
    // Remove cache entries older than specified days
  }
}
```

**Cache Storage Format:**
```json
{
  "documentHash": "abc123...",
  "documentName": "procedure-manual.pdf",
  "cachedAt": "2026-02-05T10:30:00Z",
  "expiresAt": "2026-03-07T10:30:00Z",
  "analysis": {
    "keyFindings": [...],
    "complianceIssues": [...],
    "recommendations": [...]
  }
}
```

**Testing Criteria:**
- ✅ Same document analyzed twice uses cache (no API call)
- ✅ Modified document bypasses cache (new API call)
- ✅ Cache expiration works correctly
- ✅ Cache clear functionality works
- ✅ Cache statistics show hits/misses
- ✅ Cache size is displayed (MB used)

---

### Feature 4: Enhanced PDF Report Export

**Why:** PDF reports should include insights from uploaded document analyses

**Implementation Steps:**
1. Update `PDFReportGenerator` to accept document analyses
2. Add "Document Analysis Summary" section to PDF report
3. Include compliance issues from each document
4. Add document-specific recommendations
5. Create visual separation between assessment and document findings

**Files to Modify:**
- `src/services/pdfGenerator.ts` - Enhanced report generation
- `src/components/AnalysisView.tsx` - Pass document analyses to PDF generator

**Report Structure Enhancement:**
```
EXISTING:
- Cover Page
- Executive Summary
- Compliance by Category
- Critical Findings
- Major Findings
- Recommendations

NEW ADDITIONS:
- Document Analysis Summary (NEW)
  - List of analyzed documents
  - Document-specific compliance issues
  - Cross-cutting insights
- Enhanced Recommendations (UPDATED)
  - Document-derived recommendations included
  - Source attribution (from assessment vs documents)
```

**Technical Approach:**
```typescript
// Update PDFReportGenerator.generateReport signature
async generateReport(
  assessment: AssessmentData,
  findings: Finding[],
  recommendations: Recommendation[],
  compliance: ComplianceStatus,
  documentAnalyses?: DocumentAnalysis[],  // NEW
  combinedInsights?: string[]             // NEW
): Promise<Uint8Array>
```

**Testing Criteria:**
- ✅ Reports without documents generate correctly (backward compatible)
- ✅ Reports with documents include new sections
- ✅ Document names are clearly labeled
- ✅ Compliance issues per document are visible
- ✅ Combined insights are highlighted
- ✅ Page breaks work correctly with longer reports

---

### Feature 5: Multi-Document Analysis Progress Indicators

**Why:** Users need feedback when analyzing multiple large documents

**Implementation Steps:**
1. Create progress tracking state in store
2. Emit progress events from Claude API service
3. Build progress UI component with:
   - Overall progress bar
   - Per-document status
   - Current document being analyzed
   - Estimated time remaining
4. Add ability to cancel in-progress analysis

**Files to Create:**
- `src/components/AnalysisProgress.tsx` - Progress UI component

**Files to Modify:**
- `src/services/claudeApi.ts` - Add progress callbacks
- `src/store/appStore.ts` - Add progress state
- `src/components/AnalysisView.tsx` - Integrate progress UI

**Technical Approach:**
```typescript
// In src/store/appStore.ts
interface AnalysisProgress {
  totalDocuments: number;
  processedDocuments: number;
  currentDocument: string;
  status: 'idle' | 'extracting' | 'analyzing' | 'caching' | 'complete' | 'error';
  startTime: number;
  estimatedTimeRemaining?: number;
}

// In claudeApi.ts
async analyzeWithDocuments(
  assessment: AssessmentData,
  regulatoryDocs: string[],
  entityDocs: string[],
  uploadedDocuments: Array<{ name: string; text: string }>,
  onProgress?: (progress: AnalysisProgress) => void  // NEW
): Promise<EnhancedComparisonResult>
```

**Progress UI Features:**
- Animated progress bar
- Real-time status updates
- Individual document status icons (⏳ pending, ⚙️ processing, ✅ done, ❌ error)
- Cancel button
- Collapsible detail view

**Testing Criteria:**
- ✅ Progress bar updates smoothly
- ✅ Status messages are accurate
- ✅ Individual document status updates correctly
- ✅ Cancel button stops analysis
- ✅ Error state shows which document failed
- ✅ Time estimation is reasonably accurate

---

### Feature 6: Document Text Preview/Viewer

**Why:** Users want to verify extracted text before running expensive API analysis

**Implementation Steps:**
1. Create document preview modal component
2. Add preview button next to each uploaded document
3. Show first 5000 characters of extracted text
4. Add syntax highlighting for structured text (JSON, XML)
5. Add character/word count display
6. Add "Copy to Clipboard" button

**Files to Create:**
- `src/components/DocumentPreview.tsx` - Preview modal component

**Files to Modify:**
- `src/components/AnalysisView.tsx` - Add preview button
- `src/store/appStore.ts` - Store preview state

**UI Design:**
```
┌─────────────────────────────────────────┐
│  Document Preview: procedure-manual.pdf │
├─────────────────────────────────────────┤
│  Characters: 12,345 | Words: 2,100      │
│  [Copy Text] [Download Text]            │
├─────────────────────────────────────────┤
│                                         │
│  [Extracted text content displayed      │
│   here in monospace font with           │
│   scrollable view...]                   │
│                                         │
│                                         │
├─────────────────────────────────────────┤
│         [Close Preview]                 │
└─────────────────────────────────────────┘
```

**Testing Criteria:**
- ✅ Preview modal opens and displays text
- ✅ Long text is scrollable
- ✅ Character/word count is accurate
- ✅ Copy to clipboard works
- ✅ Preview loads quickly (<500ms)
- ✅ Preview can be closed with Esc key

---

## 🛠️ Implementation Order

**Phase 1: Core Enhancements (Priority)**
1. Word Document Support (1-2 hours)
2. Document Analysis Caching (2-3 hours)
3. Enhanced PDF Report Export (2-3 hours)

**Phase 2: UX Improvements**
4. Multi-Document Progress Indicators (2-3 hours)
5. Document Text Preview (1-2 hours)

**Phase 3: Advanced Features**
6. OCR Support for Scanned PDFs (3-4 hours)

**Total Estimated Time:** 11-17 hours

---

## 📦 New Dependencies

```json
{
  "dependencies": {
    "mammoth": "^1.6.0",           // Word document extraction
    "tesseract.js": "^5.0.4"        // OCR for scanned documents
  }
}
```

---

## 🧪 Testing Strategy

### Unit Tests
- Cache service hash generation
- Document text extraction (PDF, Word)
- OCR text extraction accuracy
- Progress calculation logic

### Integration Tests
- End-to-end document upload → analysis → caching flow
- PDF report generation with document analyses
- Multi-document analysis with progress tracking
- Cache hit/miss scenarios

### Manual Testing Checklist
- [ ] Upload and analyze .docx file
- [ ] Upload and analyze .doc file
- [ ] Upload scanned PDF and verify OCR
- [ ] Analyze same document twice (verify cache hit)
- [ ] Analyze 5+ documents and watch progress
- [ ] Preview document text before analysis
- [ ] Export PDF report with document findings
- [ ] Clear analysis cache
- [ ] Handle corrupted/invalid files gracefully
- [ ] Cancel multi-document analysis mid-process

---

## 🔄 Backward Compatibility

All features must maintain backward compatibility:
- ✅ Analysis without uploaded documents still works
- ✅ PDF reports without documents generate normally
- ✅ Cache is optional (can be disabled in settings)
- ✅ OCR is automatic fallback (not required)

---

## 📊 Success Metrics

- **Performance:** Document analysis 50% faster with caching
- **Cost:** API costs reduced by 30-40% through caching
- **UX:** Users can preview 100% of documents before analysis
- **Capability:** Support 90%+ of aviation document formats (PDF, Word, scanned)
- **Transparency:** Users always know progress during multi-document analysis

---

## 🚀 Post-Iteration 3 Enhancements (Future)

- Batch document upload (drag & drop multiple files)
- Document comparison (diff view between revisions)
- Export analysis cache as JSON backup
- Support for Excel/CSV document import
- Integration with SharePoint/cloud storage
- Automatic document categorization
- Document version tracking

---

## 📝 Notes

- Keep Electron architecture for now (web migration in future iteration)
- All document processing happens in main process for security
- Cache storage uses local file system (not cloud)
- OCR is CPU-intensive - show clear progress indicator
- Word document support limited to .docx initially (.doc may have issues)

---

**Next Action:** Begin Phase 1 implementation with Word Document Support
