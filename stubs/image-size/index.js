// Not the real image-size. HeiTuva satisfies pptxgenjs's declared dependency
// with this stub so the vulnerable package is ABSENT from the install tree
// rather than merely unreachable. Nothing in this product sizes an image; if a
// future pptxgenjs ever loads this module, failing here is the right outcome —
// loud, at require time, before any image is parsed.
throw new Error(
  'image-size is intentionally absent from HeiTuva (see docs/OPERATIONS.md). ' +
    'A code path tried to load it; that path must not exist.',
)
