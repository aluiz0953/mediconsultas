// Shrinks a picked image before upload: a phone photo can be several MB, but a
// clinic logo is shown at a few hundred pixels. Keeps PNG (transparency) as PNG
// and everything else as JPEG; if re-encoding does not make the file smaller,
// the original is used as is.
export async function compressImage(file: File, maxSize = 512): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return file
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85))
  return blob && blob.size < file.size ? blob : file
}
