import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { prepareInvoiceArchives } from './invoiceArchives'

const INVOICE_FILE_PATH = resolve(
  process.cwd(),
  '..',
  'trii',
  'invoices',
  'ad08600715620062600016C69.zip',
)

describe('prepareInvoiceArchives', () => {
  it('extracts xml and pdf from invoice zip archives', async () => {
    const bytes = await readFile(INVOICE_FILE_PATH)
    const file = new File([bytes], 'ad08600715620062600016C69.zip', {
      type: 'application/zip',
    })

    const prepared = await prepareInvoiceArchives([file])

    expect(prepared.uploadResult.archiveCount).toBe(1)
    expect(prepared.uploadResult.xmlCount).toBe(1)
    expect(prepared.uploadResult.pdfCount).toBe(1)
    expect(prepared.documents[0]?.xml_file_name.toLowerCase()).toMatch(/\.xml$/)
    expect(prepared.documents[0]?.pdf_file_name.toLowerCase()).toMatch(/\.pdf$/)
    expect(prepared.documents[0]?.xml_content_base64.length).toBeGreaterThan(0)
    expect(prepared.documents[0]?.pdf_content_base64.length).toBeGreaterThan(0)
  })

  it('rejects invalid zip payloads', async () => {
    const file = new File(['broken'], 'broken.zip', {
      type: 'application/zip',
    })

    await expect(prepareInvoiceArchives([file])).rejects.toThrow(/ZIP válido/i)
  })
})
