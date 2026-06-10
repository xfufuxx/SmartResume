export function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function getFileIcon(fileType: string): string {
  const map: Record<string, string> = {
    pdf: 'file-pdf',
    docx: 'file-word',
    png: 'file-image',
    jpg: 'file-image',
    jpeg: 'file-image',
    webp: 'file-image',
  }
  return map[fileType] || 'file'
}
