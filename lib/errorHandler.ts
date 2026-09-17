export type ApiError = {
  code: number;
  message: string;
  userMessage: string;
};

export function mapApiError(error: unknown): ApiError {
  const candidate = error as { status?: number; code?: number | string; message?: string } | null;
  const code = typeof candidate?.status === 'number'
    ? candidate.status
    : typeof candidate?.code === 'number'
      ? candidate.code
      : 500;
  const message = candidate?.message ?? 'Unknown error';

  if (code === 409 || message.includes('SLOT_ALREADY_BOOKED')) {
    return {
      code: 409,
      message,
      userMessage: 'This time was just booked by someone else. Please choose another slot.',
    };
  }

  if (code === 403) {
    return { code, message, userMessage: "You don't have permission to do this." };
  }

  if (code === 400) {
    return { code, message, userMessage: 'Please check the booking details and try again.' };
  }

  return { code: 500, message, userMessage: 'The booking service is unavailable. Please try again.' };
}