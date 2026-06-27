import { parseError } from '@/lib/errors';
import { useTranslation } from 'next-i18next';

export function useErrorToast() {
  const { t } = useTranslation('common');

  return function showError(err: unknown) {
    const structured = parseError(err);
    // Replace with your actual toast call (sonner, react-hot-toast, etc.)
    console.error({
      title:    t(structured.title),
      message:  t(structured.message),
      recovery: structured.recovery ? t(structured.recovery) : null,
      link:     structured.link,
    });
  };
}