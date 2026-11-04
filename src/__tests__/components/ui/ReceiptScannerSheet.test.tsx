import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReceiptScannerSheet } from '@/components/ui/ReceiptScannerSheet'
import { prepareReceiptPhoto, scanReceiptPhotos } from '@/lib/receipt-ocr'
vi.mock('@/lib/receipt-ocr', () => ({ prepareReceiptPhoto: vi.fn(), scanReceiptPhotos: vi.fn() }))
beforeEach(() => { vi.clearAllMocks() })
describe('scanner errors and cancellation', () => {
  it('shows unsupported image errors and permits manual entry', async () => {
    vi.mocked(prepareReceiptPhoto).mockRejectedValue(new Error('Use JPEG/PNG'))
    const ready = vi.fn()
    render(<ReceiptScannerSheet onClose={vi.fn()} onResultReady={ready} />)
    fireEvent.change(screen.getByLabelText('Receipt upload'), { target: { files: [new File(['x'], 'image.heic')] } })
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Use JPEG/PNG'))
    fireEvent.click(screen.getByRole('button', { name: 'Enter receipt manually' }))
    expect(ready.mock.calls[0][0].items).toEqual([])
  })
  it('shows OCR failures without inventing products', async () => {
    vi.mocked(prepareReceiptPhoto).mockResolvedValue('data:image/png;base64,eA==')
    vi.mocked(scanReceiptPhotos).mockRejectedValue(new Error('No text found'))
    const ready = vi.fn()
    render(<ReceiptScannerSheet onClose={vi.fn()} onResultReady={ready} />)
    fireEvent.change(screen.getByLabelText('Receipt camera'), { target: { files: [new File(['x'], 'image.png')] } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Read receipt' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Read receipt' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No text found'))
    expect(ready).not.toHaveBeenCalled()
  })
  it('aborts the active worker when the sheet unmounts', async () => {
    vi.mocked(prepareReceiptPhoto).mockResolvedValue('data:image/png;base64,eA==')
    vi.mocked(scanReceiptPhotos).mockImplementation(() => new Promise(() => {}))
    const { unmount } = render(<ReceiptScannerSheet onClose={vi.fn()} onResultReady={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Receipt upload'), { target: { files: [new File(['x'], 'image.png')] } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Read receipt' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Read receipt' }))
    const signal = vi.mocked(scanReceiptPhotos).mock.calls[0][1]
    unmount()
    expect(signal.aborted).toBe(true)
  })
})
