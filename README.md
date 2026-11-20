# Resume Tailor

Paste a job description, keep your real CV, and get a tailored CV as a clean LaTeX PDF
(the sb2nov / Audric Serador layout, MIT licence).

**No external APIs and no AI service.** Tailoring is rule-based and runs on your own server:

1. Extracts keywords from the job description.
2. Scores every bullet, project and skill of the student's own CV against them.
3. Puts the most relevant content first and leaves out the least relevant until the real
   compiled PDF fits the page limit (binary search verified with the actual LaTeX build).
4. Shows a job-match score and the job keywords the CV does not mention, so the student can
   add them if they are true. It never writes claims of its own, so it cannot invent anything.

Students can upload a PDF or Word CV (or paste text, e.g. from LinkedIn's "Save to PDF") and the form is filled in for them to check. This is rule-based text parsing (`pdftotext` and a small DOCX reader), with no external service.

Edits are done by changing the text directly in the form, then updating the preview.

## Run locally

Needs Node 22, `pdftotext` (poppler-utils) for PDF import, and a TeX Live install (`pdflatex`; plus `lato` and `fontawesome5` for the exact look).

```sh
npm test
npm start          # http://localhost:8080
```

Without Lato/FontAwesome the server falls back to the default font and no header icons
(check `/health` for `fullFonts`). Use Docker for the exact Overleaf look:

```sh
docker build -t resume-tailor .
docker run -p 8080:8080 resume-tailor
```

## Deploy

- **Backend** (needs TeX Live, so not GitHub Pages): any container host, for example Fly.io,
  Railway or Render, using the `Dockerfile`. Set `ALLOWED_ORIGIN` to your site's origin if the
  front end is hosted elsewhere.
- **Front end**: the `web/` folder is static. Host it on GitHub Pages and set `API_BASE` in
  `web/config.js` to the backend URL. Or let the backend serve it (it already does).

## Privacy and safety

- CVs are processed in memory to build the PDF and are not stored on the server.
- The student's saved CV and "My CVs" list live in their browser (`localStorage`).
- All text is escaped before it reaches LaTeX, LaTeX runs with `-no-shell-escape`, builds have
  a 30 second timeout, bodies are size-limited, requests are rate-limited and builds are
  concurrency-limited. The container runs as an unprivileged user.

## Not built yet

Login, Stripe subscription (£7/month), usage limits and the legal pages (privacy policy, terms,
ICO registration). Natural-language edit requests ("make the summary shorter") need a language
model; the server's `tailorCv` accepts an optional `rewriter` hook for a self-hosted model later.

## Credits

Resume layout: Audric Serador, inspired by https://github.com/sb2nov/resume (MIT).
