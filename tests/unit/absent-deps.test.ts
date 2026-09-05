import { describe, expect, it } from 'vitest'

/**
 * `image-size` is deliberately ABSENT from the install tree (package.json
 * `overrides` → stubs/image-size). pptxgenjs declares it and never loads it;
 * the real package carries unpatched denial-of-service advisories in parsers
 * this product never runs. "Unreachable because commented out" is a claim
 * that decays with the next upstream release; "absent" is a fact the tree
 * can be asked about — so it is asked here, and a deck is rendered beside it
 * to show the absence costs nothing the product uses.
 */
describe('dependencies that must not be present', () => {
  it('image-size cannot be resolved', () => {
    expect(() => require.resolve('image-size')).toThrow()
  })

  it('pptxgenjs still renders a deck without it', async () => {
    const PptxGenJS = (await import('pptxgenjs')).default
    const pptx = new PptxGenJS()
    pptx.addSlide().addText('HeiTuva', { x: 1, y: 1 })
    const out = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer
    expect(out.subarray(0, 2).toString()).toBe('PK')
  })
})
