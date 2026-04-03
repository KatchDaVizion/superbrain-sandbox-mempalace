# Third-Party Notices

## Project N.O.M.A.D.

Several RAG intelligence patterns in SuperBrain v12.0.0 were adapted from
[Project N.O.M.A.D.](https://github.com/CrosstalkSolutions/project-nomad) by
Crosstalk Solutions LLC.

**License:** Apache License 2.0

**Patterns ported:**

- Hybrid search with multi-factor reranking (keyword overlap, term matching, source diversity penalty)
- Adaptive context budgeting by model size (small models get fewer results)
- Query rewriting before RAG search (conversation-aware standalone query generation)
- OCR fallback pipeline for scanned PDFs (pdf2pic + sharp preprocessing + Tesseract.js)
- Token-aware chunking parameters (1700 tokens/chunk target with overlap)
- Text sanitization before embedding (null bytes, control chars, Unicode replacement chars)
- Auto-title generation for chat sessions using small model inference
- Thinking model detection and `<think>` tag parsing for reasoning models

**Original Copyright:**

```
Copyright 2024-2026 Crosstalk Solutions LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
