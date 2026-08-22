export async function sha256Hex(input: Uint8Array | string) {
  const bytes =
    typeof input === 'string' ? new TextEncoder().encode(input) : input

  const digestBuffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(digestBuffer).set(bytes)

  const digest = await crypto.subtle.digest(
    'SHA-256',
    digestBuffer,
  )
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = ''

  for (let index = 0; index < bytes.length; index += 0x8000) {
    const chunk = bytes.subarray(index, index + 0x8000)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary)
}
