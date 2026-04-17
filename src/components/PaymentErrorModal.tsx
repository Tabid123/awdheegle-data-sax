import React from 'react';
import { X, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

interface PaymentErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRetry: () => void;
  errorType: 'insufficient_balance' | 'user_cancelled' | 'timeout' | 'wrong_pin' | 'general';
  errorMessage?: string;
}

interface ErrorMessageRow {
  error_key: string;
  message_en: string | null;
  message_so: string;
}

interface ErrorMessage {
  error_type: PaymentErrorModalProps['errorType'];
  title: string;
  message: string;
  icon_type: 'emoji' | 'image';
  icon_value: string;
  is_animated: boolean;
}

const getFallbackContent = (errorType: PaymentErrorModalProps['errorType'], errorMessage?: string) => {
  switch (errorType) {
    case 'insufficient_balance':
      return {
        title: 'Haraaga kuma filna',
        message: 'Macaamiil Haraagaa kuguma filna fadlan lacag ku shubo si aad xirmada u iibsatid',
        icon: '💰',
        iconType: 'emoji' as const,
        isAnimated: true,
      };
    case 'user_cancelled':
      return {
        title: 'Waad diidday dalabka',
        message: 'Waad diidday dalabka lacag bixinta. Haddii aad rabtid iibsi, fadlan riix "Isku Day Mar Kale".',
        icon: '❌',
        iconType: 'emoji' as const,
        isAnimated: true,
      };
    case 'timeout':
      return {
        title: 'Waqtigu wuu dhamaaday',
        message: 'Waqtigu wuu dhamaaday. Fadlan isku day mar kale si aad xirmada u iibsatid.',
        icon: '⏱️',
        iconType: 'emoji' as const,
        isAnimated: true,
      };
    case 'wrong_pin':
      return {
        title: 'PIN-ka waa khalad',
        message: 'PIN-ka aad gashay waa khalad. Fadlan hubi PIN-kaaga oo isku day mar kale.',
        icon: '🔐',
        iconType: 'emoji' as const,
        isAnimated: true,
      };
    default:
      return {
        title: 'Khalad ayaa dhacay',
        message: errorMessage || 'Lacag bixinta way fashilantay. Fadlan isku day mar kale.',
        icon: '⚠️',
        iconType: 'emoji' as const,
        isAnimated: true,
      };
  }
};

const normalizeErrorKey = (errorKey: string): PaymentErrorModalProps['errorType'] => {
  const key = errorKey.toLowerCase();
  if (key.includes('balance')) return 'insufficient_balance';
  if (key.includes('cancel')) return 'user_cancelled';
  if (key.includes('timeout')) return 'timeout';
  if (key.includes('pin')) return 'wrong_pin';
  return 'general';
};

export const PaymentErrorModal: React.FC<PaymentErrorModalProps> = ({
  isOpen,
  onClose,
  onRetry,
  errorType,
  errorMessage,
}) => {
  const { data: errorMessages } = useQuery({
    queryKey: ['errorMessages'],
    queryFn: async (): Promise<ErrorMessage[]> => {
      const { data, error } = await supabase
        .from('error_messages')
        .select('error_key, message_en, message_so');

      if (error) throw error;

      return (data ?? []).map((row: ErrorMessageRow) => {
        const normalizedType = normalizeErrorKey(row.error_key);
        const fallback = getFallbackContent(normalizedType);

        return {
          error_type: normalizedType,
          title: fallback.title,
          message: row.message_so || row.message_en || fallback.message,
          icon_type: fallback.iconType,
          icon_value: fallback.icon,
          is_animated: fallback.isAnimated,
        };
      });
    },
    staleTime: 5 * 60 * 1000,
  });

  if (!isOpen) return null;

  const dbErrorContent = errorMessages?.find((msg) => msg.error_type === errorType);
  const fallbackContent = getFallbackContent(errorType, errorMessage);
  const content = dbErrorContent
    ? {
        title: dbErrorContent.title,
        message: dbErrorContent.message,
        icon: dbErrorContent.icon_value,
        iconType: dbErrorContent.icon_type,
        isAnimated: dbErrorContent.is_animated,
      }
    : fallbackContent;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-background rounded-3xl shadow-2xl animate-scale-in overflow-hidden">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-full bg-muted hover:bg-muted/80 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </button>

        <div className="flex flex-col items-center text-center p-8 pt-12">
          {content.iconType === 'image' ? (
            <div className={`mb-6 ${content.isAnimated ? 'animate-bounce' : ''}`}>
              <img src={content.icon} alt="Error Icon" className="w-32 h-32 object-contain" />
            </div>
          ) : (
            <div className={`text-6xl mb-6 ${content.isAnimated ? 'animate-pulse' : ''}`}>
              {content.icon}
            </div>
          )}

          <h2 className="text-2xl font-bold text-foreground mb-3">{content.title}</h2>
          <p className="text-muted-foreground text-base leading-relaxed mb-8 max-w-sm">{content.message}</p>

          <div className="w-full space-y-3">
            <Button
              onClick={onRetry}
              className="w-full h-14 text-lg font-semibold rounded-2xl bg-primary hover:bg-primary/90 transition-all hover:scale-105"
            >
              <RefreshCw className="w-5 h-5 mr-2" />
              Isku Day Mar Kale
            </Button>

            <Button onClick={onClose} variant="outline" className="w-full h-12 text-base rounded-2xl">
              Xiray
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
