Baseline document downloads (public references)

FOLDER
  aviationassessment\downloads\baseline-doc-public\

TYPICAL SUCCESSFUL FILES (after running the script on a normal network)
  PDFs:
    BIPM_JCGM_100_2008_GUM.pdf — GUM / measurement uncertainty
    NIST_SP_800-171_rev2.pdf — NIST SP 800-171 Rev 2
  HTML snapshots (reference only; not substitutes for controlled manuals):
    ecfr-14CFR-21.50.html
    faa-aircraft-certification.html
    faa-part107-waivers.html
    faa-sms-resources.html
    ibac-is-bao.html
    nasa-msfc-std-3716.html

RE-RUN FROM REPO ROOT
  powershell -ExecutionPolicy Bypass -File .\scripts\download-baseline-public-docs.ps1

OFTEN FAIL UNTIL YOU ARE ON A NETWORK THAT CAN REACH THE SITE
  rgl.faa.gov — FAA Regulatory & Guidance Library (AC PDFs, MMEL DB); DNS blocked in some environments
  Some faa.gov / icao.int paths — 404 if FAA/ICAO moved pages; use site search
  phmsa.dot.gov — occasional 403 to training URLs
  pri-network.org, jarus-rpas.org — TLS chain / corporate proxy issues (fix trust store or use a browser)

NOT AVAILABLE AS A SINGLE FREE “COMPANY DOC” DOWNLOAD
  GMM, QCM, IPM, Training Program, RSM, Ops Specs, operator manuals, etc.
  Get current approved copies from your document control / certificate holder.

PAYWALLED / STOREFRONT
  SAE, RTCA, ISO store, ANSI — purchase or use organizational subscription.
