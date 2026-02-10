# Aviation Assessment Analyzer - Roadmap & Changelog

## Roadmap

### High Priority
- [x] Extended thinking mode for deeper agent analysis (budget_tokens)
- [x] Self-review iteration for agent responses (per-turn and post-simulation modes)
- [x] Agent knowledge base currency checking via web search
- [x] Streaming API responses for real-time output during simulation

### Medium Priority
- [x] Export simulation results to DOCX format
- [x] Agent response comparison view (side-by-side)
- [ ] Custom agent creation (user-defined roles and system prompts)
- [ ] Batch analysis mode for multiple assessments

### Low Priority
- [ ] Dark/light theme toggle
- [ ] Keyboard shortcuts for common actions
- [ ] Simulation templates (pre-configured agent sets and rounds)
- [ ] Analytics dashboard for historical simulation data

---

## Changelog

### v1.5.0 (Upcoming)
- Export simulation results to DOCX format — professional report with cover page, transcript by round, review section, page numbers

### v1.4.0
- Agent response comparison view — tabbed per-round, side-by-side agent columns
- Save/load simulation results within projects (persisted to localStorage & Drive)

### v1.3.0
- Extended thinking mode with configurable budget (Light / Standard / Deep)
- Self-review iteration with per-turn and post-simulation modes
- Agent KB currency checking via web search
- Added roadmap and changelog tracking

### v1.2.0
- Revision tracking with web search verification
- Per-user persistence with Google Sign-In identity and AuthGate
- User-scoped localStorage with auto-migration from unscoped keys
- Auto-sync to Google Drive via SyncManager (30s debounce)
- SDK upgraded to ^0.52.0 for web search support

### v1.1.0
- Project organization with sidebar switcher and ProjectManager view
- Google Drive persistence — save/load `.aqp.json` project files
- Import/export project files
- Global and project-scoped agent knowledge bases

### v1.0.0
- Multi-agent audit simulation (7 agents: FAA Inspector, Shop Owner, IS-BAO Auditor, EASA Inspector, AS9100 Auditor, SMS Consultant, Third-Party Safety Auditor)
- Single-pass analysis with Claude (findings, recommendations, compliance scoring)
- Google Drive integration with OAuth and Google Picker
- Document upload and text extraction (PDF/DOCX/TXT/images via Claude vision OCR)
- Library management (Regulatory / Entity / Uploaded Documents tabs)
- Navy/sky glass morphism design theme
