import { generateIdempotencyKey } from '../lib/idempotency';
import { mapApiError } from '../lib/errorHandler';

describe('API contracts', () => {
  it('generates UUID-shaped idempotency keys', () => {
    expect(generateIdempotencyKey()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('maps booking conflicts to a non-retryable user message', () => {
    expect(mapApiError({ status: 409, message: 'SLOT_ALREADY_BOOKED' })).toEqual({
      code: 409,
      message: 'SLOT_ALREADY_BOOKED',
      userMessage: 'This time was just booked by someone else. Please choose another slot.',
    });
  });

  it('does not expose server details for unknown failures', () => {
    expect(mapApiError({ status: 500, message: 'database connection string' }).userMessage)
      .toBe('The booking service is unavailable. Please try again.');
  });
});