import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ReceiptReviewSheet } from '@/components/ui/ReceiptReviewSheet'
import type { ReceiptResult } from '@/types'
const receipt: ReceiptResult = { store: 'Tesco', date: '2026-11-04', currency: 'EUR', items: [{ id: '1', name: 'Milk', quantity: 2, unitPrice: 2, lineTotal: 4 }], subtotal: 4, tax: 0, grandTotal: 3.5 }
describe('receipt review', () => {
  it('keeps the printed total after correcting an item and saves once', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    render(<ReceiptReviewSheet result={receipt} photos={[]} onClose={vi.fn()} onSave={save} />)
    fireEvent.change(screen.getByLabelText('Unit price (€)'), { target: { value: '3' } })
    expect(screen.getByLabelText('Total paid (€)')).toHaveValue(3.5)
    expect(screen.getByText(/Items and total differ/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Confirm purchase/ }))
    expect(save).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('checkbox', { name: /checked these differences/ }))
    fireEvent.click(screen.getByRole('button', { name: /Confirm purchase/ }))
    fireEvent.click(screen.getByRole('button', { name: /Saving/ }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(save.mock.calls[0][0]).toMatchObject({ grandTotal: 3.5, tax: 0, subtotal: 6 })
  })
  it('requires fresh acknowledgement after editing the price', () => {
    const save = vi.fn()
    render(<ReceiptReviewSheet result={receipt} photos={[]} onClose={vi.fn()} onSave={save} />)
    const acknowledgement = screen.getByRole('checkbox', { name: /checked these differences/ })
    fireEvent.click(acknowledgement)
    fireEvent.change(screen.getByLabelText('Unit price (€)'), { target: { value: '2.01' } })
    expect(acknowledgement).not.toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: /Confirm purchase/ }))
    expect(save).not.toHaveBeenCalled()
  })
  it('requires inspecting missing rows when the money balances and excludes scan evidence from the save', async () => {
    const save = vi.fn()
    const position = { photo: 0, top: 0.4, bottom: 0.45 }
    const evidence = { positions: { '1': position }, warnings: [{ message: 'Possible missing row', position }] }
    render(<ReceiptReviewSheet result={{ ...receipt, grandTotal: 4, evidence }} photos={['data:image/png;base64,AA==']} onClose={vi.fn()} onSave={save} />)
    fireEvent.click(screen.getByRole('button', { name: /Locate product/ }))
    expect(screen.getAllByRole('img', { name: /Highlighted row/ })).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: /Confirm purchase/ }))
    expect(save).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('checkbox', { name: /checked this row/ }))
    fireEvent.click(screen.getByRole('button', { name: /Confirm purchase/ }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(save.mock.calls[0][0]).not.toHaveProperty('evidence')
  })
  it('keeps review open after duplicate rejection', async () => {
    const close = vi.fn()
    render(<ReceiptReviewSheet result={receipt} photos={[]} onClose={close} onSave={async () => { throw new Error('Already saved') }} />)
    fireEvent.click(screen.getByRole('button', { name: /Confirm purchase/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /checked these differences/ }))
    fireEvent.click(screen.getByRole('button', { name: /Confirm purchase/ }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Already saved'))
    expect(close).not.toHaveBeenCalled()
  })
  it('allows missing products and discounts to be added, but blocks invalid inputs', async () => {
    const save = vi.fn()
    render(<ReceiptReviewSheet result={receipt} photos={[]} onClose={vi.fn()} onSave={save} />)
    fireEvent.click(screen.getByRole('button', { name: /Add product/ }))
    fireEvent.click(screen.getByRole('button', { name: /Confirm purchase/ }))
    expect(save).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Check every item')
    fireEvent.change(screen.getByLabelText('Product 2'), { target: { value: 'Discount' } })
    fireEvent.change(screen.getAllByLabelText('Unit price (€)')[1], { target: { value: '-0.50' } })
    fireEvent.click(screen.getByRole('button', { name: /Confirm purchase/ }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(save.mock.calls[0][0].items[1].lineTotal).toBe(-0.5)
  })
})
