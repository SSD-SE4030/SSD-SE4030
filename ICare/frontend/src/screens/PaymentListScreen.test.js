import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Store } from '../Store';
import PaymentListScreen from './PaymentListScreen';

jest.mock('axios', () => ({ get: jest.fn(), put: jest.fn(), delete: jest.fn() }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('jspdf', () => ({ jsPDF: jest.fn() }));
jest.mock('jspdf-autotable', () => ({}));

const order = { _id: 'isolated-test-order', totalPrice: 230, paymentMethod: 'Cash On Delivery', isPaid: false };
const renderPayments = (isAdmin = true) => render(
  <Store.Provider value={{ state: { userInfo: { isAdmin, token: 'test-token' } } }}>
    <PaymentListScreen />
  </Store.Provider>
);

beforeEach(() => {
  jest.clearAllMocks();
  axios.get.mockResolvedValue({ data: [order] });
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => jest.restoreAllMocks());

test('cash confirmation, pending disable, authenticated request and server response refresh', async () => {
  let resolvePayment;
  axios.put.mockImplementation(() => new Promise((resolve) => { resolvePayment = resolve; }));
  renderPayments();
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm COD Payment' }));
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('actually collected Rs. 230.00 in cash'));
  expect(axios.put).toHaveBeenCalledWith('/api/orders/isolated-test-order/pay', {}, { headers: { Authorization: 'Bearer test-token' } });
  const pending = screen.getByRole('button', { name: 'Confirming...' });
  expect(pending).toBeDisabled();
  fireEvent.click(pending);
  expect(axios.put).toHaveBeenCalledTimes(1);
  await act(async () => resolvePayment({ data: { order: { ...order, isPaid: true, paidAt: '2026-10-16T00:00:00.000Z', totalPrice: 345 } } }));
  expect(screen.getByRole('button', { name: 'Paid' })).toBeDisabled();
  expect(screen.getByText('Rs. 345.00')).toBeInTheDocument();
});

test('cancelling cash confirmation does not call payment API', async () => {
  window.confirm.mockReturnValue(false);
  renderPayments();
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm COD Payment' }));
  expect(axios.put).not.toHaveBeenCalled();
});

test('failed request preserves unpaid state and allows retry', async () => {
  axios.put.mockRejectedValue({ response: { data: { message: 'Order cannot be marked paid' } } });
  renderPayments();
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm COD Payment' }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Order cannot be marked paid'));
  expect(screen.getByRole('button', { name: 'Confirm COD Payment' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: 'Paid' })).not.toBeInTheDocument();
});

test.each(['Demo - Cash on Delivery', 'Card'])('ineligible %s cannot initiate confirmation', async (paymentMethod) => {
  axios.get.mockResolvedValue({ data: [{ ...order, paymentMethod }] });
  renderPayments();
  const button = await screen.findByRole('button', { name: 'Confirm COD Payment' });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(window.confirm).not.toHaveBeenCalled();
  expect(axios.put).not.toHaveBeenCalled();
});

test('already-paid order cannot initiate confirmation', async () => {
  axios.get.mockResolvedValue({ data: [{ ...order, isPaid: true }] });
  renderPayments();
  expect(await screen.findByRole('button', { name: 'Paid' })).toBeDisabled();
  expect(axios.put).not.toHaveBeenCalled();
});

test('customer has no payment confirmation control', async () => {
  renderPayments(false);
  await screen.findByText('isolated-test-order');
  expect(screen.queryByRole('button', { name: 'Confirm COD Payment' })).not.toBeInTheDocument();
  expect(axios.put).not.toHaveBeenCalled();
});
