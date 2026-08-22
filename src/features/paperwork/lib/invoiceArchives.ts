import JSZip from 'jszip'
import { bytesToBase64 } from './crypto'
import { buildBogotaTimestamp, getBogotaTimezoneLabel } from './time'

export type PreparedInvoiceDocument = {
  archive_name: string
  archive_stem: string
  xml_file_name: string
  pdf_file_name: string
  xml_content_base64: string
  pdf_content_base64: string
}

export type InvoiceArchivesUploadResult = {
  capturedAt: string
  timezone: string
  archiveCount: number
  xmlCount: number
  pdfCount: number
  previewRows: Array<Record<string, string>>
}

export type PreparedInvoiceArchives = {
  uploadResult: InvoiceArchivesUploadResult
  documents: PreparedInvoiceDocument[]
}

export async function prepareInvoiceArchives(files: File[]): Promise<PreparedInvoiceArchives> {
  if (files.length === 0) {
    throw new Error('Debes cargar al menos un archivo ZIP de factura.')
  }

  const capturedAt = buildBogotaTimestamp()
  const documents = await Promise.all(
    files.map((file) => prepareSingleArchive(file, capturedAt.datePath)),
  )

  return {
    uploadResult: {
      capturedAt: capturedAt.iso,
      timezone: getBogotaTimezoneLabel(),
      archiveCount: documents.length,
      xmlCount: documents.length,
      pdfCount: documents.length,
      previewRows: documents.map((document) => ({
        'ZIP archive': document.archive_name,
        'XML detected': document.xml_file_name,
        'PDF detected': document.pdf_file_name,
        'XML S3 path': `invoices/${capturedAt.datePath}/${document.archive_stem}/${document.xml_file_name}`,
        'PDF S3 path': `invoices/${capturedAt.datePath}/${document.archive_stem}/${document.pdf_file_name}`,
      })),
    },
    documents,
  }
}

async function prepareSingleArchive(file: File, datePath: string): Promise<PreparedInvoiceDocument> {
  let zip: JSZip

  try {
    zip = await JSZip.loadAsync(file)
  } catch (error) {
    throw new Error(`El archivo \`${file.name}\` no es un ZIP válido.`)
  }

  const members = Object.values(zip.files).filter((entry) => !entry.dir)
  if (members.length === 0) {
    throw new Error(`El archivo \`${file.name}\` no contiene documentos internos.`)
  }

  const xmlMembers = members.filter((entry) => entry.name.toLowerCase().endsWith('.xml'))
  const pdfMembers = members.filter((entry) => entry.name.toLowerCase().endsWith('.pdf'))

  if (xmlMembers.length !== 1) {
    throw new Error(
      `El archivo \`${file.name}\` debe contener exactamente un XML y se encontraron ${xmlMembers.length}.`,
    )
  }

  if (pdfMembers.length !== 1) {
    throw new Error(
      `El archivo \`${file.name}\` debe contener exactamente un PDF y se encontraron ${pdfMembers.length}.`,
    )
  }

  const xmlMember = xmlMembers[0]
  const pdfMember = pdfMembers[0]
  const xmlBytes = await xmlMember.async('uint8array')
  const pdfBytes = await pdfMember.async('uint8array')

  if (xmlBytes.length === 0) {
    throw new Error(`El archivo \`${file.name}\` contiene un XML vacío.`)
  }

  if (pdfBytes.length === 0) {
    throw new Error(`El archivo \`${file.name}\` contiene un PDF vacío.`)
  }

  void datePath

  return {
    archive_name: file.name,
    archive_stem: file.name.replace(/\.zip$/i, ''),
    xml_file_name: basename(xmlMember.name),
    pdf_file_name: basename(pdfMember.name),
    xml_content_base64: bytesToBase64(xmlBytes),
    pdf_content_base64: bytesToBase64(pdfBytes),
  }
}

function basename(path: string) {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] ?? path
}
