---
name: cab-extraction
description: "CAB file extraction for game assets using 7zip-min."
user-invokable: false
disable-model-invocation: false
---

# CAB Extraction

Auto-loaded when working on `cab-extractor.ts`, texture extraction service, or asset pipeline.

## Why 7zip-min

- `cabarc` (npm): Incompatible with Node.js v24+ (ERR_OUT_OF_RANGE)
- `cabextract` (CLI): Not available on Windows 11 without system install
- `7zip-min`: Bundled 7za binaries, cross-platform, no external deps

## API

```typescript
import { extractCabArchive, listCabContents } from './cab-extractor';

// Extract all files
const result = await extractCabArchive('path/to/file.cab', 'output/dir');
// result: { success: boolean, extractedFiles: string[], errors: string[] }

// List without extracting
const files = await listCabContents('path/to/file.cab');
// files: { name: string, size: number, offset: number }[] | null
```

## Integration Point

```
UpdateService (sync game assets)
  -> TextureExtractionService (extract CAB textures)
    -> extractCabArchive() (7zip-min)
      -> texture-alpha-baker.ts (BMP -> PNG alpha pre-baking)
        -> atlas-generator.ts (pack into object atlases)
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Cannot find module '7zip-min'` | `npm install` |
| Extraction fails | Check `result.errors` — likely corrupted CAB, bad format, or permissions |
| Path issues on Windows | Use forward slashes in code, 7zip-min handles conversion |

## Deep-Dive Reference

- [CAB Extraction Setup](../../../doc/CAB-EXTRACTION.md) — Migration history, full API reference, format support